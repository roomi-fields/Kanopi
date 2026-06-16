import {
  MockClock,
  MockScenes,
  MockMaps,
  MockConsole,
  MockActors
} from '../core-mock/mock-runtime';
import type { Actor, ActorFileRef, CoreApi, LogEntry, Runtime, Scene } from '../core-mock/types';
import { getAdapter, listRuntimes } from '../runtimes/registry';
import { installConsoleBridge } from '../runtimes/console-bridge';
import { parseSession } from '../session';
import { findBank } from '../library/audio-banks';
import { loadSampleBank, setDeclaredBanks } from '../runtimes/strudel';
import { enableMidi, matchMapping, type MidiEvent } from '../midi/midi-input';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';
import { production } from '../../stores/production.svelte';

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
  // Resolve a `.bps` file-scene child by file name → its source text. Fed by the
  // workspace (bindBpsSceneFiles) so activating a `@scene calm "calm.bps"` can
  // load + evaluate the referenced child program.
  private getBpsSceneFile?: (fileName: string) => string | undefined;

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
    // Relay beat/bar events from the clock to any adapter that opts in.
    // Symmetric with `setBpm` above; lets adapters whose language exposes a
    // visual clock (Hydra `beat` / `bar` globals) stay in sync without each
    // re-subscribing to core.events.
    this.events.on('beat', (e) => {
      for (const id of listRuntimes()) {
        const adapter = getAdapter(id);
        adapter?.onBeat?.(e.count, this.log);
      }
    });
    this.events.on('bar', (e) => {
      for (const id of listRuntimes()) {
        const adapter = getAdapter(id);
        adapter?.onBar?.(e.count, this.log);
      }
    });
  }

  private async handleSceneActivate(scene: Scene) {
    // Activating a scene arms its actors AND starts the transport if it was
    // stopped — the intent is "play this scene," not just "arm these LEDs."
    // Start the clock first so the actor toggles that follow can eval through
    // handleActorToggle (which only evaluates when the clock is running).
    if (!this.clock.state.playing) this.clock.play();

    // `.bps` file-scene (`@scene calm "calm.bps"`): the scene references a child
    // `.bps` program instead of arming in-session actors. Load its source and
    // evaluate it through the bpscript adapter — its own actors/voices then play.
    // The child eval is keyed by the child file name so re-activating a scene
    // replaces the previous child's voices (the adapter stops the prior source).
    if (scene.file) {
      const contents = this.getBpsSceneFile?.(scene.file);
      if (contents === undefined) {
        this.log({
          runtime: 'kanopi',
          level: 'error',
          msg: `scene "${scene.name}": child file "${scene.file}" not found`
        });
        return;
      }
      const adapter = getAdapter('bpscript');
      if (adapter) {
        try {
          await adapter.evaluate(contents, { actorId: scene.file, fileId: scene.file }, this.log);
        } catch {
          /* error already logged by the adapter */
        }
      }
      this.log({ runtime: 'system', level: 'info', msg: `scene: ${scene.name} (${scene.file})` });
      return;
    }

    const current = new Map(this.actors.list().map((a) => [a.name, a.active]));
    for (const [actorName, wantOn] of Object.entries(scene.actors)) {
      const isOn = current.get(actorName);
      if (isOn === undefined) continue; // unknown actor
      if (isOn !== wantOn) this.actors.toggle(actorName);
    }
    this.log({ runtime: 'system', level: 'info', msg: `scene: ${scene.name}` });
  }

  /**
   * Feed the Scenes panel from a `.bps`'s `@scene <name> "<file>"` table. Each
   * named scene becomes a file-scene card; activating it loads + plays the
   * referenced child `.bps`. `resolve` reads a child file's source by name (fed
   * by the workspace).
   *
   * COEXISTS with `.kanopi` session scenes (`loadSession`): a `.kanopi` session's
   * actor-set scenes carry no `file` field, file-scenes do. This method only owns
   * the FILE-scene cards — it never wipes session scenes. So a non-empty table
   * installs file-scenes; an empty table (the active file declares none) clears
   * the panel ONLY when the current scenes are themselves file-scenes, leaving an
   * active `.kanopi` session's scenes intact.
   */
  loadBpsFileScenes(
    sceneTable: Record<string, { file: string }>,
    resolve: (fileName: string) => string | undefined
  ) {
    this.getBpsSceneFile = resolve;
    const entries = Object.entries(sceneTable);
    const currentAreFileScenes = this.scenes.list().some((s) => s.file !== undefined);

    if (entries.length === 0) {
      // No file-scenes in the active file. Don't touch `.kanopi` session scenes;
      // only clear if what's shown is a previously-loaded file-scene set.
      if (currentAreFileScenes) this.scenes.setScenes([]);
      return;
    }

    const activeName = this.scenes.list().find((s) => s.active)?.name;
    const next: Scene[] = entries.map(([name, def]) => ({
      name,
      actors: {},
      file: def.file,
      active: name === activeName
    }));
    this.scenes.setScenes(next);
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
      this.log({
        runtime: ref.runtime,
        level: 'warn',
        msg: `no adapter for runtime "${ref.runtime}" — actor "${a.name}" toggled visually only`
      });
      return;
    }
    const src = { actorId: a.name, fileId: a.name };
    if (willBeActive) {
      // Arming an actor PLAYS it (beta issue 5 — "play/actor est incohérent").
      // If the transport was stopped, start it: handleTransport(true) then
      // re-evaluates every armed actor (including this one), so we don't double-
      // eval here. Mirrors handleSceneActivate's "arm + start + eval".
      if (!this.clock.state.playing) {
        this.clock.play();
        return;
      }
      await adapter.evaluate(ref.contents, src, this.log);
    } else {
      await adapter.stop(src, this.log);
    }
  }

  async loadSession(text: string) {
    const r = parseSession(text);

    // Preserve current active state for actors that survive; arm NEW actors by
    // default (beta issue 3 — "par défaut les acteurs doivent être armés au
    // chargement"). A reload keeps whatever the user had toggled; a fresh load
    // arms every actor so the session sounds on Play without a manual rearm.
    const before = new Map(this.actors.list().map((a) => [a.name, a.active]));
    const nextActors = r.actors.map((a) => ({
      ...a,
      active: before.get(a.name) ?? true
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

    // Fire-and-forget: load each @library bank via Strudel's samples().
    // De-duped inside loadSampleBank, so repeated loadSession calls with the
    // same libraries don't re-fetch. Errors are logged but non-fatal — the
    // session still loads even if the sample server is down.
    const bankSources: string[] = [];
    for (const id of r.libraries) {
      const bank = findBank(id);
      if (!bank) continue;
      bankSources.push(bank.source);
      void loadSampleBank(bank.source)
        .then(() =>
          this.log({ runtime: 'strudel', level: 'info', msg: `library loaded: ${bank.name}` })
        )
        .catch((err) =>
          this.log({ runtime: 'strudel', level: 'error', msg: `library ${id}: ${String(err)}` })
        );
    }
    // Warn about libraries that were declared earlier and are now removed.
    // Strudel's `samples()` has no reverse, so they stay in the sound map
    // until the page is reloaded. Telling the user explicitly prevents the
    // "I removed @library but `s("bd")` still works" surprise.
    const { lingering } = setDeclaredBanks(bankSources);
    for (const src of lingering) {
      this.log({
        runtime: 'strudel',
        level: 'warn',
        msg: `library ${src} removed from session but its samples are still in memory — reload the page to truly drop them`
      });
    }

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
    actorId?: string,
    flags?: Record<string, number>,
    section?: { index: number; count: number }
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

    // FULL-production readout is meaningful only for the symbolic (bp3/bpscript)
    // languages that derive note tokens. A backtick-only voice (Strudel, Hydra,
    // …) produces no derived symbols, so clear the production store before its
    // eval — the Text panel then degrades to its empty "no symbolic production"
    // state instead of showing a stale derivation. bp3/bpscript repopulate it
    // synchronously inside their own `evaluate`.
    if (runtime !== 'bp3' && runtime !== 'bpscript') production.clear();

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
    await adapter.evaluate(
      code,
      { actorId: slotId, fileId: sourceId, docOffset, flags, section },
      this.log
    );

    // Surgical: a manual Ctrl+Enter (re)sounds ONLY this block. If the transport
    // was stopped we start it so the UI reads "playing" and time-based voices
    // advance — but via startSilently, which does NOT re-evaluate the rest of
    // the armed set (that's `play()`, reserved for load / scene / arm). The
    // block just evaluated above is already live; the others keep playing
    // untouched.
    if (!this.clock.state.playing) this.clock.startSilently();
    if (matching && !matching.active) {
      const next = this.actors
        .list()
        .map((a) => (a.name === matching.name ? { ...a, active: true } : a));
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
        this.log({
          runtime: 'system',
          level: 'warn',
          msg: `actor.param "${tgt.ref}.${tgt.param}" not yet supported`
        });
      }
    }
  }
}

export function createRealCore(): CoreApi {
  return new RealCore();
}
