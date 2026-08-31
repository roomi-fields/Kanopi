#!/usr/bin/env node
// TRACER MON PORTILLON — HORS FENÊTRE, ET SEULEMENT QUAND IL A CHANGÉ.
//
// ⛔ CE QUE CE GESTE RÉPOND, ET POURQUOI IL EST SÉPARÉ DE MA CAMPAGNE. Un gel demande au voisin de ne
// pas écrire ; rien ne le demande à MON portillon, qui construit et efface sous l'arbre que certains
// lisent en source. La première mesure, le 2026-08-30 : 12 074 chemins écrits sous `packages`, la
// racine même qu'un voisin avait déclaré lire chez moi une heure plus tôt.
//
// ⇒ Prise DANS la campagne, la réponse coûtait +26 % — quatre minutes et demie de gel en plus pour
//   douze dépôts, à chaque tir, pour une question qui ne se repose qu'au changement. Décision de
//   méthode de l'architecte : elle sort de la fenêtre, le verdict renvoie au dernier relevé daté, et
//   ⛔ elle est OBLIGATOIRE APRÈS TOUT CHANGEMENT DE PORTILLON. Le garde `garde-releve-du-portillon`
//   refuse le portillon tant que le relevé ne décrit pas le portillon d'aujourd'hui.
//
// ⚠️ ET CE GESTE ÉCRIT, LUI AUSSI — il fait tourner le portillon en entier, donc il pose les mêmes
// douze mille chemins sous `packages`. C'est le prix de la décision, et il est rare par
// construction : une frappe de portillon, pas une campagne.
//
// ⛔⛔ IL OUVRE SA PROPRE FENÊTRE, ET LA PHRASE D'AVANT ÉTAIT UN PIÈGE. Elle disait « hors fenêtre »
// en entendant DEUX choses à la fois : ne pas tracer pendant celle d'un voisin (juste, et gardé), et
// n'en ouvrir aucune (faux, et coûteux). Mesuré le 2026-08-31, deux fois de suite : la suite entière
// a tourné vingt-six minutes, un voisin a reconstruit en plein milieu, et le résultat portait sur
// deux états — donc sur aucun. ⇒ **Le seul geste de trente minutes de ma chaîne était le seul sans
// aucune protection**, et il est obligatoire précisément les jours où je travaille.
//
// ⇒ La forme existait déjà, et je ne l'avais pas appliquée là : le garde de fenêtre de la tour saute
//   déjà la fenêtre du demandeur (`hub/tools/garde-fenetre.sh`, la ligne qui compare `qui` à `MOI`).
//   Une fenêtre que J'OUVRE ne me gèle donc pas — rien à changer chez personne.
//
// ⇒ ⛔ DEUX CONDITIONS, POSÉES PAR L'ARCHITECTE LE 2026-08-31 EN AUTORISANT CE GESTE :
//     · **la fenêtre porte un PLAFOND** — elle se lève seule, même si ce relevé meurt en route. Un
//       relevé tué laisserait sinon douze dépôts gelés sans que personne sache pourquoi ; c'est la
//       famille du marqueur d'ouverture qui survivait à sa trace, un cran plus loin.
//     · **l'exemption est NOMMÉE** — elle ne vaut que pour LA fenêtre que CE relevé vient d'ouvrir,
//       jamais pour « une fenêtre ». D'où le refus en tête qui vaut AUSSI pour une fenêtre à mon
//       nom : une fenêtre kanopi déjà ouverte est une campagne, ou une trace morte, et on n'empile
//       pas. Puis l'identifiant écrit dans le motif, relu après ouverture.
//     · et **la durée est dite dans l'avis**, pour que le destinataire décide s'il attend ou s'il
//       pousse d'abord.

import { execFileSync } from "node:child_process";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ecrituresSous, parRacineDeTete } from "./lib/ecritures-du-portillon.mjs";
import { attributionDuRouge } from "./lib/cause-du-rouge.mjs";
import {
  empreinteDuPortillon,
  ecrireReleve,
  lireReleve,
  estUneMesure,
  CHEMIN_DU_RELEVE,
} from "./lib/releve-du-portillon.mjs";

const RACINE = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const TOUR = join(process.env.HOME, "dev", "bp", "hub", "tour");

