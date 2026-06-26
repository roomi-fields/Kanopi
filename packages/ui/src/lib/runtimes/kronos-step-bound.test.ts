import { describe, it, expect, vi } from 'vitest';
import { Scheduler } from '@kronos/core';
import { startKronosAudio } from './kronos-audio';
import { kairosFromEvents } from './kairos-test-helpers';
import type { DispatchEvent } from './kairos-test-helpers';

// THE BUG: in kronos mode a STEP played TWO beats instead of one. The old STEP path
// did `scheduler.start(fromSec)` + a WALL-CLOCK `setTimeout(driver.stop, durSec)`.
// The driver pumps with lookahead (0.12 s) and the scheduler had no scene upper bound,
// so the FIRST synchronous pump already scheduled the NEXT beat (onset = the window
// boundary, inside the lookahead) BEFORE the wall-clock timer could fire → 2 notes.
//
// THE FIX: the STEP path now calls `scheduler.playWindow(fromSec, fromSec + durSec)`,
// which bounds EMISSION to the half-open scene window `[from, to)` with the lookahead
// INCLUDED — no event with onset ≥ `to` is ever emitted, deterministically. No
// wall-clock stop. These tests prove the wiring (playWindow, not start+setTimeout) and
// the behaviour (exactly the window's events, never the next beat).

// A bare note (no CV) at scene `onset` s, lasting `dur` s.
function note(token: string, onset: number, dur: number): DispatchEvent {
  return {
    token,
    startSec: onset,
    durSec: dur,
    type: 'note',
    payload: null,
    // Route to the 'midi' sink so the capture transport receives the FLAT event shape and
    // reads `event.token` — incidental here; the test probes STEP windowing, not routing.
    output: { runtime: 'midi' }
  } as unknown as DispatchEvent;
}

// Capture the order/identity of every event the transport receives (every emitted note).
function captureTokens(opts: {
  events: DispatchEvent[];
  step?: { fromSec: number; durSec: number };
}): string[] {
  const tokens: string[] = [];
  const transport = {
    send(event: Record<string, unknown>) {
      tokens.push(String(event.token));
    }
  };
  const totalDur = Math.max(...opts.events.map((e) => e.startSec + e.durSec), 0);
  const param = () => ({
    setValueAtTime() {},
    setValueCurveAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
    value: 0
  });
  const ctx = {
    get currentTime() {
      return 0;
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

  const handle = startKronosAudio({
    durationSec: totalDur,
    audioCtx: ctx,
    derivedTempo: 60,
    loop: false,
    sinks: { midi: transport },
    step: opts.step,
    kairos: kairosFromEvents(opts.events, totalDur)
  });
  handle.stop();
  return tokens;
}

describe('Kronos STEP — emission-bounded (no wall-clock race): ONE beat, not two', () => {
  it('STEP wires scheduler.playWindow(from, from+durSec), NOT start + wall-clock stop', () => {
    // Spy the actual primitives. The fix MUST call playWindow with the half-open scene
    // window and MUST NOT arm an unbounded `start()` for the step (the racy path).
    const playWindow = vi.spyOn(Scheduler.prototype, 'playWindow');
    const start = vi.spyOn(Scheduler.prototype, 'start');
    try {
      captureTokens({
        events: [note('B0', 0, 0.5), note('B1', 1, 0.5)],
        step: { fromSec: 0, durSec: 1 }
      });
      expect(playWindow).toHaveBeenCalledTimes(1);
      // [from, from + durSec) — the emission bound.
      expect(playWindow.mock.calls[0][0]).toBe(0);
      expect(playWindow.mock.calls[0][1]).toBe(1);
      // The step path must NOT also call the unbounded `start(startScene)` directly
      // (playWindow re-arms internally; an extra direct start would drop the bound).
      // start() is called once, from inside playWindow — with the SAME fromScene.
      for (const c of start.mock.calls) expect(c[0]).toBe(0);
    } finally {
      playWindow.mockRestore();
      start.mockRestore();
    }
  });

  it('the next beat sits INSIDE the lookahead but is NOT emitted (the bug, gone)', () => {
    // Two beats so close (scene 0 and 0.05 s) that BOTH fall inside the driver's 0.12 s
    // lookahead on the first synchronous pump. STEP window = [0, 0.05) EXCLUSIVE, so the
    // beat at 0.05 (the window boundary) must NOT be emitted — even though the old
    // wall-clock code would have scheduled it on that first pump (the 2-beats bug).
    const tokens = captureTokens({
      events: [note('B0', 0, 0.02), note('B1', 0.05, 0.02)],
      step: { fromSec: 0, durSec: 0.05 }
    });
    expect(tokens).toEqual(['B0']);
    expect(tokens).not.toContain('B1');
  });

  it('a STEP emits exactly the events of its window, never the following beat', () => {
    // Three beats at scene 0 / 0.04 / 0.08, all inside lookahead. STEP [0.04, 0.08)
    // emits ONLY the beat at 0.04: the one before (seek prunes it) and the one at the
    // boundary 0.08 (emission bound) are both excluded.
    const tokens = captureTokens({
      events: [note('B0', 0, 0.02), note('B1', 0.04, 0.02), note('B2', 0.08, 0.02)],
      step: { fromSec: 0.04, durSec: 0.04 }
    });
    expect(tokens).toEqual(['B1']);
  });

  it('two onsets WITHIN one window both emit (the window is not capped to one event)', () => {
    // Chord-like: two onsets at scene 0 and 0.01, window [0, 0.05). Both are < 0.05 so
    // both emit — the bound is on the scene window, not an event count.
    const tokens = captureTokens({
      events: [note('A', 0, 0.02), note('B', 0.01, 0.02), note('C', 0.05, 0.02)],
      step: { fromSec: 0, durSec: 0.05 }
    });
    expect(tokens.sort()).toEqual(['A', 'B']);
    expect(tokens).not.toContain('C');
  });
});
