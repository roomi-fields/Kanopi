import { MockScenes, MockConsole, MockActors } from '../core-mock/mock-runtime';
import type { Actor, CoreApi, LogEntry, Runtime, Scene } from '../core-mock/types';
import { getAdapter, listRuntimes } from '../runtimes/registry';
import {
  setTempoSink,
  setActorsSink,
  setOrchestratedActorMuted,
  isOrchestratedActor,
  type PublishedActor
} from '../runtimes/bpx-adapter';
import { kronosCursor } from '../../stores/kronos-cursor.svelte';
// KAN-UX3 — la couche mute MIXER (intention performeur, persistante) : consultée en
// garde des chemins d'armement pour qu'un arm/replay/publish ne ré-arme jamais un
// acteur que le mixer tient muet (module pur, importable sans cycle).
import { mixerMutedFor } from '../mixer/mixer-intent';
import { applyMixerGains } from '../mixer/mixer-gain';
// VOIE B (chantier voix-code-transport [523]) : le transport Kronos partagé des voix de code
// AUTONOMES — plus aucune voix hors transport. L'éval enregistre la voix (registerCodeVoice),
// le cœur relaie Stop/Play/hush au handle (le relais lifecycle coupe/gèle/reprend les moteurs).
import {
  registerCodeVoice,
  stopCodeVoiceTransportInPlace,
  replayCodeVoiceTransport,
  disposeCodeVoiceTransport,
  codeVoiceTransport
} from '../runtimes/kronos-codevoice';
import { createCodeVoicesRuntime, type CodeVoicesRuntime } from 'runtime-codevoices';
import type { LogPush } from '../runtimes/adapter';
import { installConsoleBridge } from '../runtimes/console-bridge';
import { ensureCsoundSoundfiles } from '../runtimes/csound-soundfiles';
import { enableMidi, type MidiEvent } from '../midi/midi-input';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';
import { production } from '../../stores/production.svelte';

