// Regression lock for the `.gr` head-section reader (F11). The `.gr` path used to
// scan the grammar TEXT with a regex (`headSectionNames`); that scanner was BUGGY —
// it mis-read multi-line / fraction-directive head rules (bp-transposition produced
// 36 junk "sections" incl. `-->`/`lambda`; bp-rotate-scales reported 3 sections,
// dropping the real polymetric). The adapter now reads sections off `parseBP3().ast`
// with the SAME reader as `.bps` (`headSectionNamesFromAst`). This test locks the
// CORRECT sections (the AST result, NOT the old buggy text output) for every bundled
// `.gr`, so a future regression on the AST reader is caught.
//
// Reads via `parseBP3(code, { alphabetNames: WESTERN_NOTES })` — the head-rule RHS
// (the section structure) is independent of sound/alphabet resolution, so this gives
// the same sections grFrontend's `parseWithSound(code, WESTERN_NOTES)` does.
import { describe, it, expect } from 'vitest';
import { parseBP3 } from 'bp3-frontend';
import { headSectionNamesFromAst } from './head-sections-ast';

import acceleration from '../../../../library/scenes/bp3/bp-acceleration.gr?raw';
import ames from '../../../../library/scenes/bp3/bp-ames.gr?raw';
import notReich from '../../../../library/scenes/bp3/bp-not-reich.gr?raw';
import rotateScales from '../../../../library/scenes/bp3/bp-rotate-scales.gr?raw';
import transposition from '../../../../library/scenes/bp3/bp-transposition.gr?raw';
import visser5 from '../../../../library/scenes/bp3/bp-visser5.gr?raw';

const WESTERN_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

function grSections(code: string): string[] {
  const { ast } = parseBP3(code, { alphabetNames: WESTERN_NOTES });
  return headSectionNamesFromAst(ast);
}

// Expected CORRECT sections per bundled `.gr` (the AST result). bp-transposition and
// bp-rotate-scales are the two the buggy text scanner got wrong: 36→1 and 3→2.
const EXPECTED: { name: string; code: string; sections: string[] }[] = [
  {
    name: 'bp-acceleration',
    code: acceleration,
    sections: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
  },
  { name: 'bp-ames', code: ames, sections: ['PA,PB'] },
  { name: 'bp-not-reich', code: notReich, sections: ["A'", "B'", "C'"] },
  { name: 'bp-rotate-scales', code: rotateScales, sections: ['M', 'N'] },
  { name: 'bp-transposition', code: transposition, sections: ['A'] },
  { name: 'bp-visser5', code: visser5, sections: ['Melos1 Melos2 Melos3'] }
];

describe('gr head sections (read from parseBP3 AST, not grammar text)', () => {
  for (const { name, code, sections } of EXPECTED) {
    it(`${name} → [${sections.join(', ')}] (count ${sections.length})`, () => {
      expect(grSections(code)).toEqual(sections);
    });
  }
});
