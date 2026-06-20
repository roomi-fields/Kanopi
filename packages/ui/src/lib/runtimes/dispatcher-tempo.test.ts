import { describe, it, expect } from 'vitest';
// Live tempo retune (requirement A) + real audio beat position (requirement B).
// Driven against a MUTABLE mock AudioContext clock (no Web Audio): we advance
// `currentTime` by hand and call `_schedule` directly, like the sibling loop
// test. The anchored tempo map lives in the dispatcher's Clock; these tests
// assert (1) a tempo change rescales FUTURE event fire times by the expected
// ratio with the anchor preserved (no position jump), and (2) the exposed
// musical beat position advances at the CURRENT tempo.
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';

interface MockCtx {
  currentTime: number;
  state: string;
  resume(): void;
}
function makeCtx(): MockCtx {
  return { currentTime: 0, state: 'running', resume() {} };
}

class MockTransport {
  sent: { token: string; absTime: number; durSec: number }[] = [];
  send(msg: { token: string; durSec: number }, absTime: number) {
    this.sent.push({ token: msg.token, absTime, durSec: msg.durSec });
  }
  close() {}
}

type ClockAny = {
  _running: boolean;
  _startTime: number;
  _anchorAudio: number;
  _anchorMusical: number;
  _derivedTempo: number;
  tempo: number;
  rate: number;
  musicalNow(t: number): number;
  audioTimeFor(m: number): number;
};
type DispAny = InstanceType<typeof Dispatcher> & {
  _running: boolean;
  clock: ClockAny;
  audioCtx: MockCtx;
  setSoundPredicate(fn: (t: string) => boolean): void;
  setDerivedTempo(bpm: number): void;
  setLiveTempo(bpm: number): void;
  loadEvents(ev: unknown[]): void;
  musicalBeatPosition(
    bpb?: number
  ): { beatsTotal: number; bar: number; beat: number; phase: number } | null;
  _schedule(until: number): void;
};

function note(token: string, startSec: number) {
  return { token, startSec, durSec: 0.05, type: 'note' as const };
}

// Replicate what clock.start() does to its anchors, WITHOUT installing the
// real-time setInterval (we drive _schedule + currentTime manually instead).
function arm(d: DispAny, derivedTempo: number) {
  d.setDerivedTempo(derivedTempo);
  d._running = true;
  const c = d.clock;
  c._running = true;
  c._startTime = d.audioCtx.currentTime;
  c._anchorAudio = d.audioCtx.currentTime;
  c._anchorMusical = 0;
}

