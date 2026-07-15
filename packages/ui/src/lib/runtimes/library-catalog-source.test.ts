// Non-régression [773] : le chargeur `@library.strudel <id>` doit résoudre contre
// `guestLibraries` (runtime-codevoices), la SOURCE DE VÉRITÉ — plus le doublon
// écrit à la main `packages/ui/src/lib/library/audio-banks/catalog.json` (supprimé).
// Bug observé : `@library.strudel gm` → son MUET, « banque inconnue » (le doublon
// n'avait QUE dirt-samples/tidal-drum-machines/emu-sp12, pas gm/xen).
//
// `resolveStrudelLibrary` (bpx-adapter.ts) est la fonction RÉELLE consommée par le
// chargeur — pas une réimplémentation en miroir : ce test trace jusqu'à l'autorité
// amont (guestLibraries), pas une comparaison circulaire de deux calculs hôte.
import { describe, it, expect } from 'vitest';
import { guestLibraries } from 'runtime-codevoices';
import { resolveStrudelLibrary, resourceResolutionErrors } from './bpx-adapter';

describe('resolveStrudelLibrary — consomme guestLibraries (SOURCE DE VÉRITÉ, [773])', () => {
  it('résout "gm" avec source==="gm" (soundfonts GM, précédemment MUET)', () => {
    const lib = resolveStrudelLibrary('gm');
    expect(lib).toBeDefined();
    expect(lib?.source).toBe('gm');
    expect(lib?.engine).toBe('strudel');
  });

  it('résout "xen" avec source==="xen" (accordage microtonal, précédemment MUET)', () => {
    const lib = resolveStrudelLibrary('xen');
    expect(lib).toBeDefined();
    expect(lib?.source).toBe('xen');
  });

  it('un id bidon ne résout PAS (déclenche le log "banque inconnue")', () => {
    expect(resolveStrudelLibrary('nope')).toBeUndefined();
  });

  it("trace jusqu'à l'autorité amont : chaque bank déclarable de guestLibraries résout à son propre `source`", () => {
    for (const lib of guestLibraries) {
      if (lib.engine !== 'strudel' || !lib.declarable) continue;
      expect(resolveStrudelLibrary(lib.id)?.source).toBe(lib.source);
    }
  });
});

describe('resourceResolutionErrors — signal 2 du voyant de santé (décision 2026-07-15)', () => {
  it('une banque strudel inconnue est rapportée', () => {
    const code = `@core\n@library.strudel "zzz-nonexistent"\n\nS -> a\na -> \`note("c2")\``;
    const errs = resourceResolutionErrors(code);
    expect(errs).toEqual([{ message: 'banque inconnue: zzz-nonexistent' }]);
  });

  it('une banque strudel connue (dirt-samples) ne déclenche aucune erreur', () => {
    const code = `@core\n@library.strudel "dirt-samples"\n\nS -> a\na -> \`note("c2")\``;
    expect(resourceResolutionErrors(code)).toEqual([]);
  });

  it('aucune déclaration @library → aucune erreur', () => {
    const code = `@core\n@controls\n@alphabet.western:browser\nS -> Bass\nBass -> C2 (wave:sawtooth)`;
    expect(resourceResolutionErrors(code)).toEqual([]);
  });

  it('un engine non-strudel (pas de chargeur) ne compte jamais comme une erreur', () => {
    const code = `@core\n@library.csound "some-bank"\n\nS -> a\na -> \`note("c2")\``;
    expect(resourceResolutionErrors(code)).toEqual([]);
  });

  it('un code non compilable (parse throw) rend une liste vide, jamais une exception', () => {
    expect(() => resourceResolutionErrors('{{{ not bpscript at all')).not.toThrow();
  });
});
