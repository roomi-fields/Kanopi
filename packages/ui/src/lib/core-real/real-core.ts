import {
  MockClock,
  MockScenes,
  MockMaps,
  MockConsole,
  MockActors
} from '../core-mock/mock-runtime';
import type {
  Actor,
  ActorFileRef,
  CoreApi,
  LogEntry,
  Runtime,
  Scene
} from '../core-mock/types';
import { getAdapter, listRuntimes } from '../runtimes/registry';
import { installConsoleBridge } from '../runtimes/console-bridge';
import { parseSession } from '../session';
import { enableMidi, matchMapping, type MidiEvent } from '../midi/midi-input';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';

class RealActors extends MockActors {
  // We override toggle to delegate to the real-core orchestration via a callback.
  private onToggle?: (a: Actor, willBeActive: boolean) => void;
  private onMute?: (a: Actor, willBeMuted: boolean) => void;

  setOnToggle(fn: (a: Actor, willBeActive: boolean) => void) {
    this.onToggle = fn;
  }
  setOnMute(fn: (a: Actor, willBeMuted: boolean) => void) {
    this.onMute = fn;
  }

  toggle(name: string) {
    const before = this.list().find((a) => a.name === name);
    super.toggle(name);
    const after = this.list().find((a) => a.name === name);
    if (before && after && this.onToggle) {
      this.onToggle(after, after.active);
    }
  }

  setMuted(name: string, muted: boolean) {
    const before = this.list().find((a) => a.name === name);
    if (!before || !!before.muted === muted) return;
    super.setMuted(name, muted);
    const after = this.list().find((a) => a.name === name);
    if (after && this.onMute) this.onMute(after, muted);
  }
}

class RealCore implements CoreApi {
  clock = new MockClock();
  actors = new RealActors();
  scenes = new MockScenes();
  maps = new MockMaps();
  console = new MockConsole();
  events: EventBus = createEventBus();

  private getActorFile?: (name: string) => ActorFileRef | undefined;

  constructor() {
    this.clock.setEventBus(this.events);
    for (const id of listRuntimes()) {
      const a = getAdapter(id);
      if (a?.events) a.events.onAny((e) => this.events.emit(e));
    }
    this.console.push({ runtime: 'system', level: 'info', msg: 'kanopi runtime online' });
    installConsoleBridge((e) => this.console.push(e));
    this.actors.setOnToggle((a, willBeActive) => {
      void this.handleActorToggle(a, willBeActive);
    });
    this.actors.setOnMute((a, willBeMuted) => {
      void this.handleActorMute(a, willBeMuted);
    });
    this.clock.setOnTransport((playing) => {
      void this.handleTransport(playing);
    });
    this.scenes.setOnActivate((s) => {
      void this.handleSceneActivate(s);
    });
    this.clock.setOnTempo((bpm) => {
      for (const id of listRuntimes()) {
        const adapter = getAdapter(id);
        adapter?.setBpm?.(bpm, this.log);
      }
    });
  }

  private async handleSceneActivate(scene: Scene) {
    // Activating a scene arms its actors AND starts the transport if it was
    // stopped — the intent is "play this scene," not just "arm these LEDs."
    // Start the clock first so the actor toggles that follow can eval through
    // handleActorToggle (which only evaluates when the clock is running).
    if (!this.clock.state.playing) this.clock.play();
    const current = new Map(this.actors.list().map((a) => [a.name, a.active]));
    for (const [actorName, wantOn] of Object.entries(scene.actors)) {
      const isOn = current.get(actorName);
      if (isOn === undefined) continue; // unknown actor
      if (isOn !== wantOn) this.actors.toggle(actorName);
    }
    this.log({ runtime: 'system', level: 'info', msg: `scene: ${scene.name}` });
  }

