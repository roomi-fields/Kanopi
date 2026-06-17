import { describe, it, expect } from 'vitest';
// Core scale engine — concrete ratios from a scale name (PITCH.md 6-layer model).
import { resolveScaleRatios } from '../../../../core/src/dispatcher/scale.js';
import scalesJson from 'bpscript/lib/scales.json';

const SCALES = scalesJson as unknown as Record<string, unknown>;

// Compare a computed ratio list against expected fractions, within float epsilon.
const closeTo = (got: number[], expected: number[]) => {
  expect(got.length).toBe(expected.length);
  got.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9));
};
// Ratio list → rounded cents from the tonic (1200·log2). The authoritative
// oracles below are expressed in cents (as confirmed by BPScript).
const cents = (got: number[]) => got.map((v) => Math.round(1200 * Math.log2(v)));

describe('resolveScaleRatios — concrete ratios from the scales catalog', () => {
  it('computes maqam_rast (arabic) from compose(jins_rast, jins_rast) @ 3/2 — NO dedup (ORACLE)', () => {
    // Arabic tetrachords end on 4/3, junction 3/2 → no coincidence → keep all.
    // jins_rast = [1, 9/8, 27/22, 4/3] → 8 ratios, neutral third 27/22 (~355c).
    const ratios = resolveScaleRatios('maqam_rast', SCALES);
    expect(ratios).not.toBeNull();
    closeTo(ratios!, [1, 9 / 8, 27 / 22, 4 / 3, 3 / 2, 27 / 16, 81 / 44, 2]);
    expect(cents(ratios!)).toEqual([0, 204, 355, 498, 702, 906, 1057, 1200]);
  });

  it('computes makam_rast (turkish) with DEDUP by coincidence — the critical test (ORACLE)', () => {
    // Turkish cins are PENTACHORDS ending on 3/2; junction 3/2 coincides with the
    // previous jins's last note → dedup, else the fifth doubles. 8 ratios, not 9.
    const ratios = resolveScaleRatios('makam_rast', SCALES);
    expect(ratios).not.toBeNull();
    expect(ratios!.length).toBe(8);
    expect(cents(ratios!)).toEqual([0, 204, 384, 498, 702, 906, 1086, 1200]);
  });

  it('computes maqam_saba (3 jins, junction array [13/10, 26/15]) — 2 dedups (ORACLE)', () => {
    // Multi-junction scale: both junctions coincide with the running last note →
    // 2 dedups. Saba runs past the octave (1450c) — that is expected.
    const ratios = resolveScaleRatios('maqam_saba', SCALES);
    expect(ratios).not.toBeNull();
    expect(ratios!.length).toBe(10);
    expect(cents(ratios!)).toEqual([0, 151, 316, 454, 566, 841, 952, 1156, 1307, 1450]);
  });

  it('returns the intrinsic ratios of a jins (ratios form, normalized to floats)', () => {
    // jins_rast carries its ratios directly (fragment) → returned as-is, floats.
    const ratios = resolveScaleRatios('jins_rast', SCALES);
    expect(ratios).not.toBeNull();
    closeTo(ratios!, [1, 9 / 8, 27 / 22, 4 / 3]);
  });

  it('returns null for a degrees-based western mode (use the degrees+temperament path)', () => {
    // bilaval = degrees into the 22-shruti grid → no intrinsic ratios here.
    expect(resolveScaleRatios('bilaval', SCALES)).toBeNull();
  });

  it('returns null for an unknown scale name', () => {
    expect(resolveScaleRatios('not_a_scale', SCALES)).toBeNull();
  });
});
