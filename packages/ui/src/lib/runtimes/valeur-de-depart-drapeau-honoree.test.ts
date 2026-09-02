// VERROU — LA VALEUR DE DÉPART QU'UNE SCÈNE DÉCLARE ATTEINT SA DÉRIVATION, ET L'HÔTE N'Y EST
// POUR RIEN. Le sujet est traversant : la scène écrit `flag section:1`, bpscript le pose sur
// l'arbre, BPx le lit à la dérivation. Ce banc mesure le RÉSULTAT, donc il rougit quel que soit
// le maillon qui lâche.
//
// ⛔ POURQUOI IL EST ÉCRIT AINSI, ET C'EST L'HISTOIRE DE DEUX VERROUS RETOURNÉS.
//
// Premier état : l'hôte lisait des ÉTATS NOMMÉS (`flag section(calm:1, full:2)`) et posait
// lui-même l'état de plus petit entier — une valeur que rien dans la scène n'écrivait. Le banc
// verrouillait cette lecture. Le langage a retiré les états nommés le 2026-08-22.
//
// Deuxième état : l'hôte lisait la valeur DÉCLARÉE et la reportait à la session. Mesuré le même
// jour, ce report était nécessaire — le dériveur ignorait la déclaration. Le banc verrouillait
// cette lecture-là.
//
// Aujourd'hui : le dériveur lit la déclaration (`BPx/src/load/loadGrammar.ts`, `collectFlagInitialValues`), et le report
// de l'hôte est SUPPRIMÉ — deux mains sur une valeur qui a un porteur, c'est une voie parallèle.
// Le banc ne verrouille donc plus aucune fonction de l'hôte : il verrouille le RÉSULTAT sans
// aucune injection. Si quelqu'un remet un report côté hôte, ce banc reste vert — c'est voulu, il
// ne mesure pas ça ; ce qu'il empêche, c'est que le résultat DISPARAISSE en silence.
//
// ⚠️ ET IL NE REMPLACE PAS LA PREUVE À L'ÉCRAN. Le chemin réel — l'adaptateur, le transport, les
// voix — n'est exercé que par les bancs d'écran. Ce banc dit que la valeur traverse la chaîne
// d'analyse et de dérivation, pas que la scène sonne.
import { describe, it, expect } from 'vitest';
import { sceneQuiPasse, sceneQuiEchoue } from '../library/scene-de-banc';
import { createSession } from 'bpx';

// Même route que le garde de corpus (`library/corpus-compile.test.ts:60`) : le bundler lit le
// fichier, pas `node:fs` (rejeté par le tsconfig de `src/`).
const SCENES = import.meta.glob('../../../../library/scenes/code-voices/starter-main.bps', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;
const STARTER_MAIN = Object.values(SCENES)[0];

/** Les feuilles d'un arbre, désignées par la RÈGLE qui les a produites — jamais par leur nombre.
 *  Un symbole non expansé n'a pas de règle : c'est ce qui distingue « la scène s'est tue » de
 *  « la scène a dérivé autre chose », et un simple décompte confond les deux (deux valeurs de
 *  drapeau peuvent rendre UNE feuille chacune sans que ce soit la même). */
function feuilles(n: unknown, out: string[] = []): string[] {
  if (!n || typeof n !== 'object') return out;
  if (Array.isArray(n)) {
    for (const e of n) feuilles(e, out);
    return out;
  }
  const noeud = n as Record<string, unknown>;
  if (noeud.type === 'occupying') {
    const r = noeud.ruleRef as { ruleIndex?: number } | null | undefined;
    out.push(r ? `règle${r.ruleIndex}` : 'NON-EXPANSÉ');
  }
  for (const k in noeud) feuilles(noeud[k], out);
  return out;
}

function derivéSansInjection(source: string): string[] {
  const ast = sceneQuiPasse(source);
  const d = createSession(ast as Parameters<typeof createSession>[0], { seed: 1 }).derive();
  return feuilles(d.tree);
}

describe('la valeur de départ déclarée par un drapeau est honorée à la dérivation', () => {
  it('trois valeurs, trois dérivations DISTINCTES — et aucun drapeau injecté', () => {
    const gabarit = (v: number) =>
      `core\nalphabet.western:audio\nflag g:${v}\n-----\n[g==1] S -> C4 E4 G4\n[g==0] S -> D4\n`;

    // `g:1` ouvre la première règle, `g:0` la seconde, `g:2` aucune. Les deux dernières rendent
    // UNE feuille chacune : c'est le CONTENU qui les sépare, pas le compte.
    expect(derivéSansInjection(gabarit(1)), 'la garde `[g==1]` ne s’ouvre pas').toEqual([
      'règle0',
      'règle0',
      'règle0'
    ]);
    expect(derivéSansInjection(gabarit(0)), 'la garde `[g==0]` ne s’ouvre pas').toEqual(['règle1']);
    expect(
      derivéSansInjection(gabarit(2)),
      'une valeur qu’aucune garde n’attend devrait laisser le symbole de départ non expansé'
    ).toEqual(['NON-EXPANSÉ']);
  });

  it('la scène d’accueil dérive sa section déclarée, et se tairait à une autre', () => {
    expect(STARTER_MAIN, 'starter-main.bps introuvable — ce banc ne mesurerait rien').toBeTruthy();
    // ⛔ SUR LA VRAIE SCÈNE, ET PAR COMPARAISON — pas sur un numéro de règle écrit en dur, qui se
    // périmerait au premier réarrangement du fichier. Ce qui est verrouillé : la valeur déclarée
    // fait dériver, et une valeur qu'aucune garde n'attend fait TAIRE. Un banc qui ne mesurerait
    // que le premier volet resterait vert si la déclaration cessait d'être lue, puisqu'une scène
    // muette et une scène qui dérive rendent toutes deux « une feuille ».
    const déclarée = derivéSansInjection(STARTER_MAIN);
    const orpheline = derivéSansInjection(STARTER_MAIN.replace('flag section:1', 'flag section:9'));

    expect(
      déclarée,
      'la scène d’accueil s’ouvre MUETTE — sa valeur déclarée ne traverse plus'
    ).not.toContain('NON-EXPANSÉ');
    expect(
      orpheline,
      'une valeur qu’aucune garde n’attend fait quand même dériver — la déclaration n’est pas lue'
    ).toEqual(['NON-EXPANSÉ']);
  });

  it('la forme à états nommés est REFUSÉE — elle ne peut plus revenir en douce', () => {
    const source = `core\nactor drums eval.strudel\nflag section(intro:1, drop:2)\n-----\n[section==intro] S -> drums_r\ndrums_r -> drums.\`s("bd")\`\n`;
    const { erreurs } = sceneQuiEchoue(source);
    expect(
      erreurs.map((e) => e.message ?? '').join(' | '),
      'le refus ne parle pas de la forme du drapeau — il échoue pour une autre raison'
    ).toMatch(/drapeau/i);
  });
});
