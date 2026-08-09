// OUVRIR UNE SCÈNE PAR SON IDENTIFIANT, DEPUIS L'URL — `?scene=<catégorie>/<fichier>.bps`.
// Demande de Romain (2026-08-09) : depuis un exemple de la doc, un clic amène l'utilisateur sur la
// scène OUVERTE dans Kanopi, prête à produire — « ainsi ce qui sera testé, ça sera toujours les
// vraies scènes d'exemples correspondantes ». Un lien vers un fichier ne répond pas à la demande :
// il donne du texte à lire, pas une scène à jouer.
//
// ⚠️ CE MODULE NE FAIT QUE LIRE. L'ouverture passe par le MÊME chemin que le clic du rail
// (`LibrarySpace.svelte` → `workspace.openBundle`), jamais par une seconde voie : deux façons
// d'ouvrir la même chose, c'est une seule des deux qui serait testée.
//
// PATRON REPRIS DE `mode-test.ts` (`?seed=N`), qui a fait ses preuves :
//   • lu SUR l'URL à l'appel, sans mémoïsation → testable en changeant `window.location` ;
//   • repli SILENCIEUX si absent ou invalide → jamais d'ouverture surprise ;
//   • pas de `window` (vitest sans jsdom, SSR) → rien, comportement identique à aujourd'hui.

/** L'identifiant demandé dans l'URL (`?scene=strudel/09-gm.bps`), ou `undefined`.
 *
 * FORME ATTENDUE : l'identifiant de catalogue, `catégorie/fichier` (`catalog.ts` le construit
 * ainsi). On ne valide PAS son existence ici — c'est l'affaire de qui résout ; ce module ne
 * répond qu'à « qu'est-ce qui est demandé ». On rejette en revanche ce qui ne peut pas être un
 * identifiant : vide, ou remontant hors du corpus (`..`). */
export function sceneDemandeeParUrl(): string | undefined {
  if (typeof window === 'undefined' || !window.location) return undefined;
  const brut = new URLSearchParams(window.location.search).get('scene');
  if (brut === null) return undefined;
  const id = brut.trim();
  // Un identifiant vide n'ouvre rien ; `..` ne peut pas venir du catalogue et n'a rien à y faire.
  if (id === '' || id.includes('..')) return undefined;
  return id;
}
