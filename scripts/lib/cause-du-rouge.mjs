/**
 * CE QUI A FAIT ROUGIR LE CROCHET, EXTRAIT DE SA SORTIE — jamais une liste vide.
 *
 * ⛔ CE MODULE EXISTE POUR ÊTRE ÉPROUVÉ. Sa logique vivait dans `tir-arme.mjs`, qui tire une arme
 * au chargement : personne ne pouvait l'exercer sans geler dix dépôts, et elle a passé une journée
 * fausse sans que rien ne le dise. L'éprouver en recopiant son motif chez l'appelant en aurait fait
 * une seconde autorité — verte sur sa copie, fausse sur l'original.
 */

/**
 * LA GRAPHIE QUE LES OUTILS ÉCRIVENT, PAS CELLE DE MES GARDES.
 *
 * ⛔ Le 2026-08-24, sept voisins ont reçu « (cause non extraite — voir mon journal) » alors que le
 * crochet avait imprimé sa cause : `[warn] Code style issues found`, puis `error: impossible de
 * pousser`. Le motif exigeait `Error:` en capitale, ou `error ` suivi d'une ESPACE — la ligne
 * portait `error:` — et rien ne décrivait `[warn]` ni `FAIL`. Le champ existait et se remplissait
 * de son propre angle mort ; il se relisait comme un rapport.
 */
export const MOTIF_CAUSE =
  /^\s*(✗|✘|✖|×|ERROR|Error:|error:|error |FAIL|\[warn\]|not ok|\s+•)/;

/**
 * ⛔ LE REFUS DE GIT EST LA CONSÉQUENCE, JAMAIS LA CAUSE — et il est TOUJOURS là.
 *
 * Mesuré le 2026-08-24 sur la campagne de 14:23 : le champ n'était plus vide, il portait
 * `error: impossible de pousser des références` — vrai, présent à chaque rouge, et n'apprenant
 * RIEN. Le repêchage s'arrêtait là et le repli ne se déclenchait pas, alors que les six dernières
 * lignes portaient le banc instable et l'erreur hors test. Une ligne qui accompagne tous les rouges
 * ne discrimine aucun d'eux : elle chasse la vraie cause de la place qui lui revient.
 */
const CONSEQUENCE =
  /impossible de pousser|failed to push|error: failed to push/;

/**
 * ⛔ LE REPLI EST OBLIGATOIRE, PAS ORNEMENTAL : quand aucun motif ne prend, les DERNIÈRES lignes
 * non vides partent quand même. Le pré-vol avait déjà ce repli, le verdict ne l'avait pas — la même
 * asymétrie qui rendait la parenthèse vide possible. « Voir mon journal » ne se lit chez personne :
 * un dépôt gelé n'a que ce message.
 */
export function causeDuRouge(sortie) {
  const lignes = String(sortie).split("\n");
  const repechees = lignes
    .filter((l) => MOTIF_CAUSE.test(l) && !CONSEQUENCE.test(l))
    .slice(0, 6);
  if (repechees.length) return repechees;
  const dernieres = lignes.filter((l) => l.trim() !== "").slice(-6);
  if (dernieres.length) return dernieres;
  // ⛔ ET LE VIDE SE DIT, il ne se rend pas. Une liste vide reproduirait la parenthèse muette sous
  // une autre forme : le lecteur verrait « CE QUI A RENDU 1 : » suivi de rien et ne saurait pas si
  // l'extraction a échoué ou si le crochet s'est tu. Les deux appellent des gestes différents.
  return ["(le crochet n'a rien imprimé avant de rendre son code)"];
}