/**
 * ⛔ LE PLAFOND, ET IL EST LARGE EXPRÈS. La suite d'écran seule a mesuré 26,6 min le 2026-08-31, le
 * portillon entier tourne autour de 32. Un plafond trop court se lève PENDANT la mesure et rend le
 * problème qu'il ferme ; il ne coûte rien de trop puisque le relevé ferme sa fenêtre en partant.
 */
const PLAFOND_MIN = 50;
/** Ce que j'annonce, et qui n'est pas le plafond : la durée ATTENDUE, celle sur laquelle on décide. */
const DUREE_ANNONCEE = "environ 35 minutes";

/** L'identifiant de CETTE ouverture — c'est lui qui rend l'exemption nommée, jamais « une fenêtre ». */
const CE_RELEVE = `releve-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;

let fenetres;
try {
  fenetres = JSON.parse(
    execFileSync(TOUR, ["fenetre", "--json"], {
      encoding: "utf8",
      env: { ...process.env, BP_AGENT: "kanopi" },
    }),
  );
} catch (e) {
  // ⛔ UNE TOUR INJOIGNABLE N'EST PAS UNE ABSENCE DE FENÊTRE. Un contrôle qui prend une panne pour un
  // feu vert est pire que pas de contrôle (formule de bpscript, 2026-08-30).
  console.error(`⛔ la tour n'a pas répondu — je ne trace pas : ${e.message}`);
  process.exit(2);
}
// ⛔ AUCUNE FENÊTRE OUVERTE, PAS MÊME LA MIENNE. Celle d'un voisin gèlerait ma mesure ; une à mon
// nom est une campagne en cours ou une trace morte, et empiler deux ouvertures kanopi est l'accident
// que mon arme garde déjà de son côté.
if (fenetres.length) {
  console.error(
    "⛔ UNE FENÊTRE EST DÉJÀ OUVERTE — je ne trace pas :\n" +
      fenetres
        .map((f) => `   ${f.demandeur} jusqu'à ${f.fin} · ${(f.depots ?? []).join(", ")}`)
        .join("\n") +
      "\n   Ce relevé OUVRE la sienne : il ne s'ajoute jamais à une autre, la mienne comprise.",
  );
  process.exit(1);
}

const { empreinte, pieces, bancs } = empreinteDuPortillon();
const quand = new Date().toISOString();
console.log(
  `TRACE DU PORTILLON — empreinte ${empreinte} (${pieces} pièce(s) de définition, ${bancs} banc(s)), départ ${quand}`,
);

