import { describe, it, expect } from 'vitest';
import { makeResolver, type PitchLib } from '@kronos/core';
import alphabetsJson from 'bpscript/lib/alphabets.json';
import tuningsJson from 'bpscript/lib/tunings.json';
import temperamentsJson from 'bpscript/lib/temperaments.json';
import scalesJson from 'bpscript/lib/scales.json';
import octavesJson from 'bpscript/lib/octaves.json';

// KAN-B04 — non-regression. The adapter no longer substitutes a host-invented
// `'western'` alphabet when an actor/scene declares none: it passes `undefined`
// through to the shared resolver builder so it SNIFFS western/solfège from the
// tokens (the upstream behaviour). These tests exercise that exact builder with
// the SAME catalogs the adapter feeds it (`sceneResolverFor` → `makeResolver`),
// proving the sniff path and that a declared/sniffed western scene is unchanged.

const LIB: PitchLib = {
  alphabets: alphabetsJson as unknown as PitchLib['alphabets'],
  tunings: tuningsJson as unknown as PitchLib['tunings'],
  temperaments: temperamentsJson as unknown as PitchLib['temperaments'],
  scales: scalesJson as unknown as PitchLib['scales'],
  octaves: octavesJson as unknown as PitchLib['octaves']
};

// Mirror of the adapter's private `sceneResolverFor(alphabet, tuning, tokens)`.
const resolve = (
  alphabet: string | undefined,
  tokens: readonly { token: string }[],
  note: string
): number | undefined =>
  makeResolver({ alphabet, tuning: undefined, tokens }, LIB).resolve(note)?.frequency;

const SOLFEGE_TOKENS = [{ token: 'do4' }, { token: 're4' }, { token: 'la4' }];
const WESTERN_TOKENS = [{ token: 'C4' }, { token: 'A4' }];

describe('KAN-B04 — actor without declared alphabet sniffs upstream (no forced western)', () => {
  it('undefined alphabet + solfège tokens → SNIFFS solfège (la4 = 440)', () => {
    // The fix: an actor with no `alphabet` reaches the builder as `undefined`, which
    // falls to the western/solfège sniff. `la4` resolves only if solfège was sniffed.
    expect(resolve(undefined, SOLFEGE_TOKENS, 'la4')).toBeCloseTo(440, 6);
  });

  it('REGRESSION GUARD: a forced western lock would MUTE solfège (la4 unresolved)', () => {
    // This is the bug the fix removes: forcing `alphabet: 'western'` builds a western
    // catalog config in which `la4` is not a note → undefined frequency (silent).
    // Asserting it stays muted proves the previous default was a real musical lock,
    // and that the fix (passing undefined) is what restores the solfège sniff above.
    expect(resolve('western', SOLFEGE_TOKENS, 'la4')).toBeUndefined();
  });

  it('undefined alphabet + western tokens → SNIFFS western unchanged (A4 = 440)', () => {
    expect(resolve(undefined, WESTERN_TOKENS, 'A4')).toBeCloseTo(440, 6);
  });

  it('a western scene resolves the SAME whether declared or sniffed (A4 = 440)', () => {
    // The declared-western path is untouched: a `.bps` that declares `@alphabet western`
    // still resolves identically to the no-alphabet sniff for western tokens.
    expect(resolve('western', WESTERN_TOKENS, 'A4')).toBeCloseTo(440, 6);
    expect(resolve(undefined, WESTERN_TOKENS, 'A4')).toBeCloseTo(440, 6);
  });
});
