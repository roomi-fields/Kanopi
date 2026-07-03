// Kronos AUDIO driver — Kronos drives the REAL sound (the ONLY engine; legacy removed).
//
// Replaces Kanopi's old dispatcher on the audio path: the Kronos scheduler
// produces the timed events and a thin RuntimeAdapter bridges each one to the
// EXISTING WebAudio synthesis (`core/dispatcher/transports/webaudio.js`). The old
// dispatcher never schedules sound — Kronos alone does (it is kept only as the
// inert structure of transports/resolvers that Kronos reads, never as an emitter).
//
// Coverage: NOTE + per-note CV (cutoff/pan/…) + actor routing + backtick/code
// voices (via the backtick sink) + per-actor MIDI (MidiTransport). The one
// residual gap is control-token STATE mutation — NOT folded yet; this module
// LOGS what it skips (never a silent drop), it does not fall back anywhere.
//
// Integration rule: `@kronos/core` and the WebAudio transport are consumed
// AS-IS. This file is glue — the PLAYED timeline is the Kairos projection (bound on the
// Transport via `bindStructureSource`); this maps each Kronos `ScheduledEvent` → the event
// shape `WebAudioTransport.send(event, absTime)` expects, reusing the dispatcher's own
// `coerceControlValues` and the transport already configured with the scene's resolver.

// Chantier transport-SM [471-482] : Kanopi ne CONSTRUIT plus le moteur (garantie ARCHITECTURALE).
// La FABRIQUE `createTransport` assemble clock+scheduler+cursor+driver EN INTERNE et ne rend qu'un
// handle (commandes + observables LECTURE SEULE + câblage sorties + pompe) — `InternalClock`/
// `Scheduler`/`Cursor`/`MaterializedTimeline` sont RETIRÉS du public (tsc refuse : c'est la preuve
// que l'hôte n'a plus les primitives pour reconstruire une position/step). `ModulationBinding` :
// résidu parti (point 5). `Transport`/`RealtimeDriver` : types seuls (portés par le handle).
import {
  createTransport,
  type KronosTransport,
  type Transport,
  type RuntimeAdapter,
  type ScheduledEvent,
  type ClockProvider
} from '@kronos/core';
// KAN-orchestration P1 — Kairos is the SOURCE of the played timeline (it projects the
// BPx tree into a Kronos Timeline and exposes a StructureSource the Transport PULLs).
// Consumed AS-IS: the host builds it, `charger`s the tree+context, and hands it here.
import type { Kairos } from '@kairos/core';
// Audio OUTPUT — the runtime-audio package's RuntimeAdapter (Web Audio synthesis +
// CV rendering), consumed AS-IS. Kanopi renders NOTHING: it hands the AudioRuntime
// the shared clock and routes Kronos's ScheduledEvents to it (the AudioRuntime reads
// `content.pitch.hz` graven by Kairos — KAI-10 — and renders `content.modulations`).
import { createAudioRuntime } from 'runtime-audio';
// OSC OUTPUT — runtime-OSC's adapter (output profile + WebSocket transport to the
// osc-bridge relay), consumed AS-IS. Kanopi resolves no address: it builds the
// adapter on the shared clock, hands it the actor→device bindings, and routes
// OSC actors' ScheduledEvents to it. The profile maps controls → device addresses.
//
// Imported from the package's BROWSER entry (`runtime-osc/browser`): the default
// barrel re-exports `DeviceLibrary` (`node:os`/`node:fs`) and `UdpTransport`
// (`node:dgram`), Node-only modules that crash in the browser. The `/browser`
// subpath exposes only the browser-safe surface (OscAdapter/OscBridgeProfile/
// WebSocketTransport) — deterministic under both Vite and vitest.
import { OscAdapter, OscBridgeProfile, WebSocketTransport } from 'runtime-osc/browser';
// Reused AS-IS from the core dispatcher: coerces numeric-string controls to
// numbers (vel/filterQ/…) while leaving strings (wave) untouched.
import { coerceControlValues } from '../../../../core/src/dispatcher/dispatcher.js';
import { DEFAULT_BEATS_PER_BAR } from './meter';
// Relais lifecycle voix de code (chantier voix-code-transport S2) : suit l'état RÉEL du
// Transport (pause quantifiée comprise) et relaie gel réel / reprise resynchronisée /
// tais-toi aux moteurs de voix (option (b) 2026-07-03, arbitrage [524]).
import { attachCodeVoiceLifecycle, type CodeVoiceSlot } from './code-voice-lifecycle';

/** A per-runtime OUTPUT SINK this module drives. The host registers sinks BY RUNTIME
 *  NAME (the key Kairos emits in `event.output.runtime`); Kanopi chooses no sink itself —
 *  each ScheduledEvent already carries its route. `absTime` is optional: the AudioRuntime
 *  sink reads the onset off the event, a MIDI sink takes the absolute time. */
interface TransportLike {
  send(event: Record<string, unknown>, absTime?: number): void;
}

