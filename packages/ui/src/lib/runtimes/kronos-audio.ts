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

import {
  MaterializedTimeline,
  InternalClock,
  Scheduler,
  RealtimeDriver,
  Cursor,
  Transport,
  type RuntimeAdapter,
  type ScheduledEvent,
  type ModulationBinding
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
  /** STEP audition (one beat of the REAL production, in place). The host builds the
   *  SAME full timeline as normal Play (real scene times, full CV windows) and asks
   *  Kronos to seek to the beat's scene-second and play exactly one beat: the clock
   *  re-anchors at `fromSec` and the scheduler's `playWindow(fromSec, fromSec+durSec)`
   *  bounds EMISSION to that half-open scene window (lookahead included), so no event
   *  past the beat — including the next beat at the window boundary — is ever scheduled.
   *  The beat's note(s) + their release tails play out, nothing after. The CV is sampled
   *  at `fromSec` EXACTLY as in full Play (no re-window, no distortion). Absent ⇒ normal
   *  Play / loop. */
  step?: { fromSec: number; durSec: number };
  /** Host logger (routed to the Console panel). */
  log?: (msg: string) => void;
  /** Déclenche la voix de code à son moment ordonnancé (routée par `output.runtime==='code'`).
   *  `interp` = l'interpréteur, porté par `event.output.device` (strudel/hydra/…). */
  backtickSink?: (
    token: string,
    info: { startSec: number; durSec: number; absTime: number },
    interp?: string
  ) => void;
  /** Coupe les voix de code orchestrées (Strudel/Hydra) — appelé explicitement à la PAUSE. */
  stopCodeVoices?: () => void;
  /** Re-déclenche les voix de code dans leurs slots — appelé à la REPRISE après une pause-cut. */
  refireCodeVoices?: () => void;
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
  /** Cut the scene's sustained code voices (Strudel/Hydra) — host-managed PAUSE-cut. */
  cutCodeVoices(): void;
  /** Re-fire the scene's code voices in their slots — RESUME after a pause-cut. */
  refireCodeVoices(): void;
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
  // STEP auditions ONE beat in place: never loop, and seek to the beat's scene
  // second (the timeline + CV windows are the full production's, untouched).
  const step = opts.step;
  // BUILD-ONLY (Model C produce/load): construct the machine + timeline but DON'T play.
  // A STEP always plays its window, so it is never build-only. Determined HERE (not just
  // before the play branch) so every "would actually sound" side-effect — including the
  // OSC relay socket below — can stay gated behind it.
  const buildOnly = step ? false : !!opts.buildOnly;
  const loop = step ? false : opts.loop;
  const startScene = step ? step.fromSec : (opts.startSceneSec ?? 0);
  const log = opts.log ?? (() => {});
  const backtickSink = opts.backtickSink;

  // 1. Placeholder timeline — Kronos's `Scheduler`/`Cursor` need an initial Timeline, but
  //    the REAL played timeline is the Kairos projection that `bindStructureSource` swaps in
  //    at bind (it ALSO sets the cursor loop length from the swapped view — Kronos 4aea362).
  //    So this empty placeholder is transient; its only seed is `opts.durationSec` (the
  //    BPx-compiled length) for the brief window before the swap. Kanopi builds NO timeline
  //    from events — the single read path is the tree → Kairos projection.
  const duration = opts.durationSec ?? 0;
  const timeline = new MaterializedTimeline([], duration);

  // 2. Clock on the shared AudioContext; anchor at the current instant (the host
  //    calls us right where it would have started the dispatcher).
  const clock = new InternalClock({ now: () => audioCtx.currentTime, derivedTempo });
  clock.setDerivedTempo(derivedTempo);
  clock.start(startScene);

  // 2b. AUDIO OUTPUT = the runtime-audio AudioRuntime, built HERE (where the shared clock
  //     lives — it needs `musicalNow`/`audioTimeFor` to map t_scene↔t_audio for CV). It is
  //     the 'audio'/'webaudio' SINK: a token resolves to Hz via the shared `pitch`, CV
  //     renders from `content.modulations`. A host-provided `sinks.webaudio`/`sinks.audio`
  //     (tests inject capture) OVERRIDES it.
  // KAI-10 — the AudioRuntime reads `content.pitch.hz` off each event (graven by Kairos);
  // the host injects NO pitch resolver (the `pitch` option is gone — Kanopi resolves nothing).
  const audioRuntime = createAudioRuntime(audioCtx, {
    clock,
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
      modulations?: ModulationBinding[] | null;
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
  // sink resolves it itself.
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
  const scheduler = new Scheduler({ clock, timeline, loop });
  if (audioSink) {
    scheduler.addAdapter('audio', audioAdapter);
    scheduler.addAdapter('webaudio', audioAdapter);
  }
  if (midiSink) scheduler.addAdapter('midi', midiAdapter);
  if (oscSink) scheduler.addAdapter('osc', oscRuntimeAdapter);
  if (backtickSink) scheduler.addAdapter('code', codeAdapter);

  // The playing cursor (EX4 phase 2): the INVERSE of the time authority, not a separate
  // counter — it reads the same `clock` the scheduler does, so the drawn playhead is
  // rigorously aligned to the heard audio (no ~1-note lag) and monotone from `startScene`
  // (the only return-to-0 is the legitimate loop crossing). The timeline's single cursor.
  const cursor = new Cursor(clock, { loopDuration: duration, loop });

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
  const transport = new Transport({ clock, scheduler, cursor });
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
  const driver = new RealtimeDriver({
    clock,
    scheduler: transport,
    lookahead: LOOKAHEAD_SEC,
    intervalMs: 25
  });
  // BUILD-ONLY (Model C produce/load): construct the machine + timeline but DON'T play —
  // transport stays 'stopped', the driver is NOT started, so nothing is ever emitted (zero
  // sound, the audio context is not woken here). The host registers this persistent handle
  // and the first Play calls `replay()` (= 0 re-derivation). A STEP always plays its window.
  // (`buildOnly` is computed up top so the OSC socket mount is gated by it too.)
  if (buildOnly) {
    // Park the position at the start scene second (frozen, transport 'stopped'); do not arm
    // the scheduler, do not start the pump. `replay()` will `transport.play()` + `driver.start()`.
    transport.seek(startScene);
  } else if (step) {
    // Audition one tree unit IN PLACE: seek to the unit, step once. The step grain is
    // now the STRUCTURE's own unit (Kronos decision 2026-06-30, CVA-7) — `step(1)` lands
    // on the next tree position, so the host no longer hands Kronos a time grain.
    transport.seek(step.fromSec);
    transport.step(1);
    driver.start();
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

  let stopped = false;

  // CVA-2 — playhead aligned to the SPEAKER, not to the audio being processed.
  // The injected clock (l.271) reads raw `audioCtx.currentTime`, so `transport.position()`
  // tracks the frame being PROCESSED; the speaker trails it by `audioCtx.outputLatency`
  // (~32 ms measured here). Kronos's core position is exact (CVA-2 handoff) — the missing
  // term is the host's `outputLatency`, ours to apply since we own the injected clock.
  // We shift only the DISPLAY read (scheduling/anchoring keep raw currentTime): subtract
  // the SCENE-second duration of `outputLatency`, computed via the clock's own `musicalNow`
  // map (rate-exact, tempo-warp aware), then fold into the loop so the wrap shows the
  // previous iteration's tail that is still sounding at the boundary. No host counter —
  // every term is a Kronos read.
  const alignToSpeaker = (raw: number): number => {
    const L = audioCtx.outputLatency || 0;
    if (L <= 0) return raw;
    const a = clock.now();
    const lagScene = clock.musicalNow(a) - clock.musicalNow(a - L);
    let p = raw - lagScene;
    // Fold modulo the LIVE loop length read FROM Kronos (`cursor.loopDuration`, which
    // Kronos resyncs at every timeline swap AND tempo warp — structure-source, cursor
    // 4aea362), NOT the construction-time `duration` constant. A live tempo change or a
    // re-derive changes the scene-second loop length (e.g. 13.9 s → 21.3 s on a decel,
    // → 9.6 s on an accel); folding the DISPLAY modulo the frozen `duration` wrapped the
    // playhead at the OLD second — the loop appeared to restart at the wrong place and
    // rests/notes drew shifted (CVA-L3, facette boucle, déclenchée par un changement de
    // BPM en cours de boucle). The host READS Kronos's bound; it never holds its own.
    const loopLen = cursor.loopDuration;
    if (loopActive && loopLen > 0) p = ((p % loopLen) + loopLen) % loopLen;
    else if (p < 0) p = 0;
    return p;
  };

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
      // Transport.stop() disarms emission + resets the position; the external pump is
      // host-owned, so stop it here. Code voices are NOT cut here — a same-file re-eval
      // calls this on the previous handle to drop its note timeline and must keep the
      // Hydra/Strudel voice. The explicit transport Stop cuts code voices separately
      // (host `silenceRuntimes` → each code adapter `stop('__hush__')`).
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
      // parks the external pump; the code voices are cut explicitly (the scheduler's own
      // stop must NOT, same rule as everywhere). NO `stopped` flag: a later `replay()`
      // restarts this very scheduler from 0. A full-teardown `stop()` already ran ⇒ no-op.
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
      opts.stopCodeVoices?.();
    },
    replay() {
      // Model C — REPLAY the persisted scene from 0. `transport.stop()` left resume=0, so
      // `transport.play()` re-anchors clock+scheduler at 0 and re-arms emission; the WebAudio
      // transport recreates its nodes on the next `send`. `driver.start()` is idempotent.
      // Re-fire the code voices so Strudel/Hydra restart in their slots. No re-derivation —
      // the SAME timeline plays again. After a full-teardown `stop()` this is a no-op.
      if (stopped) return;
      try {
        transport.play();
        driver.start();
      } catch {
        /* torn down */
      }
      opts.refireCodeVoices?.();
    },
    /** Cut this scene's sustained code voices (Strudel/Hydra) — called on PAUSE (and any
     *  point that must silence them without a full teardown). Host-managed, idempotent. */
    cutCodeVoices() {
      opts.stopCodeVoices?.();
    },
    /** Re-fire this scene's code voices in their slots (RESUME after a pause-cut) — the
     *  pattern restarts in place, no re-derivation of the note timeline. */
    refireCodeVoices() {
      opts.refireCodeVoices?.();
    },
    setReRandom(on: boolean) {
      reRandomActive = on;
      applyReDerive();
    },
    setLoop(on: boolean) {
      loopActive = on;
      scheduler.setLoop(on);
      cursor.setLoop(on);
      applyReDerive();
    },
    position() {
      // The TRANSPORT's position: the cursor while running, the FROZEN position when
      // paused/stopped. The host reads this per-frame to draw the playhead — one
      // authority (Kronos), never a host counter.
      //
      // STEP exception: Kronos's `step(1)` plays `[fromSec, fromSec+grain)` then lands
      // (monotone) at the END `fromSec+grain`. Drawing the playhead there would put the
      // cursor ONE BEAT AHEAD of the note that just sounded. So for a stepped handle the
      // displayed position is the STEPPED beat itself (`fromSec`) — still the Kronos
      // cursor (the scene second it played from), aligned to the heard note.
      if (step) return step.fromSec;
      // CVA-2 latency alignment: align the DISPLAY to the speaker (see alignToSpeaker).
      // Running only — paused/stopped is frozen (no sound), so the raw frozen position is
      // exactly right and must not be shifted.
      return transport.state === 'running'
        ? alignToSpeaker(transport.position())
        : transport.position();
    },
    beatPosition() {
      // Same STEP exception: report the beat AT the stepped second (`fromSec`), via the
      // cursor's own frozen-position formula (no host beat counter), so bar·beat matches
      // the heard note instead of the landing boundary.
      if (step) return cursor.beatPositionForScene(step.fromSec, clock.derivedTempo, beatsPerBar);
      // CVA-2: the bar·beat readout reads the same speaker-aligned second while running,
      // so the numeric display and the playhead pixel agree.
      return transport.state === 'running'
        ? cursor.beatPositionForScene(
            alignToSpeaker(transport.position()),
            clock.derivedTempo,
            beatsPerBar
          )
        : transport.beatPosition(beatsPerBar);
    },
    seek(sceneSec: number) {
      // Re-anchor the time authority and the scheduler to the SAME scene second
      // (no new audio graph): the next scheduled events fire from there and the
      // cursor reads from there — used by a Play-from-position / STEP resume.
      clock.start(sceneSec);
      scheduler.start(sceneSec);
    },
    resume(sceneSec: number) {
      // Resume IN PLACE (no re-eval): drop the pause bound, re-anchor at the frozen
      // boundary, restart the pump. ONE scheduler lives across play→pause→play, so a
      // rapid cycle can't stack a second emitter (the old re-eval-on-resume race that
      // intermittently doubled the audio + left a voice ringing through pause).
      if (stopped) return;
      scheduler.setSceneBound(null);
      clock.start(sceneSec);
      scheduler.start(sceneSec);
      driver.start(); // idempotent: no-op if still running, restarts if pause stopped it
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
