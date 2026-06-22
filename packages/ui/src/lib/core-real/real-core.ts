import {
  MockClock,
  MockScenes,
  MockMaps,
  MockConsole,
  MockActors
} from '../core-mock/mock-runtime';
import type { Actor, ActorFileRef, CoreApi, LogEntry, Runtime, Scene } from '../core-mock/types';
import { getAdapter, listRuntimes } from '../runtimes/registry';
import {
  setTempoSink,
  setActorsSink,
  armOrchestratedActor,
  disarmOrchestratedActor,
  isOrchestratedActor,
  pauseAudioContext,
  resumeAudioContext,
  getDispatcherBeat,
  type PublishedActor
} from '../runtimes/bpx-adapter';
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
  // True while the Actors panel shows an orchestrator `.bps`'s `@actor` list
  // (published by the bpscript adapter), so `loadSession('')` — fired by the
  // workspace when no `.kanopi` session is open — doesn't wipe them.
  private actorsAreOrchestrated = false;

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
    // PAUSE/RESUME (≠ stop): suspend/resume the WebAudio context in place so the
    // dispatchers keep their scheduled timeline — resuming continues mid-phrase
    // instead of restarting. Stop still goes through onTransport(false) and tears
    // everything down. Strudel/Hydra own their own contexts (not paused here yet).
    this.clock.setOnPauseResume((paused) => {
      // Audio only: suspend in place on pause, resume on play. The PLAYHEAD
      // position is owned by the transport state machine (playback store), which
      // records the paused beat itself — the core no longer tracks it here.
      if (paused) void pauseAudioContext();
      else void resumeAudioContext();
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
    // A grammar that declares `@mm` derives at that tempo; let the bp3/bpscript
    // adapter drive the CENTRAL clock so the displayed BPM and the STEP grid
    // adopt the same tempo the derivation used (transport ⇄ derivation coherence).
    setTempoSink((bpm) => this.clock.setBpm(bpm));
    // Real beat display (requirement B): while a bp3/bpscript dispatcher plays,
    // the transport beat dots + bar·beat·phase counter phase-lock to its actual
    // musical position (the heard audio) instead of the free rAF clock. Returns
    // null when no dispatcher plays → the clock keeps its rAF behaviour.
    this.clock.setBeatSource(() => getDispatcherBeat());
    // An orchestrator `.bps` publishes its `@actor` list here so the Actors panel
    // shows every voice (groove + viz, …), not just the file-bound `.kanopi`
    // actors. The actors are armed by default (a freshly-evaluated orchestrator
    // sounds every voice); the per-actor arm/disarm then routes through the
    // orchestrated path (see handleActorToggle). The active state of an actor
    // that survives a re-eval is preserved.
    setActorsSink((published: PublishedActor[]) => {
      // A NON-orchestrated `.bps`/`.gr` publishes an EMPTY list: it replaces the
      // previous program's orchestrator voices (groove/viz) with nothing. Only act
      // on it when the panel is CURRENTLY showing orchestrator actors — a `.kanopi`
      // session owns its actors via `loadSession` (flag false), so a non-orchestrated
      // actor-bound `.bps` eval must NOT wipe them.
      if (published.length === 0) {
        if (this.actorsAreOrchestrated) {
          this.actorsAreOrchestrated = false;
          this.actors.setActors([]);
        }
        return;
      }
      this.actorsAreOrchestrated = true;
      // A PRODUCE/scene-load arms EVERY actor (they all sound — Kronos plays the whole
      // scene). The LED reflects "this actor is sounding", so all light up together;
      // a previous Stop set them `active:false`, and the old `before.get(name) ?? true`
      // re-inherited that false → only the evaluated block's actor re-lit (the « un seul
      // acteur armé alors que les deux jouent » bug). Live arm/disarm still toggles one
      // actor at a time through `handleActorToggle`, not this publish.
      this.actors.setActors(
        published.map((p) => ({
          name: p.name,
          runtime: p.runtime,
          file: p.file,
          active: true
        }))
      );
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
      // ORCHESTRATED scene (.bps with inline @actor): its actors all map to the SAME
      // orchestrator file, so a per-actor eval here re-runs the WHOLE scene once per
      // actor (the double/triple voice + pause leak). An orchestrated scene plays via
      // its SINGLE scene eval (the active block's replay), never per-actor. Only a
      // `.kanopi` SESSION (actors = separate real files, `actorsAreOrchestrated`=false)
      // gets a per-actor eval here. `actorsAreOrchestrated` is set at produce time, so
      // it is reliable on the play edge (unlike `isOrchestratedActor`, which depends on
      // the full eval having already registered the live voices).
      if (!this.actorsAreOrchestrated) {
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
    // Orchestrator `.bps` actor: mute/unmute its live voice (same mechanism as
    // arm/disarm — silence the voice while the rest play, restore on unmute).
    if (isOrchestratedActor(a.name)) {
      if (willBeMuted) disarmOrchestratedActor(a.name);
      else armOrchestratedActor(a.name);
      return;
    }
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
    // Orchestrator `.bps` actor (no `.kanopi` file binding): arm/disarm its voice
    // LIVE on the running orchestrator. Disarm silences this voice (code stopped,
    // notes gated) while the others keep playing; arm restores it. If the
    // transport was stopped, start it so the orchestrator (and this voice) sounds.
    if (isOrchestratedActor(a.name)) {
      if (willBeActive) {
        if (!this.clock.state.playing) {
          this.clock.play();
          return;
        }
        armOrchestratedActor(a.name);
        this.log({ runtime: a.runtime, level: 'info', msg: `arm [${a.name}]` });
      } else {
        disarmOrchestratedActor(a.name);
        this.log({ runtime: a.runtime, level: 'info', msg: `disarm [${a.name}]` });
      }
      return;
    }

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
    // No `.kanopi` session open (empty text) while the Actors panel shows an
    // orchestrator `.bps`'s actors: don't wipe them. The workspace fires
    // `loadSession('')` when no session tab is active, which would otherwise
    // clear groove/viz the moment a `.bps` orchestrator is the only open program.
    if (!text.trim() && this.actorsAreOrchestrated) return;

    const r = parseSession(text);
    // A real session owns the Actors panel from here on (until an orchestrator
    // publishes again).
    this.actorsAreOrchestrated = false;

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
    section?: { index: number; count: number },
    produceOnly: boolean = false
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
      { actorId: slotId, fileId: sourceId, docOffset, flags, section, produceOnly },
      this.log
    );

    // PRODUCE-only (scene opened, not played): the adapter derived + published the
    // structure, but we must NOT touch the transport or light the actor LED — the
    // scene is ready, not playing. Play sounds it later.
    if (produceOnly) return;

    // STEP (a `section` window) is a discrete advance, NOT continuous play: the
    // dispatcher sounds the single beat on its own clock, and the transport must
    // stay in STEP mode (not playing) — `bpsScenes.stepActive` already called
    // `enterStep`. So DON'T startSilently here, or stepping would resume the
    // transport (and "remove the pause").
    if (section) return;

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

  async silenceRuntimes(): Promise<void> {
    // Silence every KNOWN runtime (not just the declared actors': a loaded
    // program's blocks sound through a runtime that may have no `@actor`), then
    // deactivate the actors' LEDs — but leave the clock running. Mirrors the
    // per-runtime hush `handleTransport(false)` does, without `clock.stop()`.
    const seen = new Set<string>();
    for (const id of listRuntimes()) {
      if (seen.has(id)) continue;
      seen.add(id);
      const adapter = getAdapter(id);
      if (!adapter) continue;
      try {
        await adapter.stop({ actorId: '__hush__', fileId: '__hush__' }, this.log);
      } catch {
        /* swallow — silencing must be best-effort */
      }
    }
    const quieted = this.actors.list().map((a) => ({ ...a, active: false }));
    this.actors.setActors(quieted);
  }

  async hushAll(): Promise<void> {
    // Panic stop: silence every runtime + reset visual state (LEDs off,
    // transport stopped). Reuses the clock-preserving silencer, then stops.
    await this.silenceRuntimes();
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
