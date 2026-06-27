import { describe, it, expect } from 'vitest';
import { beatsPerBarFromMeter, DEFAULT_BEATS_PER_BAR } from './meter';

describe('beatsPerBarFromMeter — projects DeriveResult.meter, never invents', () => {
  it('absent / null meter → the documented default (4/4 unchanged)', () => {
    expect(beatsPerBarFromMeter(undefined)).toBe(DEFAULT_BEATS_PER_BAR);
    expect(beatsPerBarFromMeter(null)).toBe(DEFAULT_BEATS_PER_BAR);
    expect(beatsPerBarFromMeter({ numerators: [], denom: 4 })).toBe(DEFAULT_BEATS_PER_BAR);
  });

  it('simple meter [N] → N (read upstream, not the hardcoded 4)', () => {
    expect(beatsPerBarFromMeter({ numerators: [4], denom: 4 })).toBe(4);
    expect(beatsPerBarFromMeter({ numerators: [7], denom: 8 })).toBe(7);
    expect(beatsPerBarFromMeter({ numerators: [5], denom: 4 })).toBe(5);
  });

  it('uniform repeated bars [N,N,…] → N (e.g. 4+4+4 = bars of 4)', () => {
    expect(beatsPerBarFromMeter({ numerators: [4, 4, 4], denom: 4 })).toBe(4);
    expect(beatsPerBarFromMeter({ numerators: [3, 3], denom: 8 })).toBe(3);
  });

  it('additive (differing) [a,b,…] → cycle length sum (downbeat correct)', () => {
    expect(beatsPerBarFromMeter({ numerators: [3, 2], denom: 8 })).toBe(5);
    expect(beatsPerBarFromMeter({ numerators: [3, 3, 2], denom: 8 })).toBe(8);
  });

  it('traces the upstream value: mutating numerators changes the projection', () => {
    expect(beatsPerBarFromMeter({ numerators: [4], denom: 4 })).toBe(4);
    expect(beatsPerBarFromMeter({ numerators: [9], denom: 8 })).toBe(9);
  });
});
