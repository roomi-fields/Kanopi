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
 * Cette ligne est présente à CHAQUE rouge et n'apprend rien. Tant qu'elle est repêchée, elle
 * compte comme une cause trouvée — donc le repli ne se déclenche pas, et une sortie qui n'écrit
 * rien d'autre de reconnaissable rend un champ rempli qui ne discrimine aucun rouge.
 *
 * ⚠️ CE N'EST PAS CE QUI S'EST PASSÉ LE 2026-08-24, ET LE COMMENTAIRE D'ORIGINE LE DISAIT. Je
 * l'avais écrit après avoir lu le journal de la campagne de 14:23 à travers un `tail -40` : sur ce
 * texte amputé, la ligne de git était seule. Le verdict réel, lui, portait bien le banc et son
 * erreur — trois voisins me l'ont rendu mot pour mot. La ligne sort quand même du repêchage : le
 * scénario ci-dessus reste atteignable, mais il n'a pas été observé.
 */
const CONSEQUENCE =
  /impossible de pousser|failed to push|error: failed to push/;

/**
 * ⛔ LE REPLI EST OBLIGATOIRE, PAS ORNEMENTAL : quand aucun motif ne prend, les DERNIÈRES lignes
 * non vides partent quand même. Le pré-vol avait déjà ce repli, le verdict ne l'avait pas — la même
 * asymétrie qui rendait la parenthèse vide possible. « Voir mon journal » ne se lit chez personne :
 * un dépôt gelé n'a que ce message.
 */
/**
 * ⛔ UNE LIGNE QUI ACCUSE N'EST PAS UNE LIGNE QUI EXPLIQUE — ET JE JETAIS LA SECONDE.
 *
 * Mesuré le 2026-08-25, sur un rouge réel : une construction de production a cassé, et le verdict
 * parti aux onze portait exactement ceci —
 *
 *     ✗ Build failed in 19.28s
 *     error during build:
 *
 * …c'est-à-dire DEUX ACCUSATIONS ET AUCUNE CAUSE. La cause vivait juste en dessous, indentée :
 * « ../../../kairos/dist/empreinte.js (3:9): "dirname" is not exported by "__vite-browser-external" ».
 * ⇒ J'ai dû rejouer la construction à la main pour l'écrire au voisin concerné.
 *
 * ⚠️ C'EST LE SYMÉTRIQUE EXACT DU DÉFAUT QU'UN VOISIN A MESURÉ CHEZ LUI LA MÊME NUIT : ses gardes
 * EXPLIQUENT APRÈS AVOIR ACCUSÉ, donc une fenêtre de queue montre la prose et pas le verdict. Chez
 * moi, le repêchage garde l'accusation et jette l'explication — même cause, effet opposé.
 *
 * ⇒ Une ligne repêchée emporte donc les lignes qui la DÉTAILLENT : celles qui sont indentées sous
 *   elle, ou qui ne commencent pas elles-mêmes une nouvelle accusation. Un outil met sa cause en
 *   dessous ; c'est une convention, pas un hasard.
 */
function avecSonDetail(lignes, i) {
  const bloc = [lignes[i]];
  for (let j = i + 1; j < lignes.length && bloc.length < 4; j++) {
    const l = lignes[j];
    if (l.trim() === "") break;
    if (MOTIF_CAUSE.test(l)) break; // une nouvelle accusation se repêche pour elle-même
    bloc.push(l);
  }
  return bloc;
}

export function causeDuRouge(sortie) {
  const lignes = String(sortie).split("\n");
  const repechees = [];
  for (let i = 0; i < lignes.length && repechees.length < 8; i++) {
    if (!MOTIF_CAUSE.test(lignes[i]) || CONSEQUENCE.test(lignes[i])) continue;
    for (const l of avecSonDetail(lignes, i)) if (repechees.length < 8) repechees.push(l);
  }
  if (repechees.length) return repechees;
  const dernieres = lignes.filter((l) => l.trim() !== "").slice(-6);
  if (dernieres.length) return dernieres;
  // ⛔ ET LE VIDE SE DIT, il ne se rend pas. Une liste vide reproduirait la parenthèse muette sous
  // une autre forme : le lecteur verrait « CE QUI A RENDU 1 : » suivi de rien et ne saurait pas si
  // l'extraction a échoué ou si le crochet s'est tu. Les deux appellent des gestes différents.
  return ["(le crochet n'a rien imprimé avant de rendre son code)"];
}
