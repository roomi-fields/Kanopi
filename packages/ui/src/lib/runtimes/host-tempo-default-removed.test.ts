import { describe, it, expect } from 'vitest';
import { createBPx } from 'bpx';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { effectiveTempoBpm } from './bpx-adapter';

// KAN-C20 — the host's invented tempo default (the « 128 ») is gone from the
// derivation seed. A scene with NO `@mm` must derive at the ENGINE's OWN default,
// read back from `tree.metadata.tempo` — never overwritten by a host literal.
//
// These assertions are NON-CIRCULAR: they don't compare two halves of one host
// computation. They trace the projected tempo to the UPSTREAM authority (BPx). Modèle
// PORTE FERMÉE (f831830/c0fe56f, arbitrage archi [460]) : le tempo n'est PAS un input de
// dérivation BPx — il vit au transport Kronos (warp). Donc `metadata.tempo` est TOUJOURS
// le défaut moteur, quel que soit le tempo passé ; jamais un host 128.

const SCENE_NO_MM = `@core
@alphabet.western:audio
S -> C4 D4 E4
`;

function deriveMetaTempo(tempo: number | undefined): number | undefined {
  const ast = (compileToBPxAST(SCENE_NO_MM) as { ast: unknown; errors: unknown[] }).ast;
  const bpx = createBPx(tempo === undefined ? {} : { tempo });
  bpx.loadGrammar(ast as never);
  const derived = bpx.derive();
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

  it('createBPx({tempo}) does NOT inject the tempo into the derivation (porte fermée) — metadata stays the engine default; the heard tempo rides the Kronos WARP', () => {
    // Modèle PORTE FERMÉE (arbitrage archi [460]) : le tempo n'est PAS un input de dérivation
    // BPx (il vit au transport Kronos). Passer un tempo à createBPx ne le propage donc PAS à
    // `tree.metadata.tempo` — celui-ci reste le défaut moteur (60), quel que soit le tempo
    // passé. Le tempo entendu est appliqué par le WARP Kronos, hors dérivation. (L'ancien
    // modèle injectait le tempo dans la dérivation → metadata suivait ; ce test le prouvait,
    // il est mis à jour au modèle actuel. Invariant : jamais un host 128.)
    expect(deriveMetaTempo(96)).toBe(60);
    expect(deriveMetaTempo(150)).toBe(60);
    expect(deriveMetaTempo(undefined)).toBe(60);
    expect(deriveMetaTempo(96)).not.toBe(128);
  });

  it('effectiveTempoBpm on a no-@mm derivation reads the engine default (60), not 128', () => {
    const ast = (compileToBPxAST(SCENE_NO_MM) as { ast: unknown }).ast;
    // Reproduce the adapter's no-@mm / no-user-tempo path: createBPx WITHOUT a tempo.
    const bpx = createBPx({});
    bpx.loadGrammar(ast as never);
    const derived = bpx.derive();
    // The adapter reconciles `currentBpm = effectiveTempoBpm(derived, deriveTempo ?? 60)`.
    // With no @mm and no user tempo, `deriveTempo` is undefined → fallback 60, AND the
    // derivation itself reports 60 — both engine-sourced, neither a host 128.
    const currentBpm = effectiveTempoBpm(derived, 60);
    expect(currentBpm).toBe(60);
    expect(currentBpm).not.toBe(128);
  });
});
