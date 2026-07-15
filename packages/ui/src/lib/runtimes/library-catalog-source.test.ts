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
import { resolveStrudelLibrary } from './bpx-adapter';

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
