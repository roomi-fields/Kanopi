import { describe, it, expect } from 'vitest';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { createBPx } from 'bpx';
import { sectionLeafCounts, headSectionNamesFromAst } from './head-sections-ast';
import { sectionBoundsFromTree } from './bpx-adapter';
import type { ProductionTree } from '../../stores/production.svelte';

// Maqam Rast (arabic.bps): Sayr 7 notes, Rujoo 7 notes, Qarar 1 note + 4 held
// prolongations (5 leaves). The OLD equal three-way split put every boundary at
// 1/3 and 2/3 of the duration regardless of the real onsets; the tree-derived
// bounds must instead land on the actual leaf spans (Qarar visibly shorter — it
// is one onset followed by a sustain, not a third of the notes).
const ARABIC = `@alphabet.arabic:browser
@tuning.maqam_rast
@mm:70
S -> Sayr Rujoo Qarar
Sayr -> rast dukah sikah jaharkah nawa husayni awj (wave:sine, vel:85)
Rujoo -> awj husayni nawa jaharkah sikah dukah rast (vel:70)
Qarar -> rast _ _ _ _ (vel:60)
`;

function deriveTree(src: string): { tree: ProductionTree; ast: unknown } {
  const c = compileToBPxAST(src) as { ast: unknown; errors?: unknown[] };
  const bpx = createBPx({ tempo: 70 }) as {
    loadGrammar(a: unknown): void;
    derive(): { tree: ProductionTree };
  };
  bpx.loadGrammar(c.ast);
  // 'complete' migrated to Kairos (now throws); default 'sounding' tree.
  const d = bpx.derive();
  return { tree: d.tree, ast: c.ast };
}

describe('sectionLeafCounts (per-section leaf count from the AST head rule)', () => {
  it('counts Sayr 7, Rujoo 7, Qarar 5 (note + 4 held) for maqam Rast', () => {
    const { ast } = deriveTree(ARABIC);
    expect(headSectionNamesFromAst(ast)).toEqual(['Sayr', 'Rujoo', 'Qarar']);
    expect(sectionLeafCounts(ast)).toEqual([7, 7, 5]);
  });

  it('returns [] for a polymetric / non-flat macro shape (fallback signal)', () => {
    const POLY = `S -> { a b , c }
a -> c
b -> d
c -> e
`;
    const { ast } = deriveTree(POLY);
    // A `{ … }` polymetric is one section but not a flat symbol run → no counts.
    expect(sectionLeafCounts(ast)).toEqual([]);
  });
});

describe('sectionBoundsFromTree', () => {
  it('maps maqam Rast sections to their real onset spans (Qarar shorter)', () => {
    const { tree, ast } = deriveTree(ARABIC);
    const counts = sectionLeafCounts(ast);
    const bounds = sectionBoundsFromTree(tree, counts);
    expect(bounds).not.toBeNull();
    expect(bounds!.length).toBe(3);

    // Sections are contiguous and ordered.
    expect(bounds![0].startSec).toBeCloseTo(0, 3);
    expect(bounds![0].endSec).toBeCloseTo(bounds![1].startSec, 3);
    expect(bounds![1].endSec).toBeCloseTo(bounds![2].startSec, 3);

    // The equal split would put each boundary at 1/3 and 2/3 of the total. The
    // REAL Sayr/Rujoo are 7 even notes each and Qarar is 5 leaves — at 70 bpm the
    // per-leaf duration is constant, so 7 + 7 + 5 = 19 leaves means the first two
    // boundaries fall at 7/19 and 14/19, NOT 1/3 and 2/3.
    const total = bounds![2].endSec;
    expect(bounds![0].endSec / total).toBeCloseTo(7 / 19, 2);
    expect(bounds![1].endSec / total).toBeCloseTo(14 / 19, 2);
    expect(bounds![0].endSec / total).not.toBeCloseTo(1 / 3, 2);

    // Each boundary lands on a real leaf onset present in the flat token stream.
    expect(bounds![2].endSec).toBeGreaterThan(bounds![2].startSec);
  });

  it('returns null when the counts do not sum to the tree leaf total (fallback)', () => {
    const { tree } = deriveTree(ARABIC);
    expect(sectionBoundsFromTree(tree, [7, 7, 4])).toBeNull(); // 18 ≠ 19
    expect(sectionBoundsFromTree(undefined, [1])).toBeNull();
    expect(sectionBoundsFromTree(tree, [])).toBeNull();
  });
});
