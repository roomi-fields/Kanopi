// The ACTIVE Kronos transport, surfaced from the audio runtime to the UI.
//
// Kronos owns the transport: its `Transport` is the SINGLE execution state machine
// AND the position authority (contract `kronos-transport.md`). Kanopi PROJECTS on it —
// it calls the commands and READS the state/position. This store is the bridge: it holds
// the active handle (whose `.transport` is the live Transport), a REACTIVE MIRROR of
// `transport.state` (updated via `onStateChange`, display only — never an authority), and
// a per-frame REACTIVE SAMPLE of the playhead (`beat`) the displays read.
//
// The drawn position is sampled per-frame from `transport.position()`/`beatPosition()`
// (the cursor in running, the frozen position when paused) — never a host counter. A
// private rAF loop does that sampling here (it replaces the old MockClock render loop):
// it reads `active.beatPosition()` each frame, exposes it as `beat`, AND derives the
// beat/bar UI EVENTS (p5/hydra `onBeat`/`onBar`) from the integer crossings of that
// Kronos position. No position is ever integrated — Kronos is the only authority.

import type { Transport, TransportState } from '@kronos/core';
import type { KronosCursorBeat } from '../lib/runtimes/kronos-audio';
import type { EventBus } from '../lib/events/types';

/** What the UI needs off the active Kronos handle. */
export interface KronosCursorView {
  /** The live Transport — commands (play/pause/stop/step/seek/…) + observable state. */
  transport: Transport;
  /** Beats-per-bar this handle folds with — projected from the derived meter
   *  (`DeriveResult.meter`, BPx authority). Read here for the onBar/onBeat derivation
   *  so a non-4 / additive scene's bars don't fall on a fabricated 4-beat grid. */
  beatsPerBar: number;
  /** Scene seconds of the playhead (frozen-aware): the cursor in running, the frozen
   *  position when paused. Read per-frame by the timeline. */
  position(): number;
  /** Beat/bar readout (frozen-aware), for the transport display. */
  beatPosition(): KronosCursorBeat;
  /** STEP `n` tree units in place on the persistent handle (Model C, RC-B) — `transport.step(n)` +
   *  pump. The reached column sounds (snap-to-onset); NO re-derivation, NO host beat counter/grain. */
  step(n: number): void;
}

class KronosCursorStore {
  /** The currently-active Kronos handle, or null when no kronos scene is live. */
  active = $state<KronosCursorView | null>(null);
  /** REACTIVE PROJECTION of `transport.state` (`stopped|running|paused`). Mirrored from
   *  Kronos via `onStateChange` — the host reads this for the UI; it is never an
   *  authority (the truth is `active.transport.state`). */
  state = $state<TransportState>('stopped');
  /** Per-frame REACTIVE SAMPLE of the playhead, READ from the Transport (frozen-aware):
   *  the moving cursor while running, the frozen position when paused/stepped, `null`
   *  when stopped or no scene is live. The bar·beat displays read THIS — never a host
   *  counter, never `clock.state` (the old mirror that kept advancing through pause). */
  beat = $state<KronosCursorBeat | null>(null);
  /** REACTIVE mirror of the live Transport's tempo (BPM). `transport` is a Kronos class
   *  instance Svelte does not deep-proxy, so a live in-place tempo warp (`retune` →
   *  `transport.setTempo`) would never re-render a `$derived` reading `transport.tempo`.
   *  The rAF loop guard-samples it here (write only on change → no per-frame churn) so the
   *  BPM readout (`clock.state.bpm`) tracks a live warp. 0 when no scene is live. */
  tempo = $state(0);
  #unsub: (() => void) | null = null;

  // Beat/bar UI EVENT derivation (p5/hydra `onBeat`/`onBar`). Last-seen ABSOLUTE integer
  // indices for crossing detection (−1 = no baseline yet, set on the first running frame
  // so the downbeat isn't counted, reset to −1 when a new dispatcher takes over or the
  // transport leaves `running`). The emitted `count` is NOT a host recount: it IS the
  // absolute beat/bar index read from Kronos's `transport.absoluteBeatPosition` primitive
  // (the unfolded position authority). So a dropped frame that skips 2 beats jumps the
  // count to the primitive's value instead of under-counting by +1.
  #lastBeatFloor = -1;
  #lastBarFloor = -1;
  #eventsBus?: EventBus;
  /** Current tempo for the beat events' informational `bpm` field — fed by the core so
   *  the displayed value matches `clock.state.bpm` (no circular import on the core). */
  #bpm: () => number = () => 0;