// ⛔ CE QUE JE LIS SE DÉCLARE, ET LA RÉPONSE VIENT DE L'ARME — jamais d'une liste recopiée ici.
//
// Mesuré le 2026-08-31 en éprouvant ce mécanisme : sans `--racines`, la tour REFUSE d'ouvrir dès
// qu'un dépôt gelé porte un fichier non enregistré N'IMPORTE OÙ. Onze dépôts refusés, dont dix pour
// la MÊME fiche de skill diffusée par atlas — pas une seule sous une racine que mon portillon lit.
// Le critère n'était pas faux, il était au mauvais niveau : « dépôt sale » là où il faut « racine
// lue sale ». C'est le trou que mon arme avait déjà nommé le 2026-08-21, et je le rencontrais ici
// pour la première fois.
//
// ⇒ ⛔ ET LA RÉPONSE NE SE RECOPIE PAS : `tir-arme.mjs --releve-racines` DÉRIVE l'union par les mêmes
//   fonctions que sa fenêtre de campagne. Une seconde liste écrite ici dériverait de la première, et
//   c'est un verdict qui porterait sur un périmètre que personne n'a mesuré. Le drapeau n'appelle ni
//   la tour ni aucun gel : il dérive, il imprime, il sort.
const demanderALArme = (drapeau) => {
  try {
    return execFileSync("node", [join(RACINE, "scripts", "tir-arme.mjs"), drapeau], {
      encoding: "utf8",
      env: { ...process.env, BP_AGENT: "kanopi" },
    })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch (e) {
    console.error(`⛔ mon arme n'a pas rendu \`${drapeau}\` — je ne trace pas : ${e.message}`);
    process.exit(2);
  }
};
const racinesLues = demanderALArme("--releve-racines");
// ⛔ ET LES DÉPÔTS AVEC : la tour refuse des racines sans dépôts, et elle a raison de le refuser —
// « sinon tu gèles les quinze pour ce que tu lis chez trois ». Les deux moitiés vont ensemble.
const depotsGeles = demanderALArme("--releve-depots");
// ⛔ UN PÉRIMÈTRE VIDE N'EST PAS UN PÉRIMÈTRE : la tour le lirait comme « je ne lis rien », donc
// n'opposerait aucun refus, et ma fenêtre protégerait ce qu'elle nomme — rien.
if (racinesLues.length === 0 || depotsGeles.length === 0) {
  console.error(
    `⛔ PÉRIMÈTRE VIDE — ${depotsGeles.length} dépôt(s), ${racinesLues.length} racine(s). ` +
      "Une fenêtre qui ne déclare rien ne protège rien.",
  );
  process.exit(2);
}

// ⛔ LE MOTIF DIT LA DURÉE, ET C'EST UNE CONDITION, PAS UNE POLITESSE. Posée par l'architecte le
// 2026-08-31 : une fenêtre de trente-cinq minutes n'est pas une fenêtre de campagne, et le
// destinataire doit pouvoir décider s'il attend ou s'il pousse d'abord.
const MOTIF =
  "RELEVÉ DE PORTILLON — je mesure ce que MON portillon écrit sous mon arbre, une fois, parce qu'il " +
  `a changé. Durée attendue : ${DUREE_ANNONCEE} ; la fenêtre se lève seule au bout de ` +
  `${PLAFOND_MIN} minutes même si je meurs en route. ` +
  "⛔ CE QUE JE VOUS DEMANDE : ne RECONSTRUISEZ pas pendant ce temps. Écrivez, commitez, poussez si " +
  "ça ne republie rien chez vous — c'est votre CONSTRUCTION qui me bascule, parce que je vous lis " +
  "vivants. Une reconstruction en cours de route fait porter ma mesure sur deux états, donc sur " +
  "aucun, et vingt-six minutes sont perdues : c'est arrivé deux fois ce soir. " +
  "⚠️ ET JE GÈLE PLUS LARGE QUE MA CAMPAGNE, DÉLIBÉRÉMENT : elle ne vise que les voisins en " +
  "chantier, parce qu'un tir se retarde. Un relevé ne se retarde pas — il se prend quand le " +
  "portillon a changé — donc il vise TOUS ceux que je lis, y compris ceux qui se taisent depuis " +
  "une heure. Si vous ne me construisez rien, il ne vous coûte rien : poussez d'abord si vous " +
  "préférez, et dites-le-moi. " +
  `⌁ identifiant de cette ouverture : ${CE_RELEVE}`;

// ⛔ L'OUVERTURE EST UNE CONDITION, PAS UNE FORMALITÉ : si la tour refuse, je NE TRACE PAS. Tracer
// quand même serait exactement le geste sans protection que ce bloc existe pour retirer.
try {
  execFileSync(
    TOUR,
    [
      "fenetre", "ouvrir", "kanopi",
      "--minutes", String(PLAFOND_MIN),
      "--lit", "disque",
      "--depots", depotsGeles.join(","),
      "--racines", racinesLues.join(","),
      "--motif", MOTIF,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, BP_AGENT: "kanopi" } },
  );
} catch (e) {
  // La RAISON du refus, jamais la commande qui a échoué — la tour parle sur ses deux sorties.
  const dit = [e.stderr, e.stdout].map((x) => String(x ?? "").trim()).filter(Boolean).join(" · ");
  console.error(`⛔ LA TOUR A REFUSÉ MA FENÊTRE — je ne trace pas :\n   ${dit || e.message}`);
  process.exit(2);
}

// ⛔ ET ON RELIT CE QUI EST OUVERT : l'exemption vaut pour LA fenêtre que ce relevé vient d'ouvrir,
// nommée par son identifiant. Une ouverture qu'on ne relit pas est une ouverture supposée, et le
// portillon tournerait trente minutes en croyant être protégé.
const miennes = (() => {
  try {
    return JSON.parse(
      execFileSync(TOUR, ["fenetre", "--json"], {
        encoding: "utf8",
        env: { ...process.env, BP_AGENT: "kanopi" },
      }),
    );
  } catch {
    return null;
  }
})();
if (!miennes?.some((f) => String(f.motif ?? "").includes(CE_RELEVE))) {
  console.error(
    `⛔ MA FENÊTRE N'EST PAS OUVERTE — la tour a répondu sans elle (${CE_RELEVE}). Je ne trace pas.`,
  );
  fermerMaFenetre();
  process.exit(2);
}
console.log(`  ⟨fenêtre⟩ ouverte pour ${CE_RELEVE}, plafond ${PLAFOND_MIN} min, gel large.`);