  private async handleTransport(playing: boolean) {
    const actives = this.actors.list().filter((a) => a.active);
    if (playing) {
      // re-evaluate all active actors; swallow per-actor failures so one
      // broken file doesn't abort the whole scene and surface as an
      // unhandled rejection (clock.play isn't awaited by its callers).
      for (const a of actives) {
        const ref = this.getActorFile?.(a.name);
        if (!ref) continue;
        const adapter = getAdapter(ref.runtime);
        if (!adapter) continue;
        try {
          await adapter.evaluate(ref.contents, { actorId: a.name, fileId: a.name }, this.log);
        } catch {
          /* error already logged by adapter */
        }
      }
      this.log({ runtime: 'system', level: 'info', msg: `play: ${actives.length} actor(s)` });
    } else {
      // Stop every known runtime, not just the active actors. A Ctrl+Enter
      // eval on a file that isn't bound to an @actor still leaves Strudel
      // playing — hushing by runtime id is the only way to be sure the
      // transport stop actually stops audio.
      const seen = new Set<string>();
      for (const id of listRuntimes()) {
        if (seen.has(id)) continue;
        seen.add(id);
        const adapter = getAdapter(id);
        if (!adapter) continue;
        try {
          await adapter.stop({ actorId: '__hush__', fileId: '__hush__' }, this.log);
        } catch {
          /* swallow — stop must be best-effort */
        }
      }
      this.log({ runtime: 'system', level: 'info', msg: 'stop: all runtimes' });
    }
  }

  private log = (e: { runtime: Runtime; level: LogEntry['level']; msg: string }) =>
    this.console.push(e);

  private async handleActorMute(a: Actor, willBeMuted: boolean) {
    // Only affects audio if the actor is currently armed and the transport runs.
    if (!a.active || !this.clock.state.playing) return;
    const ref = this.getActorFile?.(a.name);
    if (!ref) return;
    const adapter = getAdapter(ref.runtime);
    if (!adapter) return;
    const src = { actorId: a.name, fileId: a.name };
    if (willBeMuted) {
      await adapter.stop(src, this.log);
      this.log({ runtime: ref.runtime, level: 'info', msg: `mute [${a.name}]` });
    } else {
      await adapter.evaluate(ref.contents, src, this.log);
      this.log({ runtime: ref.runtime, level: 'info', msg: `unmute [${a.name}]` });
    }
  }

  private async handleActorToggle(a: Actor, willBeActive: boolean) {
    const ref = this.getActorFile?.(a.name);
    if (!ref) {
      this.log({ runtime: a.runtime, level: 'warn', msg: `actor "${a.name}" has no file bound` });
      return;
    }
    const adapter = getAdapter(ref.runtime);
    if (!adapter) {
      this.log({ runtime: ref.runtime, level: 'warn', msg: `no adapter for runtime "${ref.runtime}" — actor "${a.name}" toggled visually only` });
      return;
    }
    const src = { actorId: a.name, fileId: a.name };
    if (willBeActive) {
      if (!this.clock.state.playing) {
        this.log({ runtime: ref.runtime, level: 'info', msg: `actor "${a.name}" armed (transport stopped)` });
        return;
      }
      await adapter.evaluate(ref.contents, src, this.log);
    } else {
      await adapter.stop(src, this.log);
    }
  }

  async loadSession(text: string) {
    const r = parseSession(text);

    // Preserve current active state for actors that survive.
    const before = new Map(this.actors.list().map((a) => [a.name, a.active]));
    const nextActors = r.actors.map((a) => ({
      ...a,
      active: before.get(a.name) ?? false
    }));
    this.actors.setActors(nextActors);

    // Preserve active scene by name.
    const currentActive = this.scenes.list().find((s) => s.active)?.name;
    const nextScenes = r.scenes.map((s) => ({ ...s, active: s.name === currentActive }));
    this.scenes.setScenes(nextScenes);

    this.maps.setMappings(r.mappings);

    // Apply @time signature if declared. Default 4/4 if absent so reopening a
    // session that dropped the directive resets to the standard signature.
    this.clock.setTimeSignature(r.timeSignature?.num ?? 4);

    for (const e of r.errors) {
      const where = e.line > 0 ? ` (line ${e.line})` : '';
      this.log({ runtime: 'kanopi', level: 'error', msg: `session: ${e.msg}${where}` });
    }
    this.log({
      runtime: 'kanopi',
      level: 'info',
      msg: `session loaded: ${nextActors.length} actors, ${nextScenes.length} scenes, ${r.mappings.length} maps${r.errors.length ? ` — ${r.errors.length} error(s)` : ''}`
    });
  }

