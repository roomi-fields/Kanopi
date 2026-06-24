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
// AS-IS. This file is glue — it maps `DispatchEvent[]` → `MaterializedTimeline`
// and `ScheduledEvent` → the event shape `WebAudioTransport.send(event, absTime)`
// expects, reusing the dispatcher's own `coerceControlValues` and the
// transport already configured with the scene's resolver + modulator registry.

import {
  MaterializedTimeline,
  InternalClock,
  Scheduler,
  RealtimeDriver,
  Cursor,
  Transport,
  type RuntimeAdapter,
  type ScheduledEvent,
  type TimelineEvent,
  type Timeline,
  type ModulationBinding,
  type PitchResolver
} from '@kronos/core';
import type { DispatchEvent } from './tree-dispatch';
// Audio OUTPUT — the runtime-audio package's RuntimeAdapter (Web Audio synthesis +
// CV rendering), consumed AS-IS. Kanopi renders NOTHING: it hands the AudioRuntime
// the shared PitchResolver + the shared clock, and routes Kronos's ScheduledEvents
// to it (the AudioRuntime resolves token→Hz and renders `content.modulations`).
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

/** The WebAudio transport surface this module drives (configured by the host
 *  with the scene's resolver + modulator registry before we touch it). */
interface TransportLike {
  send(event: Record<string, unknown>, absTime: number): void;
}
/** Minimal view of the live dispatcher: its per-actor transport map (built by
 *  the host) and its loop length, read for routing + cycle alignment. */
interface DispatcherLike {
  duration?: number;
  transports?: Record<string, TransportLike>;
  _actors?: Record<string, { transportName?: string | null } | undefined>;
}