  constructor() {
    requestAnimationFrame(this.#loop);
  }

  /** Wire the event bus + tempo source the per-frame loop emits beat/bar events on.
   *  Called by the core (same place it owns the bus), so the store stays import-clean. */
  setEventBus(bus: EventBus, bpm: () => number) {
    this.#eventsBus = bus;
    this.#bpm = bpm;
  }

  set(handle: KronosCursorView | null) {
    this.#unsub?.();
    this.#unsub = null;
    this.active = handle;
    // A NEW handle = a new dispatcher → reset the crossing baselines so the new scene's
    // downbeat isn't counted as a crossing of the previous one.
    this.#lastBeatFloor = -1;
    this.#lastBarFloor = -1;
    if (handle?.transport) {
      // Capture the current state (the init `transport.play()` already fired before this
      // subscription), then mirror every later transition.
      this.state = handle.transport.state;
      this.tempo = handle.transport.tempo;
      this.#unsub = handle.transport.onStateChange((s) => {
        this.state = s;
      });
    } else {
      this.state = 'stopped';
      this.beat = null;
      this.tempo = 0;
    }
  }

  #loop = (now: number) => {
    const kc = this.active;
    // Guard-sample the live tempo (write only when it actually changed → no per-frame
    // churn) so a live in-place warp re-renders the BPM readout. Cheap: one compare/frame.
    if (kc) {
      const t = kc.transport.tempo;
      if (t !== this.tempo) this.tempo = t;
    }
    if (kc && this.state === 'running') {
      // DISPLAY position = Kronos's Transport (the single authority), READ each frame —
      // never integrated. The folded readout drives the bar·beat displays.
      this.beat = kc.beatPosition();
      // BEAT/BAR EVENTS count = the ABSOLUTE (unfolded) beat/bar index, READ from Kronos's
      // `absoluteBeatPosition` primitive (the upstream authority that replaces the old
      // host `absBeat`/`absBar` recount). `beatAbs` is the unfolded beat index (monotone
      // across loops); the bar count is its 0-based bar-crossing index (NOT `abs.bar`,
      // which is 1-indexed — using it directly would shift every bar count by one). The
      // count is thus the primitive's value, not a +1 tally, so a dropped frame that skips
      // 2 beats jumps the count correctly instead of under-counting.
      const beatsPerBar = kc.beatsPerBar;
      const abs = kc.transport.absoluteBeatPosition(beatsPerBar);
      const totalBeats = Math.max(0, abs.beatsTotal);
      const beatAbs = Math.floor(totalBeats);
      const barAbs = Math.floor(beatAbs / beatsPerBar);
      // Emit on each crossing of the integer beat — INCLUDING the loop wrap, since the
      // absolute index keeps climbing through it. The first running frame sets the
      // baseline only (so the downbeat isn't counted).
      if (this.#lastBeatFloor === -1) {
        this.#lastBeatFloor = beatAbs;
        this.#lastBarFloor = barAbs;
      } else {
        if (beatAbs !== this.#lastBeatFloor) {
          this.#lastBeatFloor = beatAbs;
          this.#eventsBus?.emit({
            schemaVersion: 1,
            type: 'beat',
            runtime: 'clock',
            t: now,
            count: beatAbs,
            bpm: this.#bpm(),
            phase: totalBeats - beatAbs
          });
        }
        if (barAbs !== this.#lastBarFloor) {
          this.#lastBarFloor = barAbs;
          this.#eventsBus?.emit({
            schemaVersion: 1,
            type: 'bar',
            runtime: 'clock',
            t: now,
            count: barAbs
          });
        }
      }
    } else {
      // Not running: FREEZE the displayed position at Kronos's frozen-aware readout
      // (paused/stepped → the parked beat, B13) or clear it (stopped / no scene → null,
      // the displays fall back to 001·01.00, B16). Reset the crossing baselines so a
      // fresh play from stopped doesn't count its downbeat.
      this.beat = kc ? kc.beatPosition() : null;
      this.#lastBeatFloor = -1;
      this.#lastBarFloor = -1;
    }
    requestAnimationFrame(this.#loop);
  };
}

export const kronosCursor = new KronosCursorStore();
