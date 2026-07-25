// COMMANDE TEMPO — le point d'entrée UNIQUE du geste « régler le tempo », partagé par le champ
// BPM de la barre (TransportCluster) et la façade de pilotage (`window.kanopi.setTempo`).
//
// POURQUOI ce module existe (mesuré 2026-07-25, recadrage architecte [927]) : le geste tempo a
// DEUX effets indissociables — (a) warper les runtimes via `clock.setBpm`, (b) répercuter la
// valeur appliquée dans la directive `@tempo`/`@mm` de la scène active. L'effet (b) vivait DANS
// le composant Svelte, donc l'API n'en héritait pas : `window.kanopi.setTempo(120)` warpait sans
// réécrire le texte, et un re-eval faisait retomber le tempo sur la directive inchangée. Un banc
// mené par l'API mesurait alors une divergence que le vrai geste utilisateur ne produit PAS —
// l'instrument mentait. La règle dure de la façade (kanopi-api.ts : « chaque commande DÉLÈGUE au
// MÊME point d'entrée que le bouton UI ») était violée par un chemin plus court.
//
// La correction est l'extraction, pas la duplication : la séquence complète vit ICI, les deux
// appelants l'appellent. Aucun d'eux ne réimplémente sa moitié.

import { clock } from '../../stores/clock.svelte';
import { workspace } from '../../stores/workspace.svelte';
import { writeMmDirective } from '../runtimes/mm-directive';

/** Répercute le BPM APPLIQUÉ dans la directive de la scène active.
 *
 *  Prend la valeur retournée par `setBpm`/`tap`, JAMAIS `clock.state.bpm` : pendant qu'une scène
 *  joue, le readout reflète le tempo du handle vivant, qui n'a pas encore warpé à cet instant
 *  synchrone → on écrirait la valeur du changement PRÉCÉDENT (retard d'un cran).
 *
 *  N'écrit que dans une scène bp3/bpscript qui DÉCLARE déjà un tempo — on n'en injecte jamais
 *  un (décision Romain 2026-07-01) — et seulement sur un vrai changement, pour ne pas agiter
 *  l'éditeur pour rien. L'éditeur reflète cette réécriture externe (CMEditor réconcilie doc→vue). */
function mirrorToScene(bpm: number | null): void {
  if (bpm == null) return;
  const f = workspace.activeTabId ? workspace.fileById(workspace.activeTabId) : undefined;
  if (!f || (f.runtime !== 'bpscript' && f.runtime !== 'bp3')) return;
  const next = writeMmDirective(f.contents, bpm);
  if (next !== f.contents) workspace.updateContents(f.id, next);
}

/** Régler le tempo à la main (champ BPM / API). Retourne la valeur APPLIQUÉE (bornée par
 *  `clock.setBpm`, seul propriétaire de la borne [20,300]). */
export function setTempo(bpm: number): number {
  const applied = clock.setBpm(bpm);
  mirrorToScene(applied);
  return applied;
}

/** Battre le tempo (bouton TAP). Retourne la valeur appliquée, `null` tant que la moyenne des
 *  frappes n'est pas exploitable. */
export function tapTempo(): number | null {
  const applied = clock.tap();
  mirrorToScene(applied);
  return applied;
}
