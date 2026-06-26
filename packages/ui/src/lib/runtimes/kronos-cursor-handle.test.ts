import { describe, it, expect } from 'vitest';
import { startKronosAudio } from './kronos-audio';
import { kairosFromEvents } from './kairos-test-helpers';
import type { DispatchEvent } from './kairos-test-helpers';

// EX4 phase 2 — the Kronos AUDIO handle exposes the PLAYING cursor (position /
// beatPosition), forwarded straight from the Cursor built on the scheduler's own
// clock. Kronos's own suite (cursor-correctness.test.ts, beat-position.test.ts)
// already proves the Cursor is monotone-from-0 and folds on loop; here we prove
// the HANDLE forwards those values — i.e. the wiring the timeline reads.
//
// We drive a FAKE AudioContext clock by hand (`now`), so no real timers/audio:
// the RealtimeDriver's interval never advances time on its own. Each `now` bump
// is one "frame"; we read `handle.position()` after each.

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

// Two notes at 120 bpm, 0.5 s each → a 1.0 s scene loop.
const EVENTS: DispatchEvent[] = [
  { token: 'C4', startSec: 0, durSec: 0.5, type: 'note', payload: null },
  { token: 'E4', startSec: 0.5, durSec: 0.5, type: 'note', payload: null }
] as unknown as DispatchEvent[];

describe('Kronos audio handle — playing cursor forwarding', () => {
  it('position() advances monotonically from 0 and folds on the loop', () => {
    const now = { t: 0 };
    const handle = startKronosAudio({
      durationSec: 1.0,
      audioCtx: fakeCtx(now),
      derivedTempo: 120,
      loop: true,
      dispatcher: { transports: {} },
      startSceneSec: 0,
      kairos: kairosFromEvents(EVENTS, 1.0)
    });
    try {
      // Sample across the first loop and just past the fold.
      const samples = [0, 0.1, 0.25, 0.5, 0.9, 0.99].map((t) => {
        now.t = t;
        return handle.position();
      });
      // Monotone, starts at 0, never jumps backward within the loop.
      expect(samples[0]).toBeCloseTo(0, 6);
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i]).toBeGreaterThan(samples[i - 1]);
        expect(samples[i]).toBeLessThan(1.0); // folded inside the loop length
      }
      // Just past the loop boundary → folds back near 0 (the only legitimate reset).
      now.t = 1.05;
      const folded = handle.position();
      expect(folded).toBeGreaterThanOrEqual(0);
      expect(folded).toBeLessThan(0.2);
    } finally {
      handle.stop();
    }
  });

  it('beatPosition() reports bar 1-indexed / beat 0-indexed, aligned to position', () => {
    const now = { t: 0 };
    const handle = startKronosAudio({
      durationSec: 1.0,
      audioCtx: fakeCtx(now),
      derivedTempo: 120,
      loop: true,
      dispatcher: { transports: {} },
      startSceneSec: 0,
      kairos: kairosFromEvents(EVENTS, 1.0)
    });
    try {
      // At 120 bpm a beat is 0.5 s. At t=0 → beat 0; at t=0.5 → beat 1.
      now.t = 0;
      const b0 = handle.beatPosition();
      expect(b0.bar).toBe(1);
      expect(b0.beat).toBe(0);
      expect(b0.beatsTotal).toBeCloseTo(0, 6);

      now.t = 0.5;
      const b1 = handle.beatPosition();
      expect(b1.beatsTotal).toBeCloseTo(1, 6);
      expect(b1.beat).toBe(1);
    } finally {
      handle.stop();
    }
  });

  it('seek() repositions the playhead to the requested scene second', () => {
    const now = { t: 0 };
    const handle = startKronosAudio({
      durationSec: 1.0,
      audioCtx: fakeCtx(now),
      derivedTempo: 120,
      loop: true,
      dispatcher: { transports: {} },
      startSceneSec: 0,
      kairos: kairosFromEvents(EVENTS, 1.0)
    });
    try {
      now.t = 0.2; // advance the hardware clock
      handle.seek(0.5); // re-anchor scene-0.5 to the current instant
      expect(handle.position()).toBeCloseTo(0.5, 6);
      now.t = 0.3; // +0.1 s of audio → +0.1 s of scene (rate 1)
      expect(handle.position()).toBeCloseTo(0.6, 6);
    } finally {
      handle.stop();
    }
  });
});