export interface KronosAudioOptions {
  /** Compiled loop length in scene seconds (BPx-compiled scene end). Seeds the placeholder
   *  timeline; the REAL loop bound comes from the Kairos timeline `bindStructureSource`
   *  swaps in (it sets the scheduler timeline AND the cursor loop length at bind). */
  durationSec?: number;
  /** Shared AudioContext (the transports' time source). */
  audioCtx: AudioContext;
  /** Tempo (BPM) the events' seconds were derived at. */
  derivedTempo: number;
  /** Beats-per-bar PROJECTED from the derived meter (`DeriveResult.meter`, BPx authority)
   *  for the bar/beat fold. Absent (tests/headless) → `DEFAULT_BEATS_PER_BAR` (4/4). */
  beatsPerBar?: number;
  /** Whether to loop the scene. */
  loop: boolean;
  /** Per-runtime OUTPUT SINKS built by the host (e.g. the per-actor MIDI transport), keyed
   *  by the runtime name Kairos emits in `event.output.runtime` ('midi', …). The AUDIO
   *  ('audio'/'webaudio') and OSC sinks are built HERE (they need the shared clock); a key
   *  present here OVERRIDES the built-in (tests inject capture sinks this way). */
  sinks?: Record<string, TransportLike>;
  /** The derived scene's actor→output table (`tree.metadata.actors`, BPx authority). Used
   *  ONLY to ENUMERATE the OSC devices at setup (actors whose `runtime==='osc'`) so
   *  runtime-OSC can pre-fetch their surfaces (`setBindings`, sync hot path). The per-event
   *  device/channel still travels on `event.output`. Absent ⇒ no OSC. */
  actors?: Record<string, { runtime: string; params?: Record<string, unknown> }>;
  /** OSC output: the osc-bridge WS→UDP relay endpoint the OscAdapter's WebSocket
   *  transport connects to (from `library/routing.json`). */
  oscWsUrl?: string;
  /** Scene-second offset to start from (STEP / resume). Default 0. */
  startSceneSec?: number;
  /** Whether re-random is active (gates the Kairos `reDeriveKairos` re-derive). */
  reRandom?: boolean;
  // (Le champ `step` hôte est RETIRÉ, RC-B : un STEP passe par le handle persistant
  //  `handle.step`/`transport.step(1)`, plus par une construction dédiée avec grain de fenêtre.)
  /** Host logger (routed to the Console panel). */
  log?: (msg: string) => void;
  /** Déclenche la voix de code à son moment ordonnancé (routée par `output.runtime==='code'`).
   *  `interp` = l'interpréteur, porté par `event.output.device` (strudel/hydra/…). */
  backtickSink?: (
    token: string,
    info: { startSec: number; durSec: number; absTime: number },
    interp?: string
  ) => void;
  /** Les voix de code VIVANTES sous ce transport (LAZY : rappelée à chaque transition —
   *  l'orchestré enregistre ses voix APRÈS la construction du handle). Le relais lifecycle
   *  (code-voice-lifecycle.ts) suit `transport.onStateChange` et leur relaie gel réel /
   *  reprise resynchronisée / tais-toi (option (b), décision 2026-07-03 + arbitrage [524]).
   *  Remplace l'ancien couple cut+refire hôte (`stopCodeVoices`/`refireCodeVoices`). */
  codeVoiceSlots?: () => readonly CodeVoiceSlot[];
  /** Logger STRUCTURÉ (niveau + runtime) pour le relais lifecycle — les dégradations
   *  transitoires (moteur sans gel) doivent arriver en `warn` au panneau console, pas en
   *  info préfixée. Requis si `codeVoiceSlots` est fourni. */
  codeVoiceLog?: import('./adapter').LogPush;
  /** BUILD-ONLY (Model C produce/load): construire la machine (clock/scheduler/cursor/driver/
   *  transport) et la timeline SANS jouer — le transport reste 'stopped', le driver n'est PAS
   *  démarré, donc AUCUN `send` n'a lieu (zéro son, le contexte audio n'est pas réveillé ici).
   *  Le handle persistant ainsi obtenu est REJOUABLE : le premier Play appelle `replay()`
   *  (= 0 dérivation). Ignoré quand `step` est fourni (un STEP joue toujours une fenêtre). */
  buildOnly?: boolean;
  /** The Kairos handle the host already `charger`ed with the derived tree + projection
   *  context. It is the SOURCE of the played timeline: its `sourceStructure()` is bound on
   *  the Transport (PULL — Kronos swaps in its projected Timeline at bind AND sets the cursor
   *  loop length), the RealtimeDriver ticks the TRANSPORT (drains Kairos ops, then the
   *  scheduler), and live tempo/mute route through `kairos.demande(...)`. REQUIRED — Kanopi
   *  has a single read path (Kronos via Kairos); there is no legacy events-timeline path. */
  kairos: Kairos;
  /** RE-RANDOM re-derive. The host builds this closure (re-derive grammar with a fresh seed
   *  → `kairos.charger` the new tree → Kronos re-pulls + swaps at the loop edge).
   *  `startKronosAudio` installs it via `kairos.setReDerive(reRandom && loop ? cb : null)` at
   *  construction AND re-arms it on every live `setReRandom`/`setLoop` toggle — so flipping
   *  re-random mid-play takes effect. */
  reDeriveKairos?: () => void;
}

/** Beat/bar readout for the transport display, derived from the SAME playhead as
 *  the audio (loop-folded) → aligned + monotone-from-0. */
export interface KronosCursorBeat {
  beatsTotal: number;
  bar: number;
  beat: number;
  phase: number;
}

