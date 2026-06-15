import { describe, it, expect } from 'vitest';
// Same import path bp3.ts uses (packages/core ships raw ESM).
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';

// Proof harness for lot 4 cross-runtime CÂBLAGE: a standalone backtick voice
// compiles to a `BT<interp><id>` terminal in the derivation. The dispatcher must
// FIRE the registered sink at the token's scheduled time and must NOT route that
// token to an audio/text transport.

interface DispatcherInternals {
  addTransport(name: string, t: unknown): void;
  setBacktickSink(
    isBacktick: (t: string) => boolean,
    sink: (t: string, ts: { startSec: number; durSec: number; absTime: number }) => void
  ): void;
  load(tokens: { token: string; start: number; end: number }[]): void;
  _running: boolean;
  _cursor: number;
  _loopOffset: number;
  _schedule(until: number): void;
}

function makeDispatcher() {
  const fakeCtx = { currentTime: 0, state: 'running', resume() {} };
  return new Dispatcher(fakeCtx as unknown as AudioContext) as unknown as DispatcherInternals;
}

describe('dispatcher — backtick voice sink (lot 4)', () => {
  it('fires the sink once at the scheduled time and routes nothing to audio', () => {
    const audioSent: string[] = [];
    const fired: { token: string; startSec: number; durSec: number }[] = [];
    const d = makeDispatcher();
    d.addTransport('default', {
      send(evt: { token: string }) {
        audioSent.push(evt.token);
      },
      close() {}
    });
    const backticks = new Set(['BTstrudel350']);
    d.setBacktickSink(
      (t) => backticks.has(t),
      (token, ts) => fired.push({ token, startSec: ts.startSec, durSec: ts.durSec })
    );
    // C4 note, then a backtick terminal at 0.5s, then E4. (start/end in ms.)
    d.load([
      { token: 'C4', start: 0, end: 500 },
      { token: 'BTstrudel350', start: 500, end: 1000 },
      { token: 'E4', start: 1000, end: 1500 }
    ]);
    d._running = true;
    d._cursor = 0;
    d._loopOffset = 0;
    d._schedule(Infinity);

    // The sink fired exactly once, for the BT token, at its scheduled time.
    expect(fired).toHaveLength(1);
    expect(fired[0].token).toBe('BTstrudel350');
    expect(fired[0].startSec).toBeCloseTo(0.5, 5);
    expect(fired[0].durSec).toBeCloseTo(0.5, 5);

    // The audio transport received the two NOTES but NOT the backtick token.
    expect(audioSent).toEqual(['C4', 'E4']);
    expect(audioSent).not.toContain('BTstrudel350');
  });

  it('does not fire for tokens outside the backtick table', () => {
    const fired: string[] = [];
    const d = makeDispatcher();
    d.addTransport('default', { send() {}, close() {} });
    d.setBacktickSink(
      (t) => t === 'BThydra7',
      (token) => fired.push(token)
    );
    d.load([{ token: 'C4', start: 0, end: 500 }]);
    d._running = true;
    d._cursor = 0;
    d._loopOffset = 0;
    d._schedule(Infinity);
    expect(fired).toHaveLength(0);
  });
});
