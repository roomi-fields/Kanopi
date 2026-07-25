// [921] MODE TEST — graine FIGÉE au lancement, une OPTION jamais un défaut (demande Romain via
// architecte, 2026-07-25). Romain compare une grammaire au natif dans le comparateur 3-chaînes,
// puis veut VOIR ET ENTENDRE le MÊME tirage dans l'UI. Le pont : un paramètre d'URL `?seed=42`
// — par ONGLET, sans redémarrer le serveur, composable avec le dev server ordinaire.
//
//   • POSÉ (`?seed=42`) : tout produce ET le re-roll utilisent CETTE graine à la place de
//     `freshSeed()` (bpx-adapter) → deux produces de suite redonnent la MÊME suite, la session
//     de test est déterministe de bout en bout.
//   • ABSENT : rien ne change — le défaut VIVANT (tirage frais à chaque produce, décision Romain
//     2026-07-25) reste strictement intact, zéro différence avec aujourd'hui.
//
// Lu SUR L'URL à chaque appel (l'URL d'un onglet est stable ; pas de mémoïsation → testable en
// changeant `window.location` dans un banc). Robuste au headless : pas de `window` (vitest sans
// jsdom, SSR) → mode OFF, comportement identique à aujourd'hui.

function currentTestSeed(): number | undefined {
  if (typeof window === 'undefined' || !window.location) return undefined;
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null) return undefined;
  const n = Number(raw);
  // Une graine BPx valide est un entier ≥ 1 (cf. `freshSeed` : 1..0x7ffffffe). Un `?seed=` vide,
  // négatif ou non entier N'ARME PAS le mode (repli silencieux sur le défaut vivant, jamais une
  // graine fantaisiste posée à l'insu de l'auteur).
  if (!Number.isInteger(n) || n < 1) return undefined;
  return n;
}

/** La graine FIGÉE du mode test si l'onglet est lancé en `?seed=N` (N entier ≥ 1), sinon `undefined`. */
export function testSeed(): number | undefined {
  return currentTestSeed();
}

/** Le mode test est-il armé pour cet onglet ? (⇔ `testSeed() !== undefined`) */
export function isTestMode(): boolean {
  return currentTestSeed() !== undefined;
}
