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

/**
 * ⛔ À QUI LE ROUGE APPARTIENT — trois attributions, et la troisième manquait.
 *
 * Le marqueur est la PHRASE que le refus écrit, jamais une déduction sur l'étape qui a rendu 1.
 *
 * ⛔ CE QU'ELLE A COÛTÉ, MESURÉ LE 2026-08-30 : bpx a reconstruit son `dist` pendant ma trace —
 * 245 entrées remplacées — et mon relevé de fin de campagne a refusé, à raison. Mais mes deux
 * appelants ne connaissaient que DEUX causes étrangères, alors ils ont écrit « la cause est chez
 * moi » sous un verdict qui nommait bpx en toutes lettres. ⇒ Un refus juste sous une attribution
 * fausse envoie chercher un défaut là où il n'y en a pas.
 *
 * ⇒ ET ELLE VIT ICI PARCE QU'ELLE VIVAIT EN DEUX EXEMPLAIRES — `tir-arme.mjs` et
 *   `trace-du-portillon.mjs` portaient chacun sa copie du test. Le troisième cas n'a été ajouté à
 *   aucune des deux, ce qui est exactement ce qu'une voie parallèle produit.
 */
const ATTRIBUTIONS = [
  {
    qui: "voisin",
    marqueur: "UN VOISIN A BASCULÉ PENDANT CETTE CAMPAGNE",
    phrase:
      "Un VOISIN a reconstruit pendant la mesure : le résultat porte sur deux états, donc sur " +
      "aucun. Ce n'est pas un défaut d'ici, et ça ne se relance pas à l'aveugle.",
  },
  {
    qui: "voisin",
    marqueur: "CONSTRUCTION DE PRODUCTION REFUSÉE",
    phrase:
      "La cause est l'arbre de travail d'un VOISIN, pas mon portillon : sa construction est " +
      "refusée tant qu'il n'enregistre pas.",
  },
  {
    qui: "courrier",
    marqueur: "message(s) NON LU(S)",
    phrase: "La cause est mon COURRIER non lu, arrivé pendant la mesure.",
  },
];

/**
 * Rend `{ qui, phrase }` — `qui` vaut `voisin`, `courrier` ou `moi`. `moi` est le DÉFAUT, et c'est
 * voulu : une attribution qui se replierait sur « un voisin » disculperait par ignorance.
 */
