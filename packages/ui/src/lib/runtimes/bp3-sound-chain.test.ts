import { describe, it, expect } from 'vitest';
import { resolveGrAux } from './bpx-adapter';
// The real -al.EkDoTin / -mi.EkDoTin from Bernard's corpus, bundled as raw text.
import alEkDoTin from '../../../tests/fixtures/al.EkDoTin.txt?raw';
import miEkDoTin from '../../../tests/fixtures/mi.EkDoTin.txt?raw';

// The sound prototype of an alphabet symbol is reached through the alphabet, not
// the grammar: `-gr → -al → -so/-mi/-cs` (decision routage-texte-son-par-symbole,
// bp3-frontend 6a26fc4). This proves resolveGrAux follows that chain — the
// 12345678 grammar's numbers map to bols (ek/do/tin…) that carry a sound (-mi).

// Loader the adapter would wire to bundled aux; here it serves the fixtures.
const fixtureLoader = (prefix: string, name: string): string | undefined => {
  if (name !== 'EkDoTin') return undefined;
  if (prefix === 'al') return alEkDoTin;
  if (prefix === 'mi') return miEkDoTin;
  return undefined;
};

describe('resolveGrAux — the -gr → -al → sound chain', () => {
  it('follows the alphabet to the sound prototype and lists the sounding symbols', () => {
    const { alphabetNames, soundSymbols } = resolveGrAux(
      [{ prefix: 'al', name: 'EkDoTin', line: 0 }],
      fixtureLoader
    );
    // La table vient du -al, et de lui seul.
    expect(alphabetNames).toEqual(expect.arrayContaining(['ek', 'do', 'tin']));
    // The numbers' bols carry a sound (-mi.EkDoTin).
    expect(soundSymbols).toEqual(expect.arrayContaining(['ek', 'do', 'tin']));
  });

  // ⛔ CE BANC NE DEMANDE PLUS « CE MOT EST-IL UNE NOTE ? » (décision 2026-07-29 : les
  // conventions ne sont connues que du frontal BP3). Il reconstruisait ici un prédicat de son
  // local en interrogeant le prédicat de note du frontal — la question n'appartient pas à ce
  // dépôt, et plus rien ici ne l'importe (verrou : pas-de-question-de-note.test.ts). Ce qu'il
  // prouve VRAIMENT, et qui reste, c'est la chaîne `-al → -so/-mi` : quels symboles sonnent.
  it('resolves WHICH symbols sound through the -al chain (bols yes, unknowns no)', () => {
    const { soundSymbols } = resolveGrAux(
      [{ prefix: 'al', name: 'EkDoTin', line: 0 }],
      fixtureLoader
    );
    const sounding = new Set(soundSymbols);
    expect(sounding.has('ek')).toBe(true); // bol prototypé → sonne
    expect(sounding.has('zzz')).toBe(false); // symbole muet → console texte
  });

  // ⛔ SANS `-al`, PLUS DE TABLE DU TOUT — et c'est le point du mouvement (bp3-frontend db2a1ab).
  // Ce cas verrouillait l'inverse : il exigeait qu'on rende une liste de notes de repli. Cette
  // liste partait dans la TABLE D'ALPHABET du natif, où une note n'a rien à faire — 58 grammaires
  // sur 113 en sortaient polluées. `undefined` n'est pas « vide » : c'est « je ne sais pas », et
  // c'est la vraie réponse quand aucun `-al` ne la donne.
  it('rend une ABSENCE franche, pas un alphabet de repli, quand il n’y a pas de -al', () => {
    const r = resolveGrAux([{ prefix: 'se', name: 'X', line: 0 }], fixtureLoader);
    expect(r.alphabetNames).toBeUndefined();
    expect(r.soundSymbols).toEqual([]);
  });
});
