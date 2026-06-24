// Garde anti-régression d'infrastructure (BPS-propagation).
// Prouve que le paquet bpscript CONSOMMÉ (node_modules/bpscript, résolu par NOM)
// porte bien le param `environnement` de compileToBPxAST (M5, BPScript ac9a474+).
// Échoue si la copie consommée est périmée / inerte (env ignoré → défaut moteur).
// À poser dans packages/ui/src/lib/runtimes/ (à côté de osc-routing.test.ts).
import { describe, it, expect } from 'vitest';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';

// Réplique locale du lecteur de tempo (cf. bpx-adapter mmFromAst).
function mmFromAst(
  ast: { directives?: { name?: string; value?: unknown }[] } | null
): number | undefined {
  for (const d of ast?.directives ?? []) {
    if (d.name === 'mm' && typeof d.value === 'number' && d.value > 0) return d.value;
  }
  return undefined;
}

describe('bpscript propagation — env → AST à travers le paquet consommé', () => {
  it("inscrit le défaut de tempo d'environnement quand la scène ne déclare rien", () => {
    const ast = compileToBPxAST('A -> C4', { tempo: 88 }).ast;
    expect(mmFromAst(ast as Parameters<typeof mmFromAst>[0])).toBe(88); // ÉCHOUE si la copie ignore `environnement`
  });

  it("la scène qui déclare @mm gagne (pas d'écrasement)", () => {
    const ast = compileToBPxAST('@mm:70\nA -> C4', { tempo: 88 }).ast;
    expect(mmFromAst(ast as Parameters<typeof mmFromAst>[0])).toBe(70);
  });
});