export interface KronosAudioOptions {
  /** The SAME DispatchEvents the host built for this scene. */
  events: DispatchEvent[];
  /** Loop length in scene seconds; falls back to dispatcher.duration / max. */
  durationSec?: number;
  /** Shared AudioContext (the transports' time source). */
  audioCtx: AudioContext;
  /** Tempo (BPM) the events' seconds were derived at. */
  derivedTempo: number;
  /** Whether to loop the scene. */
  loop: boolean;
  /** The host dispatcher — its configured transports (MIDI, …) carry per-actor output. */
  dispatcher: DispatcherLike;
  /** Scene pitch resolver (shared `@kronos/core/pitch`). When given, this module builds
   *  the runtime-audio AudioRuntime with it as the AUDIO output (token→Hz + CV render). */
  pitch?: PitchResolver;
  /** OSC output (OSC-5b): per-actor `{device, channel}` bindings (`@actor X device:…
   *  ch:…`). When present, this module builds runtime-OSC's OscAdapter as the 'osc'
   *  transport and pre-resolves these bindings via `setBindings`. Absent ⇒ no OSC. */
  oscBindings?: Record<string, { device?: string; channel?: number }>;
  /** OSC output: the osc-bridge WS→UDP relay endpoint the OscAdapter's WebSocket
   *  transport connects to (from `library/routing.json`). */
  oscWsUrl?: string;
  /** Scene-second offset to start from (STEP / resume). Default 0. */
  startSceneSec?: number;
  /** Mono play-vs-skip predicate (note OR sounding symbol). A token it rejects
   *  is a non-sounding terminal (e.g. a CV modulator name) → marked rest so
   *  Kronos never emits it. Absent ⇒ every note sounds (actor path). */
  soundsFn?: (token: string) => boolean;
  /** Re-random per loop cycle: when set AND `loop`, Kronos calls this at each loop
   *  boundary; it must re-run the BPx derivation (fresh random draw) and return the
   *  fresh dispatch events for the next cycle. Kronos NEVER derives — the host does.
   *  Returns null to replay the current derivation. */
  reDerive?: (() => DispatchEvent[] | null) | null;
  /** Whether re-random is active (gates `reDerive`). */
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
  /** True si ce token est une voix de code (backtick BT<interp><id>), pas une note. */
  isBacktick?: (token: string) => boolean;
  /** Déclenche la voix de code à son moment ordonnancé. Le même sink que le dispatcher legacy. */
  backtickSink?: (
    token: string,
    info: { startSec: number; durSec: number; absTime: number }
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

// Transport beats-per-bar for the Kronos beat readout. Matches the central
// clock's default (4); the cursor folds beats to the scene loop regardless.
const BEATS_PER_BAR = 4;

// Scheduler look-ahead window (seconds).
const LOOKAHEAD_SEC = 0.12;

/**
 * Start Kronos driving the real audio for one scene. Call JUST BEFORE the host
 * would have started the old dispatcher (the transports are already configured);
 * in kronos mode the host then SKIPS `dispatcher.start` so only Kronos sounds.
 * `stop()` tears down the driver; the host's `dispatcher.stop()` closes the
 * transports (cuts the scheduled audio) as usual.
 */
export function startKronosAudio(opts: KronosAudioOptions): KronosAudioHandle {
  const { events, audioCtx, derivedTempo, dispatcher } = opts;
  // STEP auditions ONE beat in place: never loop, and seek to the beat's scene
  // second (the timeline + CV windows are the full production's, untouched).
  const step = opts.step;
  const loop = step ? false : opts.loop;
  const startScene = step ? step.fromSec : (opts.startSceneSec ?? 0);
  const log = opts.log ?? (() => {});
  const sounds = opts.soundsFn ?? (() => true);
  const isBacktick = opts.isBacktick;
  const backtickSink = opts.backtickSink;

  // 1. Map DispatchEvents → Kronos TimelineEvents. Non-sounding terminals and
  //    control/rest markers are flagged so Kronos's note-only dispatch skips
  //    them (it emits `kind:'note'` only). Counts surface what we cover vs skip.
  //    Factored so the re-random loop boundary can rebuild a fresh timeline.
  const buildTimeline = (
    evs: DispatchEvent[]
  ): {
    timeline: MaterializedTimeline;
    noteCount: number;
    restCount: number;
    controlCount: number;
    muteCount: number;
    transposeWarned: boolean;
  } => {
    let notes = 0;
    let rests = 0;
    let controls = 0;
    let mutes = 0;
    let transpose = false;
    const tEvents: TimelineEvent[] = evs.map((e) => {
      let kind: 'note' | 'rest' | 'control';
      if (e.type === 'rest') {
        kind = 'rest';
        rests++;
      } else if (e.type === 'control') {
        kind = 'control';
        controls++;
      } else if (isBacktick?.(e.token)) {
        // Code voice (backtick): ALWAYS dispatched as a note so `send` can intercept
        // it and fire the interpreter — independent of `soundsFn` (which would mark
        // an unknown `BT…` token a non-sounding rest and silence the code voice).
        kind = 'note';
        notes++;
      } else if (!sounds(e.token)) {
        kind = 'rest'; // non-sounding terminal (CV name, mute symbol)
        mutes++;
      } else {
        kind = 'note';
        notes++;
      }
      if (!transpose && e.rq && typeof e.rq.transpose === 'number' && e.rq.transpose !== 0) {
        transpose = true;
      }
      return {
        sceneOnset: e.startSec,
        sceneDuration: e.durSec,
        kind,
        actor: (e.payload as { actor?: string } | null | undefined)?.actor,
        content: {
          token: e.token,
          controls: e.controls,
          payload: e.payload,
          rq: e.rq,
          nature: e.nature,
          // Kronos CV bindings (one per modulated input) composed off the tree.
          modulations: e.modulations,
          // Scene onset + duration carried through: the adapter renders each
          // modulation source over the note's scene window and maps it to t_audio.
          startSec: e.startSec,
          durSec: e.durSec
        }
      };
    });
    const computedDuration =
      opts.durationSec ?? evs.reduce((m, e) => Math.max(m, e.startSec + e.durSec), 0);
    const dur =
      typeof dispatcher.duration === 'number' && dispatcher.duration > 0
        ? dispatcher.duration
        : computedDuration;
    return {
      timeline: new MaterializedTimeline(tEvents, dur),
      noteCount: notes,
      restCount: rests,
      controlCount: controls,
      muteCount: mutes,
      transposeWarned: transpose
    };
  };

  const built = buildTimeline(events);
  const { timeline } = built;
  const { noteCount, restCount, controlCount, muteCount, transposeWarned } = built;
  const duration = timeline.duration;

  // 2. Clock on the shared AudioContext; anchor at the current instant (the host
  //    calls us right where it would have started the dispatcher).
  const clock = new InternalClock({ now: () => audioCtx.currentTime, derivedTempo });
  clock.setDerivedTempo(derivedTempo);
  clock.start(startScene);

  // 2b. AUDIO OUTPUT = the runtime-audio AudioRuntime, built HERE (where the shared
  //     clock lives — it needs `musicalNow`/`audioTimeFor` to map t_scene↔t_audio for
  //     CV). It IS the 'audio'/'webaudio' transport: a token resolves to Hz via the
  //     shared `pitch`, CV renders from `content.modulations`, `sounds` is empty (no
  //     percussion in Kanopi — recreated later via alphabet-sound-backtick). The host
  //     adds only MIDI to the dispatcher; we overlay audio here.
  const audioRuntime = opts.pitch
    ? createAudioRuntime(audioCtx, { pitch: opts.pitch, clock, sounds: undefined })
    : null;

  // 3. The REAL adapter: route each scheduled event to its actor's transport.
  //    Audio actors → the AudioRuntime (raw ScheduledEvent, it renders pitch + CV);
  //    MIDI actors → the dispatcher's MidiTransport (flat event). Else 'default'.
  const transports: Record<string, TransportLike> = { ...(dispatcher.transports ?? {}) };
  if (audioRuntime) {
    transports['webaudio'] = audioRuntime as unknown as TransportLike;
    transports['audio'] = audioRuntime as unknown as TransportLike;
  }
  // OSC OUTPUT (OSC-5b): when the scene has OSC bindings, build runtime-OSC's adapter
  // HERE (it schedules on the shared `audioCtx` clock — `now` must be the SAME scale
  // as the event onset). WebSocket transport → osc-bridge relay; osc-bridge output
  // profile resolves opaque control names to device addresses (literal fallback when
  // no device surface library, e.g. `device:bridge1` → `/bridge1/<param>`). Kronos
  // routes each OSC actor's RAW ScheduledEvent to it (3rd branch in `adapter.send`).
  let oscAdapter: InstanceType<typeof OscAdapter> | null = null;
  if (opts.oscBindings && Object.keys(opts.oscBindings).length > 0 && opts.oscWsUrl) {
    try {
      // Build the socket ourselves so a relay that is down (connection refused)
      // is LOGGED once rather than silently queueing frames forever: the
      // WebSocketTransport ctor returns synchronously, before the async connection
      // result, so a dead relay never surfaces through the try/catch otherwise.
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
      // setBindings pre-resolves device surfaces (async). Catch a rejection so it
      // never becomes an unhandled rejection; the literal-fallback path resolves on
      // a microtask, before the driver's setTimeout-scheduled first emission.
      void oscAdapter.setBindings(opts.oscBindings).catch((err: unknown) => {
        log(`⚠ OSC setBindings a échoué (${String(err)})`);
      });
      transports['osc'] = oscAdapter as unknown as TransportLike;
    } catch (err) {
      log(`⚠ OSC indisponible (${String(err)}) — voix OSC muettes`);
      oscAdapter = null;
    }
  }
  const warned = new Set<string>();
  const pickTransport = (actor?: string): TransportLike | null => {
    if (actor) {
      const def = dispatcher._actors?.[actor];
      const t = def?.transportName ? transports[def.transportName] : undefined;
      if (t) return t;
    }
    return transports['default'] ?? audioRuntime ?? Object.values(transports)[0] ?? null;
  };
  const adapter: RuntimeAdapter = {
    send(ev: ScheduledEvent) {
      // Voix de code (backtick BT<interp><id>) : Kronos l'ordonnance comme un event
      // `kind:'note'`, mais ce n'est PAS une note — la déclencher via le même sink que
      // le dispatcher legacy et NE PAS la router vers le synthé.
      const tok = (ev.content as { token?: string }).token;
      if (tok && isBacktick?.(tok)) {
        backtickSink?.(tok, {
          startSec: (ev.content as { startSec?: number }).startSec ?? 0,
          durSec: ev.duration,
          absTime: ev.onset
        });
        return;
      }
      const c = ev.content as {
        token: string;
        controls?: Record<string, unknown> | null;
        rq?: Record<string, number> | null;
        startSec?: number;
        durSec?: number;
        modulations?: ModulationBinding[] | null;
      };
      const transport = pickTransport(ev.actor);
      if (!transport || typeof transport.send !== 'function') {
        const k = ev.actor ?? '∅';
        if (!warned.has(k)) {
          warned.add(k);
          log(`⚠ no audio transport for actor "${k}" — note(s) dropped`);
        }
        return;
      }
      // Coerce numeric-string controls (vel/filterQ/…) to numbers, then drop any
      // leftover CV descriptor OBJECTS — modulation is driven by `content.modulations`
      // (composed by Kronos), never a literal control value.
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

      // AUDIO: hand the AudioRuntime the ScheduledEvent AS-IS — it resolves token→Hz
      // (shared `pitch`) and RENDERS `content.modulations` itself (no host pre-render).
      // Map controls to its shape: MIDI 0..127 `vel` → 0..1 `velocity`.
      if (audioRuntime && transport === (audioRuntime as unknown as TransportLike)) {
        const controls: Record<string, unknown> = { ...coerced };
        if (velRaw != null) controls.velocity = velRaw / 127;
        audioRuntime.send({
          onset: ev.onset,
          duration: ev.duration,
          actor: ev.actor,
          kind: ev.kind,
          content: { token: c.token, controls, modulations: c.modulations ?? [] }
        });
        return;
      }

      // OSC: hand the OscAdapter the RAW ScheduledEvent (like audio, NOT the flat
      // MIDI shape). Its profile maps `content.controls` (e.g. `cutoff`) to the bound
      // device's address and `content.token` (Hz) to note/on-off, on the right channel.
      if (oscAdapter && transport === (oscAdapter as unknown as TransportLike)) {
        oscAdapter.send({
          onset: ev.onset,
          duration: ev.duration,
          actor: ev.actor,
          kind: ev.kind,
          content: { token: c.token, controls: coerced, modulations: c.modulations ?? [] }
        });
        return;
      }

      // MIDI: the dispatcher's MidiTransport reads a flat event (token + controls).
      const event: Record<string, unknown> = {
        token: c.token,
        startSec: c.startSec ?? 0,
        durSec: ev.duration,
        ...coerced
      };
      if (velRaw != null) event.velocity = velRaw / 127;
      transport.send(event, ev.onset);
    }
    // NOTE: no `stop()` here. The scheduler's stop must NOT cut the code voices, or a
    // SAME-FILE re-eval (which calls `transport.stop()` on the previous handle to drop
    // its note timeline) would tear down the still-wanted Hydra/Strudel voice (canvas
    // flicker). Code voices are host-managed: cut explicitly on Pause/Stop, preserved on
    // a same-file re-eval (the new eval re-fires them in their slot).
  };

  // 4. Scheduler + driver. Default adapter handles mono; per-actor adapters are
  //    registered so a routed event reaches its actor's transport explicitly.
  const scheduler = new Scheduler({ clock, timeline, loop });
  scheduler.setDefaultAdapter(adapter);

  // The playing cursor (EX4 phase 2): the INVERSE of the time authority, not a
  // separate counter — it reads the same `clock` the scheduler does, so the drawn
  // playhead is rigorously aligned to the heard audio (no ~1-note lag) and
  // monotone from `startScene` (no backward jump at launch; the only return-to-0
  // is the legitimate loop crossing). This is the timeline's single cursor source.
  const cursor = new Cursor(clock, { loopDuration: duration, loop });
  const actors = new Set<string>();
  for (const e of events) {
    const a = (e.payload as { actor?: string } | null | undefined)?.actor;
    if (a) actors.add(a);
  }
  for (const a of actors) scheduler.addAdapter(a, adapter);

  // RE-RANDOM (B): Kronos calls `setReDerive` ONCE at each loop boundary. The host
  // re-runs the BPx derivation (fresh random draw) and hands back a fresh timeline
  // for the next cycle — Kronos never derives. Off ⇒ replay the same derivation.
  //
  // The closure is built UNCONDITIONALLY (whenever the host gave a `reDerive`), so a
  // LIVE re-random/loop toggle can install it on the active scheduler mid-play. Which
  // of the two states is live is tracked here; `applyReDerive` installs the closure
  // only when re-random AND loop are both on (else removes it → replay/stop at bord).
  const reDeriveClosure: (() => Timeline | null) | null = opts.reDerive
    ? (): Timeline | null => {
        const fresh = opts.reDerive!();
        if (!fresh || fresh.length === 0) return null;
        const rebuilt = buildTimeline(fresh).timeline;
        // Keep the cursor's loop length in step with the fresh derivation so the
        // playhead folds at the right boundary if re-random changed the length.
        cursor.setLoopDuration(rebuilt.duration);
        return rebuilt;
      }
    : null;
  let loopActive = loop;
  let reRandomActive = !!opts.reRandom;
  const applyReDerive = (): void => {
    scheduler.setReDerive(reRandomActive && loopActive && reDeriveClosure ? reDeriveClosure : null);
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
  // External pump (Kronos has no internal timer): the driver ticks the scheduler each
  // ~25 ms within the lookahead window. Transport arms/disarms emission; the driver
  // just advances it. Declared before the play branch so a BUILD-ONLY construction can
  // leave it un-started (no pump = no `send` = no sound).
  const driver = new RealtimeDriver({ clock, scheduler, lookahead: LOOKAHEAD_SEC, intervalMs: 25 });
  // BUILD-ONLY (Model C produce/load): construct the machine + timeline but DON'T play —
  // transport stays 'stopped', the driver is NOT started, so nothing is ever emitted (zero
  // sound, the audio context is not woken here). The host registers this persistent handle
  // and the first Play calls `replay()` (= 0 re-derivation). A STEP always plays its window.
  const buildOnly = step ? false : !!opts.buildOnly;
  if (buildOnly) {
    // Park the position at the start scene second (frozen, transport 'stopped'); do not arm
    // the scheduler, do not start the pump. `replay()` will `transport.play()` + `driver.start()`.
    transport.seek(startScene);
  } else if (step) {
    // Audition one beat IN PLACE: seek to the beat, grain = the beat window, step once.
    transport.setStepGrain(step.durSec);
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
    `${buildOnly ? '⏸ kronos built (stopped)' : '▶ kronos audio'} — ${noteCount} notes` +
      (muteCount ? `, ${muteCount} non-sounding skipped` : '') +
      (restCount ? `, ${restCount} rests` : '') +
      (controlCount ? `, ${controlCount} controls skipped` : '') +
      `, ${duration.toFixed(3)}s, ${derivedTempo} bpm, loop ${loop}` +
      (loop && opts.reRandom && opts.reDerive ? ', re-random ON' : '')
  );
  if (controlCount > 0) {
    log(`⚠ ${controlCount} control event(s) not applied (kronos phase 1 = notes + CV).`);
  }
  if (transposeWarned) {
    log(
      `⚠ a note carries a transpose qualifier — not folded in kronos phase 1 (plays untransposed).`
    );
  }

  let stopped = false;
  return {
    // The Kronos Transport — the SINGLE state machine + position authority. The host
    // (playback store + transport UI) projects on it: calls its commands and reads
    // state/position. Kanopi keeps no FSM and no position counter.
    transport,
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
      return step ? step.fromSec : transport.position();
    },
    beatPosition() {
      // Same STEP exception: report the beat AT the stepped second (`fromSec`), via the
      // cursor's own frozen-position formula (no host beat counter), so bar·beat matches
      // the heard note instead of the landing boundary.
      return step
        ? cursor.beatPositionForScene(step.fromSec, clock.derivedTempo, BEATS_PER_BAR)
        : transport.beatPosition(BEATS_PER_BAR);
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
      // Live tempo via the Transport (re-anchor, position continuous): the clock adopts
      // the new BPM, scheduler+cursor read it, so audio and playhead warp together.
      transport.setTempo(bpm);
    },
    setActorMuted(actor: string, muted: boolean) {
      // Orchestrated arm/disarm (kronos path): gate this actor's notes at the
      // scheduler's own emission filter — the SAME `_mutedActors` set the legacy
      // dispatcher exposes, but here Kronos drives the audio so the mute must reach
      // ITS scheduler (consumed AS-IS). Re-derive cycles re-emit through the same
      // gate, so a disarmed actor stays silent across loop boundaries until re-armed.
      scheduler.setActorMuted(actor, muted);
    }
  };
}
