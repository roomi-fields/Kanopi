// L'HÔTE CONSOMME LA FACETTE HORS-LIGNE DE BPx, ET LES DEUX PORTES NE RENDENT PAS LA MÊME CHOSE.
//
// Préavis bpx [1310] / BPX-58, mesuré chez eux sur `acceleration`, même scène même graine :
//   ASSIETTE  hors-ligne 78 jetons · en direct 90 (12 jetons de contrôle en trop)
//   CHARGE    hors-ligne chaque jeton porte ses contrôles résolus · en direct AUCUN, 0 sur 90
//   DATATION  hors-ligne le premier jeton à 0 ms · en direct à 10 ms
// Cause déclarée chez eux : la porte du DIRECT est restée sur l'ancien émetteur quand la
// production a migré (arbitrage 2026-06-23, `streaming` laissé intact). Non réparée à ce jour.
//
// ⛔ CE QUE CE BANC VERROUILLE, ET POURQUOI IL EST ÉCRIT : la charge absente est le dégât
// SILENCIEUX de leur défaut — rien ne plante, la note sort, elle sort à la mauvaise hauteur. Une
// note transposée cesserait de l'être, sans une seule erreur. Si l'hôte basculait un jour sur la
// porte du direct, RIEN dans mes bancs ne le dirait : ils vérifient qu'une scène sonne, pas ce
// qu'elle porte.
//
// ⚠️ ET IL MESURE, IL NE DÉDUIT PAS. Mon code n'importe que `createSession` de BPx et jamais son
// module de flux — on pourrait s'en contenter. Mais un import est un indice sur le CHEMIN, pas une
// preuve sur la VALEUR : la même porte pourrait changer de charge sans changer de nom. Ce banc
// compare donc les trois axes eux-mêmes, aux DEUX points où l'hôte consomme.
//
// LES DEUX FACETTES, ET ELLES NE SERVENT PAS À LA MÊME CHOSE (bpx-adapter.ts:2028-2031) :
//   · `emit('timed-tokens')` → l'ÉCRAN seul (longueur de scène, rouleau, liste des jetons) ;
//   · `derive().tree` → Kairos → Kronos → les runtimes : ce qui SONNE.
// Les deux sortent du MÊME `derive()`, à trois lignes l'une de l'autre.

import { describe, it, expect } from 'vitest';
import { parseBP3 } from 'bp3-frontend';
import { createSession } from 'bpx';
import { Kairos } from '@kairos/core';
import { resolveGrAux, resolveSeSettings, resolveSeText } from './bpx-adapter';
import { BUNDLED_AL, BUNDLED_SOUND } from './bp3-aux';
import gr from '../../../../library/scenes/bp3/bp-acceleration.gr?raw';

const loader = (p: string, n: string) => (p === 'al' ? BUNDLED_AL[n] : BUNDLED_SOUND[n]);

type Tok = { token: string; start: number; end: number; type?: string; controls?: unknown };
type Feuille = {
  kind?: string;
  sceneOnset: number;
  content?: { controls?: unknown; rq?: unknown };
};

/** Le VRAI chemin de résolution de l'adaptateur — chaque brique importée réelle, pas
 *  réimplémentée (même schéma que `bp3-bel-phase-b.test.ts`). */
function deriver() {
  const first = parseBP3(gr);
  const seText = resolveSeText(first.fileRefs);
  const { alphabetNames, soundSymbols } = resolveGrAux(first.fileRefs, loader);
  const r =
    soundSymbols.length > 0 || alphabetNames !== undefined || seText !== undefined
      ? parseBP3(gr, { alphabetNames, soundSymbols, seText })
      : first;
  const settings = resolveSeSettings(r.fileRefs);
  const bpx = createSession(r.ast as never, {
    ...(settings !== undefined ? { settings } : {}),
    seed: 12345
  });
  const d = bpx.derive() as { tree: unknown };
  const tokens = bpx.emit<Tok[]>('timed-tokens');
  // APRÈS `derive()`, jamais avant : leur surface lève dans l'autre ordre ([1311]).
  const ctx = bpx.buildProjectionContext();
  const kairos = new Kairos();
  kairos.charger(d.tree as never, ctx as never);
  const tl = kairos.arbreCourant();
  const feuilles = tl.query(0, tl.duration + 1) as readonly unknown[] as readonly Feuille[];
  return { tokens, feuilles, ctx };
}

