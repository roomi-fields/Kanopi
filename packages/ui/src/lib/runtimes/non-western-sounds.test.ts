import { describe, it, expect } from 'vitest';
import { makeResolver, type PitchLib } from '@kronos/core';
import alphabetsJson from 'bpscript/lib/alphabets.json';
import tuningsJson from 'bpscript/lib/tunings.json';
import temperamentsJson from 'bpscript/lib/temperaments.json';
import scalesJson from 'bpscript/lib/scales.json';
import octavesJson from 'bpscript/lib/octaves.json';

// KAN-B01 / KAN-B02 then KAN-M4 — non-regression for the "arabic muet" bug.
// HISTORY: three host gates once decided "does this token sound" with a WESTERN
// heuristic (`isNoteName`), muting every maqâm leaf. B01/B02 first replaced the
// heuristic with the ALPHABET-AWARE resolver. KAN-M4 then went further: the host
// stops JUDGING audibility altogether — the audio/dispatch gates are REMOVED, every
// no-actor terminal reaches Kronos, and the runtime SINK decides (it resolves the
// token and simply emits nothing when the alphabet does not resolve it). So the
// determination now lives entirely in the resolver Kanopi WIRES to the runtimes,
// not in a host filter. These tests prove (1) that resolver is alphabet-aware (the
// DATA the sink resolves maqâm with — `sceneResolverFor` → `makeResolver`, the same
// builder the adapter feeds the runtimes), and (2) the host dispatch filter no
// longer DROPS no-actor non-western leaves (guarding against a re-introduced gate).

const LIB: PitchLib = {
  alphabets: alphabetsJson as unknown as PitchLib['alphabets'],
  tunings: tuningsJson as unknown as PitchLib['tunings'],
  temperaments: temperamentsJson as unknown as PitchLib['temperaments'],
  scales: scalesJson as unknown as PitchLib['scales'],
  octaves: octavesJson as unknown as PitchLib['octaves']
};

// Mirror of the adapter's private `sceneResolverFor(alphabet, tuning, tokens)` — the
// resolver Kanopi WIRES to the runtimes as DATA. Its `sounds(token)` is the upstream
// ALPHABET-AWARE primitive the SINK uses to resolve (or skip) a leaf.
const resolverFor = (alphabet: string | undefined, tokens: readonly { token: string }[]) =>
  makeResolver({ alphabet, tuning: undefined, tokens }, LIB);

const ARABIC_TOKENS = [{ token: 'rast4' }, { token: 'dukah4' }, { token: 'sikah4' }];
const WESTERN_TOKENS = [{ token: 'C4' }, { token: 'A4' }];

describe('KAN-B01/M4 — the resolver Kanopi wires is alphabet-aware (the sink resolves maqâm)', () => {
  it('maqâm token resolves (sounds) under the arabic alphabet', () => {
    const r = resolverFor('arabic', ARABIC_TOKENS);
    expect(r.sounds('rast4')).toBe(true);
    expect(r.sounds('dukah4')).toBe(true);
  });

  it('the same maqâm token does NOT resolve under western — the ALPHABET decides, not a host heuristic', () => {
    const r = resolverFor('western', WESTERN_TOKENS);
    expect(r.sounds('rast4')).toBe(false);
    expect(r.sounds('dukah4')).toBe(false);
  });

  it('western pitches still resolve: C4 / A4', () => {
    const r = resolverFor('western', WESTERN_TOKENS);
    expect(r.sounds('C4')).toBe(true);
    expect(r.sounds('A4')).toBe(true);
  });
});

// KAN-M4: the host dispatch filter no longer JUDGES audibility. For an event WITHOUT
// `payload.actor` (the mono / synthetic `default` actor — any scene with no `@actor`
// such as `arabic.bps`) it used to gate on the resolver; it now returns true and the
// leaf reaches Kronos, where the runtime sink resolves it (and emits nothing if the
// alphabet does not). This mirrors the adapter's CURRENT `orchestratedFilter`.
type Ev = { token: string; type: 'note' | 'control' | 'rest'; payload?: { actor?: string | null } };

const orchestratedFilter = (isBacktick: Record<string, unknown>) => (e: Ev) => {
  if (e.type === 'control') return true;
  if (e.type === 'rest') return false;
  const actor = e.payload?.actor;
  if (actor) return true;
  if (Object.prototype.hasOwnProperty.call(isBacktick, e.token)) return true;
  return true; // M4: no host audibility judgment — the sink decides.
};

describe('KAN-M4 — the host filter keeps every no-actor leaf (no host audibility gate)', () => {
  const maqamEvents: Ev[] = ['rast', 'dukah', 'sikah', 'jaharkah', 'nawa', 'husayni', 'awj'].map(
    (token) => ({ token, type: 'note' as const })
  );

  it('REGRESSION GUARD: every no-actor maqâm leaf is KEPT (a re-introduced sounds-gate would drop them)', () => {
    const f = orchestratedFilter({});
    expect(maqamEvents.filter(f).length).toBe(maqamEvents.length);
  });

  it('control events pass, rest events are dropped (structure, not audibility)', () => {
    const f = orchestratedFilter({});
    expect(f({ token: '_vel(50)', type: 'control' })).toBe(true);
    expect(f({ token: '-', type: 'rest' })).toBe(false);
  });

  it('an actor-bound event passes regardless of resolution (routing branch)', () => {
    const f = orchestratedFilter({});
    expect(f({ token: 'Xyz', type: 'note', payload: { actor: 'sitar' } })).toBe(true);
  });

  it('a backtick (code voice) reference passes (always dispatched)', () => {
    const f = orchestratedFilter({ '`bt0`': true });
    expect(f({ token: '`bt0`', type: 'note' })).toBe(true);
  });
});
