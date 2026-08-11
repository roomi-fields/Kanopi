// Bundled BP3 auxiliary settings for the showcase grammars.
//
// A BP3 `.gr` references its engine timing in a sibling `-se.<name>` file
// (parseBP3 surfaces it via `fileRefs`). Without it the derivation falls back to
// a 1000 ms beat instead of the native tempo (e.g. acceleration 750 ms). The
// adapter resolves the referenced settings here, parses them with the upstream
// `parseSeFile`, and hands the engine timing to `createBPx({ settings })`.
//
// Keyed by the `-se` reference name (the `name` in `fileRefs`). Bundled as raw
// text so the upstream parser does the interpretation — no values duplicated.

// ⛔ CETTE LISTE ÉTAIT ÉCRITE À LA MAIN, ET ELLE A MENTI PENDANT DES MOIS.
// Vingt-quatre `import` posés un par un, pour un corpus qui en référence QUATRE-VINGT-UN.
// Cinquante-sept grammaires dérivaient donc au timing moteur par défaut au lieu du leur — pas
// d'erreur, pas de rouge, un `console.warn` que personne ne lit, et la scène joue faux.
// UNE LISTE SE PÉRIME, UNE DÉRIVATION NON : on énumère les DOSSIERS, et déposer un réglage suffit
// à le rendre disponible. C'est la forme que l'architecte a arbitrée ([1303]) et celle que
// bp3-frontend emploie déjà de son côté.

/** Les réglages CONVERTIS de la vitrine (`se.<nom>.json`) — le chemin déjà éprouvé. */
const SE_VITRINE = import.meta.glob('../../../../library/scenes/bp3/se.*.json', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

/** Les réglages NATIFS du corpus (`-se.<nom>`, sans extension), tels que la table de
 *  correspondance de bp3-engine les désigne — 143 fichiers, la source de vérité du couple. */
const SE_CORPUS = import.meta.glob('../../../../library/test-assets/bp3/commun/-se.*', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

/** Le nom de RÉFÉRENCE porté par la ligne `-se.<nom>` d'une grammaire, tiré du chemin.
 *  Le point fait partie du nom (`ShapesInRhythm.QTM`, `trial.mohanam`) : on retire le préfixe
 *  et, côté vitrine, le seul suffixe `.json` — jamais « tout ce qui suit le premier point ». */
function nomDeReference(chemin: string, prefixe: string, suffixe = ''): string {
  const base = chemin.split('/').pop() ?? '';
  const sansPrefixe = base.slice(prefixe.length);
  return suffixe && sansPrefixe.endsWith(suffixe)
    ? sansPrefixe.slice(0, -suffixe.length)
    : sansPrefixe;
}

// Nom de référence (tel qu'il apparaît dans la ligne `-se.<nom>`) → texte brut du réglage.
// ⚠️ LA VITRINE GAGNE SUR LE CORPUS quand les deux portent le même nom, et c'est délibéré : les
// vingt-quatre convertis sont le chemin PROUVÉ (scènes de vitrine vertes au portillon). Les
// natifs viennent COMPLÉTER, jamais remplacer — zéro régression sur ce qui marchait déjà.
export const BUNDLED_SE: Record<string, string> = {
  ...Object.fromEntries(Object.entries(SE_CORPUS).map(([c, t]) => [nomDeReference(c, '-se.'), t])),
  ...Object.fromEntries(
    Object.entries(SE_VITRINE).map(([c, t]) => [nomDeReference(c, 'se.', '.json'), t])
  )
};

// Sound-object aux files (-so/-mi/-cs) → which alphabet symbols carry a sound,
// for per-symbol routing (decision routage-texte-son-par-symbole). Keyed by the
// reference name in the grammar's `-so.<name>` line, raw text for parseSoundObjects.
// Phase B publishes none of these: bp-csound-objects.gr (the only scene that
// carried a `-mi`/`-cs` sound-object prototype) was triaged OUT (mute — gate
// 'joue vraiment' [825]). Empty until a future published scene references one.
export const BUNDLED_SOUND: Record<string, string> = {};

// Alphabet aux files (-al). A sound-bearing grammar reaches its prototype through
// the alphabet (-gr → -al → -so/-mi/-cs), so the adapter loads the -al to follow
// the chain. Keyed by the `-al.<name>` reference, raw text for parseAlFile /
// alphabetSoundRef.
// Phase B publishes none of these: bp-asymmetric.gr (the only scene that
// referenced `-al.asymmetric1`) was triaged OUT (off the iso-native list).
// Empty until a future published scene references one.
export const BUNDLED_AL: Record<string, string> = {};
