import { describe, it, expect, vi, afterEach } from 'vitest';
import { startKronosAudio } from './kronos-audio';
import type { DispatchEvent } from './tree-dispatch';

// B7 — Pause is NOT instant: it bounds emission at the END of the beat currently
// heard, so that beat's note(s) ring out but the NEXT beat is never emitted, and the
// AudioContext is NOT suspended (which would cut the tails). B8 — Play after such a
// pause forward-resumes (a fresh seek+start), with emission UNBOUNDED again (no
// missing beat, no double beat).
//
// The transition is DETERMINISTIC, not polled: `pauseAtBeatEnd` arms Kronos's
// `playWindow(from, boundary, onEnd)`, and `onEnd` fires EXACTLY ONCE from inside the
// scheduler's `tick` the instant the scene cursor reaches the boundary. There is NO
// `setInterval` watching `scheduler.running` — the boundary-reached signal is the
// scheduler's own one-shot callback. (Earlier band-aid: a 25 ms poll of
// `scheduler.running` — removed.)
//
// Pattern (same as kronos-step-bound / kronos-live-toggle): a hand-driven hardware
// clock (`now.t`) + vitest fake timers pumping the RealtimeDriver. One note per beat
// at 60 bpm (rate 1 → scene seconds === audio seconds). The transport records every
// emitted token, so a bounded beat shows up as an ABSENT token.

function note(token: string, onset: number, dur: number): DispatchEvent {
  return { token, startSec: onset, durSec: dur, type: 'note', payload: null } as unknown as DispatchEvent;
}

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

// 4 beats, one note each, at scene 0/1/2/3 s; 4 s loop (60 bpm → 1 beat = 1 s).
const EVENTS: DispatchEvent[] = [
  note('B0', 0, 0.5),
  note('B1', 1, 0.5),
  note('B2', 2, 0.5),
  note('B3', 3, 0.5)
];

function setup(now: { t: number }, loop: boolean) {
  const tokens: string[] = [];
  const transport = {
    send(event: Record<string, unknown>) {
      tokens.push(String(event.token));
    }
  };
  const handle = startKronosAudio({
    events: EVENTS,
    durationSec: 4,
    audioCtx: fakeCtx(now),
    derivedTempo: 60,
    loop,
    dispatcher: { duration: 4, transports: { default: transport } }
  });
  return { handle, tokens };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Kronos pause-at-beat-end (B7) + forward resume (B8)', () => {
  it('B7: pausing mid-beat-2 bounds emission — beat 2 emits, beat 3 does NOT', () => {
    vi.useFakeTimers();
    const now = { t: 0 };
    const { handle, tokens } = setup(now, true);
    try {
      // Play through beat 0 and 1; we are now mid-beat-2 (heard beat index 2).
      now.t = 2.3;
      vi.advanceTimersByTime(25); // pump: horizon 2.3 + 0.12 → beats 0,1,2 emitted
      expect(tokens).toContain('B2');
      expect(tokens).not.toContain('B3'); // not yet (beat 3 onset is 3.0)

      // Pause at the END of the current beat (beat 2). Boundary = (2+1)·1 = 3.0 s.
      const reached: number[] = [];
      const completed = handle.pauseAtBeatEnd(1.0, (b) => reached.push(b), 4);
      expect(completed).toBe(2); // the beat that completes (loop-folded into 0..3)

      // Advance PAST where beat 3 (onset 3.0) would have been scheduled. With the
      // emission bound at 3.0 (exclusive), beat 3 must NEVER be emitted.
      now.t = 3.5;
      vi.advanceTimersByTime(25); // pump: scheduler.tick crosses the bound → fires onEnd
      expect(tokens).not.toContain('B3');
      // The boundary-reached callback fired exactly once, deterministically from the
      // scheduler's own tick (no separate poll), with the completed beat.
      expect(reached).toEqual([2]);
      // No DOUBLING (B3): beat 2 — already emitted in the lookahead window before the
      // pause — must NOT be re-emitted by `playWindow`'s re-arm (the re-anchor sits at
      // the scheduler horizon, ahead of the heard position, so the already-queued note
      // is not re-queried).
      expect(tokens.filter((t) => t === 'B2')).toHaveLength(1);
    } finally {
      handle.stop();
    }
  });

  it('B8: resume from the frozen boundary plays the NEXT beat forward, UNBOUNDED — no backward, no gap', () => {
    vi.useFakeTimers();
    const now = { t: 0 };
    // First handle plays 0,1,2 then pauses at the end of beat 2 (boundary 3.0).
    const first = setup(now, true);
    try {
      now.t = 2.3;
      vi.advanceTimersByTime(25);
      const completed = first.handle.pauseAtBeatEnd(1.0, () => {}, 4);
      expect(completed).toBe(2);
      now.t = 3.5;
      vi.advanceTimersByTime(50); // boundary reached; beat 3 NOT emitted on the paused handle
      expect(first.tokens).not.toContain('B3');
      first.handle.stop(); // the host stops the paused handle when resuming (prev.kronosAudio.stop())
    } finally {
      // already stopped
    }

    // B8 — the host re-evaluates and starts a FRESH handle seeked to the frozen
    // boundary (= lastBeat+1 = beat 3 at 3.0 s), emission UNBOUNDED again. This is
    // exactly what `core.clock.play()` → re-eval → startKronosAudio({startSceneSec})
    // does after a kronos pause. The fresh handle is the same forward-resume as
    // Step→Play: it begins at beat 3, never re-plays 0/1/2 (no backward, no double).
    const now2 = { t: 3.0 };
    const tokens2: string[] = [];
    const transport2 = { send: (e: Record<string, unknown>) => tokens2.push(String(e.token)) };
    const second = startKronosAudio({
      events: EVENTS,
      durationSec: 4,
      audioCtx: fakeCtx(now2),
      derivedTempo: 60,
      loop: true,
      dispatcher: { duration: 4, transports: { default: transport2 } },
      startSceneSec: 3.0 // resume at the frozen boundary = beat 3
    });
    try {
      now2.t = 3.1;
      vi.advanceTimersByTime(25); // pump: beat 3 (onset 3.0) emits, unbounded
      expect(tokens2).toContain('B3'); // the next beat plays
      // Forward only: no backward re-emission of beats 0/1/2 on resume.
      expect(tokens2).not.toContain('B0');
      expect(tokens2).not.toContain('B1');
      expect(tokens2).not.toContain('B2');
    } finally {
      second.stop();
    }
  });

  it('stop() during a pending pause drops the bound + onEnd (no stale callback)', () => {
    vi.useFakeTimers();
    const now = { t: 0 };
    const { handle } = setup(now, true);
    try {
      now.t = 2.3;
      vi.advanceTimersByTime(25);
      const reached: number[] = [];
      handle.pauseAtBeatEnd(1.0, (b) => reached.push(b), 4);
      handle.stop(); // tears down (driver stop + setSceneBound(null)) before the bound is reached
      now.t = 4.0;
      vi.advanceTimersByTime(100); // driver stopped + bound cleared → onEnd must NOT fire
      expect(reached).toEqual([]);
    } finally {
      handle.stop();
    }
  });
});
