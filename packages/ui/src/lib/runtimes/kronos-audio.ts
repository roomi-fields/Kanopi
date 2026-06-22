// Kronos AUDIO driver (EX4 flip — Kronos drives the REAL sound).
//
// Replaces Kanopi's old dispatcher on the audio path: the Kronos scheduler
// produces the timed events and a thin RuntimeAdapter bridges each one to the
// EXISTING WebAudio synthesis (`core/dispatcher/transports/webaudio.js`). The
// old engine no longer schedules sound in this mode — Kronos alone does.
//
// Phase 1 scope (honest): NOTE + per-note CV (cutoff/pan/…) + basic actor
// routing, for the MONO note path (covers cv-adsr, polymetric, every
// single-voice note scene). Advanced live features (control-token state
// mutation, backtick/code voices, MIDI orchestration, arm/disarm) are NOT yet
// driven here — the host falls those scenes back to the legacy engine and this
// module logs what it skips (never a silent drop).
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
  PeriodicModulation,
  renderToBreakpoints,
  type RuntimeAdapter,
  type ScheduledEvent,
  type TimelineEvent,
  type Timeline,
  type ModulationBinding
} from '@kronos/core';
import type { DispatchEvent } from './tree-dispatch';
// Reused AS-IS from the core dispatcher: coerces numeric-string controls to
// numbers (vel/filterQ/…) while leaving strings (wave) and CV descriptor objects
// (`{__cv:true,…}`) untouched — exactly what the WebAudio transport reads.
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
  _actors?: Record<
    string,
    { transportName?: string | null; transport?: TransportLike | null } | undefined
  >;
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
  /** The host dispatcher — its configured transports are the audio output. */
  dispatcher: DispatcherLike;
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
  /** Coupe les voix de code orchestrées (Strudel/Hydra) quand le scheduler s'arrête (Stop/teardown). */
  stopCodeVoices?: () => void;
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
  /** Live re-random toggle (transport): installs/removes the re-derive on the
   *  ACTIVE scheduler so toggling re-random mid-play takes effect at the next loop
   *  boundary (gated by the current loop state). The legacy dispatcher path has the
   *  twin; in kronos mode this handle drives the audio, so the toggle must reach it. */
  setReRandom(on: boolean): void;
  /** Live loop toggle (transport): updates the scheduler + cursor loop state and
   *  re-evaluates whether the re-derive should be installed (re-random ⊗ loop). */
  setLoop(on: boolean): void;
  /** Current playhead in scene seconds (loop-folded). Reads the SAME clock the
   *  scheduler does, so the drawn cursor cannot drift from the heard audio. */
  position(): number;
  /** Playhead in scene seconds aligned to the HEARD audio (loop-folded): the same
   *  clock as `position()` but sampled at `currentTime − outputLatency − baseLatency`,
   *  the instant whose sound is reaching the speakers NOW. `position()` reads the
   *  scene at `currentTime`, which is what is being SCHEDULED, ~one output buffer
   *  ahead of what is heard — so the drawn cursor must use THIS, not `position()`,
   *  to sit on the note the listener hears (no ~50 ms visual lead). */
  displayPosition(): number;
  /** Current beat/bar position for the transport readout (loop-folded). */
  beatPosition(): KronosCursorBeat;
  /** Re-anchor + reposition the playhead to a scene second (seek, no new audio):
   *  same primitive a Play-from-position uses — the next scheduled events fire
   *  from there and the cursor reads from there. */
  seek(sceneSec: number): void;
  /** Pause AT THE END OF THE CURRENT BEAT (B7), not instantly. Bounds EMISSION at
   *  the end of the beat currently heard so that beat's note(s)/release ring out in
   *  full but the NEXT beat is never emitted — WITHOUT suspending the AudioContext
   *  (which would cut the tails). `beatDurScene` = one clock beat in scene seconds
   *  (`60/derivedTempo`). When the boundary is reached (emission stopped) the clock
   *  is frozen there so the cursor parks at the beat boundary, and `onReached(beat)`
   *  fires once with the integer index of the beat that just completed (loop-folded
   *  into the production's beat range when `beatsInLoop` is given). Returns the
   *  integer beat that will complete (the same value `onReached` later reports). */
  pauseAtBeatEnd(
    beatDurScene: number,
    onReached: (completedBeat: number) => void,
    beatsInLoop?: number
  ): number;
  /** Resume IN PLACE after a `pauseAtBeatEnd` — WITHOUT re-evaluating the scene.
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

// Scheduler look-ahead window (seconds). Single source of truth shared by the
// RealtimeDriver and `pauseAtBeatEnd`: the latter must re-anchor at the scheduler's
// own scheduling HORIZON (`now + lookahead`), never behind it, or rewinding the
// scene cursor would re-emit notes already queued in this window (doubled notes).
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

  // 3. The REAL adapter: bridge each scheduled event to the configured WebAudio
  //    transport. Routing — an event's actor → its transport, else 'default'.
  const transports = dispatcher.transports ?? {};
  const warned = new Set<string>();
  const pickTransport = (actor?: string): TransportLike | null => {
    if (actor) {
      const def = dispatcher._actors?.[actor];
      const t = def?.transport ?? (def?.transportName ? transports[def.transportName] : undefined);
      if (t) return t;
    }
    return transports['default'] ?? Object.values(transports)[0] ?? null;
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
      // Resolved non-temporal controls (wave/vel/pan/filterQ + CV descriptors)
      // ride on `content.controls`; coerce numeric strings (fresh object).
      const coerced = coerceControlValues(c.controls);

      // CV (A): Kronos composed a binding per modulated input (cutoff/pan/…). Render
      // each source over THIS note's scene window → a normalized 0..1 curve the
      // transport applies to the matching AudioParam (MOD_SCALE). This drives BOTH
      // clocks correctly — the binding's source already encodes which (signal
      // unrolls across the phrase, per-note retriggers, sibling-voice follows
      // env1→env2→env3). Kronos owns these inputs, so they're stripped from the
      // literal controls below.
      const bindings = c.modulations ?? [];
      const modCurves: Record<string, number[]> = {};
      const onsetScene = c.startSec ?? 0;
      const durScene = c.durSec ?? 0;
      if (bindings.length > 0 && durScene > 0) {
        for (const b of bindings) {
          // Render the source over THIS note's scene window so a SIGNAL unrolls its
          // phrase slice at the note's position and a per-note envelope retriggers at
          // the note's onset. STEP uses the SAME (full-production) windows: the host
          // seeks the whole timeline to the beat, so a stepped note keeps its real
          // scene onset and its CV is sampled exactly as in full Play (no re-window).
          const renderStart = onsetScene;
          // ~2 ms resolution → a smooth value curve for setValueCurveAtTime
          // (Kronos guidance: finer than 10 ms avoids stair-stepping the envelope).
          const pts = renderToBreakpoints(b.source, renderStart, renderStart + durScene, 0.002);
          if (pts.length === 0) continue;
          // ADSR/breakpoint sources are unipolar 0..1; a periodic LFO is bipolar
          // (±amp centred on 0) → recentre to 0.5 with half-depth so the transport's
          // MOD_SCALE reproduces the legacy centre±depth sweep.
          const bipolar = b.source instanceof PeriodicModulation;
          modCurves[b.input] = pts.map((p) => (bipolar ? 0.5 + p.value / 2 : p.value));
          delete coerced[b.input];
        }
      }
      // Any leftover CV descriptor objects (legacy `{__cv}` stamped by
      // resolveCvControls, or an unresolved ref) must not reach the transport as a
      // literal — Kronos drives modulation here, so drop object-valued controls.
      for (const k of Object.keys(coerced)) {
        if (coerced[k] && typeof coerced[k] === 'object') delete coerced[k];
      }

      const velRaw =
        typeof coerced.vel === 'number'
          ? coerced.vel
          : typeof c.rq?.vel === 'number'
            ? c.rq.vel
            : undefined;
      const event: Record<string, unknown> = {
        token: c.token,
        startSec: c.startSec ?? 0,
        durSec: ev.duration,
        ...coerced
      };
      // MIDI 0..127 velocity → the synth's 0..1 gain. Absent ⇒ the transport's
      // own 0.5 default applies (don't force a value).
      if (velRaw != null) event.velocity = velRaw / 127;
      // Pre-rendered Kronos modulation curves (normalized 0..1) the transport
      // applies to the note's AudioParams via setValueCurveAtTime.
      if (Object.keys(modCurves).length > 0) event.__modCurves = modCurves;
      transport.send(event, ev.onset);
    },
    stop() {
      // Stop de scène : l'ordonnanceur appelle `adapter.stop?.()` à `scheduler.stop()`.
      // Les voix de code (Strudel boucle, Hydra rend en continu) ne se taisent pas par
      // simple arrêt de planification → couper via le sink hôte.
      opts.stopCodeVoices?.();
    }
  };

  // 4. Scheduler + driver. Default adapter handles mono; per-actor adapters are
  //    registered so a routed event reaches its actor's transport explicitly.
  const scheduler = new Scheduler({ clock, timeline, loop });
  scheduler.setDefaultAdapter(adapter);

  // The playing cursor (EX4 phase 2): the INVERSE of the time authority, not a
  // separate counter — it reads the same `clock` the scheduler does, so the drawn
  // playhead is rigorously aligned to the heard audio (no ~1-note lag) and
  // monotone from `startScene` (no backward jump at launch; the only return-to-0
  // is the legitimate loop crossing). The host swaps the timeline's cursor source
  // to this when `audio-engine=kronos`.
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
  if (step) {
    // Audition one beat IN PLACE: seek to the beat, grain = the beat window, step once.
    transport.setStepGrain(step.durSec);
    transport.seek(step.fromSec);
    transport.step(1);
  } else {
    // Normal play from the start position (re-anchors clock + arms the scheduler).
    transport.seek(startScene);
    transport.play();
  }

  // External pump (Kronos has no internal timer): the driver ticks the scheduler each
  // ~25 ms within the lookahead window. Transport arms/disarms emission; the driver
  // just advances it.
  const driver = new RealtimeDriver({ clock, scheduler, lookahead: LOOKAHEAD_SEC, intervalMs: 25 });
  driver.start();

  log(
    `▶ kronos audio — ${noteCount} notes` +
      (muteCount ? `, ${muteCount} non-sounding skipped` : '') +
      (restCount ? `, ${restCount} rests` : '') +
      (controlCount ? `, ${controlCount} controls skipped` : '') +
      `, ${duration.toFixed(3)}s, ${derivedTempo} bpm, loop ${loop}` +
      (loop && opts.reRandom && opts.reDerive ? ', re-random ON' : '')
  );
  if (controlCount > 0) {
    log(
      `⚠ ${controlCount} control event(s) not applied (kronos phase 1 = notes + CV). ` +
        `If a control-driven scene misbehaves, set localStorage['audio-engine']='legacy'.`
    );
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
      // Belt: cut the sustained code voices even if the scene adapter's `stop()` isn't
      // reached through the scheduler (host teardown). `transport.stop()` also closes
      // the sinks via the scheduler, so `stopCodeVoices` must be idempotent host-side.
      opts.stopCodeVoices?.();
      // Transport.stop() disarms emission, closes the voices (scheduler.stop → adapter
      // stop?()), and resets the position. The external pump is host-owned, so stop it
      // here (Transport doesn't own the driver).
      try {
        transport.stop();
        driver.stop();
      } catch {
        /* already torn down */
      }
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
      return cursor.position();
    },
    displayPosition() {
      // What is HEARD now left the scheduler ~one output buffer ago: the audio at
      // the speakers corresponds to scene time at `currentTime − outputLatency −
      // baseLatency`. Sampling the cursor there (same clock, same fold) makes the
      // drawn playhead sit on the heard note instead of the scheduled one.
      const heardAudioTime =
        audioCtx.currentTime - (audioCtx.outputLatency || 0) - (audioCtx.baseLatency || 0);
      return cursor.positionAt(Math.max(0, heardAudioTime));
    },
    beatPosition() {
      return cursor.beatPosition(clock.derivedTempo, BEATS_PER_BAR);
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
    pauseAtBeatEnd(beatDurScene, onReached, beatsInLoop) {
      // B7 — pause at the END of the current beat. The clock keeps running (we do
      // NOT suspend the AudioContext, which would cut beat B's tails); we only bound
      // EMISSION so no event of beat B+1 is scheduled. Beat B's already-emitted
      // note(s) ring their FULL duration past the bound.
      //
      // DETERMINISTIC transition (no poll): Kronos's `playWindow(from, to, onEnd)`
      // bounds emission to `[from, to)` and fires `onEnd` EXACTLY ONCE — from inside
      // `tick`, the instant the scene cursor reaches the bound. That is the precise
      // "boundary reached" signal the state machine needs; no `setInterval` watching
      // `scheduler.running`.
      //
      // GLOBAL scene seconds: the scheduler's cursor and bound both count across loop
      // tours (they do NOT fold), so the boundary is computed in GLOBAL coords too —
      // read straight off the clock (`musicalNow`), the same authority the scheduler
      // converts against.
      if (!(beatDurScene > 0)) {
        // No beat grid → nothing to bound; report the current folded beat.
        const bp = cursor.beatPosition(clock.derivedTempo, BEATS_PER_BAR);
        const b = Math.max(0, Math.floor(bp.beatsTotal));
        onReached(b);
        return b;
      }
      const gNow = clock.musicalNow(clock.now());
      const bGlobal = Math.max(0, Math.floor(gNow / beatDurScene));
      const boundaryGlobal = (bGlobal + 1) * beatDurScene;
      // Re-anchor `from` at the scheduler's own scheduling HORIZON (`now + lookahead`),
      // NOT at the heard position `gNow`. `playWindow` re-arms via `start(from)`, which
      // resets the scene cursor to `from`; anchoring at `gNow` (behind the horizon)
      // would re-query — and re-emit — the notes already queued in the lookahead
      // window = doubled notes (B3). At the horizon, `[from, boundary)` is exactly the
      // not-yet-emitted remainder of beat B: no double, no skip. (`from` never exceeds
      // the boundary: the boundary is the end of the CURRENT beat, the horizon is at
      // most ~120 ms ahead of the heard position within that same beat.)
      const from = clock.musicalNow(clock.now() + LOOKAHEAD_SEC);
      // The beat that completes, folded into the production's beat range so the
      // paused cursor + a following Step agree (Step already wraps).
      const completed =
        beatsInLoop && beatsInLoop > 0
          ? ((bGlobal % beatsInLoop) + beatsInLoop) % beatsInLoop
          : bGlobal;
      // Bound emission to the rest of beat B and ask Kronos to notify us once when the
      // cursor reaches the bound (emission done). We do NOT touch the clock: the cursor
      // follows the heard audio through beat B (mode still 'playing') and freezes at the
      // boundary only once the host flips `mode='paused'` on this callback (which parks
      // the drawn cursor at `(B+1)·beat`, B13). Beat B's already-scheduled note(s) ring
      // their full tail meanwhile (only EMISSION is bounded, not the queued audio).
      scheduler.playWindow(from, boundaryGlobal, () => {
        // Emission is complete — the driver's remaining wakeups are no-ops (scheduler
        // not running), but stop it so nothing keeps pumping while paused.
        driver.stop();
        onReached(completed);
      });
      return completed;
    },
    retune(bpm: number) {
      // Warp the heard tempo live: the clock re-anchors at the current instant
      // (scene position continuous) and adopts the new BPM, so future scene→audio
      // conversions stretch/compress — the scheduler and cursor both read this
      // same clock, so the audio and the drawn playhead warp together.
      clock.retune(bpm);
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
