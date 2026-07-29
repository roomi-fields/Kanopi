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
import { parseBP3, BP3_PITCH_CATALOG, bp3AlphabetKey } from 'bp3-frontend';
import { headSectionNamesFromAst, sectionLeafCounts } from './head-sections-ast';
import { resolveGrAux, resolveSeNoteConvention } from './bpx-adapter';
import { BUNDLED_AL, BUNDLED_SOUND } from './bp3-aux';

import acceleration from '../../../../library/scenes/bp3/bp-acceleration.gr?raw';
import ames from '../../../../library/scenes/bp3/bp-ames.gr?raw';
import notReich from '../../../../library/scenes/bp3/bp-not-reich.gr?raw';
// Ces trois-là ont quitté la vitrine (iso-proven-only [827]) mais restent au
// dépôt sous library/unpublished/bp3 — toujours valables comme FIXTURES du
// lecteur de sections de tête (elles ne testent pas la bibliothèque).
import rotateScales from '../../../../library/unpublished/bp3/bp-rotate-scales.gr?raw';
import transposition from '../../../../library/unpublished/bp3/bp-transposition.gr?raw';
import visser5 from '../../../../library/unpublished/bp3/bp-visser5.gr?raw';
// Les deux grammaires à convention FRANÇAISE du corpus — les seules où le nom et les bornes
// d'une section divergeaient quand seul le nom recevait la convention.
import bpNegativeContext from '../../../../library/scenes/bp3/bp-negative-context.gr?raw';
import negativeContext from '../../../../library/scenes/BP3-tests/negative-context.gr?raw';

const WESTERN_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

function grSections(code: string): string[] {
  const { ast } = parseBP3(code, { alphabetNames: WESTERN_NOTES });
  // Convention ANGLAISE (0), écrite et non sous-entendue : ce banc parse justement avec l'alphabet
  // occidental ci-dessus. La passer explicitement, c'est dire de quelle convention parle le verdict.
  return headSectionNamesFromAst(ast, 0);
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

// ─────────────────────────────────────────────────────────────────────────────
// LES DEUX LECTEURS D'UNE MÊME SCÈNE RÉPONDENT SUR LA MÊME CONVENTION (GO [1035]).
//
// Une section a un NOM (`headSectionNamesFromAst`) et des BORNES
// (`sectionLeafCounts`). Les deux demandent « ce mot est-il une note ? », donc les
// deux dépendent de la convention de notes. Le nom la recevait (bpx-adapter.ts:537),
// les bornes recevaient `undefined` : sur une grammaire française, étiquettes justes
// et bandes mal découpées dessous. Mesuré sur le corpus : 2 grammaires sur 188.
//
// ⚠️ LE TÉMOIN VÉRIFIE LE CÂBLAGE, PAS UN CHIFFRE. Il ne passe pas `1` en dur : il
// LIT la convention du `-se` par la vraie fonction de l'adaptateur, et vérifie
// qu'elle vaut bien 1 — sinon le test passerait même si le câblage était rompu et
// que quelqu'un avait recodé la valeur ici. Et il verrouille l'ABSENCE de l'ancienne
// réponse : `undefined` donnait `[1,1,1,1,1,1]`, ce que plus rien ne doit produire
// sur cette grammaire.
const bundledAuxLoader = (prefix: string, name: string) =>
  prefix === 'al' ? BUNDLED_AL[name] : BUNDLED_SOUND[name];

/** Le chemin RÉEL de l'adaptateur : 1re passe anglaise → convention du `-se` → re-parse. */
function grParse(code: string) {
  const first = parseBP3(code, { alphabetNames: WESTERN_NOTES });
  const noteConvention = resolveSeNoteConvention(first.fileRefs);
  const convTokens =
    BP3_PITCH_CATALOG.alphabets[bp3AlphabetKey(noteConvention)]?.notes ?? WESTERN_NOTES;
  const { alphabetNames, soundSymbols } = resolveGrAux(first.fileRefs, bundledAuxLoader, convTokens);
  const reparse = soundSymbols.length > 0 || alphabetNames !== WESTERN_NOTES || noteConvention != null;
  const r = reparse ? parseBP3(code, { alphabetNames, soundSymbols, noteConvention }) : first;
  return { ast: r.ast, noteConvention };
}

describe('sections : le nom et les bornes lisent la MÊME convention', () => {
  for (const [nom, code] of [
    ['bp-negative-context', bpNegativeContext],
    ['negative-context', negativeContext]
  ] as const) {
    it(`${nom} (française, du -se) découpe [1,2,1,2,1,1]`, () => {
      const { ast, noteConvention } = grParse(code);
      // La convention vient de la DONNÉE, pas du test.
      expect(noteConvention).toBe(1);
      expect(headSectionNamesFromAst(ast, noteConvention)).toEqual(['A', 'A2', 'A3', 'A1', 'A', 'A']);
      expect(sectionLeafCounts(ast, noteConvention)).toEqual([1, 2, 1, 2, 1, 1]);
      // L'ancienne réponse, celle du câblage manquant — elle ne doit plus sortir d'ici.
      expect(sectionLeafCounts(ast, undefined)).not.toEqual(sectionLeafCounts(ast, noteConvention));
    });
  }

  it("une grammaire ANGLAISE ne bouge pas (les 186 autres ne sont pas cassées)", () => {
    const { ast, noteConvention } = grParse(acceleration);
    // Elle DÉCLARE l'anglaise (0) dans son `-se` — la convention vient donc de la donnée ici
    // aussi, et non d'un silence qu'on interpréterait.
    expect(noteConvention).toBe(0);
    expect(sectionLeafCounts(ast, noteConvention)).toEqual(sectionLeafCounts(ast, undefined));
    expect(headSectionNamesFromAst(ast, noteConvention)).toEqual(
      EXPECTED.find((e) => e.name === 'bp-acceleration')!.sections
    );
  });
});
