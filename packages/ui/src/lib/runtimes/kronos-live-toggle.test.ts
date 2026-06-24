import { describe, it, expect, vi, afterEach } from 'vitest';
import { startKronosAudio } from './kronos-audio';
import type { DispatchEvent } from './tree-dispatch';

// BUG 1 — re-random / loop must respond to the LIVE transport toggle in kronos mode.
// In kronos mode the Kronos handle (not the legacy dispatcher) drives the audio, and
// its re-derive is installed on the scheduler. These prove the handle's setReRandom /
// setLoop install/remove the host re-derivation at the loop boundary, gated by
// (re-random ⊗ loop), so toggling DURING playback re-rolls the next cycle.
//
// We control the hardware clock by hand (`now.t`) and pump the RealtimeDriver via
// vitest fake timers: each `advanceTimersByTime` fires one scheduler tick at the
// current `now.t`. A boundary crossing (`tick` horizon ≥ loop length) is where the
// scheduler calls the re-derive — exactly once per tour.

function fakeCtx(now: { t: number }): AudioContext {
  const param = () => ({
    setValueAtTime() {},
    setValueCurveAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
    value: 0
  });
  return {
    get currentTime() {
      return now.t;
    },
    createGain: () => ({ gain: param(), connect() {} }),
    createOscillator: () => ({
      frequency: param(),
      detune: param(),
      type: '',
      connect() {},
      start() {},
      stop() {}
    }),
    createBiquadFilter: () => ({ frequency: param(), Q: param(), type: '', connect() {} }),
    createStereoPanner: () => ({ pan: param(), connect() {} }),
    destination: {}
  } as unknown as AudioContext;
}

// One note per 1.0 s loop at 60 bpm (rate 1: scene seconds === audio seconds).
const EVENTS: DispatchEvent[] = [
  { token: 'C4', startSec: 0, durSec: 0.5, type: 'note', payload: null }
] as unknown as DispatchEvent[];

afterEach(() => {
  vi.useRealTimers();
});

describe('Kronos audio handle — live re-random / loop toggle', () => {
  it('does NOT re-derive at the boundary while re-random is OFF, but DOES after setReRandom(true)', () => {
    vi.useFakeTimers();
    const now = { t: 0 };
    const reDerive = vi.fn<() => DispatchEvent[] | null>(() => EVENTS);
    const handle = startKronosAudio({
      events: EVENTS,
      durationSec: 1.0,
      audioCtx: fakeCtx(now),
      derivedTempo: 60,
      loop: true,
      dispatcher: { transports: {} },
      startSceneSec: 0,
      reDerive, // host re-derivation supplied unconditionally now
      reRandom: false // OFF at start
    });
    try {
      // Cross the first loop boundary (1.0 s) with re-random OFF → no re-derive.
      now.t = 0.95;
      vi.advanceTimersByTime(25); // one driver tick → horizon 0.95 + 0.12 ≥ 1.0
      expect(reDerive).toHaveBeenCalledTimes(0);

      // Toggle re-random ON live, then cross the next boundary (2.0 s) → re-derive once.
      handle.setReRandom(true);
      now.t = 1.95;
      vi.advanceTimersByTime(25);
      expect(reDerive).toHaveBeenCalledTimes(1);

      // Toggle OFF again → next boundary (3.0 s) does not re-derive.
      handle.setReRandom(false);
      now.t = 2.95;
      vi.advanceTimersByTime(25);
      expect(reDerive).toHaveBeenCalledTimes(1);
    } finally {
      handle.stop();
    }
  });

  it('loop OFF gates the re-derive even with re-random ON (re-random ⊗ loop)', () => {
    vi.useFakeTimers();
    const now = { t: 0 };
    const reDerive = vi.fn<() => DispatchEvent[] | null>(() => EVENTS);
    const handle = startKronosAudio({
      events: EVENTS,
      durationSec: 1.0,
      audioCtx: fakeCtx(now),
      derivedTempo: 60,
      loop: true,
      dispatcher: { transports: {} },
      startSceneSec: 0,
      reDerive,
      reRandom: true // ON at start
    });
    try {
      // re-random ON, loop ON → boundary re-derives.
      now.t = 0.95;
      vi.advanceTimersByTime(25);
      expect(reDerive).toHaveBeenCalledTimes(1);

      // Turn loop OFF live: even with re-random ON, the closure is removed, and the
      // scheduler stops at the boundary instead of re-deriving.
      handle.setLoop(false);
      now.t = 1.95;
      vi.advanceTimersByTime(25);
      expect(reDerive).toHaveBeenCalledTimes(1); // no further re-derive
    } finally {
      handle.stop();
    }
  });
});
