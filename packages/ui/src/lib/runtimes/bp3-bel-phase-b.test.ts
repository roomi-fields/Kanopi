// KAN-GRAMMAIRES-SCENES (GO archi [822], Phase B [826]) — 8 grammaires BP3 de
// Bernard Bel PUBLIÉES en Phase B et bundlées comme scènes. Ce test rejoue la
// VOIE ADAPTATEUR réelle (parseBP3 2-passes → resolveGrAux/resolveSeSettings/
// resolveSeNoteConvention EXPORTÉS de bpx-adapter.ts, pas réimplémentés → createSession
// → derive → emit('timed-tokens')) et verrouille le compte de tokens PROUVÉ fidèle au
// natif pour chacune des 8 scènes bundlées.
//
// asymmetric/vina/csound-objects (Phase A) triaged OUT of Phase B (respectively:
// off the iso-native list, off the iso-native list, mute — gate 'joue vraiment'
// [825]) — no test cases for them here.
//
// Les grammaires RND (flags, negative-context a un ordre fixe car ORD implicite
// par ses poids <0>/défaut, repeat) varient d'ORDRE selon la seed mais pas de
// COMPTE ni d'ENSEMBLE de symboles — on verrouille compte + ensemble, pas la
// séquence exacte (sauf negative-context et ticks, dérivation
// déterministe à une seule règle — pas de RND effectif).

import { describe, it, expect } from 'vitest';
import { parseBP3 } from 'bp3-frontend';
import { BP3_PITCH_CATALOG, bp3AlphabetKey } from 'bp3-frontend';
import { createSession } from 'bpx';
import { resolveGrAux, resolveSeSettings, resolveSeNoteConvention } from './bpx-adapter';
import { BUNDLED_AL, BUNDLED_SOUND } from './bp3-aux';

import bpFlags from '../../../../library/scenes/bp3/bp-flags.gr?raw';
import bpGraphics from '../../../../library/scenes/bp3/bp-graphics.gr?raw';
import bpHarmony from '../../../../library/scenes/bp3/bp-harmony.gr?raw';
import bpNegativeContext from '../../../../library/scenes/bp3/bp-negative-context.gr?raw';
import bpRepeat from '../../../../library/scenes/bp3/bp-repeat.gr?raw';
import bpTestNc1 from '../../../../library/scenes/bp3/bp-test-nc1.gr?raw';
import bpTicks from '../../../../library/scenes/bp3/bp-ticks.gr?raw';

const BP3_EN_TOKENS = BP3_PITCH_CATALOG.alphabets[bp3AlphabetKey(0)].notes;
type AuxLoader = (prefix: string, name: string) => string | undefined;
// Même câblage que bundledAuxLoader (bpx-adapter.ts:322) — non exporté, 1 ligne, cf.
// bp3-sound-chain.test.ts qui répète le même schéma pour ses fixtures.
const bundledAuxLoader: AuxLoader = (prefix, name) =>
  prefix === 'al' ? BUNDLED_AL[name] : BUNDLED_SOUND[name];

// Réplique de parseWithSound (bpx-adapter.ts:437-463) — la fonction elle-même n'est
// pas exportée, mais chaque brique qu'elle orchestre (resolveGrAux/resolveSeSettings/
// resolveSeNoteConvention) EST importée réelle ci-dessus, donc ceci exerce le VRAI
// chemin de résolution de l'adaptateur, pas une réimplémentation indépendante.
function parseWithSoundReplica(code: string) {
  const first = parseBP3(code, { alphabetNames: BP3_EN_TOKENS });
  const noteConvention = resolveSeNoteConvention(first.fileRefs);
  const convTokens =
    BP3_PITCH_CATALOG.alphabets[bp3AlphabetKey(noteConvention as number | null | undefined)]
      ?.notes ?? BP3_EN_TOKENS;
  const { alphabetNames, soundSymbols } = resolveGrAux(
    first.fileRefs,
    bundledAuxLoader,
    convTokens
  );
  const reparse =
    soundSymbols.length > 0 || alphabetNames !== BP3_EN_TOKENS || noteConvention != null;
  const r = reparse ? parseBP3(code, { alphabetNames, soundSymbols, noteConvention }) : first;
  return { ast: r.ast, errors: r.errors, settings: resolveSeSettings(r.fileRefs) };
}

function derive(code: string, seed = 12345): string[] {
  const parsed = parseWithSoundReplica(code);
  expect(parsed.ast, `parse error: ${JSON.stringify(parsed.errors)}`).not.toBeNull();
  const bpx = createSession(parsed.ast as never, {
    ...(parsed.settings !== undefined ? { settings: parsed.settings } : {}),
    seed
  });
  bpx.derive();
  const timed = bpx.emit<{ token: string }[]>('timed-tokens');
  return timed.map((t) => t.token);
}

describe('7 grammaires BP3 Bernard Bel — Phase B — parse + dérive fidèle (voie adaptateur)', () => {
  it('flags — 20 tokens, alphabet {a,b}', () => {
    const tokens = derive(bpFlags);
    expect(tokens.length).toBe(20);
    expect(new Set(tokens)).toEqual(new Set(['a', 'b']));
  });

  it('graphics — 6 notes, même ensemble que le natif', () => {
    const tokens = derive(bpGraphics);
    expect(tokens.length).toBe(6);
    expect(new Set(tokens)).toEqual(new Set(['C4', 'D4', 'E4', 'F#5', 'G3', 'G4']));
  });

  it('harmony — 20 notes', () => {
    const tokens = derive(bpHarmony);
    expect(tokens.length).toBe(20);
  });

  it('negative-context — 6 tokens, terme à terme A A A A2 A3 A1 (dérivation déterministe)', () => {
    const tokens = derive(bpNegativeContext);
    expect(tokens).toEqual(['A', 'A', 'A', 'A2', 'A3', 'A1']);
  });

  it('repeat — 9 tokens, terme à terme a a a b b b c c c', () => {
    const tokens = derive(bpRepeat);
    expect(tokens).toEqual(['a', 'a', 'a', 'b', 'b', 'b', 'c', 'c', 'c']);
  });

  it('test-nc1 — 6 notes, même ensemble que Graphics (même règle _legato/_staccato)', () => {
    const tokens = derive(bpTestNc1);
    expect(tokens.length).toBe(6);
    expect(new Set(tokens)).toEqual(new Set(['C4', 'D4', 'E4', 'F#5', 'G3', 'G4']));
  });

  it('ticks — 16 tokens, terme à terme (une seule règle <1>, tintal)', () => {
    const tokens = derive(bpTicks);
    expect(tokens).toEqual([
      'C5',
      'D5',
      'E5',
      'F5',
      'E5',
      'G5',
      'F5',
      'E5',
      'F5',
      'D5',
      'E5',
      'G5',
      'D5',
      'F5',
      'E5',
      'C5'
    ]);
  });
});
