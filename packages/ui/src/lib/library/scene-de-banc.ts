// LA PORTE PAR OÙ UNE SOURCE BPSCRIPT ENTRE DANS UN BANC — et il n'y en a qu'une.
//
// ⛔ POURQUOI ELLE EXISTE. Le 2026-08-20, mon banc de parité comparait deux arbres issus d'une
// compilation REFUSÉE : sa scène écrivait `tuning.maqam_rast`, or `maqam_rast` est une GAMME et le
// catalogue des accordages ne l'a jamais portée. Le compilateur répondait « introuvable » depuis
// toujours ; le banc ne regardait pas `errors` ; les deux chemins recevaient le même arbre bancal,
// donc ils étaient identiques, donc il était VERT. Son sujet — la parité sur un alphabet non anglais
// avec son accordage — avait disparu sans qu'une assertion rougisse.
//
// MON CORPUS DE 329 SCÈNES NE POUVAIT PAS L'ATTRAPER : la source n'est pas un fichier, elle vit dans
// un littéral. Trois portes mènent une source BPScript chez moi — le corpus par `import.meta.glob`
// (passage obligé, gardé), le compilateur importé directement par treize bancs, et le mémo
// `compileBps`. Les deux dernières n'avaient AUCUN passage. Celle-ci les remplace.
//
// ⛔ ET UN PÉRIMÈTRE NE S'ÉLARGIT PAS EN AJOUTANT DES FICHIERS, IL SE FERME EN SUPPRIMANT LES ENTRÉES
// QUI NE PASSENT PAS PAR LUI (arbitrage de l'architecte, 2026-08-21). Balayer les littéraux aurait
// raté le prochain banc ; ici, un banc qui n'emprunte pas cette porte ne compile pas du tout.
//
// LE NOM DIT L'INTENTION, ET L'INTENTION EST VÉRIFIÉE. C'est la règle du rouge d'intention — un rouge
// ne prouve que s'il échoue pour SA raison — posée DANS la porte au lieu d'être répétée dans chaque
// banc.
import { compileToBPxAST } from 'bpscript';

// ⛔ LA PORTE RELAIE LE TYPE DE L'AMONT, ELLE N'EN INVENTE PAS UN. Écrite d'abord avec un retour
// `unknown`, elle a fait rougir cinq contrôles de typage : les bancs passent l'arbre à des fonctions
// qui attendent un `SceneAST`, et ma porte leur rendait un sac vide. Une porte qui APPAUVRIT ce
// qu'elle transmet oblige chaque appelant à réinventer une conversion — donc à ré-ouvrir la
// frontière qu'elle est censée tenir.
type Compilation = ReturnType<typeof compileToBPxAST>;
type ArbreDeScene = NonNullable<Compilation['ast']>;

interface Erreur {
  message?: string;
}

/** Ce que le compilateur a répondu, sans jugement — usage interne aux deux portes. */
function compiler(source: string, environnement?: { tempo?: number }): Compilation {
  return compileToBPxAST(source, environnement);
}

function citer(erreurs: Erreur[]): string {
  return erreurs.map((e) => e.message ?? String(e)).join(' | ');
}

/**
 * L'ARBRE D'UNE SOURCE DONT LE BANC AFFIRME QU'ELLE PASSE.
 *
 * Refuse sur deux faces, et les deux sont nécessaires :
 *   · `errors` non vide — le banc mesurerait sur un arbre que le compilateur rejette ;
 *   · arbre ABSENT — la porte de BPscript cessera d'en rendre un quand elle refuse (décision de
 *     Romain, 2026-08-19). Le banc doit alors échouer en DISANT POURQUOI, jamais sur un accès à
 *     `null` dont le message ne nomme rien.
 */
export function sceneQuiPasse(source: string, environnement?: { tempo?: number }): ArbreDeScene {
  const r = compiler(source, environnement);
  const erreurs = (r.errors ?? []) as Erreur[];
  if (erreurs.length > 0) {
    throw new Error(
      `LA SOURCE DE CE BANC EST REFUSÉE — il mesurerait sur un arbre que le compilateur rejette : ${citer(erreurs)}`
    );
  }
  if (r.ast == null) {
    throw new Error(
      'COMPILATION SANS ERREUR ET SANS ARBRE — la porte amont a changé de contrat ; ce banc ne peut ' +
        'mesurer que ce qui existe.'
    );
  }
  return r.ast;
}

/**
 * LES ERREURS D'UNE SOURCE DONT LE BANC AFFIRME QU'ELLE EST REFUSÉE.
 *
 * ⛔ C'EST LE VOLET LE PLUS FORT DES DEUX. Un banc de refus verdit le jour où sa source cesse d'être
 * fautive POUR UNE AUTRE RAISON — un renommage déplace le sujet, un cri neuf le rend illégal
 * autrement — et rien ne le signale : il refuse toujours, donc il passe toujours. Exiger que
 * `errors` soit non vide ne suffit pas à l'empêcher, mais l'exiger ICI le rend impossible à oublier.
 *
 * L'arbre n'est pas rendu : ce que le banc en fait le regarde, et il y accède par sa propre lecture.
 */
export function sceneQuiEchoue(
  source: string,
  environnement?: { tempo?: number }
): { erreurs: Erreur[]; ast: Compilation['ast'] } {
  const r = compiler(source, environnement);
  const erreurs = (r.errors ?? []) as Erreur[];
  if (erreurs.length === 0) {
    throw new Error(
      "LA SOURCE DE CE BANC N'EST PLUS REFUSÉE — le banc affirme un refus que le compilateur ne " +
        'prononce plus. Son sujet a disparu : le retourner ou le retirer, jamais le laisser vert.'
    );
  }
  return { erreurs, ast: r.ast };
}
