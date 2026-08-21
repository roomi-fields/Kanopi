import { describe, it, expect } from 'vitest';
import { sceneQuiPasse } from '../library/scene-de-banc';
import { createBPx } from 'bpx';
import { effectiveTempoBpm } from './bpx-adapter';

// KAN-C10 — the host must hold ONE tempo, not two. Before the fix two copies
// coexisted: `currentBpm` (the STEP / `beatDurSec` grid) and the central clock,
// both seeded from the DECLARED `mm` before deriving. The single source of truth
// is the EFFECTIVE tempo the derivation reports on `tree.metadata.tempo`; the host
// projects THAT onto both copies, so they converge (the « derived at 70, stepped
// at 128 » bug). These tests pin the projection used by the adapter at eval.

const SCENE_MM70 = `core
alphabet.western:audio
tempo:70
-----
S -> Sayr
Sayr -> C4 D4 E4 F4 G4 A4 B4
`;

describe('effectiveTempoBpm — single tempo source from the derivation', () => {
  it('projects tree.metadata.tempo over the pre-derive fallback', () => {
    // A divergent fallback (128) must be SUPERSEDED by the derivation's effective
    // tempo (70) — this is exactly the "stepped at 128 while derived at 70" case.
    const derived = { tree: { metadata: { tempo: 70 } } };
    expect(effectiveTempoBpm(derived, 128)).toBe(70);
  });

  it('keeps the fallback (repli) when the derivation reports no usable tempo', () => {
    expect(effectiveTempoBpm({ tree: { metadata: {} } }, 96)).toBe(96);
    expect(effectiveTempoBpm({ tree: { metadata: { tempo: 0 } } }, 96)).toBe(96);
    expect(effectiveTempoBpm(undefined, 96)).toBe(96);
    expect(effectiveTempoBpm(null, 96)).toBe(96);
  });

  it('end-to-end: a tempo:70 scene derives metadata.tempo=70, so BOTH ex-copies become 70', () => {
    const ast = sceneQuiPasse(SCENE_MM70);
    // The adapter seeds `createBPx({ tempo: currentBpm })` with the DECLARED mm
    // (70) before deriving; the derivation echoes it on metadata.tempo. We pass a
    // DELIBERATELY divergent fallback (128, the old clock default) to prove the
    // projection follows the derivation, never the stale 128.
    const bpx = createBPx({ tempo: 70 });
    bpx.loadGrammar(ast);
    const derived = bpx.derive();

    // The derivation's effective tempo is the single source.
    expect((derived.tree as { metadata?: { tempo?: number } }).metadata?.tempo).toBe(70);

    // `currentBpm` (ex-copy #1, drives the STEP grid) reconciles to 70, NOT 128.
    const currentBpm = effectiveTempoBpm(derived, 128);
    expect(currentBpm).toBe(70);

    // The STEP `beatDurSec` (`60 / currentBpm`) therefore reflects 70 bpm…
    const beatDurSec = currentBpm > 0 ? 60 / currentBpm : 0;
    expect(beatDurSec).toBeCloseTo(60 / 70, 9);
    // …and NOT the 128 it would have shown had the host kept its own copy.
    expect(beatDurSec).not.toBeCloseTo(60 / 128, 6);

    // Ex-copy #2 (the value fanned out to the central clock via the grammar sink)
    // is the SAME `currentBpm` — the two former copies now carry one value.
    const tempoPushedToClock = currentBpm;
    expect(tempoPushedToClock).toBe(currentBpm);
    expect(tempoPushedToClock).toBe(70);
  });
});
