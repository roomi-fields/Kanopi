// KAN-C01/C08 — the beat/bar UI events' `count` must TRACE Kronos's absolute-beat
// primitive (`transport.absoluteBeatPosition`), not a host +1-per-crossing recount.
//
// The store's #loop self-schedules through requestAnimationFrame. We capture the
// scheduled callback (stubbed BEFORE importing the singleton) and step it by hand with
// controlled `now`, while the mocked transport advances `absoluteBeatPosition`. The proof
// is non-circular: the folded display readout `beatPosition()` is mocked SEPARATELY from
// the absolute primitive, so any `count` that follows the absolute values can only come
// from the upstream authority — and on a SKIPPED frame (2 beats at once) the count must
// JUMP to the primitive's value, which a host +1 counter cannot do.

import { describe, it, expect, beforeEach } from 'vitest';

// ── Capture the rAF callback so we can drive #loop frame-by-frame ──────────────
let rafCb: FrameRequestCallback | null = null;
(
  globalThis as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }
).requestAnimationFrame = (cb: FrameRequestCallback) => {
  rafCb = cb;
  return 0;
};

// Import AFTER the stub so the singleton's constructor schedules into our capture.
const { kronosCursor } = await import('./kronos-cursor.svelte');
import type { KanopiEvent, EventBus } from '../lib/events/types';
import type { KronosCursorBeat } from '../lib/runtimes/kronos-audio';

function stepFrame(now: number) {
  const cb = rafCb;
  expect(cb).toBeTruthy();
  rafCb = null; // the loop reschedules → repopulates rafCb
  cb!(now);
}

// A BeatPosition built from an absolute beats value (mirrors the cursor's folded formula
// for the field shape, but the VALUE here is the absolute one we feed).
function bp(beatsTotal: number, beatsPerBar = 4): KronosCursorBeat {
  const whole = Math.floor(Math.max(0, beatsTotal));
  return {
    beatsTotal,
    bar: Math.floor(whole / beatsPerBar) + 1,
    beat: whole % beatsPerBar,
    phase: beatsTotal - whole
  };
}

// A spy bus that records every emitted event.
function spyBus(): { bus: EventBus; events: KanopiEvent[] } {
  const events: KanopiEvent[] = [];
  const noop = () => () => {};
  const bus: EventBus = {
    emit: (e: KanopiEvent) => events.push(e),
    on: noop as EventBus['on'],
    onAny: noop as EventBus['onAny']
  } as EventBus;
  return { bus, events };
}

// A fake KronosCursorView whose absolute primitive and folded readout are driven
// INDEPENDENTLY (the whole point: count must trace the absolute one).
function fakeView(opts: {
  abs: () => number; // absolute unfolded beats (the upstream authority)
  folded: () => number; // folded display beats (must NOT source the count)
}) {
  const transport = {
    state: 'running' as const,
    tempo: 120,
    onStateChange: () => () => {},
    absoluteBeatPosition: (beatsPerBar = 4) => bp(opts.abs(), beatsPerBar)
  };
  return {
    transport: transport as unknown as import('@kronos/core').Transport,
    position: () => 0,
    beatPosition: () => bp(opts.folded()),
    cutCodeVoices: () => {},
    refireCodeVoices: () => {}
  };
}

const beats = (events: KanopiEvent[]) =>
  events
    .filter((e) => e.type === 'beat')
    .map((e) => (e as Extract<KanopiEvent, { type: 'beat' }>).count);
const bars = (events: KanopiEvent[]) =>
  events
    .filter((e) => e.type === 'bar')
    .map((e) => (e as Extract<KanopiEvent, { type: 'bar' }>).count);

