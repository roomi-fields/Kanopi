import { describe, it, expect } from 'vitest';
import { makeResolver, type PitchLib } from '@kronos/core';
import { isNoteName } from 'bp3-frontend';
import alphabetsJson from 'bpscript/lib/alphabets.json';
import tuningsJson from 'bpscript/lib/tunings.json';
import temperamentsJson from 'bpscript/lib/temperaments.json';
import scalesJson from 'bpscript/lib/scales.json';
import octavesJson from 'bpscript/lib/octaves.json';

// KAN-B01 / KAN-B02 — non-regression for the "arabic muet" bug. THREE host gates
// used to decide "does this token sound" with a WESTERN heuristic (`isNoteName`):
// the audio gate (`soundsFn`), the production-readout predicate (`productionSounds`),
// AND the event filter that runs FIRST on the dispatch path (`orchestratedFilter`).
// A maqâm token (`rast`, `dukah`) does not match → judged silent → for the filter
// the leaf is DROPPED before reaching Kronos (`treeEvents` empty → `loadEvents([])`
// → 0 note), for the gates it is skipped → the whole arabic scene goes MUTE. The
// fix projects the upstream ALPHABET-AWARE primitive `PitchResolver.sounds(token)`
// at all three. These tests exercise that primitive through the SAME builder the
// adapter feeds it (`sceneResolverFor` → `makeResolver`) and mirror the filter's
// exact predicate, proving the maqâm scene now sounds and western is unchanged.

const LIB: PitchLib = {
  alphabets: alphabetsJson as unknown as PitchLib['alphabets'],
  tunings: tuningsJson as unknown as PitchLib['tunings'],
  temperaments: temperamentsJson as unknown as PitchLib['temperaments'],
  scales: scalesJson as unknown as PitchLib['scales'],
  octaves: octavesJson as unknown as PitchLib['octaves']
};

// Mirror of the adapter's private `sceneResolverFor(alphabet, tuning, tokens)`.
const resolverFor = (alphabet: string | undefined, tokens: readonly { token: string }[]) =>
  makeResolver({ alphabet, tuning: undefined, tokens }, LIB);

// Mirror of the adapter's `soundsFn = sceneResolver.sounds(token) || sounding.has(token)`.
// `sounding` carries non-pitched front-end sound assignments (out of `sounds`' scope).
const soundsFn =
  (alphabet: string | undefined, tokens: readonly { token: string }[], sounding: Set<string>) =>
  (token: string): boolean =>
    resolverFor(alphabet, tokens).sounds(token) || sounding.has(token);

const ARABIC_TOKENS = [{ token: 'rast4' }, { token: 'dukah4' }, { token: 'sikah4' }];
const WESTERN_TOKENS = [{ token: 'C4' }, { token: 'A4' }];

describe('KAN-B01/B02 — non-western audio gate is alphabet-aware (arabic no longer muted)', () => {
  it('maqâm token under arabic alphabet → sounds (the western heuristic returned false)', () => {
    const sounds = soundsFn('arabic', ARABIC_TOKENS, new Set());
    expect(sounds('rast4')).toBe(true);
    expect(sounds('dukah4')).toBe(true);
  });

  it('REGRESSION GUARD: the OLD western heuristic would mute the maqâm token', () => {
    // `isNoteName` (the host predicate the fix removed) does not recognise `rast4`;
    // under western it is NOT a pitch either — so the resolver agrees it is muted
    // there. Asserting it stays false under western proves the bug was a real
    // alphabet lock, and that the arabic-true above is the alphabet deciding.
    const western = resolverFor('western', WESTERN_TOKENS);
    expect(western.sounds('rast4')).toBe(false);
    expect(western.sounds('dukah4')).toBe(false);
  });

  it('western scene unchanged: C4 / A4 still sound', () => {
    const sounds = soundsFn('western', WESTERN_TOKENS, new Set());
    expect(sounds('C4')).toBe(true);
    expect(sounds('A4')).toBe(true);
  });

  it('a maqâm token does NOT sound under western (alphabet, not host heuristic, decides)', () => {
    const sounds = soundsFn('western', WESTERN_TOKENS, new Set());
    expect(sounds('rast4')).toBe(false);
  });

  it('non-pitched front-end sound assignments still sound via the `sounding` branch', () => {
    // `kick` is no pitch in any alphabet but is a declared sound → must still gate true.
    const sounds = soundsFn('arabic', ARABIC_TOKENS, new Set(['kick']));
    expect(sounds('kick')).toBe(true);
    expect(sounds('rast4')).toBe(true); // pitched branch unaffected
  });

  it('a full arabic token set marks ≥1 leaf sounding where the western gate marked 0', () => {
    // Proxy for "a real arabic scene derives ≥1 audible note": gate every produced
    // token. Under arabic every maqâm token sounds; under western none do.
    const tokens = ['rast4', 'dukah4', 'sikah4', 'nawa4'];
    const arabicGate = soundsFn('arabic', ARABIC_TOKENS, new Set());
    const westernGate = soundsFn('western', WESTERN_TOKENS, new Set());
    const arabicSounding = tokens.filter(arabicGate).length;
    const westernSounding = tokens.filter(westernGate).length;
    expect(arabicSounding).toBeGreaterThan(0);
    expect(westernSounding).toBe(0);
  });
});

