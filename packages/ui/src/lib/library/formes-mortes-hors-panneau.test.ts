import { describe, it, expect, beforeAll } from 'vitest';
import { createEventBus } from '../events/bus';
import { initAdapters } from '../runtimes/registry';
import { referencedLibraries } from './referenced';
import { sceneQuiEchoue } from './scene-de-banc';

// LE VERROU EST RETOURNÉ. Deux directives sont SORTIES du langage — `library.<moteur>
// "<banque>"` (Romain 2026-08-06) et `transport.<canal>` (Romain 2026-08-04). Une scène qui
// les écrit encore ne produit plus d'arbre : elle tombe donc dans le REPLI-TEXTE du panneau
// des ressources, la seule voie qui tourne sur ces scènes-là. Le repli les affichait comme des
// ressources valides — « audio bank: gm » pour une scène qui ne jouera jamais un son (mesuré
// et routé par runtime-codevoices, 2026-08-12).
// Ce banc ne verrouille pas leur présence : il verrouille leur ABSENCE. Il rougit si l'une des
// deux revient au panneau, et il rougit AUSSI si le compilateur cessait de les refuser — auquel
// cas la question se retranche en amont, elle ne se rattrape pas ici.
beforeAll(() => initAdapters(createEventBus()));

// ⛔ DEUX CHOSES ONT BOUGÉ EN AMONT LE 2026-08-18, ET AUCUNE N'AFFAIBLIT CE QUE CE BANC TIENT.
// 1. LE REFUS S'ACCOMPAGNE DÉSORMAIS D'UN ARBRE. Le compilateur signale l'erreur ET rend un
//    `ast` non nul. Ce banc exigeait `ast` falsy et lisait donc le CONTRAT DE RETOUR là où son
//    sujet est le REFUS. Ce qui prouve le refus est l'erreur, et c'est elle qu'il vérifie
//    maintenant. L'application ne dérive rien de cet arbre : l'adaptateur jette dès qu'une erreur
//    est présente (`bpx-adapter.ts`, `throw new Error(parse error)`), avant toute dérivation.
// 2. LE MESSAGE NE NOMME PLUS TOUJOURS LE MOT. Romain a tranché le retrait des messages dédiés
//    (2026-08-18) : `library` rend « Expected IDENT, got STRING (gm) ». `transport` nomme encore
//    son axe. Chaque cas porte donc l'empreinte du message QU'IL REÇOIT, pas celle qu'on aimerait.
const SUPPRIMEES = [
  {
    mot: 'library',
    scene: 'library.strudel "gm"\ncore\n-----\nS -> C4 D4\n',
    jamais: 'gm',
    empreinte: /Expected IDENT, got STRING \(gm\)/
  },
  {
    mot: 'transport',
    scene: 'transport.midi\ncore\n-----\nS -> C4 D4\n',
    jamais: 'midi',
    empreinte: /no library serves the axis 'transport'/
  },
  // ⛔ TROIS DE PLUS LE 2026-09-02, ET ILS VIVAIENT DANS MA PROPRE TABLE. `devices`, `controls` et
  // `filter` figuraient dans `DIRECTIVE_TYPES` comme des invocations valides — la table datait de
  // l'époque de l'arobase. Mesurés au compilateur du jour : les trois sont refusés nus en tête, donc
  // une scène qui les écrit tombe dans le repli-texte, qui les affichait au panneau. `devices` s'y
  // affichait sous le nom `all` ; les deux autres sous leur propre mot.
  {
    mot: 'devices',
    scene: 'devices\ncore\n-----\nS -> C4 D4\n',
    jamais: 'all',
    empreinte: /'devices' is declared by no loaded library/
  },
  {
    mot: 'controls',
    scene: 'controls\ncore\n-----\nS -> C4 D4\n',
    jamais: 'controls',
    empreinte: /'controls' is declared by no loaded library/
  },
  {
    mot: 'filter',
    scene: 'filter\ncore\n-----\nS -> C4 D4\n',
    jamais: 'filter',
    empreinte: /'filter' cannot be written at the top of a scene/
  }
];

describe('les directives SORTIES du langage ne sont plus des ressources', () => {
  for (const { mot, scene, jamais, empreinte } of SUPPRIMEES) {
    it(`${mot} : le compilateur la REFUSE`, () => {
      const c = { errors: sceneQuiEchoue(scene).erreurs };
      const messages = (c.errors ?? []).map((e) => e.message ?? '').join(' | ');
      expect(
        c.errors ?? [],
        `${mot} ne produit plus d'erreur — le refus amont a été levé, la question se retranche là-bas`
      ).not.toHaveLength(0);
      expect(
        messages,
        `${mot} est refusé, mais pas sur « ${empreinte} » — c'est un AUTRE refus, à confronter avant de le croire couvert`
      ).toMatch(empreinte);
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