describe('les deux facettes que l’hôte consomme sont celles du HORS-LIGNE', () => {
  const { tokens, feuilles } = deriver();

  // ASSIETTE — 78 chez eux hors-ligne, 90 en direct. Le compte SEUL sépare les deux portes.
  it('assiette : 78 des deux côtés, et AUCUN jeton de contrôle (le direct en ajoute 12)', () => {
    expect(
      tokens.length,
      `l’émetteur rend ${tokens.length} jetons : 78 = facette hors-ligne, 90 = porte du direct (BPX-58)`
    ).toBe(78);
    expect(
      tokens.filter((t) => t.type === 'control').length,
      'des jetons de contrôle sont apparus — signature de la porte du direct'
    ).toBe(0);
    expect(feuilles.length, 'l’arbre projeté par Kairos ne porte plus 78 feuilles').toBe(78);
  });

  // CHARGE — le point qui fait le plus de dégâts en silence : zéro contrôle en direct.
  it('charge : chaque feuille jouée porte ses contrôles résolus (le direct n’en porte AUCUN)', () => {
    const chargees = feuilles.filter(
      (e) => e.content?.controls != null || e.content?.rq != null
    ).length;
    expect(
      chargees,
      `${chargees} feuilles sur ${feuilles.length} portent une charge — à zéro, une note transposée ` +
        `sortirait à la mauvaise hauteur sans qu’une seule erreur le dise`
    ).toBe(feuilles.length);
    // Et côté écran : le jeton porte bien son canal de contrôles.
    expect(Object.keys(tokens[0])).toContain('controls');
  });

  // DATATION — 0 ms hors-ligne, 10 ms en direct. Un décalage désalignerait le rouleau du son.
  it('datation : les deux facettes commencent à zéro (le direct commence à 10 ms)', () => {
    expect(tokens[0].start, 'le premier jeton ne commence plus à 0 ms').toBe(0);
    expect(feuilles[0].sceneOnset, 'la première feuille jouée ne commence plus à 0').toBe(0);
  });
});

// ⛔ LE TÉMOIN DE COMPENSATION, ET IL EST ÉPROUVÉ SUR UNE VALEUR NON NULLE.
//
// Préavis bpx [1311], le même matin : construire le contexte de projection AVANT d'avoir dérivé
// rendait un contexte silencieusement FAUX — le décalage d'origine y était lu sur une table de
// temps encore vide, donc ZÉRO, et la scène projetée sortait entièrement décalée. Leur surface
// LÈVE désormais dans ce cas.
//
// ⚠️ CE QUI M'A ARRÊTÉ, ET QUI VALAIT LA PEINE D'ÊTRE MESURÉ : leurs deux courriers portent le
// même nombre, 10 ms, sur la même scène — et j'ai bien failli conclure que mon zéro était le
// chiffre faux, donc que le banc ci-dessus verrouillait le défaut. LES DEUX 10 ms NE SONT PAS LA
// MÊME GRANDEUR. Celui du préavis est `kpressOffset`, une clé du CONTEXTE ; celui du direct est
// l'instant du premier JETON. Un troisième terme les sépare — le contenu réel du contexte — et
// aucun des deux courriers ne le portait.
//
// CE QUE CE CAS VERROUILLE : le contexte que je remets à Kairos porte un décalage NON NUL. À zéro,
// tout jouerait, rien ne planterait, et la scène entière serait décalée — la forme exacte du
// défaut qu'ils viennent de rendre bruyant. Un témoin de compensation éprouvé sur une valeur nulle
// n'aurait rien prouvé : zéro est précisément ce que rendait le chemin fautif.
describe('le contexte remis à Kairos porte un décalage d’origine NON NUL', () => {
  it('kpressOffset vaut 10 sur acceleration (le chemin fautif rendait 0)', () => {
    const { ctx } = deriver();
    const offset = (ctx as { kpressOffset?: number }).kpressOffset;
    expect(
      offset,
      'le décalage d’origine est absent ou nul — la scène projetée serait décalée en entier, ' +
        'sans erreur ni rouge (bpx [1311])'
    ).toBe(10);
  });
});
