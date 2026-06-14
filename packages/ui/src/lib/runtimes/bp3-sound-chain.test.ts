import { describe, it, expect } from 'vitest';
import { isNoteName } from 'bp3-frontend';
import { resolveGrAux } from './bp3';
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

const WESTERN = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

describe('resolveGrAux — the -gr → -al → sound chain', () => {
  it('follows the alphabet to the sound prototype and lists the sounding symbols', () => {
    const { alphabetNames, soundSymbols } = resolveGrAux(
      [{ prefix: 'al', name: 'EkDoTin', line: 0 }],
      fixtureLoader,
      WESTERN
    );
    // The alphabet now comes from the -al, not the western fallback.
    expect(alphabetNames).not.toEqual(WESTERN);
    // The numbers' bols carry a sound (-mi.EkDoTin).
    expect(soundSymbols).toEqual(expect.arrayContaining(['ek', 'do', 'tin']));
  });

  it('makes the per-token sound predicate route bols to audio, unknowns to text', () => {
    const { soundSymbols } = resolveGrAux(
      [{ prefix: 'al', name: 'EkDoTin', line: 0 }],
      fixtureLoader,
      WESTERN
    );
    const sounding = new Set(soundSymbols);
    const sounds = (n: string) => isNoteName(n) || sounding.has(n);
    expect(sounds('ek')).toBe(true); // sounding bol → audio
    expect(sounds('C4')).toBe(true); // note → audio
    expect(sounds('zzz')).toBe(false); // mute symbol → text console
  });

  it('falls back to the default alphabet and no sound when there is no -al', () => {
    const r = resolveGrAux([{ prefix: 'se', name: 'X', line: 0 }], fixtureLoader, WESTERN);
    expect(r.alphabetNames).toEqual(WESTERN);
    expect(r.soundSymbols).toEqual([]);
  });
});