export interface KronosAudioHandle {
  /** Kronos's Transport — the single execution state machine + position authority
   *  (`play/pause/stop/step/seek/setTempo/setLoop`, observable `state/position()/
   *  beatPosition()/onStateChange`). The host projects on it; it holds no FSM/counter. */
  transport: Transport;
  /** Beats-per-bar this handle folds bar/beat with (projected from the derived meter).
   *  Read by the cursor store for the onBar/onBeat event derivation. */
  beatsPerBar: number;
  stop(): void;
  /** STOP-IN-PLACE (Model C): return the playhead to 0 and silence everything, but KEEP the
   *  handle REPLAYABLE. `transport.stop()` (→ position 0, emission off, state 'stopped') +
   *  `driver.stop()` + cut the code voices. Unlike `stop()` this poses NO one-shot teardown
   *  flag — a later `replay()` restarts the SAME scheduler/timeline. Used by the transport
   *  Stop button (the timeline persists; only the head moves). */
  stopInPlace(): void;
  /** REPLAY the persisted scene from 0 after a `stopInPlace` (Model C): `transport.play()`
   *  (re-anchors clock+scheduler at resume=0, re-arms emission) + `driver.start()` (idempotent)
   *  + re-fire the code voices. No re-derivation, no new scheduler — the SAME timeline the
   *  derivation built plays again. No-op after a full-teardown `stop()`. */
  replay(): void;
  /** STEP `n` tree UNITS in place on the PERSISTENT handle (Model C, RC-B fix): `transport.step(n)`
   *  (Kronos plays the bounded window `[P, position+n)`, snap-to-onset so the reached column SOUNDS
   *  — bug 2 fix — and lands at the next unit boundary) + pump. NO re-derivation, NO host beat
   *  counter (`%n`), NO grille-beat grain: the grain IS Kronos's tree unit (CVA-7). The host gesture
   *  just forwards `step(1)` — it neither counts beats nor re-derives the scene. */
  step(n: number): void;
  /** Live re-random toggle (transport): installs/removes the re-derive on the
   *  ACTIVE scheduler so toggling re-random mid-play takes effect at the next loop
   *  boundary (gated by the current loop state). The legacy dispatcher path has the
   *  twin; in kronos mode this handle drives the audio, so the toggle must reach it. */
  setReRandom(on: boolean): void;
  /** Live loop toggle (transport): updates the scheduler + cursor loop state and
   *  re-evaluates whether the re-derive should be installed (re-random ⊗ loop). */
  setLoop(on: boolean): void;
  /** Playhead in scene seconds, READ from the Transport (cursor while running, frozen
   *  position when paused/stopped). The host reads this per-frame; one authority. */
  position(): number;
  /** Beat/bar readout, READ from the Transport (frozen-aware). */
  beatPosition(): KronosCursorBeat;
  /** Re-anchor + reposition the playhead to a scene second (seek, no new audio):
   *  same primitive a Play-from-position uses — the next scheduled events fire
   *  from there and the cursor reads from there. */
  seek(sceneSec: number): void;
  /** Resume IN PLACE after a pause — WITHOUT re-evaluating the scene.
   *  Clears the pause emission bound, re-anchors clock+scheduler at `sceneSec` (the
   *  frozen beat boundary), and restarts the driver pump. The SAME scheduler/timeline
   *  lives across the whole play→pause→play cycle, so no second emitter is ever
   *  created (the re-eval-on-resume path stacked schedulers → intermittent doubling). */
  resume(sceneSec: number): void;
  /** Live tempo change WITHOUT re-deriving: warps the heard tempo by re-anchoring
   *  the clock at the current instant and adopting the new BPM for future
   *  scene→audio conversions (the scene position stays continuous, no jump). The
   *  legacy dispatcher's `setLiveTempo` has the twin; in kronos mode this handle
   *  drives the audio, so a BPM/TAP change mid-play must reach it here. */
  retune(bpm: number): void;
  /** Arm/disarm an orchestrated actor's NOTE voice while the rest keep playing
   *  (orchestrated kronos path). Disarming silences that actor's notes at the
   *  scheduler's emission gate (Kronos owns the audio in this mode); re-arming
   *  lets them through again at the next emission. A code voice (Strudel/Hydra)
   *  is NOT note-routed — its arm/disarm is handled by its own adapter, not here.
   *  No-op for the mono path (no actors). */
  setActorMuted(actor: string, muted: boolean): void;
}

// Scheduler look-ahead window (seconds).
const LOOKAHEAD_SEC = 0.12;

/**
 * ENUMERATE the scene's OSC devices for runtime-OSC's setup (`setBindings`, whose hot
 * `map()` is sync and pre-fetches device surfaces). The list is DERIVED from the scene's
 * actor→output table (`metadata.actors`) — the OSC actors (`runtime==='osc'`) and their
 * transport `params` (device + ch/channel). Kanopi chooses no binding; the per-event
 * device/channel still rides `event.output`. Keyed by ACTOR (the key runtime-OSC's profile
 * resolves on `event.actor`). `{ ... }` empty ⇒ no OSC.
 */
function deriveOscBindings(
  actors: Record<string, { runtime: string; params?: Record<string, unknown> }> | undefined
): Record<string, { device?: string; channel?: number }> {
  const out: Record<string, { device?: string; channel?: number }> = {};
  for (const [name, ref] of Object.entries(actors ?? {})) {
    if (ref.runtime !== 'osc') continue;
    const p = ref.params ?? {};
    const device = typeof p.device === 'string' ? p.device : undefined;
    const channel =
      typeof p.channel === 'number' ? p.channel : typeof p.ch === 'number' ? p.ch : undefined;
    out[name] = { device, channel };
  }
  return out;
}

/**
 * Start Kronos driving the real audio for one scene. Call JUST BEFORE the host
 * would have started the old dispatcher (the transports are already configured);
 * in kronos mode the host then SKIPS `dispatcher.start` so only Kronos sounds.
 * `stop()` tears down the driver; the host's `dispatcher.stop()` closes the
 * transports (cuts the scheduled audio) as usual.
 */
// PILOTAGE (DEV) — observateur STRICTEMENT lecture-seule des events audio forwardés au sink, posé
// par la façade `window.kanopi` (kanopi-api.ts) pour remplacer l'ancien tap `AudioRuntime.send`
// ad-hoc. Nul en prod (jamais posé). Le forward réel ne dépend JAMAIS de lui (cf. audioAdapter).
let audioForwardObserver: ((e: unknown) => void) | null = null;
export function setAudioForwardObserver(fn: ((e: unknown) => void) | null): void {
  audioForwardObserver = fn;
}

// PILOTAGE (DEV) — affordance de MESURE de la sortie : Kanopi ne tient AUCUN nœud audio ; il lit
// seulement des NOMBRES via l'affordance lecture-seule de runtime-audio (enableMeter/getMeasurement/
// getFloatFrequencyData/disableMeter, commit 6148d03). Référence sur l'AudioRuntime COURANT (mis à
// jour à chaque build de handle) que la façade `window.kanopi` lit. Nul en prod.
export interface AudioMeter {
  enableMeter(opts?: { fftSize?: number }): void;
  disableMeter(): void;
  getMeasurement(): { rms: number; spectralCentroid: number } | null;
  getFloatFrequencyData(arr: Float32Array): void;
}
let currentAudioMeter: AudioMeter | null = null;
export function pilotAudioMeter(): AudioMeter | null {
  return currentAudioMeter;
}

