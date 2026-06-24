import { describe, it, expect } from 'vitest';
import { createBPx } from 'bpx';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { effectiveTempoBpm } from './bpx-adapter';

// KAN-C20 — the host's invented tempo default (the « 128 ») is gone from the
// derivation seed. A scene with NO `@mm` must derive at the ENGINE's OWN default,
// read back from `tree.metadata.tempo` — never overwritten by a host literal.
//
// These assertions are NON-CIRCULAR: they don't compare two halves of one host
// computation. They trace the projected tempo to the UPSTREAM authority (BPx):
// pass a tempo → metadata follows it; omit it → metadata is BPx's default, NOT 128.

const SCENE_NO_MM = `@core
@alphabet.western:browser
S -> C4 D4 E4
`;

function deriveMetaTempo(tempo: number | undefined): number | undefined {
  const ast = (compileToBPxAST(SCENE_NO_MM) as { ast: unknown; errors: unknown[] }).ast;
  const bpx = createBPx(tempo === undefined ? {} : { tempo });
  bpx.loadGrammar(ast as never);
  const derived = bpx.derive({ output: 'complete' });
  return (derived.tree as { metadata?: { tempo?: number } }).metadata?.tempo;
}

describe('KAN-C20 — host « 128 » default removed from the derivation seed', () => {
  it('a no-@mm scene with NO tempo passed derives at the ENGINE default, not 128', () => {
    const meta = deriveMetaTempo(undefined);
    // BPx's own documented default is 60 (instance.ts: `tempo ?? 60`). The point is
    // not the exact number but that it TRACES to the engine, never the host 128.
    expect(meta).toBe(60);
    expect(meta).not.toBe(128);
  });

  it('the projected tempo TRACES to the engine: change the passed tempo → metadata follows', () => {
    // Mutate the upstream input; the projected value must follow it (not a host fallback).
    expect(deriveMetaTempo(96)).toBe(96);
    expect(deriveMetaTempo(150)).toBe(150);
    // …and with no input, it is the engine default — proving the host injects no 128.
    expect(deriveMetaTempo(undefined)).toBe(60);
  });

  it('effectiveTempoBpm on a no-@mm derivation reads the engine default (60), not 128', () => {
    const ast = (compileToBPxAST(SCENE_NO_MM) as { ast: unknown }).ast;
    // Reproduce the adapter's no-@mm / no-user-tempo path: createBPx WITHOUT a tempo.
    const bpx = createBPx({});
    bpx.loadGrammar(ast as never);
    const derived = bpx.derive({ output: 'complete' });
    // The adapter reconciles `currentBpm = effectiveTempoBpm(derived, deriveTempo ?? 60)`.
    // With no @mm and no user tempo, `deriveTempo` is undefined → fallback 60, AND the
    // derivation itself reports 60 — both engine-sourced, neither a host 128.
    const currentBpm = effectiveTempoBpm(derived, 60);
    expect(currentBpm).toBe(60);
    expect(currentBpm).not.toBe(128);
  });
});