// LE runtime des voix de code AUTONOMES (partagé, lazy). Il ÉVALUE les voix autonomes (capture
// §3.1 — résout l'interprète, tire le moteur) et, une fois enregistré sur le transport autonome,
// s'abonne au bus de cycle de vie. Backticks vides (une voix autonome n'a pas de scène .bps ;
// l'interprète voyage en argument d'`evaluate`). fileId par voix = via `src`.
let _autonomousCV: CodeVoicesRuntime | null = null;
function autonomousCodeVoices(log: LogPush): CodeVoicesRuntime {
  if (!_autonomousCV) {
    _autonomousCV = createCodeVoicesRuntime({ backticks: {}, fileId: 'autonomous', log });
  }
  return _autonomousCV;
}

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
    // (Le mètre de scène — DeriveResult.meter, autorité BPx — n'est plus POUSSÉ dans le clock : le
    //  readout DÉRIVE `kronosCursor.active.beatsPerBar` en direct (KAN-C09, [562]). Plus de setMeterSink.)
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
        // KAN-UX3 — a mono `.gr`/`.bps` publishes no actors but DID rebuild the
        // AudioRuntime: re-project the persisted gains (master volume/mute) too.
        applyMixerGains();
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
          active: true,
          outputTransport: p.outputTransport,
          error: p.error
        }))
      );
      // KAN-UX3 — a fresh publish re-registered the voices fully armed; re-apply the
      // PERSISTENT mixer mutes (performer intent, keyed by actor name) so they survive
      // re-evals and scene loads. The arming re-sync at replay is handled separately
      // (`replayActiveScene`).
      for (const p of published) {
        if (mixerMutedFor(p.name)) setOrchestratedActorMuted(p.name, true);
      }
      // KAN-UX3 — the eval rebuilt the AudioRuntime: re-project the persisted
      // VOLUME intent (master gain/mute + per-actor gains) onto the fresh
      // instance, same hook as the mixer-mute re-application just above.
      applyMixerGains();
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
    // Activating a scene BY ACTOR SET only ARMS its actors (LEDs) — it does NOT
    // start the transport (Romain 2026-07-14: arm ≠ play, beta issue 5 self-start
    // removed; see `handleActorToggle`). A file-scene (below) is a DIFFERENT,
    // unaffected gesture: it explicitly evaluates the referenced child `.bps`,
    // which DOES build/play a Kronos handle — loading a file-scene table entry
    // has always been an explicit "play this file" action.

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
      if (willBeMuted) setOrchestratedActorMuted(a.name, true);
      // Un-muting the ARMING layer must not override the MIXER layer (KAN-UX3).
      else if (!mixerMutedFor(a.name)) setOrchestratedActorMuted(a.name, false);
      return;
    }
  }

  private async handleActorToggle(a: Actor, willBeActive: boolean) {
    // Orchestrator `.bps` actor: arm/disarm sets ONLY the "ready" intent (the LED
    // + the voice's mute flag) for this actor — it NEVER starts the transport
    // (Romain 2026-07-14: arm ≠ play; the old "arm = play" self-start, beta issue
    // 5, is retired). `setOrchestratedActorMuted` is safe to call regardless of
    // transport state: Kronos gates emission on its OWN running state, so
    // unmuting an actor while stopped routes no sound (confirmed
    // orchestrator-actors.test.ts "unmute on a STOPPED transport ... does not
    // fire sound"). The Play button (`playback.play()` → `replayActiveScene` /
    // `replayArmed`) is the sole gesture that starts Kronos, and re-projects this
    // same arm/mute intent onto the freshly-(re)built scene.
    if (isOrchestratedActor(a.name)) {
      if (willBeActive) {
        // An actor armed while mixer-muted stays silent — the mixer layer wins (KAN-UX3).
        if (!mixerMutedFor(a.name)) setOrchestratedActorMuted(a.name, false);
        this.log({ runtime: a.runtime, level: 'info', msg: `arm [${a.name}]` });
      } else {
        setOrchestratedActorMuted(a.name, true);
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
    // Voix de code AUTONOME : évaluée À TRAVERS l'adaptateur uniforme de runtime-codevoices
    // (capture §3.1 — il résout l'interprète et tire le moteur), pas via la registry hôte. Les
    // natifs bp3/bpscript passent par leur adaptateur BPx. (Une voix de code n'a pas de produceOnly.)
    if (runtime !== 'bp3' && runtime !== 'bpscript') {
      // [764](e) — un CSD lit ses soundfiles depuis le FS virtuel Csound ; l'hôte les fournit AVANT
      // l'éval (fetch depuis le store auto-hébergé -> writeCsoundFile). Best-effort, ne throw jamais.
      if (runtime === 'csound') await ensureCsoundSoundfiles(code, this.log);
      await autonomousCodeVoices(this.log).evaluate(
        code,
        { actorId: slotId, fileId: sourceId, docOffset, flags },
        runtime
      );
    } else {
      await adapter.evaluate(
        code,
        { actorId: slotId, fileId: sourceId, docOffset, flags, produceOnly },
        this.log
      );
    }

    // PRODUCE-only (scene opened, not played): the adapter derived + published the
    // structure, but we must NOT touch the transport or light the actor LED — the
    // scene is ready, not playing. Play sounds it later.
    if (produceOnly) return;

    // Surgical: a manual Ctrl+Enter (re)sounds ONLY this block — the block just evaluated
    // above is already live. A bp3/bpscript/.gr eval builds a Kronos handle (transport →
    // running, so the readout follows the single authority). VOIE B [523] : une voix de
    // code AUTONOME (Strudel/Hydra/… évaluée seule) passe elle AUSSI sous un transport
    // Kronos — le transport partagé des voix autonomes : l'éval (qui vient de tirer le
    // code) enregistre la voix dessus et le curseur le lit → l'afficheur dit PLAYING au
    // BPM porté (REV-F02) et Stop/Pause gouvernent la voix via le relais lifecycle
    // (REV-F01). Toujours AUCUN état inventé : l'état affiché EST celui du transport.
    if (runtime !== 'bp3' && runtime !== 'bpscript') {
      // Tempo de session (D10) — import DYNAMIQUE du store (même règle anti-cycle que
      // blocks.svelte plus haut : store → core → real-core).
      const { clock } = await import('../../stores/clock.svelte');
      // On met la voix (déjà tirée) SOUS le transport autonome, en y ENREGISTRANT l'adaptateur
      // uniforme de runtime-codevoices : Kronos l'abonne au bus de cycle de vie (le re-tir /
      // gel / reprise / tais-toi passent par le bus, plus par un refire hôte).
      const handle = registerCodeVoice({
        runtime: autonomousCodeVoices(this.log),
        bpm: clock.state.bpm
      });
      kronosCursor.set(handle);
    }
  }

  /** Broadcast one transport SENTINEL, then set the actors' LEDs. Per-runtime by id,
   *  best-effort — `listRuntimes()` returns unique Map keys, so no dedup is needed.
   *  The sentinel rides `stop()`'s `{actorId, fileId}`.
   *
   *  PORTÉE (chantier voix-code-transport [523]) : `__hush__` (panique) va à TOUS les
   *  runtimes — c'est LE mot que chaque adaptateur voix-de-code documente comme hush
   *  total. Les sentinelles Model C (`__stop_in_place__`/`__replay__`) sont le protocole
   *  des adaptateurs BPX (elles pilotent leur handle Kronos) : les envoyer à un
   *  adaptateur voix-de-code lui faisait SUPPRIMER un slot fantôme puis RE-FLUSHER son
   *  composite — la voix se RE-TIRAIT après le stop propre (mécanisme REV-F01, vu à
   *  l'écran). Les voix de code sont gouvernées par le RELAIS lifecycle de leur
   *  transport (orchestré : handle de scène ; autonome : transport voie B), jamais par
   *  ces sentinelles → on ne les leur envoie plus. */
  async #broadcast(sentinel: string, ledsActive: boolean): Promise<void> {
    const bpxOnly = sentinel === '__stop_in_place__' || sentinel === '__replay__';
    for (const id of listRuntimes()) {
      if (bpxOnly && id !== 'bp3' && id !== 'bpscript') continue;
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
    // Full hush: silence every runtime + LEDs off. Le transport des voix autonomes est
    // DÉMONTÉ (les voix sont déjà tues par `__hush__` ; sans teardown, l'afficheur
    // continuerait de dire « playing » sur une session muette). Même règle que les handles
    // de scène au hush : le curseur ne pointe pas un handle mort.
    await this.#broadcast('__hush__', false);
    const wasCursor = kronosCursor.active === (codeVoiceTransport() as unknown);
    disposeCodeVoiceTransport();
    if (wasCursor) kronosCursor.set(null);
  }

  async stopInPlace(): Promise<void> {
    // Model C STOP: each bpx adapter returns its live scene's playhead to 0 and cuts
    // its sound WITHOUT discarding the derived timeline (the handle / kronos cursor stay
    // live so a Play replays the same timeline). LEDs off (the scene is stopped).
    // Voix AUTONOMES (voie B) : leur transport passe à 'stopped' — le relais lifecycle
    // coupe chaque voix (tais-toi immédiat, REV-F01) ; le handle persiste pour un replay.
    await this.#broadcast('__stop_in_place__', false);
    stopCodeVoiceTransportInPlace();
  }

  async replayActiveScene(): Promise<void> {
    // Model C PLAY-from-stopped: each bpx adapter restarts its persisted (stopped)
    // handle from 0 with NO re-derivation. LEDs back on (the scene is sounding again).
    // Voix AUTONOMES (voie B) : leur transport repart aussi — stopped→running, le relais
    // re-tire chaque voix dans son slot (même performance, même armement).
    await this.#broadcast('__replay__', true);
    replayCodeVoiceTransport();
    // CVA-INIT — the replay's `reset()` cleared the audio arming (`_muted`) for a pristine
    // 1st loop; RE-APPLY the composed arming from the actor store (the AUTHORITY) so a
    // stop→play REPRODUCES the same performance: an orchestrated actor muted/disarmed before
    // Stop must stay silent on replay (else stop→play would silently change the arming →
    // non-deterministic, décision archi [448]). Armed actors need nothing (reset already
    // re-armed them). No-op in mono (no orchestrated actors); `setOrchestratedActorMuted`
    // is itself a no-op for a name with no live voice. Kronos is separately adding its
    // OWN mute re-affirmation across a replay ([673] NB) — this host loop stays as belt
    // over that until confirmed redundant, same pattern as the runtime-audio gain guarantee below.
    for (const a of this.actors.list()) {
      // `mixerMutedFor`: the PERSISTENT mixer layer (KAN-UX3) is re-applied here too —
      // the replay `reset()` must never un-mute a mixer-muted actor.
      if (isOrchestratedActor(a.name) && (a.muted || !a.active || mixerMutedFor(a.name)))
        setOrchestratedActorMuted(a.name, true);
    }
    // KAN-UX3 — belt over the runtime guarantee: levels + master mute survive
    // `reset()` runtime-side (contract [651]), but re-projecting the persisted
    // intent here keeps replay deterministic from the SAME source of truth.
    applyMixerGains();
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
