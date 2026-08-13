/**
 * Extraction des MEMBRES PUBLICS d'une classe JS **ou TypeScript** — cœur partagé de
 * `surface:aval`, copié tel quel par les autres runtimes (empreinte identique, cf. la section
 * `outillage` de `surface-aval.json`).
 *
 * Isolé ici pour être TESTABLE : deux faux positifs successifs, signalés par des dépôts à
 * l'empreinte différente de la mienne, ont montré qu'un scanner imprécis finit ignoré — et que
 * l'angle mort revient alors par la porte de la lassitude.
 *
 *  · [68] runtime-audio — `this.clock` : je ne lisais que les MÉTHODES. Mon adaptateur n'a aucun
 *    champ public, donc le cas ne pouvait pas naître chez moi.
 *  · [71] runtime-codevoices — deux défauts d'un coup, et le second est le plus gros :
 *      (a) TypeScript déclare la visibilité (`private clock: … = null`), alors qu'en JS un
 *          `this.X =` EST public faute d'autre moyen. Je remontais donc l'état privé d'un
 *          adaptateur TS comme des membres « ignorés par la copie ».
 *      (b) je lisais le fichier ENTIER — donc les autres `interface`, les paramètres de
 *          fonction et les littéraux d'objet (`fileId: src.fileId`) devenaient des « membres ».
 *          Mes fichiers ne portent qu'une classe : invisible chez moi, là encore.
 *
 * Règle tenue : on lit le CORPS DU SYMBOLE demandé, et « public » = ce que le langage dit public.
 */

const MOTS_CLÉS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'constructor', 'super']);

/**
 * Corps de `class|interface <nom> { … }` — s'arrête à la première accolade fermante en colonne 0.
 * @returns {string|null} null si le symbole est introuvable (l'appelant doit REFUSER de conclure).
 */
export function corpsDuSymbole(texte, nom) {
  const lignes = texte.split('\n');
  const i = lignes.findIndex((l) => new RegExp(`\\b(class|interface)\\s+${nom}\\b`).test(l));
  if (i < 0) return null;
  const j = lignes.findIndex((l, k) => k > i && /^\}/.test(l));
  return lignes.slice(i + 1, j < 0 ? lignes.length : j).join('\n');
}

/**
 * @param {string} src - code source (JS ou TS)
 * @param {string} [symbole] - classe/interface à lire ; sans lui, le fichier entier (à éviter :
 *   c'est ce qui a produit le faux positif [71b]).
 * @returns {Set<string>} méthodes, accesseurs et champs PUBLICS.
 */
export function membresPublics(src, symbole) {
  const corps = symbole ? corpsDuSymbole(src, symbole) : src;
  if (corps === null) return new Set();

  // Visibilité DÉCLARÉE (TypeScript) : elle fait autorité sur l'affectation `this.X = …`.
  const privés = new Set();
  for (const m of corps.matchAll(/^\s*(?:private|protected)\s+(?:readonly\s+)?(?:async\s+)?([a-zA-Z][\w]*)/gm)) privés.add(m[1]);

  const membres = new Set();
  for (const m of corps.matchAll(/^ {2}(?:(?:public|readonly|static|async)\s+)*([a-zA-Z][\w]*)\s*[(<]/gm)) membres.add(m[1]);
  for (const m of corps.matchAll(/^ {2}(?:get|set)\s+([a-zA-Z][\w]*)\s*\(/gm)) membres.add(m[1]);
  for (const m of corps.matchAll(/^ {2}(?:(?:public|readonly|declare)\s+)*([a-zA-Z][\w]*)\??\s*(?::[^;=]+)?(?:=[^=]|;\s*$)/gm)) membres.add(m[1]);
  for (const m of corps.matchAll(/\bthis\.([a-zA-Z][\w]*)\s*=[^=]/g)) membres.add(m[1]);

  for (const k of MOTS_CLÉS) membres.delete(k);
  for (const p of privés) membres.delete(p);
  for (const m of [...membres]) if (m.startsWith('_')) membres.delete(m); // convention « privé »
  return membres;
}