// ⛔ LA FERMETURE SE POSE UNE FOIS, SUR LA SORTIE — jamais recopiée à chaque `process.exit`. Ce
// script a cinq chemins de sortie et il en gagnera d'autres ; un appel oublié sur l'un d'eux
// laisserait douze dépôts gelés jusqu'au plafond, pour une trace déjà finie. Le plafond couvre la
// mort brutale, ce crochet couvre les sorties propres, et les deux ensemble ne laissent aucun trou.
process.on("exit", fermerMaFenetre);

/** Ferme la fenêtre de CE relevé. Idempotente : une fenêtre déjà levée n'est pas une erreur. */
function fermerMaFenetre() {
  if (fermerMaFenetre.faite) return;
  fermerMaFenetre.faite = true;
  try {
    execFileSync(TOUR, ["fenetre", "fermer", "kanopi"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BP_AGENT: "kanopi" },
    });
    console.log(`  ⟨fenêtre⟩ fermée (${CE_RELEVE}).`);
  } catch {
    /* elle a expiré d'elle-même au plafond — rien à fermer, et c'est un cas nominal */
  }
}

// ⛔ LE RELEVÉ PRÉCÉDENT SE GARDE EN MAIN — UNE TENTATIVE RATÉE NE DOIT PAS DÉTRUIRE UNE MESURE
// VALIDE. Mesuré le 2026-08-30 : deux traces de suite ont rendu 1 pour des causes qui ne sont pas
// le portillon — du courrier arrivé pendant l'une, l'arbre sale d'un voisin pendant l'autre. Chacune
// écrasait le fichier. Un troisième essai réussi n'aurait rien restauré du tout.
//
// ⛔ ET CE QU'ON GARDE EN MAIN DOIT ÊTRE UNE MESURE, PAS N'IMPORTE QUEL RELEVÉ. Mesuré le 2026-08-31 :
// une trace tuée en route a laissé son marqueur `enCours` seul sur le disque ; la trace suivante l'a
// relu ici, l'a réécrit tel quel plus bas, et a annoncé « le relevé précédent est INTACT ». La phrase
// était fausse et la mesure était déjà perdue. `estUneMesure` écarte le marqueur et le plancher pris
// sur un rouge ; l'empreinte n'entre pas dans la question, puisque ce qu'on garde est par nature le
// relevé d'AVANT.
const surLeDisque = lireReleve();
const ancien = estUneMesure(surLeDisque) ? surLeDisque : null;

// ⛔ LE RELEVÉ S'OUVRE AVANT DE MESURER, ET IL PORTE DÉJÀ L'EMPREINTE DU JOUR. Sans ça, le garde
// refuserait le portillon que cette trace est justement en train de faire tourner, et la mesure
// s'arrêterait à sa première étape. ⇒ S'il meurt en route, `enCours` reste avec un pid mort et le
// garde refuse : une trace commencée n'est pas une trace faite.
ecrireReleve({ quand, empreinte, enCours: true, pid: process.pid });

const TRACE = join(tmpdir(), `kanopi-trace-portillon-${process.pid}.txt`);
const JOURNAL = join(tmpdir(), `kanopi-portillon-${process.pid}.log`);
let sortie = "?";
try {
  // ⛔ LA SORTIE DU PORTILLON SE GARDE ENTIÈRE DANS UN FICHIER, ET ELLE S'AFFICHE AUSSI. Ma première
  // reprise a été lancée derrière un `tail -12` : le portillon a nommé sa cause en toutes lettres et
  // je ne l'ai pas vue. Une sonde tronquée rend une conclusion fausse — ici, « rouge sans cause ».
  execFileSync(
    "bash",
    [
      "-c",
      `cd ${RACINE} && { if command -v strace >/dev/null 2>&1; then ` +
        `strace -f -y -qq -s 512 --seccomp-bpf -e trace=openat,open,creat,rename,renameat,renameat2,unlink,unlinkat,mkdir,mkdirat,link,linkat,symlink,symlinkat,truncate -o ${TRACE} bash .githooks/pre-push; ` +
        `else bash .githooks/pre-push; fi; } 2>&1 | tee ${JOURNAL}; exit \${PIPESTATUS[0]}`,
    ],
    { encoding: "utf8", stdio: "inherit", maxBuffer: 256 * 1024 * 1024 },
  );
  sortie = "0";
} catch (e) {
  sortie = String(e.status ?? "?");
}