export function attributionDuRouge(sortie) {
  const texte = String(sortie);
  for (const a of ATTRIBUTIONS)
    if (texte.includes(a.marqueur)) return { qui: a.qui, phrase: a.phrase };
  // ⛔ « CI-DESSOUS », PARCE QUE C'EST LÀ QU'ELLE S'IMPRIME. La phrase disait « ci-dessus » et l'appelant
  // l'écrit AVANT la cause : au premier pré-vol rouge de la nuit, la ligne était la PREMIÈRE du journal
  // et renvoyait à un vide. J'ai cherché la cause ailleurs qu'à l'endroit où elle était.
  return { qui: "moi", phrase: "La cause est chez moi — elle est écrite ci-dessous." };
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⛔ L'ÉPREUVE — ce module DISAIT exister pour être éprouvé, et rien ne l'exerçait.
//
// Mesuré le 2026-08-30 : un seul appelant (`tir-arme.mjs`), aucun banc, aucun `--eprouver`. Son
// en-tête décrivait la raison de son extraction comme si elle avait été honorée. Un commentaire se
// relit comme une preuve.
//
// Les cas sont ÉCRITS À LA MAIN, jamais dérivés d'une sortie captée : un juge dérivé de l'accusé
// confirme ce qu'il devait trouver. Le contrôle POSITIF compte autant que les refus — un
// extracteur qui rendrait toujours quelque chose serait vert sur chaque cas et n'aurait rien prouvé.
if (process.argv[2] === "--eprouver") {
  const cas = [];
  const verifier = (quoi, obtenu, attendu) =>
    cas.push({ quoi, ok: JSON.stringify(obtenu) === JSON.stringify(attendu), obtenu, attendu });

  // ── L'ATTRIBUTION, sur les quatre issues et dans les deux sens.
  const att = (s) => attributionDuRouge(s).qui;
  verifier(
    "un voisin qui BASCULE pendant la mesure est attribué au voisin",
    att("Test Files 83 passed\nError: UN VOISIN A BASCULÉ PENDANT CETTE CAMPAGNE — bpx : 245"),
    "voisin",
  );
  verifier(
    "un arbre de voisin SALE est attribué au voisin",
    att("[gate] build…\n⛔ CONSTRUCTION DE PRODUCTION REFUSÉE — kairos : 2 non enregistré(s)"),
    "voisin",
  );
  verifier(
    "mon courrier non lu est attribué au courrier, jamais à mon code",
    att("[gate] tour inbox…\n⛔ 3 message(s) NON LU(S) — lis avant de pousser"),
    "courrier",
  );
  verifier(
    "un rouge SANS marqueur étranger reste à moi — l'attribution ne disculpe pas par ignorance",
    att("FAIL src/lib/x.test.ts\n  • attendu 3, obtenu 4"),
    "moi",
  );
  verifier(
    "une sortie VIDE reste à moi",
    att(""),
    "moi",
  );
  // ⛔ LE TÉMOIN QUI DISCRIMINE LES DEUX MARQUEURS DE VOISIN : ils ne rendent pas la même phrase,
  // et les confondre effacerait la différence entre « il n'a pas enregistré » et « il a reconstruit
  // sous moi » — deux gestes différents attendus de lui.
  verifier(
    "les deux causes de voisin ne rendent pas la même phrase",
    attributionDuRouge("UN VOISIN A BASCULÉ PENDANT CETTE CAMPAGNE").phrase ===
      attributionDuRouge("CONSTRUCTION DE PRODUCTION REFUSÉE").phrase,
    false,
  );

  // ── L'EXTRACTION de la cause.
  // La forme réelle du rouge du 2026-08-25 : l'accusation, sa cause indentée, puis une ligne vide.
  verifier(
    "une accusation emporte le détail INDENTÉ sous elle",
    causeDuRouge("[gate] build…\n✗ Build failed in 19.28s\n    dirname is not exported\n\nsuite"),
    ["✗ Build failed in 19.28s", "    dirname is not exported"],
  );
  // ⛔ ET LA BORNE DANS L'AUTRE SENS, sinon « emporte le détail » ne se distingue pas de « emporte
  // les trois lignes suivantes » : une LIGNE VIDE arrête le bloc, une NOUVELLE accusation aussi et
  // se repêche pour elle-même.
  verifier(
    "une ligne vide arrête le détail",
    causeDuRouge("✗ premier\n\nune prose qui suit"),
    ["✗ premier"],
  );
  verifier(
    "une nouvelle accusation arrête le détail et se repêche seule",
    causeDuRouge("✗ premier\nFAIL second\n    son détail"),
    ["✗ premier", "FAIL second", "    son détail"],
  );
  verifier(
    "le refus de git est la CONSÉQUENCE et ne compte pas comme cause",
    causeDuRouge("error: impossible de pousser\n[warn] Code style issues found"),
    ["[warn] Code style issues found"],
  );
  verifier(
    "sans aucun motif, les dernières lignes non vides partent quand même",
    causeDuRouge("une prose\n\nsans motif reconnaissable"),
    ["une prose", "sans motif reconnaissable"],
  );
  verifier(
    "une sortie muette se DIT, elle ne rend pas une liste vide",
    causeDuRouge("").length > 0,
    true,
  );

  const rates = cas.filter((c) => !c.ok);
  if (cas.length === 0) {
    console.error("[cause-du-rouge] AUCUN CAS EXÉCUTÉ — l'épreuve n'a rien prouvé.");
    process.exit(1);
  }
  for (const c of cas) console.log(`  ${c.ok ? "✓" : "✗"} ${c.quoi}`);
  if (rates.length) {
    for (const c of rates)
      console.error(`    attendu ${JSON.stringify(c.attendu)}, obtenu ${JSON.stringify(c.obtenu)}`);
    process.exit(1);
  }
  console.log(
    `  ✓ ${cas.length} cas — l'attribution rend les trois causes étrangères et retombe sur MOI par défaut.`,
  );
}