  async evaluateBlock(
    runtime: Runtime,
    code: string,
    sourceId: string,
    docOffset: number = 0,
    actorId?: string
  ): Promise<void> {
    const adapter = getAdapter(runtime);
    if (!adapter) {
      this.log({ runtime, level: 'warn', msg: `no adapter for runtime "${runtime}"` });
      throw new Error(`no adapter for runtime "${runtime}"`);
    }
    if (!code.trim()) {
      this.log({ runtime, level: 'warn', msg: 'empty block' });
      return;
    }

    // Locate the actor bound to this file (sourceId = file.name) so we can
    // light up its LED and make the transport reflect that audio is live.
    const matching = this.actors.list().find((a) => {
      const ref = this.getActorFile?.(a.name);
      return ref?.fileName === sourceId;
    });

    // Resolution order for the slot key:
    //   explicit actorId (block-level, e.g. `melody.$0`) >
    //   declared @actor bound to this file >
    //   raw source id (back-compat: whole-file slot).
    // Multiple blocks in the same file must land in DIFFERENT slots, otherwise
    // Strudel composite overwrites block 1 when block 2 is evaluated.
    const slotId = actorId ?? matching?.name ?? sourceId;

    // Eval first — if it throws, we leave transport+LED alone so a broken
    // block doesn't falsely mark the scene as playing.
    await adapter.evaluate(code, { actorId: slotId, fileId: sourceId, docOffset }, this.log);

    if (!this.clock.state.playing) this.clock.play();
    if (matching && !matching.active) {
      const next = this.actors.list().map((a) =>
        a.name === matching.name ? { ...a, active: true } : a
      );
      this.actors.setActors(next);
    }
  }

  bindActorFiles(get: (name: string) => ActorFileRef | undefined) {
    this.getActorFile = get;
  }

  async hushAll(): Promise<void> {
    // Panic stop: silence every runtime + reset visual state (LEDs off, transport stopped).
    const seen = new Set<string>();
    for (const a of this.actors.list()) {
      const ref = this.getActorFile?.(a.name);
      const runtime = ref?.runtime ?? a.runtime;
      const adapter = getAdapter(runtime);
      if (!adapter || seen.has(runtime)) continue;
      seen.add(runtime);
      await adapter.stop({ actorId: '__hush__', fileId: '__hush__' }, this.log);
    }
    const quieted = this.actors.list().map((a) => ({ ...a, active: false }));
    this.actors.setActors(quieted);
    if (this.clock.state.playing) this.clock.stop();
    this.log({ runtime: 'system', level: 'warn', msg: 'hush all' });
  }

  async enableMidiInput(): Promise<void> {
    const r = await enableMidi((e) => this.handleMidi(e));
    if (r.ok) {
      this.log({
        runtime: 'system',
        level: 'info',
        msg: `midi enabled: ${r.ports.length ? r.ports.join(', ') : 'no input port detected'}`
      });
    } else {
      this.log({ runtime: 'system', level: 'warn', msg: `midi: ${r.reason}` });
    }
  }

  private handleMidi(e: MidiEvent) {
    this.log({
      runtime: 'system',
      level: 'info',
      msg: `[midi] ${e.kind}:${e.index} val:${e.value} ch:${e.ch}`
    });
    for (const m of this.maps.list()) {
      if (!matchMapping(m, e)) continue;
      this.maps.emitIncoming(m.id, e.value);
      const tgt = m.target;
      if (tgt.kind === 'tempo') {
        // Map CC 0..127 → BPM 60..180 (live coding common range).
        const bpm = 60 + (e.value / 127) * 120;
        this.clock.setBpm(bpm);
      } else if (tgt.kind === 'scene') {
        if (e.value > 0) this.scenes.activate(tgt.ref);
      } else if (tgt.kind === 'actor.toggle') {
        if (e.value > 0) this.actors.toggle(tgt.ref);
      } else if (tgt.kind === 'actor.param') {
        // Param routing not implemented yet (per-actor API needed).
        this.log({ runtime: 'system', level: 'warn', msg: `actor.param "${tgt.ref}.${tgt.param}" not yet supported` });
      }
    }
  }
}

export function createRealCore(): CoreApi {
  return new RealCore();
}
