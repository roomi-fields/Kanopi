// Sonde DEV lecture-seule : les DERNIERS événements d'ENTRÉE passés sur le bus, capturés
// VERBATIM. Exposée par `window.kanopi.inspect.inputs()`.
//
// POURQUOI ELLE EXISTE. Le banc d'écran de Kanopi passe par l'API et rien d'autre — importer un
// store dans la page donnerait une instance DUPLIQUÉE qui ne voit rien. Sans cette sonde, prouver
// qu'une touche du clavier de jeu arrive vraiment jusqu'au bus exigeait d'ouvrir la lucarne de
// développement (`?events=1`) et de lire son texte : mesurer un RENDU au lieu du FAIT.
//
// CE QU'ELLE NE FAIT PAS : interpréter. La charge est recopiée telle qu'elle arrive — un numéro
// reste un numéro, jamais un nom de note (un nom se résout par l'alphabet déclaré, en aval,
// contrat `hub/contrats/hote-runtime-in.md`). Aucun routage, aucune table, aucune corrélation avec
// un rôle : associer un événement au rôle qui l'attend est le mandat de `@map`.

import type { InputEvent, KanopiEvent } from '../events/types';

/** Bornée : une sonde de diagnostic ne doit pas grossir sans fin dans une session de jeu. */
const MAX = 100;

const derniers: InputEvent[] = [];
let branchee = false;

/** Branche la sonde sur le bus. Idempotente — deux appels ne doublent pas l'écoute. */
export function startInputObserver(onAny: (fn: (e: KanopiEvent) => void) => () => void): void {
  if (branchee) return;
  branchee = true;
  onAny((e) => {
    if (e.type !== 'input') return;
    derniers.push(e);
    if (derniers.length > MAX) derniers.shift();
  });
}

/** Les événements d'entrée vus, du plus ancien au plus récent. Lecture seule. */
export function readInputs(): readonly InputEvent[] {
  return [...derniers];
}
