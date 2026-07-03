import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clock } from './clock.svelte';
import { kronosCursor } from './kronos-cursor.svelte';
import * as registry from '../lib/runtimes/registry';

// The tempo/transport store is a PROJECTION/ROUTER, not a host clock. These tests cover the
// live behavior the old MockClock object carried — now reimplemented WITHOUT a clock object:
// the persisted session tempo (clamp, no-op guard, TAP), the cross-runtime live retune
// fan-out, and the transport readout PROJECTED from Kronos's Transport state.

beforeEach(() => {
  kronosCursor.set(null); // no live scene → readout falls back to the persisted value
});

describe('tempo store — persisted session value (clamp + no-op + TAP)', () => {
  it('clamps the persisted bpm to [20, 300]', () => {
    clock.setBpm(5);
    expect(clock.state.bpm).toBe(20);
    clock.setBpm(500);
    expect(clock.state.bpm).toBe(300);
    clock.setBpm(128); // back to a sane default for following tests
  });

  it('setBpm is a no-op (no runtime fan-out) when the tempo is unchanged', () => {
    clock.setBpm(120);
    const spy = vi.spyOn(registry, 'listRuntimes');
    // Re-setting the SAME tempo must not fan out to the runtimes. A `.bps` with `@mm`
    // re-applies its own tempo on every Play→replay; without this guard each replay would
    // churn every runtime for nothing.
    clock.setBpm(120);
    expect(spy).not.toHaveBeenCalled();
    // A genuine change DOES fan out (live retune across runtimes).
    clock.setBpm(70);
    expect(spy).toHaveBeenCalled();
    expect(clock.state.bpm).toBe(70);
    spy.mockRestore();
    clock.setBpm(128);
  });

  it('tap() derives the bpm from the tap intervals', () => {
    // Two taps 500 ms apart → 120 bpm. performance.now is mocked to control the deltas.
    let t = 1000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => t);
    clock.setBpm(60); // a value the taps will move away from
    clock.tap();
    t += 500;
    clock.tap();
    expect(clock.state.bpm).toBeCloseTo(120, 1);
    nowSpy.mockRestore();
    clock.setBpm(128);
  });

  it('tap() ignores a degenerate (zero) interval — no silent jump to max (F27)', () => {
    // Two taps on the SAME clamped timestamp (performance.now frozen — the cross-origin
    // precision clamp can collapse two quick taps onto one value): the interval is 0. The old
    // code did 60000/0 = Infinity → clampBpm → 300, so a tap became a silent jump to the max
    // tempo. It must instead IGNORE the degenerate interval and keep the current tempo.
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => 10000);
    clock.setBpm(100);
    expect(clock.tap()).toBeNull(); // first tap establishes nothing
    const r = clock.tap(); // second tap, same timestamp → delta 0
    expect(r).toBeNull(); // degenerate → ignored, not Infinity→300
    expect(clock.state.bpm).toBe(100); // current tempo preserved (was 300)
    nowSpy.mockRestore();
    clock.setBpm(128);
  });
});

describe('transport readout — PROJECTED from Kronos, never a host flag', () => {
  it('playing/paused are false when no scene is live', () => {
    kronosCursor.set(null);
    expect(clock.state.playing).toBe(false);
    expect(clock.state.paused).toBe(false);
  });

  it('a running Kronos handle projects playing=true and shows its live tempo', () => {
    let state: 'stopped' | 'running' | 'paused' = 'running';
    const fakeHandle = {
      transport: {
        state,
        tempo: 142,
        onStateChange: (_cb: (s: typeof state) => void) => () => {}
      },
      position: () => 0,
      beatPosition: () => ({ bar: 1, beat: 0, phase: 0, beatsTotal: 0 })
    } as unknown as Parameters<typeof kronosCursor.set>[0];
    kronosCursor.set(fakeHandle);
    expect(clock.state.playing).toBe(true);
    expect(clock.state.paused).toBe(false);
    // The live handle's tempo is the authority while a scene plays (not the persisted value).
    expect(clock.state.bpm).toBe(142);
    void state;
    kronosCursor.set(null);
  });
});
