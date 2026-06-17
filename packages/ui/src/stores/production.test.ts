import { describe, it, expect } from 'vitest';
import { production, beatCount, type RawTimedToken } from './production.svelte';

// Lot A plumbing: the raw BPx tokens carried alongside the production must reach
// the store UNTRANSFORMED, with times still in MILLISECONDS (the unit the
// vendored piano-roll `timeline.js` expects), distinct from the `tokens`
// readout which is converted to seconds.
describe('production store — rawTokens', () => {
  it('preserves raw tokens in milliseconds, untransformed', () => {
    const raw: RawTimedToken[] = [
      { token: 'C4', start: 0, end: 500, type: 'terminal', actor: 'lead' },
      { token: 'E4', start: 250, end: 750, type: 'terminal', actor: null }
    ];

    production.set({
      source: 'bp3',
      tokens: [{ token: 'C4', startSec: 0, durSec: 0.5, sounding: true }],
      durationSec: 0.75,
      beatDurSec: 0.5,
      sections: [],
      rawTokens: raw
    });

    const stored = production.current?.rawTokens;
    expect(stored).toBeDefined();
    // Times stay in ms (500, 750), not converted to seconds.
    expect(stored).toEqual(raw);
    expect(stored?.[0].start).toBe(0);
    expect(stored?.[0].end).toBe(500);
    expect(stored?.[1].start).toBe(250);
    expect(stored?.[1].end).toBe(750);
    // Side fields survive.
    expect(stored?.[0].actor).toBe('lead');
    expect(stored?.[1].actor).toBeNull();

    production.clear();
    expect(production.current).toBeNull();
  });
});

// STEP beat count: the number of one-beat windows a production spans. A
// derivation usually ends exactly on a beat boundary, so floating-point noise
// must not add a phantom trailing beat (the Structure-view "+2" overshoot).
describe('beatCount (STEP window count)', () => {
  it('returns 0 when the beat length is not positive', () => {
    expect(beatCount(10, 0)).toBe(0);
    expect(beatCount(10, -1)).toBe(0);
  });

  it('snaps to the exact integer when on a beat boundary', () => {
    // arabic @mm:70: 16.2857s / (60/70 = 0.857143s) = exactly 19 beats.
    expect(beatCount(16.285714285714285, 60 / 70)).toBe(19);
    // cv-adsr @mm:138: 13.913s / (60/138 = 0.434783s) ≈ 31.9999 → 32, not 33.
    expect(beatCount(13.913, 60 / 138)).toBe(32);
  });

  it('does not overshoot on a tiny float excess past an integer', () => {
    // 32 beats with a sub-millisecond rounding excess must stay 32, not 33.
    const beat = 0.5;
    expect(beatCount(32 * beat + 1e-9, beat)).toBe(32);
  });

  it('still rounds a genuine partial final beat up', () => {
    // 4.6 beats → the partial 5th beat is its own STEP window.
    expect(beatCount(4.6 * 0.5, 0.5)).toBe(5);
  });

  it('counts a single beat as 1 (STEP then disabled, count < 2)', () => {
    expect(beatCount(0.5, 0.5)).toBe(1);
  });
});
