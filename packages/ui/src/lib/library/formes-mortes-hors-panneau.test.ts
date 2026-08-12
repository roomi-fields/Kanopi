import { describe, it, expect, beforeAll } from 'vitest';
import { createEventBus } from '../events/bus';
import { initAdapters } from '../runtimes/registry';
import { referencedLibraries } from './referenced';
import { compileBps } from '../runtimes/compile-cache';

// LE VERROU EST RETOURNÉ. Deux directives sont SORTIES du langage — `@library.<moteur>
// "<banque>"` (Romain 2026-08-06) et `@transport.<canal>` (Romain 2026-08-04). Une scène qui
// les écrit encore ne produit plus d'arbre : elle tombe donc dans le REPLI-TEXTE du panneau
// des ressources, la seule voie qui tourne sur ces scènes-là. Le repli les affichait comme des
// ressources valides — « audio bank: gm » pour une scène qui ne jouera jamais un son (mesuré
// et routé par runtime-codevoices, 2026-08-12).
// Ce banc ne verrouille pas leur présence : il verrouille leur ABSENCE. Il rougit si l'une des
// deux revient au panneau, et il rougit AUSSI si le compilateur cessait de les refuser — auquel
// cas la question se retranche en amont, elle ne se rattrape pas ici.
beforeAll(() => initAdapters(createEventBus()));

const SUPPRIMEES = [
  { mot: '@library', scene: '@library.strudel "gm"\n@core\nS -> C4 D4\n', jamais: 'gm' },
  { mot: '@transport', scene: '@transport.midi\n@core\nS -> C4 D4\n', jamais: 'midi' }
];

describe('les directives SORTIES du langage ne sont plus des ressources', () => {
  for (const { mot, scene, jamais } of SUPPRIMEES) {
    it(`${mot} : le compilateur la REFUSE et ne rend aucun arbre`, () => {
      const c = compileBps(scene) as { errors?: { message?: string }[]; ast?: unknown };
      expect(c.ast, `${mot} produit encore un arbre — le refus amont a bougé`).toBeFalsy();
      const messages = (c.errors ?? []).map((e) => e.message ?? '').join(' | ');
      expect(messages).toContain(mot);
    });

    it(`${mot} : le repli-texte ne l'affiche PAS au panneau`, () => {
      const libs = referencedLibraries('x.bps', scene);
      // Le repli tourne bien (le reste de la scène est lu) — c'est son absence à LUI qu'on tient.
      expect(libs.map((l) => l.name)).toContain('core');
      expect(
        libs.map((l) => l.name),
        `${mot} est resté affiché comme ressource valide`
      ).not.toContain(jamais);
    });
  }
});
