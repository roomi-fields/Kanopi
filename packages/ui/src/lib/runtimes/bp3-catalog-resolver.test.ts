import { describe, it, expect } from 'vitest';
import { catalogResolver } from './bpx-adapter';

// The core Resolver is plain JS (ambient `resolve(): unknown`); read the
// frequency field through a thin typed view for the assertions.
const hz = (r: { resolve(t: string): unknown }, token: string): number | undefined =>
  (r.resolve(token) as { frequency?: number } | null)?.frequency;

// A `.bps` with `@alphabet.X` (+ optional `@tuning:Y`) must resolve its pitches
// through the bpscript catalogs, NOT the western/solfège note-name sniffer. This
// proves the catalog wiring: the resolver turns the alphabet's own symbols into
// frequencies, and the symbols are reported as sounding (so they reach audio).

describe('catalogResolver — pitches from the bpscript catalogs', () => {
  it('resolves a bohlen-pierce scene (alphabet only, default tuning)', () => {
    const c = catalogResolver('bohlen_pierce', undefined);
    expect(c).not.toBeNull();
    // Bohlen letters resolve (no octave suffix → default register applies).
    expect(hz(c!.resolver, 'C')).toBe(440);
    expect(hz(c!.resolver, 'H')).toBe(792);
    // The alphabet's symbols are flagged sounding so the predicate plays them.
    expect(c!.notes.has('C')).toBe(true);
    expect(c!.notes.has('H')).toBe(true);
  });

  it('resolves a gamelan slendro scene (alphabet only, default tuning)', () => {
    const c = catalogResolver('gamelan_slendro', undefined);
    expect(c).not.toBeNull();
    expect(hz(c!.resolver, 'nem')).toBe(282);
    expect(c!.notes.has('barang')).toBe(true);
  });

  it('honours an explicit western tuning identically to the slice default', () => {
    const c = catalogResolver('western', 'western_12TET');
    expect(c).not.toBeNull();
    // Same frequencies the legacy makeWesternResolver produced (A440 grid).
    expect(hz(c!.resolver, 'A4')).toBe(440);
    expect(hz(c!.resolver, 'C4')).toBe(261.63);
  });

  it('resolves a composed maqam (compose+junction) on the arabic alphabet', () => {
    // arabic / maqam_rast = compose(jins_rast, jins_rast) @ junction 3/2. The
    // core scale engine computes the ratios; the resolver lays the 7 arabic
    // notes (rast dukah sikah jaharkah nawa husayni awj) on them with base
    // rast4 = 440. Oracle: dukah=495 (9/8), sikah=540 (neutral third 27/22),
    // nawa=660 (3/2), rast5=880 (octave). NOT hardcoded — from the catalog.
    const c = catalogResolver('arabic', 'maqam_rast');
    expect(c).not.toBeNull();
    expect(hz(c!.resolver, 'rast4')).toBe(440);
    expect(hz(c!.resolver, 'dukah4')).toBe(495);
    expect(hz(c!.resolver, 'sikah4')).toBe(540);
    expect(hz(c!.resolver, 'nawa4')).toBe(660);
    expect(hz(c!.resolver, 'rast5')).toBe(880);
    expect(c!.notes.has('sikah')).toBe(true);
  });

  it('returns null when no alphabet is declared (western/solfège fallback kept)', () => {
    expect(catalogResolver(undefined, undefined)).toBeNull();
  });
});