// The dispatch-path event filter that runs FIRST (before the audio gate). For an
// event WITHOUT `payload.actor` — the mono / synthetic `default` actor, i.e. ANY
// scene with no `@actor` such as `arabic.bps` — its verdict decides whether the
// leaf reaches Kronos at all. The OLD verdict was `isNoteName(token)` (western),
// which DROPPED every maqâm leaf → `treeEvents` empty → 0 note. The fix is the
// alphabet-aware `sceneResolver.sounds(token) || sounding.has(token)`.
type Ev = { token: string; type: 'note' | 'control' | 'rest'; payload?: { actor?: string | null } };

// Mirror of the adapter's private `orchestratedFilter`, parameterised on the
// no-actor predicate so we can run the OLD (western) and the NEW (alphabet-aware)
// side by side on the SAME maqâm events.
const orchestratedFilter =
  (isBacktick: Record<string, unknown>, noActorSounds: (token: string) => boolean) => (e: Ev) => {
    if (e.type === 'control') return true;
    if (e.type === 'rest') return false;
    const actor = e.payload?.actor;
    if (actor) return true;
    if (Object.prototype.hasOwnProperty.call(isBacktick, e.token)) return true;
    return noActorSounds(e.token);
  };

describe('KAN-B01 — orchestratedFilter keeps maqâm leaves on the no-actor (mono) path', () => {
  // A 19-leaf maqâm derivation with NO `payload.actor` (the `arabic.bps` shape).
  const maqamEvents: Ev[] = [
    'rast',
    'dukah',
    'sikah',
    'jaharkah',
    'nawa',
    'husayni',
    'awj',
    'rast',
    'dukah',
    'sikah',
    'nawa',
    'husayni',
    'awj',
    'rast',
    'dukah',
    'sikah',
    'nawa',
    'husayni',
    'awj'
  ].map((token) => ({ token, type: 'note' as const }));

  const arabicResolver = resolverFor(
    'arabic',
    maqamEvents.map((e) => ({ token: e.token }))
  );
  const sounding = new Set<string>();

  it('REGRESSION GUARD: the OLD western `isNoteName` filter DROPS every maqâm leaf (0 kept)', () => {
    const oldFilter = orchestratedFilter({}, (t) => isNoteName(t));
    const kept = maqamEvents.filter(oldFilter);
    expect(kept.length).toBe(0); // exactly the bug: empty treeEvents → loadEvents([]) → silence
  });

  it('the FIXED alphabet-aware filter KEEPS the maqâm leaves (≥1, here all 19)', () => {
    const fixedFilter = orchestratedFilter({}, (t) => arabicResolver.sounds(t) || sounding.has(t));
    const kept = maqamEvents.filter(fixedFilter);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBe(maqamEvents.length);
  });

  it('control events still pass and rest events are still dropped (unchanged)', () => {
    const fixedFilter = orchestratedFilter({}, (t) => arabicResolver.sounds(t) || sounding.has(t));
    expect(fixedFilter({ token: '_vel(50)', type: 'control' })).toBe(true);
    expect(fixedFilter({ token: '-', type: 'rest' })).toBe(false);
  });

  it('an actor-bound event passes regardless of alphabet (branch unchanged)', () => {
    const fixedFilter = orchestratedFilter({}, (t) => arabicResolver.sounds(t) || sounding.has(t));
    // A token that does NOT resolve, but carries an actor → kept via the actor branch.
    expect(fixedFilter({ token: 'Xyz', type: 'note', payload: { actor: 'sitar' } })).toBe(true);
  });
});
