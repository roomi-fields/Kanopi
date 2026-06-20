import { describe, it, expect } from 'vitest';
// Loop + re-random per cycle (old dispatcher's `loop` / `_reDerive`). Driven via
// `_schedule(Infinity)` like the other dispatcher tests — no Web Audio clock. The
// end-of-cycle branch in `_schedule` fires `_nextCycle` when the remaining time
// to the cycle end is within the clock lookahead (0.1s), so we keep the loaded
// sequence short (≤0.1s) to force the boundary in a single synchronous drain.
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';

function makeCtx() {
  return { currentTime: 0, state: 'running', resume() {} } as unknown as AudioContext;
}

class MockTransport {
  sent: { token: string }[] = [];
  send(msg: { token: string }) {
    this.sent.push(msg);
  }
  close() {}
}

type DispAny = InstanceType<typeof Dispatcher> & {
  _running: boolean;
  _reDerive: (() => unknown) | null;
  _reRandom: boolean;
  loop: boolean;
  setReRandom(on: boolean): void;
  setSoundPredicate(fn: (t: string) => boolean): void;
  loadEvents(ev: unknown[]): void;
  clock: { _startTime: number };
  _schedule(until: number): void;
};

// Drain the loaded sequence synchronously through the scheduler at currentTime 0.
function drain(d: DispAny) {
  d._running = true;
  d.clock._startTime = 0;
  d._schedule(Number.POSITIVE_INFINITY);
}

function note(token: string) {
  return { token, startSec: 0, durSec: 0.05, type: 'note' as const };
}

describe('dispatcher loop + re-random per cycle', () => {
  it('loop ON + re-random ON → re-derives at the cycle boundary and reloads its events', () => {
    const d = new Dispatcher(makeCtx()) as DispAny;
    const out = new MockTransport();
    d.addTransport('default', out);
    d.setSoundPredicate(() => true);

    // First cycle plays 'A'. The re-derive returns a DIFFERENT sequence ('B'),
    // simulating a weighted/random rule re-rolling tour to tour.
    d.loadEvents([note('A')]);

    let calls = 0;
    d.loop = true;
    d._running = true;
    d._reRandom = true; // re-random ENABLED (live flag)
    d._reDerive = () => {
      calls++;
      return [note('B')];
    };

    drain(d);

    // The cycle boundary fired the re-derive exactly once and swapped in 'B'.
    expect(calls).toBe(1);
    expect(out.sent.map((s) => s.token)).toEqual(['A']);
    // The dispatcher kept running (loop) and the next cycle now holds 'B'.
    expect(d._running).toBe(true);
    const events = (d as unknown as { events: { token: string }[] }).events;
    expect(events.map((e) => e.token)).toEqual(['B']);
  });

  it('loop ON + re-random OFF (flag) → SAME events, even though the function is present', () => {
    const d = new Dispatcher(makeCtx()) as DispAny;
    const out = new MockTransport();
    d.addTransport('default', out);
    d.setSoundPredicate(() => true);

    d.loadEvents([note('A')]);
    d.loop = true;
    d._running = true;
    let calls = 0;
    // The re-derive function is AVAILABLE but the live flag is OFF → not used.
    d._reDerive = () => {
      calls++;
      return [note('B')];
    };
    d._reRandom = false;

    drain(d);

    expect(calls).toBe(0); // gated off by the flag, not by the absence of the function
    expect(d._running).toBe(true);
    const events = (d as unknown as { events: { token: string }[] }).events;
    expect(events.map((e) => e.token)).toEqual(['A']);
  });

  it('setReRandom(true) flips it LIVE → the next cycle re-derives', () => {
    const d = new Dispatcher(makeCtx()) as DispAny;
    const out = new MockTransport();
    d.addTransport('default', out);
    d.setSoundPredicate(() => true);

    d.loadEvents([note('A')]);
    d.loop = true;
    d._running = true;
    let calls = 0;
    d._reDerive = () => {
      calls++;
      return [note('B')];
    };
    d._reRandom = false;
    d.setReRandom(true); // user flips the 🎲 mid-playback

    drain(d);

    expect(calls).toBe(1); // took effect without re-evaluating
    const events = (d as unknown as { events: { token: string }[] }).events;
    expect(events.map((e) => e.token)).toEqual(['B']);
  });

  it('loop OFF → plays once and stops (no relaunch, no re-derive)', () => {
    const d = new Dispatcher(makeCtx()) as DispAny;
    const out = new MockTransport();
    d.addTransport('default', out);
    d.setSoundPredicate(() => true);

    d.loadEvents([note('A')]);
    let calls = 0;
    d.loop = false;
    d._running = true;
    d._reDerive = () => {
      calls++;
      return [note('B')];
    };

    drain(d);

    // Reached the end → stopped; the re-derive was never called.
    expect(calls).toBe(0);
    expect(d._running).toBe(false);
    expect(out.sent.map((s) => s.token)).toEqual(['A']);
  });
});
