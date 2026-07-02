import { MockScenes, MockConsole, MockActors } from '../core-mock/mock-runtime';
import type { Actor, CoreApi, LogEntry, Runtime, Scene } from '../core-mock/types';
import { getAdapter, listRuntimes } from '../runtimes/registry';
import {
  setTempoSink,
  setMeterSink,
  setActorsSink,
  armOrchestratedActor,
  disarmOrchestratedActor,
  isOrchestratedActor,
  type PublishedActor
} from '../runtimes/bpx-adapter';
import { kronosCursor } from '../../stores/kronos-cursor.svelte';
import { installConsoleBridge } from '../runtimes/console-bridge';
import { enableMidi, type MidiEvent } from '../midi/midi-input';
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
  actors = new RealActors();
  scenes = new MockScenes();
  console = new MockConsole();
  events: EventBus = createEventBus();

  // Resolve a `.bps` file-scene child by file name → its source text. Fed by the
  // workspace (bindBpsSceneFiles) so activating a `@scene calm "calm.bps"` can
  // load + evaluate the referenced child program.
  private getBpsSceneFile?: (fileName: string) => string | undefined;

  constructor() {
    // The per-frame playhead sample + the beat/bar UI events (p5/hydra `onBeat`/`onBar`)
    // are derived by the kronos-cursor store directly off Kronos's Transport position
    // (the single authority) — it owns the rAF that used to live in the clock. Wire it
    // the same event bus the visuals listen on, plus the displayed tempo for the events'
    // informational `bpm` field. The events only fire while running, when a handle exists,
    // so the live Transport's tempo is the authoritative value (0 when no scene is live).
    kronosCursor.setEventBus(this.events, () => kronosCursor.active?.transport.tempo ?? 0);
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
    this.scenes.setOnActivate((s) => {
      void this.handleSceneActivate(s);
    });
    // A grammar that declares `@mm` derives at that tempo; route it to the tempo store so the
    // displayed BPM and every runtime (live retune) adopt the same tempo the derivation used
    // (transport ⇄ derivation coherence). This is the SCENE tempo channel — `setSceneTempo`
    // fans the live retune out WITHOUT clamping it or recording it as user input (a scene's
    // projected tempo must never seed the next no-`@mm` scene). Lazy import avoids the module
    // cycle (store → core → real-core).
    setTempoSink((bpm) => {
      void import('../../stores/clock.svelte').then((m) => m.clock.setSceneTempo(bpm));
    });
    // A scene's RESOLVED meter (`DeriveResult.meter`, BPx authority) projects onto the
    // clock's time signature so the beat LEDs reflect the declared meter (absent → the
    // default 4 stays). Same lazy-import shape as the tempo sink (avoids the module cycle).
    setMeterSink((beatsPerBar) => {
      void import('../../stores/clock.svelte').then((m) => m.clock.setTimeSignature(beatsPerBar));
    });
    // An orchestrator `.bps` publishes its `@actor` list here so the Actors panel
    // shows every voice (groove + viz, …). The actors are armed by default (a
    // freshly-evaluated orchestrator sounds every voice); the per-actor arm/disarm
    // then routes through the orchestrated path (see handleActorToggle). The active
    // state of an actor that survives a re-eval is preserved.
    setActorsSink((published: PublishedActor[]) => {
      // A NON-orchestrated `.bps`/`.gr` publishes an EMPTY list: it replaces the
      // previous program's orchestrator voices (groove/viz) with nothing.
      if (published.length === 0) {
        this.actors.setActors([]);
        return;
      }
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
    // handleActorToggle (which only evaluates when the clock is running). This
    // site does NOT rely on any clock subscriber: a file-scene evals its child
    // `.bps` explicitly below (the eval builds the Kronos handle = transport running), and
    // an actor-set scene evals via the actor toggles it triggers (each orchestrated toggle
    // self-starts from stopped). No host clock to flip — Kronos starts via the eval.

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
   * by the workspace). A non-empty table installs file-scenes; an empty table
   * (the active file declares none) clears the panel only when the current
   * scenes are themselves file-scenes.
   */
  loadBpsFileScenes(
    sceneTable: Record<string, { file: string }>,
    resolve: (fileName: string) => string | undefined
  ) {
    this.getBpsSceneFile = resolve;
    const entries = Object.entries(sceneTable);
    const currentAreFileScenes = this.scenes.list().some((s) => s.file !== undefined);

    if (entries.length === 0) {
      // No file-scenes in the active file. Only clear if what's shown is a
      // previously-loaded file-scene set.
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

  private log = (e: { runtime: Runtime; level: LogEntry['level']; msg: string }) =>
    this.console.push(e);

  private async handleActorMute(a: Actor, willBeMuted: boolean) {
    // Only affects audio if the actor is currently armed and a scene is live (transport
    // running, per Kronos — the single authority; no host clock flag).
    if (!a.active || kronosCursor.state !== 'running') return;
    // Orchestrator `.bps` actor: mute/unmute its live voice (same mechanism as
    // arm/disarm — silence the voice while the rest play, restore on unmute).
    if (isOrchestratedActor(a.name)) {
      if (willBeMuted) disarmOrchestratedActor(a.name);
      else armOrchestratedActor(a.name);
      return;
    }
  }

  private async handleActorToggle(a: Actor, willBeActive: boolean) {
    // Orchestrator `.bps` actor: arm/disarm its voice LIVE on the running
    // orchestrator. Disarm silences this voice (code stopped, notes gated) while
    // the others keep playing; arm restores it. If the transport was stopped,
    // start it so the orchestrator (and this voice) sounds.
    if (isOrchestratedActor(a.name)) {
      if (willBeActive) {
        if (kronosCursor.state !== 'running') {
          // Play-from-stopped on an orchestrated voice: eval the active scene's armed blocks
          // EXPLICITLY. That single scene eval derives + builds the Kronos handle (= transport
          // running) and sounds the orchestrator including this just-armed voice; no per-voice
          // eval here, no host clock to flip. The `openBlocks` store is imported lazily to
          // avoid a module cycle (store → core → real-core).
          void import('../../stores/blocks.svelte').then((m) => m.openBlocks.replayArmed());
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

    // Non-orchestrated actor: no file binding exists, so a toggle is visual only.
    this.log({ runtime: a.runtime, level: 'warn', msg: `actor "${a.name}" has no live voice` });
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

    // Resolution order for the slot key:
    //   explicit actorId (block-level, e.g. `melody.$0`) >
    //   raw source id (back-compat: whole-file slot).
    // Multiple blocks in the same file must land in DIFFERENT slots, otherwise
    // Strudel composite overwrites block 1 when block 2 is evaluated.
    const slotId = actorId ?? sourceId;

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

    // STEP (a `section` window) is a discrete advance, NOT continuous play: the dispatcher
    // sounds the single stepped beat on its own clock and the Kronos handle parks (paused),
    // so the transport readout stays out of continuous play. Nothing extra to do here.
    if (section) return;

    // Surgical: a manual Ctrl+Enter (re)sounds ONLY this block — the block just evaluated
    // above is already live. A bp3/bpscript/.gr eval builds a Kronos handle (transport →
    // running, so the readout follows the single authority); a pure code voice (Strudel/Hydra)
    // sounds through its own adapter. No host clock to flip — the transport readout PROJECTS
    // Kronos, it never invents a "playing" state the engine doesn't have.
  }

  /** Broadcast one transport SENTINEL to every KNOWN runtime (not just the declared
   *  actors': a loaded program's blocks sound through a runtime that may have no
   *  `@actor`), then set the actors' LEDs. Per-runtime by id, best-effort —
   *  `listRuntimes()` returns unique Map keys, so no dedup is needed. The sentinel
   *  rides `stop()`'s `{actorId, fileId}` and each adapter interprets it
   *  (`__hush__`/`__stop_in_place__`/`__replay__`); `ledsActive` is the final LED state. */
  async #broadcast(sentinel: string, ledsActive: boolean): Promise<void> {
    for (const id of listRuntimes()) {
      const adapter = getAdapter(id);
      if (!adapter) continue;
      try {
        await adapter.stop({ actorId: sentinel, fileId: sentinel }, this.log);
      } catch {
        /* swallow — transport broadcast must be best-effort */
      }
    }
    const next = this.actors.list().map((a) => ({ ...a, active: ledsActive }));
    this.actors.setActors(next);
  }

  async silenceRuntimes(): Promise<void> {
    // Full hush: silence every runtime + LEDs off.
    await this.#broadcast('__hush__', false);
  }

  async stopInPlace(): Promise<void> {
    // Model C STOP: each bpx adapter returns its live scene's playhead to 0 and cuts
    // its sound WITHOUT discarding the derived timeline (the handle / kronos cursor stay
    // live so a Play replays the same timeline). LEDs off (the scene is stopped).
    await this.#broadcast('__stop_in_place__', false);
  }

  async replayActiveScene(): Promise<void> {
    // Model C PLAY-from-stopped: each bpx adapter restarts its persisted (stopped)
    // handle from 0 with NO re-derivation. LEDs back on (the scene is sounding again).
    await this.#broadcast('__replay__', true);
    // CVA-INIT — the replay's `reset()` cleared the audio arming (`_muted`) for a pristine
    // 1st loop; RE-APPLY the composed arming from the actor store (the AUTHORITY) so a
    // stop→play REPRODUCES the same performance: an orchestrated actor muted/disarmed before
    // Stop must stay silent on replay (else stop→play would silently change the arming →
    // non-deterministic, décision archi [448]). Armed actors need nothing (reset already
    // re-armed them). No-op in mono (no orchestrated actors); `disarmOrchestratedActor` is
    // itself a no-op for a name with no live voice.
    for (const a of this.actors.list()) {
      if (isOrchestratedActor(a.name) && (a.muted || !a.active)) disarmOrchestratedActor(a.name);
    }
  }

  async hushAll(): Promise<void> {
    // Panic stop: silence every runtime + reset visual state (LEDs off). The per-runtime
    // `__hush__` fully discards each Kronos handle (kronosCursor → null), so the transport
    // readout PROJECTS 'stopped' — no host clock to stop.
    await this.silenceRuntimes();
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
    // MIDI input is logged (the input plumbing stays live). The `@map` ROUTING that
    // used to act on each event was DEAD (no `@map` was ever parsed into a mapping →
    // the list was always empty) and is removed (RA-6 phase-2 cleanup); the feature
    // will be rebuilt at the OSC/devices wiring, outside Kanopi (plan).
    this.log({
      runtime: 'system',
      level: 'info',
      msg: `[midi] ${e.kind}:${e.index} val:${e.value} ch:${e.ch}`
    });
  }
}

export function createRealCore(): CoreApi {
  return new RealCore();
}