describe('dispatcher live tempo retune (anchored map)', () => {
  it('halving the tempo doubles future inter-onset spacing, anchor preserved (no jump)', () => {
    const ctx = makeCtx();
    const d = new Dispatcher(ctx as unknown as AudioContext) as unknown as DispAny;
    const out = new MockTransport();
    d.addTransport('default', out);
    d.setSoundPredicate(() => true);

    // Events one derived-second apart, derived at 120 bpm → rate 1 at start.
    d.loadEvents([note('A0', 0), note('A1', 1), note('A2', 2), note('A3', 3)]);
    arm(d, 120);
    expect(d.clock.rate).toBe(1);

    // Fire only the event at musical 0 (audioTimeFor(0) = 0 ≤ 0).
    ctx.currentTime = 0;
    d._schedule(0);
    expect(out.sent.map((s) => s.token)).toEqual(['A0']);
    expect(out.sent[0].absTime).toBeCloseTo(0, 9);
    expect(out.sent[0].durSec).toBeCloseTo(0.05, 9); // rate 1 → unscaled

    // Mid-playback: at audio t=0.5 (musical 0.5) drop to 60 bpm → rate 2.
    ctx.currentTime = 0.5;
    const musicalBefore = d.clock.musicalNow(0.5);
    d.setLiveTempo(60);
    const musicalAfter = d.clock.musicalNow(0.5);
    // Anchor preserved: the musical position at the change instant is continuous.
    expect(musicalAfter).toBeCloseTo(musicalBefore, 9);
    expect(d.clock.rate).toBe(2);

    // Schedule the rest. Each remaining derived-second now costs 2 audio-seconds.
    d._schedule(Number.POSITIVE_INFINITY);
    const fired = out.sent;
    expect(fired.map((s) => s.token)).toEqual(['A0', 'A1', 'A2', 'A3']);
    // audioTimeFor(m) = anchorAudio 0.5 + (m − anchorMusical 0.5) * rate 2
    expect(fired[1].absTime).toBeCloseTo(0.5 + (1 - 0.5) * 2, 9); // 1.5
    expect(fired[2].absTime).toBeCloseTo(0.5 + (2 - 0.5) * 2, 9); // 3.5
    expect(fired[3].absTime).toBeCloseTo(0.5 + (3 - 0.5) * 2, 9); // 5.5
    // Inter-onset spacing doubled (1.0 derived-sec → 2.0 audio-sec).
    expect(fired[2].absTime - fired[1].absTime).toBeCloseTo(2, 9);
    expect(fired[3].absTime - fired[2].absTime).toBeCloseTo(2, 9);
    // No jump: the first future onset stays ≥ the change instant.
    expect(fired[1].absTime).toBeGreaterThanOrEqual(0.5);
    // Durations scale with the live rate (audible length tracks tempo).
    expect(fired[1].durSec).toBeCloseTo(0.1, 9);
  });

  it('faster tempo compresses future spacing', () => {
    const ctx = makeCtx();
    const d = new Dispatcher(ctx as unknown as AudioContext) as unknown as DispAny;
    const out = new MockTransport();
    d.addTransport('default', out);
    d.setSoundPredicate(() => true);

    d.loadEvents([note('A0', 0), note('A1', 1), note('A2', 2)]);
    arm(d, 120);
    ctx.currentTime = 0;
    d._schedule(0); // fire A0 at rate 1

    ctx.currentTime = 0.25;
    d.setLiveTempo(240); // rate = 120/240 = 0.5
    expect(d.clock.rate).toBe(0.5);
    d._schedule(Number.POSITIVE_INFINITY);
    const f = out.sent;
    // audioTimeFor(m) = 0.25 + (m − 0.25) * 0.5
    expect(f[1].absTime).toBeCloseTo(0.25 + (1 - 0.25) * 0.5, 9); // 0.625
    expect(f[2].absTime).toBeCloseTo(0.25 + (2 - 0.25) * 0.5, 9); // 1.125
    expect(f[2].absTime - f[1].absTime).toBeCloseTo(0.5, 9); // 1 derived-sec → 0.5 audio-sec
  });
});

describe('dispatcher musical beat position (real beat display)', () => {
  it('advances at the CURRENT tempo, across a live retune', () => {
    const ctx = makeCtx();
    const d = new Dispatcher(ctx as unknown as AudioContext) as unknown as DispAny;
    const out = new MockTransport();
    d.addTransport('default', out);
    d.setSoundPredicate(() => true);
    d.loadEvents([note('A0', 0), note('A1', 4)]);
    arm(d, 120); // 120 bpm = 2 beats/sec

    // t=0 → beat 0.
    ctx.currentTime = 0;
    expect(d.musicalBeatPosition(4)?.beatsTotal).toBeCloseTo(0, 9);

    // After 1 real second at 120 bpm → 2 beats.
    ctx.currentTime = 1;
    const at1 = d.musicalBeatPosition(4)!;
    expect(at1.beatsTotal).toBeCloseTo(2, 9);
    expect(at1.bar).toBe(1);
    expect(at1.beat).toBe(2);

    // Drop to 60 bpm (1 beat/sec) at t=1, then run 2 more real seconds.
    d.setLiveTempo(60);
    ctx.currentTime = 3;
    const at3 = d.musicalBeatPosition(4)!;
    // 2 beats at 120 bpm (first second) + 2 beats at 60 bpm (next two seconds).
    expect(at3.beatsTotal).toBeCloseTo(4, 9);
    expect(at3.bar).toBe(2); // beat index 4 with beatsPerBar 4 → bar 2, beat 0
    expect(at3.beat).toBe(0);

    // Rate advanced at the live (current) tempo over the last leg: 2 beats / 2 s.
    expect((at3.beatsTotal - at1.beatsTotal) / 2).toBeCloseTo(1, 9); // 1 beat/sec = 60 bpm
  });

  it('returns null when not running', () => {
    const ctx = makeCtx();
    const d = new Dispatcher(ctx as unknown as AudioContext) as unknown as DispAny;
    expect(d.musicalBeatPosition()).toBeNull();
  });
});