export function startKronosAudio(opts: KronosAudioOptions): KronosAudioHandle {
  const { audioCtx, derivedTempo } = opts;
  // Bar fold width = the derived meter's beats-per-bar (BPx authority), default 4.
  const beatsPerBar = opts.beatsPerBar ?? DEFAULT_BEATS_PER_BAR;
  // BUILD-ONLY (Model C produce/load): construct the machine + timeline but DON'T play.
  // Determined HERE (not just before the play branch) so every "would actually sound"
  // side-effect — including the OSC relay socket below — can stay gated behind it.
  // (Le STEP hôte est RETIRÉ, RC-B : il passe par le handle PERSISTANT `transport.step(1)`
  // via `handle.step`, plus par une construction dédiée avec un grain.)
  const buildOnly = !!opts.buildOnly;
  const loop = opts.loop;
  const startScene = opts.startSceneSec ?? 0;
  const log = opts.log ?? (() => {});
  const backtickSink = opts.backtickSink;

  // 1. Placeholder timeline — Kronos's `Scheduler`/`Cursor` need an initial Timeline, but
  //    the REAL played timeline is the Kairos projection that `bindStructureSource` swaps in
  //    at bind (it ALSO sets the cursor loop length from the swapped view — Kronos 4aea362).
  //    So this empty placeholder is transient; its only seed is `opts.durationSec` (the
  //    BPx-compiled length) for the brief window before the swap. Kanopi builds NO timeline
  //    from events — the single read path is the tree → Kairos projection.
  const duration = opts.durationSec ?? 0;

  // FABRIQUE (chantier transport-SM [471-482]) — DRAFT en cours : UN appel assemble
  // clock+scheduler+cursor+driver+transport EN INTERNE et rend le handle (commandes + observables
  // LECTURE SEULE + câblage sorties + pompe). Remplace l'ancien assemblage manuel (new InternalClock
  // / new Scheduler / new Cursor / new Transport / new RealtimeDriver, tous retirés du public). La
  // timeline placeholder est créée EN INTERNE (durationSec) ; Kairos la remplace au bind.
  // À FINALISER (dès surface Kronos confirmée finale) : les usages downstream `scheduler`/`cursor`/
  // `transport`/`driver` deviennent `kronos.addAdapter`/`kronos.transport`/`kronos.driver` ;
  // le fold hôte `alignToSpeaker` (cursor.loopDuration) → `kronos.transport.position()` /
  // `loopDurationScene()` (repli INTERNE, plus aucun fold hôte = la garantie).
  const kronos: KronosTransport = createTransport({
    now: () => audioCtx.currentTime,
    derivedTempo,
    startScene,
    durationSec: duration,
    loop,
    lookahead: LOOKAHEAD_SEC,
    intervalMs: 25
  });

  // 2b. AUDIO OUTPUT = the runtime-audio AudioRuntime (the 'audio'/'webaudio' SINK). KAI-10 — it
  //     reads `content.pitch.hz` off each event (graven by Kairos) and renders `content.modulations`.
  //     A host-provided `sinks.webaudio`/`sinks.audio` (tests inject capture) OVERRIDES it.
  // CANAL (B) — CÂBLÉ ([485]→[494], archi tranché + openDAW) : le time-view du sink (musicalNow/
  //    audioTimeFor pour placer les CV) NE PASSE PAS par l'hôte — sinon l'hôte pourrait reconstruire
  //    la position. KRONOS l'injecte lui-même : à `addAdapter`, il appelle `adapter.bindClock?.(clock)`
  //    (scheduler.ts:118,124) avec SA vue `ClockProvider` LECTURE SEULE ; l'`audioAdapter` ci-dessous
  //    la TRANSMET au moteur de rendu (champ public `audioRuntime.clock`, lu frais à chaque usage).
  //    L'hôte ne construit plus de clock et n'appelle JAMAIS musicalNow — par construction.
  const audioRuntime = createAudioRuntime(audioCtx, {
    // clock : PAS ici — la vue horloge arrive par le canal adaptateur (B), de Kronos, jamais de l'hôte.
    sounds: undefined
  });
  // PILOTAGE (DEV) : expose l'AudioRuntime courant pour la sonde audio de `window.kanopi`. Lecture
  // seule (le pilot n'appelle QUE l'affordance meter). Écrase la ref précédente → l'ancien runtime
  // reste GC-able à la destruction du handle.
  currentAudioMeter = audioRuntime as unknown as AudioMeter;
  const audioSink: TransportLike | null =
    opts.sinks?.webaudio ?? opts.sinks?.audio ?? (audioRuntime as unknown as TransportLike | null);

  // MIDI OUTPUT = the host-built per-actor MidiTransport, handed in as `sinks.midi`.
  const midiSink: TransportLike | null = opts.sinks?.midi ?? null;

  // OSC OUTPUT (OSC-5b): runtime-OSC's adapter, built HERE (it schedules on the shared
  // `audioCtx` clock — `now` must be the SAME scale as the event onset). The device
  // ENUMERATION for setup (`setBindings`, sync hot path) is DERIVED from the scene's OSC
  // actors in `metadata.actors`; the per-event device/channel rides `ev.output`. A
  // host-provided `sinks.osc` overrides the built-in (tests).
  // Gated by `!buildOnly`: a produce/load opens NO real WebSocket to the relay (the
  // transport stays muted — opening a live connection during a silent build violates
  // the buildOnly contract, exactly as `driver.start()` is gated below). The socket
  // mounts only when the scene will actually play.
  const oscBindings = deriveOscBindings(opts.actors);
  let oscAdapter: InstanceType<typeof OscAdapter> | null = null;
  if (!buildOnly && Object.keys(oscBindings).length > 0 && opts.oscWsUrl) {
    try {
      // Build the socket ourselves so a relay that is down (connection refused) is LOGGED
      // once rather than silently queueing frames forever: the WebSocketTransport ctor
      // returns synchronously, before the async connection result, so a dead relay never
      // surfaces through the try/catch otherwise.
      const url = opts.oscWsUrl;
      const ws = new WebSocket(url);
      let oscErrLogged = false;
      const onOscUnreachable = () => {
        if (oscErrLogged) return;
        oscErrLogged = true;
        log(`⚠ relais OSC injoignable (${url}) — voix OSC en attente, non émises`);
      };
      ws.addEventListener('error', onOscUnreachable);
      ws.addEventListener('close', (e) => {
        if (!(e as CloseEvent).wasClean) onOscUnreachable();
      });
      const transport = new WebSocketTransport({ socket: ws });
      oscAdapter = new OscAdapter({
        transport,
        profile: new OscBridgeProfile({ log: (m: string) => log(m) }),
        now: () => audioCtx.currentTime
      });
      // setBindings pre-resolves device surfaces (async). Catch a rejection so it never
      // becomes an unhandled rejection; the literal-fallback path resolves on a microtask,
      // before the driver's setTimeout-scheduled first emission.
      void oscAdapter.setBindings(oscBindings).catch((err: unknown) => {
        log(`⚠ OSC setBindings a échoué (${String(err)})`);
      });
    } catch (err) {
      log(`⚠ OSC indisponible (${String(err)}) — voix OSC muettes`);
      oscAdapter = null;
    }
  }
  const oscSink: TransportLike | null =
    opts.sinks?.osc ?? (oscAdapter as unknown as TransportLike | null);

  // 3. PER-RUNTIME adapters. Each ScheduledEvent already carries its `output.runtime` route
  //    key (graven by Kairos); the scheduler selects the adapter on that key alone
  //    (`addAdapter(runtime, …)`). Kanopi reads NO actor→transport map and chooses no sink:
  //    'midi' → MidiTransport (channel = ev.output.channel), 'audio'/'webaudio' →
  //    AudioRuntime, 'osc' → OscAdapter (device/channel ride ev.output), 'code' → the
  //    backtick sink (interpreter = ev.output.device). There is NO default adapter — an
  //    event whose runtime has no sink is surfaced by Kronos's `unknown-output-runtime`
  //    diagnostic, never silently rerouted.
  const warned = new Set<string>();
  const warnMissing = (runtime: string): void => {
    if (warned.has(runtime)) return;
    warned.add(runtime);
    log(`⚠ no '${runtime}' sink registered — event(s) dropped`);
  };
  // Coerce numeric-string controls (vel/filterQ/…) to numbers, then drop any leftover CV
  // descriptor OBJECTS — modulation is driven by `content.modulations`, never a literal.
  const prep = (content: unknown) => {
    const c = content as {
      token: string;
      controls?: Record<string, unknown> | null;
      rq?: Record<string, number> | null;
      startSec?: number;
      // Forwarded VERBATIM au sink (jamais manipulé structurellement ici) — la modulation est
      // pilotée par `content.modulations` gravé par Kairos. Type opaque (l'ex-`ModulationBinding`
      // de Kronos est retiré du public : l'hôte ne dépend plus de sa forme).
      modulations?: unknown[] | null;
      // KAI-10 — the pitch facet graven by Kairos (`{hz, noteName, …}`); forwarded
      // verbatim to every output so it reads the canonical Hz off the event.
      pitch?: unknown;
    };
    const coerced = coerceControlValues(c.controls);
    for (const k of Object.keys(coerced)) {
      if (coerced[k] && typeof coerced[k] === 'object') delete coerced[k];
    }
    const velRaw =
      typeof coerced.vel === 'number'
        ? coerced.vel
        : typeof c.rq?.vel === 'number'
          ? c.rq.vel
          : undefined;
    return { c, coerced, velRaw };
  };

  // AUDIO: the AudioRuntime resolves token→Hz (shared `pitch`) and RENDERS
  // `content.modulations`. MIDI 0..127 `vel` → 0..1 `velocity`.
  const audioAdapter: RuntimeAdapter = {
    // Canal (B) : KRONOS appelle ceci à l'enregistrement (`addAdapter`) avec SA vue horloge
    // LECTURE SEULE (`ClockProvider` : now/musicalNow/audioTimeFor/rate/snapshot, zéro mutateur).
    // L'hôte TRANSMET la référence au moteur de rendu — il ne la stocke pas ailleurs, ne la lit
    // pas, ne recompute jamais un time-view : le sink LIT la carte de Kronos, l'autorité de
    // position reste inatteignable (pas de handle, pas de curseur) — garantie par construction.
    bindClock(clock: ClockProvider) {
      audioRuntime.clock = clock;
    },
    send(ev: ScheduledEvent) {
      if (!audioSink) return warnMissing('audio');
      const { c, coerced, velRaw } = prep(ev.content);
      const controls: Record<string, unknown> = { ...coerced };
      if (velRaw != null) controls.velocity = velRaw / 127;
      const outEvent = {
        onset: ev.onset,
        duration: ev.duration,
        actor: ev.actor,
        kind: ev.kind,
        // CONTRAT_SINK_CONTROLE §3 : l'étiquette `nature` d'un `kind:'control'`
        // (instant/transport-control) voyage VERBATIM — le sink l'applique ou l'ignore,
        // l'hôte ne l'interprète jamais (routage Kronos, application sortie).
        nature: ev.nature,
        // SUPERP-1: forward the OCCURRENCE discriminant Kronos posed at emission
        // (scheduler.ts, the loop-tour scene base). runtime-audio keys its persistent
        // group-filter buses by `(busRef, occurrence)` (adapter.js _wireBuses) — a new
        // tour = a new occurrence = a fresh bus, never a faulty cross-tour share. It rides
        // at the EVENT level (like onset), outside the opaque `content`.
        occurrence: ev.occurrence,
        // KAI-10: forward the graven pitch facet (Kairos `content.pitch.hz`); the
        // AudioRuntime reads `c.pitch.hz` directly (its token→Hz resolver is now only a
        // fallback, retired in the final pitch-module cleanup).
        content: { token: c.token, controls, pitch: c.pitch, modulations: c.modulations ?? [] }
      };
      // PILOTAGE (1)/(b), validé archi [431] : observateur STRICTEMENT lecture-seule de ce qui
      // est FORWARDÉ, verbatim. Le forward réel (ligne suivante) ne dépend JAMAIS de lui —
      // try/catch pour qu'un observateur qui jette ne casse rien, et l'envoi est inconditionnel.
      // Inerte hors DEV (nul tant que le pilot ne l'a pas posé). NE MUTE RIEN.
      if (audioForwardObserver) {
        try {
          audioForwardObserver(outEvent);
        } catch {
          /* un observateur ne peut jamais affecter le rendu */
        }
      }
      (audioSink as { send(e: unknown): void }).send(outEvent);
    }
  };

  // MIDI: the MidiTransport reads a flat event (token + controls). The CHANNEL comes from
  // the OUTPUT layer (`ev.output.channel`, graven by Kairos) — never the host.
  const midiAdapter: RuntimeAdapter = {
    send(ev: ScheduledEvent) {
      if (!midiSink) return warnMissing('midi');
      const { c, coerced, velRaw } = prep(ev.content);
      const event: Record<string, unknown> = {
        token: c.token,
        startSec: c.startSec ?? 0,
        durSec: ev.duration,
        // CONTRAT_SINK_CONTROLE §3 : kind/nature voyagent VERBATIM (un event `control`
        // d'une nature que le sink MIDI ne connaît pas est ignoré par LUI, pas filtré ici).
        kind: ev.kind,
        nature: ev.nature,
        ...coerced
      };
      if (velRaw != null) event.velocity = velRaw / 127;
      // KAI-10: forward the graven pitch facet; the MIDI sink reads `event.pitch.hz`
      // and derives note+bend from it (its token→Hz resolver is now a stand-in only).
      if (c.pitch != null) event.pitch = c.pitch;
      const ch = ev.output?.channel;
      if (typeof ch === 'number') event.chan = ch;
      midiSink.send(event, ev.onset);
    }
  };

  // OSC: hand the OscAdapter the RAW ScheduledEvent (its profile maps `content.controls` to
  // device addresses + `content.token` to note on/off). `output` rides through so the sink
  // reads device/channel from it.
  const oscRuntimeAdapter: RuntimeAdapter = {
    send(ev: ScheduledEvent) {
      if (!oscSink) return warnMissing('osc');
      const { c, coerced } = prep(ev.content);
      (oscSink as { send(e: unknown): void }).send({
        onset: ev.onset,
        duration: ev.duration,
        actor: ev.actor,
        kind: ev.kind,
        // CONTRAT_SINK_CONTROLE §3 : la nature voyage verbatim (le profil OSC route/ignore).
        nature: ev.nature,
        output: ev.output,
        // KAI-10: forward the graven pitch facet; the OSC profile reads `content.pitch.hz`
        // (→ note/Hz address) instead of resolving the token host-side.
        content: {
          token: c.token,
          controls: coerced,
          pitch: c.pitch,
          modulations: c.modulations ?? []
        }
      });
    }
  };

  // CODE: a code voice (`output.runtime==='code'`) is NOT a note — fire it through the
  // backtick sink (the same sink the legacy dispatcher used). Its interpreter rides
  // `ev.output.device` (strudel/hydra/…), already encoded in the BT token's table, so the
  // sink resolves it itself. AGNOSTIQUE AU `kind` (CONTRAT_SINK_CONTROLE §2-3/§7) : le
  // token sonnant BT (kind absent ⇒ 'note') ET un éventuel `kind:'control'` porteur de
  // token tirent le code À LEUR ONSET — même chemin, durée 0 comprise.
  const codeAdapter: RuntimeAdapter = {
    send(ev: ScheduledEvent) {
      const tok = (ev.content as { token?: string }).token;
      if (!tok || !backtickSink) return;
      backtickSink(
        tok,
        {
          startSec: (ev.content as { startSec?: number }).startSec ?? 0,
          durSec: ev.duration,
          absTime: ev.onset
        },
        typeof ev.output?.device === 'string' ? ev.output.device : undefined
      );
    }
    // NOTE: no `stop()` on any adapter. The scheduler's stop must NOT cut the code voices,
    // or a SAME-FILE re-eval (which calls `transport.stop()` on the previous handle to drop
    // its note timeline) would tear down the still-wanted Hydra/Strudel voice. Code voices
    // are host-managed: cut explicitly on Pause/Stop, preserved on a same-file re-eval.
  };

  // 4. Scheduler + per-runtime adapter registration (NO default adapter — the host selects
  //    no sink; every event routes on its own `output.runtime`). A `.gr`/mono scene's
  //    default actor carries `output.runtime='audio'` from the AST, so it lands on 'audio'.
  // Enregistrement des sorties sur le HANDLE (la fabrique n'expose PAS le scheduler ; `kronos.addAdapter`
  // délègue en interne). Plus de `new Scheduler` hôte. NO default adapter (chaque event route sur output.runtime).
  if (audioSink) {
    kronos.addAdapter('audio', audioAdapter);
    kronos.addAdapter('webaudio', audioAdapter);
  }
  if (midiSink) kronos.addAdapter('midi', midiAdapter);
  if (oscSink) kronos.addAdapter('osc', oscRuntimeAdapter);
  if (backtickSink) kronos.addAdapter('code', codeAdapter);

  // The playing cursor (EX4 phase 2): the INVERSE of the time authority, not a separate
  // counter — it reads the same `clock` the scheduler does, so the drawn playhead is
  // rigorously aligned to the heard audio (no ~1-note lag) and monotone from `startScene`
  // (the only return-to-0 is the legitimate loop crossing). The timeline's single cursor.
  // Le curseur est INTERNE au handle (plus de `new Cursor` hôte) : la tête de lecture se lit via
  // `kronos.transport.position()`/`beatPosition()` (la machine replie, source unique — la garantie).

  // RE-RANDOM: Kairos owns the loop-edge pull. `applyReDerive` arms/disarms the host
  // re-derive on KAIROS (`setReDerive`) — gated by `reRandom && loop` — at construction AND
  // on every live `setReRandom`/`setLoop` toggle. The callback (`reDeriveKairos`) re-derives
  // the grammar with a fresh seed and `charger`s Kairos → generation bump → Kronos swaps the
  // new flat at the edge (and resyncs the cursor loop length itself, Kronos 4aea362).
  let loopActive = loop;
  let reRandomActive = !!opts.reRandom;
  const applyReDerive = (): void => {
    opts.kairos.setReDerive(
      reRandomActive && loopActive && opts.reDeriveKairos ? opts.reDeriveKairos : null
    );
  };
  applyReDerive();

  // STEP: audition ONE beat in place. EMISSION-bounded (not wall-clock): the
  // scheduler resumes at `step.fromSec` and bounds emission to the half-open scene
  // window `[fromSec, fromSec + durSec)` — lookahead INCLUDED, so it NEVER schedules
  // the next beat (whose onset is the window boundary). The previous wall-clock
  // `setTimeout(driver.stop)` was fundamentally racy: the lookahead (0.12 s) emitted
  // the next beat before the timer fired → 2 notes on the first step. The scene bound
  // clamps emission deterministically; a note whose duration overflows the window
  // still sounds fully (only emission is bounded). Normal Play keeps `start()`
  // (unbounded) below; a normal `start()` does not inherit the bound.
  // TRANSPORT (REBUILD) — Kronos's single execution state machine + position authority
  // (contract `kronos-transport.md`). Kanopi PROJECTS on it: it calls the commands and
  // READS state/position; it holds no FSM and no position counter. Composition over the
  // same clock/scheduler/cursor, so there is ZERO duplicated state — the position stays
  // the cursor. The host drives play/pause/stop/step/seek/setTempo/setLoop through this.
  const transport = kronos.transport;
  // Kairos drives the SOURCE of the played timeline. Bind its `StructureSource` on the
  // Transport (PULL channel): at bind the Transport swaps Kairos's projected Timeline into
  // the scheduler (replacing the empty placeholder) AND sets the cursor loop length from it
  // (Kronos 4aea362), then re-pulls at each loop edge when Kairos bumps its generation
  // (re-random = a generation bump). `bindStructureSource` installs the scheduler's
  // loop-edge hook itself (which fires `kairos.auBord` → the host `reDeriveKairos`).
  transport.bindStructureSource(opts.kairos.sourceStructure());
  // External pump (Kronos has no internal timer): the driver wakes every ~25 ms within the
  // lookahead window and ticks the TRANSPORT (which drains Kairos's control ops — tempo/mute
  // — THEN ticks the scheduler). Declared before the play branch so a BUILD-ONLY
  // construction can leave it un-started (no pump = no `send` = no sound).
  const driver = kronos.driver;
  // BUILD-ONLY (Model C produce/load): construct the machine + timeline but DON'T play —
  // transport stays 'stopped', the driver is NOT started, so nothing is ever emitted (zero
  // sound, the audio context is not woken here). The host registers this persistent handle
  // and the first Play calls `replay()` (= 0 re-derivation). A STEP always plays its window.
  // (`buildOnly` is computed up top so the OSC socket mount is gated by it too.)
  if (buildOnly) {
    // Park the position at the start scene second (frozen, transport 'stopped'); do not arm
    // the scheduler, do not start the pump. `replay()` will `transport.play()` + `driver.start()`.
    transport.seek(startScene);
  } else {
    // Normal play from the start position (re-anchors clock + arms the scheduler).
    transport.seek(startScene);
    transport.play();
    driver.start();
  }

  log(
    `${buildOnly ? '⏸ kronos built (stopped)' : '▶ kronos audio'} — ` +
      `${duration.toFixed(3)}s, ${derivedTempo} bpm, loop ${loop}` +
      (loop && opts.reRandom ? ', re-random ON' : '')
  );

  // RELAIS LIFECYCLE voix de code (S2) — branché APRÈS la branche play initiale : le tout
  // premier passage stopped→running est l'éval elle-même (le scheduler tire les BT à leur
  // onset), pas un replay à re-tirer. Toute transition SUIVANTE est relayée aux moteurs :
  // gel réel à la pause (quantifiée), reprise resynchronisée, tais-toi au stop. Le
  // détachement AVANT le stop() de teardown préserve la voix à la re-éval same-file.
  const detachVoiceLifecycle =
    opts.codeVoiceSlots && opts.codeVoiceLog
      ? attachCodeVoiceLifecycle(transport, opts.codeVoiceSlots, opts.codeVoiceLog)
      : null;

  let stopped = false;

  // CVA-2 (alignement latence haut-parleur) — RETIRÉ du côté hôte : il lisait `clock.musicalNow`
  // (map t_audio↔t_scène) et foldait `cursor.loopDuration`, deux primitives INTERNES à Kronos
  // désormais retirées du public. La tête de lecture = `transport.position()` directe (Kronos replie
  // en interne, source unique) ; la compensation de latence d'affichage revient à Kronos / au sink
  // via son time-view injecté (gate B). L'hôte ne folde ni ne compense plus rien = la garantie.

  return {
    // The Kronos Transport — the SINGLE state machine + position authority. The host
    // (playback store + transport UI) projects on it: calls its commands and reads
    // state/position. Kanopi keeps no FSM and no position counter.
    transport,
    // The projected meter's beats-per-bar (the cursor store reads it for onBar events).
    beatsPerBar,
    stop() {
      if (stopped) return;
      stopped = true;
      // TEARDOWN (re-éval same-file / swap de scène) : les voix de code NE sont PAS coupées
      // ici — la re-éval doit garder la voix Hydra/Strudel qui sonne (règle existante). On
      // DÉTACHE donc le relais lifecycle AVANT transport.stop(), sinon la transition
      // 'stopped' qu'il observe couperait la voix encore voulue. Le Stop TRANSPORT
      // explicite passe par `stopInPlace` (relais attaché → tais-toi immédiat).
      detachVoiceLifecycle?.();
      try {
        transport.stop();
        driver.stop();
        // OSC: full teardown — cancel pending emissions AND close the relay socket
        // (a same-file re-eval builds a fresh adapter + connection).
        oscAdapter?.close();
      } catch {
        /* already torn down */
      }
    },
    stopInPlace() {
      // Model C — STOP that KEEPS the handle. `transport.stop()` resets the position to 0
      // and disarms emission WITHOUT destroying the timeline/scheduler; `driver.stop()`
      // parks the external pump. Les voix de code sont coupées par le RELAIS lifecycle
      // (transition → 'stopped' = tais-toi immédiat, REV-F01) — plus d'appel hôte exprès.
      // NO `stopped` flag: a later `replay()` restarts this very scheduler from 0. A
      // full-teardown `stop()` already ran ⇒ no-op.
      if (stopped) return;
      try {
        transport.stop();
        driver.stop();
        // OSC: cancel scheduled-but-unsent emissions, but KEEP the socket open — a
        // later `replay()` reuses this same adapter (Model C; no reconnect churn).
        oscAdapter?.stop();
      } catch {
        /* already torn down */
      }
    },
    replay() {
      // Model C — REPLAY the persisted scene from 0. `transport.stop()` left resume=0, so
      // `transport.play()` re-anchors clock+scheduler at 0 and re-arms emission; the WebAudio
      // transport recreates its nodes on the next `send`. `driver.start()` is idempotent.
      // Les voix de code repartent dans leurs slots via le relais lifecycle
      // (stopped→running). No re-derivation — the SAME timeline plays again. After a
      // full-teardown `stop()` this is a no-op.
      if (stopped) return;
      try {
        // CVA-INIT — remise à zéro PRISTINE de la sortie audio AVANT de rejouer. Les nœuds de
        // filtre PERSISTANTS (`ctrl::<controlId>`), les voix et le report de portamento SURVIVENT
        // au `stopInPlace` (qui ne démonte pas le graphe de rendu, seulement le transport). Sans
        // ce reset, le re-play réutilise les mêmes occurrences → le dédup `posed` empêche la
        // re-pose de la courbe → 1re boucle FIGÉE sur l'état de la lecture précédente (le bug).
        // `reset()` (runtime-audio) démonte le graphe → 1er tour identique à froid. Il oublie
        // aussi l'armement (`_muted`) ; sa re-synchro orchestrée (syncActiveControls) est différée
        // — sans effet en mono (aucun acteur désarmé), signalé archi pour l'orchestré.
        // `reset` existe sur l'AudioRuntime (runtime-audio adapter.js:462) mais le type INFÉRÉ
        // du module JS pur amont ne l'expose pas encore → cast défensif (`?.` = no-op si absent).
        (audioRuntime as { reset?: () => void }).reset?.();
        // Le re-tir des voix de code est relayé par le lifecycle (transition
        // stopped→running = replay depuis 0) — plus d'appel hôte exprès.
        transport.play();
        driver.start();
      } catch {
        /* torn down */
      }
    },
    setReRandom(on: boolean) {
      reRandomActive = on;
      applyReDerive();
    },
    setLoop(on: boolean) {
      loopActive = on;
      // Toggle live via les commandes Kronos (l'hôte ne touche pas scheduler/cursor — internes).
      // `setLoop(start,end)` active la boucle pleine (V1 : les bornes sont déclaratives) ; `clearLoop`
      // la désactive. `duration` = longueur de construction (borne déclarative pour l'observabilité).
      if (on) transport.setLoop(0, duration);
      else transport.clearLoop();
      applyReDerive();
    },
    position() {
      // Tête de lecture = position Kronos, source UNIQUE (la machine replie en interne). Plus de
      // FIGEAGE STEP hôte (= fix bug 3 : la barre suit la position réelle au (re)play après un step,
      // au lieu d'être gelée à `fromSec`) ni de fold de latence hôte (le clock est retiré du public).
      // Kronos EST l'autorité de position ; l'hôte lit, ne recompute ni ne fige rien.
      return transport.position();
    },
    beatPosition() {
      // Bar·beat = lecture Kronos directe (plus de figeage step ni de fold hôte). Kronos replie,
      // source unique — l'hôte ne tient aucun compteur de beat.
      return transport.beatPosition(beatsPerBar);
    },
    seek(sceneSec: number) {
      // Re-ancre l'autorité de temps à la scène via la commande Kronos (l'hôte ne touche ni clock ni
      // scheduler — internes ; `transport.seek` re-home + ré-ancre). Play-from-position / STEP resume.
      transport.seek(sceneSec);
    },
    resume(sceneSec: number) {
      // Reprise EN PLACE (no re-eval) : ré-ancre à la borne gelée puis relance. `transport.play()`
      // relève lui-même la borne d'émission posée par `pause()` (transport.ts:158-161) et re-ancre
      // depuis la position de reprise — l'hôte ne touche ni clock ni scheduler (internes). UN seul
      // scheduler vit à travers play→pause→play (pas de 2e émetteur empilé — l'ancienne course).
      if (stopped) return;
      transport.seek(sceneSec);
      transport.play();
      driver.start(); // idempotent: no-op si déjà en marche, relance si la pause l'a arrêté
    },
    step(n: number) {
      // STEP sur le handle PERSISTANT (Model C, RC-B) : Kronos avance d'`n` unités d'arbre (fenêtre
      // bornée + snap-to-onset → la colonne atteinte SONNE = fix bug 2 ; pose à la prochaine borne),
      // puis on pompe. Plus de re-dérivation par geste, plus de compteur %n, plus de grain
      // grille-beat : le grain EST l'unité d'arbre de Kronos (CVA-7). L'hôte transmet juste step(n).
      transport.step(n);
      driver.start();
    },
    retune(bpm: number) {
      // Live tempo goes through Kairos's single write-door (`demande`), quantified
      // `immediat` (applied at the next driver tick, before scheduling). The Transport
      // drains it and re-anchors the clock — Kanopi never re-anchors the clock itself.
      opts.kairos.demande({ type: 'tempo', bpm, quand: 'immediat' });
    },
    setActorMuted(actor: string, muted: boolean) {
      // Actor arm/disarm goes through Kairos's write-door (`demande`), quantified
      // `immediat`. The Transport drains it and applies it on the scheduler's emission
      // filter (Kronos's persistent mute state survives a re-derivation — KAI-7).
      opts.kairos.demande({ type: 'mute', acteur: actor, muet: muted, quand: 'immediat' });
    }
  };
}