// ⛔ UN ROUGE QUI N'EST PAS LE MIEN NE DOIT PAS ÉCRASER UNE MESURE VALIDE. Le marqueur est la PHRASE
// que le refus écrit, jamais une déduction sur l'étape — et la liste des phrases vit chez
// `cause-du-rouge.mjs`, éprouvée, partagée avec mon arme. Elle en portait deux jusqu'au 2026-08-30,
// où bpx a reconstruit son `dist` sous cette trace : 245 entrées, un refus juste, et une attribution
// « la cause est chez moi » sous un verdict qui le nommait en toutes lettres.
if (sortie !== "0") {
  const journal = lireTexte(JOURNAL);
  const attribution = attributionDuRouge(journal);
  if (ancien) ecrireReleve(ancien);
  else ecrireReleve({ quand, empreinte, sortieDuPortillon: sortie, mesure: null, pourquoi: "portillon rouge" });
  rmSync(TRACE, { force: true });
  rmSync(JOURNAL, { force: true });
  console.error(
    `⛔ RIEN MESURÉ — le portillon a rendu ${sortie}. ` +
      attribution.phrase +
      (ancien
        ? "\n   Le relevé précédent est INTACT : une tentative ratée n'écrase pas une mesure valide."
        : surLeDisque?.enCours
          ? "\n   Aucune mesure à garder : le disque ne portait qu'un MARQUEUR d'ouverture, laissé par une" +
            "\n   trace tuée en route. La mesure d'avant était déjà perdue quand celle-ci a commencé."
          : "\n   Aucun relevé précédent à garder — le portillon reste refusé jusqu'à une trace complète."),
  );
  process.exit(1);
}

if (!existsSync(TRACE)) {
  ecrireReleve({
    quand,
    empreinte,
    sortieDuPortillon: sortie,
    mesure: null,
    pourquoi: "aucune trace produite — traceur absent",
  });
  console.log("⚠️ NON MESURÉ — aucune trace produite (traceur absent ?). Relevé écrit tel quel.");
  process.exit(0);
}

const r = ecrituresSous(TRACE, RACINE);
const par = parRacineDeTete(r.chemins, RACINE);
const horsGit = r.relatifs.filter((x) => !/\s\.git\//.test(x));

ecrireReleve({
  quand,
  empreinte,
  sortieDuPortillon: sortie,
  mesure: {
    appelsExamines: r.examinees,
    appelsEcrivants: r.ecrivantes,
    cheminsSousMonArbre: r.chemins.length,
    parRacineDeTete: Object.fromEntries(
      [...par.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, v.length]),
    ),
    relatifsNonResolus: r.relatifs.length,
    relatifsHorsGit: horsGit.length,
    echantillonHorsGit: horsGit.slice(0, 10),
  },
});
rmSync(TRACE, { force: true });

rmSync(JOURNAL, { force: true });

console.log(
  `RELEVÉ ÉCRIT — ${CHEMIN_DU_RELEVE}\n` +
    `  portillon sorti en ${sortie} · ${r.examinees} appel(s) examiné(s), ${r.ecrivantes} écrivant(s)\n` +
    `  ${r.chemins.length} chemin(s) sous mon arbre : ` +
    [...par.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([k, v]) => `${k} (${v.length})`)
      .join(" · ") +
    `\n  ${r.relatifs.length} relatif(s) non résolus, dont ${horsGit.length} hors de .git/`,
);

/** Le journal du portillon, ou une chaîne vide — une lecture qui jette ne doit pas masquer le rouge. */
function lireTexte(chemin) {
  try {
    return readFileSync(chemin, "utf-8");
  } catch {
    return "";
  }
}
