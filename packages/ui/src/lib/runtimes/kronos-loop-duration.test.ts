import { describe, it, expect } from 'vitest';
import { startKronosAudio } from './kronos-audio';
import type { DispatchEvent } from './tree-dispatch';

// KAN-C02/C03 — the loop length is no longer a HOST reduce(max). It is the timeline's
// own `duration` (materialized from the events / `opts.durationSec`), READ BACK via the
// upstream Kronos primitive `Transport.loopDurationScene()`. The removed
// `dispatcher.duration` was a SECOND host reduce(max) of the same value (duplicate
// authority). This proves the projected primitive === the old reduce(max), to the
// last decimal, on representative scenes — INCLUDING a scene that ends on a trailing
// rest (where the last SOUNDING leaf ends before real scene end: a bound computed from
// notes only would fold too early).

function note(token: string, onset: number, dur: number): DispatchEvent {
  return {
    token,
    startSec: onset,
    durSec: dur,
    type: 'note',
    payload: null
  } as unknown as DispatchEvent;
}
function rest(onset: number, dur: number): DispatchEvent {
  return { token: '-', startSec: onset, durSec: dur, type: 'rest' } as unknown as DispatchEvent;
}

// The OLD host bound: max(startSec + durSec) over EVERY event (notes AND rests).
function oldReduceMax(events: DispatchEvent[]): number {
  return events.reduce((m, e) => Math.max(m, e.startSec + e.durSec), 0);
}

function param() {
  return {
    setValueAtTime() {},
    setValueCurveAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
    value: 0
  };
}
function fakeCtx(): AudioContext {
  return {
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
}

// Build the REAL Kronos handle (real @kronos/core) WITHOUT passing a compiled
// `durationSec`, so the timeline length is materialized from the events — exactly the
// repli path. Then read the bound back through the upstream primitive.
function loopDurationViaPrimitive(events: DispatchEvent[]): number {
  const handle = startKronosAudio({
    events,
    audioCtx: fakeCtx(),
    derivedTempo: 120,
    loop: true,
    dispatcher: { transports: {} },
    startSceneSec: 0
  });
  const d = handle.transport.loopDurationScene();
  handle.stop();
  return d;
}

describe('KAN-C02/C03 — loop length is the upstream primitive, not a host reduce(max)', () => {
  it('scene A (notes only): loopDurationScene() === old reduce(max)', () => {
    const events = [note('C4', 0, 0.5), note('E4', 0.5, 0.5), note('G4', 1, 1)]; // ends at 2.0
    expect(loopDurationViaPrimitive(events)).toBeCloseTo(oldReduceMax(events), 9);
    expect(loopDurationViaPrimitive(events)).toBeCloseTo(2.0, 9);
  });

  it('scene B (a long earlier note ends LAST): primitive === reduce(max), not last-by-onset', () => {
    // The last note by ONSET ends at 1.2; an earlier long note ends at 3.0. The bound
    // must be 3.0 (max END), which both the old reduce and the primitive give.
    const events = [note('LONG', 0, 3), note('a', 0.5, 0.5), note('b', 1, 0.2)];
    expect(oldReduceMax(events)).toBeCloseTo(3.0, 9);
    expect(loopDurationViaPrimitive(events)).toBeCloseTo(oldReduceMax(events), 9);
  });

  it('scene C (TRAILING REST): the bound extends to scene end, not the last sounding leaf', () => {
    // Last SOUNDING note ends at 1.0; a trailing rest occupies [1.0, 2.0). A bound from
    // notes alone would fold at 1.0 (a bar too early). The primitive (timeline.duration)
    // and the old reduce(max-over-ALL-events) both give 2.0 — the real scene end.
    const events = [note('C4', 0, 0.5), note('E4', 0.5, 0.5), rest(1, 1)];
    const lastSoundingEnd = 1.0;
    const real = oldReduceMax(events);
    expect(real).toBeCloseTo(2.0, 9);
    expect(real).toBeGreaterThan(lastSoundingEnd); // the rest matters
    expect(loopDurationViaPrimitive(events)).toBeCloseTo(real, 9);
  });
});