describe('KAN-C01/C08 — beat/bar count traces Kronos absoluteBeatPosition', () => {
  beforeEach(() => {
    kronosCursor.set(null);
  });

  it('characterization: first running frame is baseline only (downbeat not counted)', () => {
    const { bus, events } = spyBus();
    kronosCursor.setEventBus(bus, () => 120);
    let absBeats = 0;
    kronosCursor.set(fakeView({ abs: () => absBeats, folded: () => absBeats }));
    kronosCursor.state = 'running';
    stepFrame(0); // baseline at beat 0
    expect(beats(events)).toEqual([]); // downbeat NOT counted
  });

  it('count follows the absolute primitive, INCLUDING a loop wrap (monotone across loops)', () => {
    const { bus, events } = spyBus();
    kronosCursor.setEventBus(bus, () => 120);
    // Folded readout WRAPS (0..3 then back to 0) while the absolute keeps climbing.
    // A scene of 4 beats: absolute 0,1,2,3,4,5 → folded 0,1,2,3,0,1.
    let abs = 0;
    const folded = () => abs % 4;
    kronosCursor.set(fakeView({ abs: () => abs, folded }));
    kronosCursor.state = 'running';
    let t = 0;
    for (abs = 0; abs <= 6; abs++) stepFrame((t += 16));
    // baseline at abs=0, then a crossing per integer beat → counts 1..6, climbing THROUGH
    // the wrap (abs 4 = folded 0 but count keeps going).
    expect(beats(events)).toEqual([1, 2, 3, 4, 5, 6]);
    // Bars are the 0-based crossing index: beat 4 → bar #1, no bar yet before that.
    expect(bars(events)).toEqual([1]);
  });

  it('PROOF (non-circular): a SKIPPED frame of 2 beats jumps count to the primitive value', () => {
    const { bus, events } = spyBus();
    kronosCursor.setEventBus(bus, () => 120);
    let abs = 0;
    kronosCursor.set(fakeView({ abs: () => abs, folded: () => abs }));
    kronosCursor.state = 'running';
    let t = 0;
    abs = 0;
    stepFrame((t += 16)); // baseline at 0
    abs = 1;
    stepFrame((t += 16)); // count 1
    // FRAME DROP: the primitive advanced by 2 beats (1 → 3) between frames.
    abs = 3;
    stepFrame((t += 16));
    // A host +1 counter would emit 2 here (drift). Tracing the primitive, the count must
    // jump straight to 3 — the absolute beat index at this frame.
    expect(beats(events)).toEqual([1, 3]);
    expect(beats(events)).not.toContain(2); // the dropped beat is NOT renumbered to +1
  });

  it('proof that count sources the ABSOLUTE primitive, not the folded readout', () => {
    const { bus, events } = spyBus();
    kronosCursor.setEventBus(bus, () => 120);
    // Folded readout is PINNED to a constant (never crosses) while absolute climbs.
    // If count came from the folded readout it would stay empty; it must follow absolute.
    let abs = 0;
    kronosCursor.set(fakeView({ abs: () => abs, folded: () => 0.5 }));
    kronosCursor.state = 'running';
    let t = 0;
    for (abs = 0; abs <= 3; abs++) stepFrame((t += 16));
    expect(beats(events)).toEqual([1, 2, 3]);
  });

  it('leaving running resets the baseline (a fresh play from stopped does not count its downbeat)', () => {
    const { bus, events } = spyBus();
    kronosCursor.setEventBus(bus, () => 120);
    let abs = 0;
    kronosCursor.set(fakeView({ abs: () => abs, folded: () => abs }));
    kronosCursor.state = 'running';
    let t = 0;
    abs = 0;
    stepFrame((t += 16));
    abs = 1;
    stepFrame((t += 16));
    expect(beats(events).length).toBe(1);
    // Pause, then resume from the SAME absolute beat: the resumed downbeat must NOT count.
    kronosCursor.state = 'paused';
    stepFrame((t += 16));
    const before = events.length;
    kronosCursor.state = 'running';
    stepFrame((t += 16)); // re-baseline only
    expect(events.length).toBe(before);
  });
});
