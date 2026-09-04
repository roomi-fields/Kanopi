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
//     · **un relevé tué ne doit pas laisser douze dépôts gelés** — c'est la famille du marqueur
//       d'ouverture qui survivait à sa trace, un cran plus loin.
//       ⛔⛔ ET MA PREMIÈRE RÉDACTION ÉTAIT FAUSSE, relevée par runtime-ui pendant que je mesurais :
//       j'avais écrit « la fenêtre porte un PLAFOND, elle se lève seule », et `--minutes` N'EN EST
//       PAS UN. La tour SIGNALE la péremption, elle ne ferme pas — `hub/tour.cjs`, dans `purgerFenetresPerimees` : « ON SIGNALE,
//       ON NE FERME PAS. La fenêtre RESTE ouverte : seul son propriétaire la lève. »
//       ⇒ Ma phrase de sécurité était la seule chose qui aurait empêché les douze de s'en
//         apercevoir : ils auraient attendu l'heure en confiance.
//       ⇒ Ce qui tient la promesse est donc ICI : je ferme en partant, sur la sortie du processus ET
//         sur les interruptions. Reste le coup net, qu'aucun programme n'intercepte — et le motif le
//         dit plutôt que de le taire.
//     · **l'exemption est NOMMÉE** — elle ne vaut que pour LA fenêtre que CE relevé vient d'ouvrir,
//       jamais pour « une fenêtre ». D'où le refus en tête qui vaut AUSSI pour une fenêtre à mon
//       nom : une fenêtre kanopi déjà ouverte est une campagne, ou une trace morte, et on n'empile
//       pas. Puis l'identifiant écrit dans le motif, relu après ouverture.
//     · et **la durée est dite dans l'avis**, pour que le destinataire décide s'il attend ou s'il
//       pousse d'abord.

import { execFileSync } from "node:child_process";
import { existsSync, rmSync, readFileSync, writeFileSync } from "node:fs";
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
 * ⛔ LA DURÉE DÉCLARÉE, ET ELLE EST LARGE EXPRÈS. Ce n'est PAS un plafond : la tour la traite comme un
 * PLANCHER annoncé et signale sa péremption sans fermer. Trop courte, elle fait partir aux douze un
 * message qui leur PROPOSE de lever ma fenêtre — donc de tuer ma mesure — et elle m'attire des
 * demandes « où en es-tu » qu'un chiffre juste aurait évitées.
 *
 * ⛔ ELLE A MENTI LE 2026-09-04, ET LA FORME DU MENSONGE EST INSTRUCTIVE : déclarée à 50 minutes, la
 * mesure en a pris 58 — la tour a signalé la péremption, et kronos a demandé où j'en étais alors que
 * mes bancs d'écran tournaient encore. *Une durée écrite en dur ne suit pas la suite qu'elle décrit* :
 * ma suite d'écran a grossi depuis, et ce nombre est resté. ⇒ 80 la porte, et la marge n'est pas du
 * confort : elle est ce qui sépare une fenêtre longue d'une fenêtre qu'on croit abandonnée.
 *
 * ⚠️ La borne juste serait dérivée — la durée du dernier relevé, majorée — et non écrite. Reporté ;
 * une constante qu'on relève à la main se re-périme au prochain banc ajouté.
 */
/** Ce que j'annonce, et qui n'est pas le plafond : la durée ATTENDUE, celle sur laquelle on décide. */

/** L'identifiant de CETTE ouverture — c'est lui qui rend l'exemption nommée, jamais « une fenêtre ». */

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

// ⛔ JE NE DÉCLARE PLUS DE PÉRIMÈTRE — 2026-09-04. Ce bloc demandait à mon arme les racines que je
// lis et les dépôts à geler, puis refusait de tracer sur un périmètre vide. Les deux servaient
// EXCLUSIVEMENT à remplir une fenêtre de gel, et je n'en ouvre plus : mes voisins se lisent en
// copie figée, donc leur écriture ne peut plus atteindre ma mesure.
// ⇒ ⛔ Le garder aurait été le pire cas : sans fenêtre à remplir, un périmètre exigé devient une
//   condition qui ne peut plus être satisfaite — le relevé aurait refusé de tracer à chaque
//   passage. *Un garde dont la condition disparaît ne devient pas inoffensif : il devient
//   toujours vrai.*

// ⛔ LE MOTIF EST MORT AVEC LA FENÊTRE — 2026-09-04. Il portait ce que je demandais aux douze gelés :
// la durée, le geste retenu, le coût réel. Sans gel, il n'a plus de destinataire.
// ⇒ Ce qu'il aura appris, et qui survit ailleurs : il a été FAUX quatre fois en un jour — sur qui je
//   lis, sur ce que je gèle, sur ce que ma fenêtre coûte vraiment, et sur une promesse de fermeture
//   que le code ne tenait pas. Chaque fois, un voisin l'a mesuré et me l'a rendu.
// ⇒ ⇒ *Une ligne qui vit dans un générateur revient longtemps après avoir cessé d'être vraie* — et la
//   seule parade qui a marché n'est pas la relecture, c'est qu'on la republie assez souvent pour que
//   quelqu'un la contredise.

// ⛔ JE N'OUVRE PLUS DE FENÊTRE, ET CE N'EST PAS UNE SIMPLIFICATION — 2026-09-04. Ce bloc demandait à
// la tour de geler douze dépôts le temps de ma mesure, parce que mon portillon CHARGE le construit de
// mes voisins : une republication changeait ce qu'il exécute, donc ce qu'il écrit, donc ma trace.
//
// ⇒ CE QUI A REMPLACÉ LE GEL : `tour last` pose sous `.last/<voisin>/` une COPIE FIGÉE de leur état
//   publié, et mon manifeste la déclare. Ce que je lis ne peut plus changer tant que je ne rappelle
//   pas la commande — donc je n'ai plus rien à demander à personne. *La garantie vient de la copie,
//   pas d'une promesse tenue par douze dépôts.*
//
// ⛔ ET L'INTERDICTION EST EXPLICITE : « aucune fenêtre de gel n'est nécessaire, et il ne faut plus en
//   ouvrir » — l'architecte, le jour où mes relevés à fenêtre ont été suspendus. Ce qu'elles coûtaient
//   est mesuré : une de mes fenêtres a gelé douze dépôts pendant 57 minutes pour un verdict NUL, et
//   kronos est resté à l'arrêt total quatre-vingts minutes parce que chez lui publier et pousser sont
//   liés — mon « poussez librement, ne publiez pas » ne lui laissait aucun des deux gestes.
//
// ⚠️ CE QUE JE PERDS, ET JE LE NOMME : ma mesure ne dit plus rien de l'état VIVANT de mes voisins.
//   Elle porte sur les versions inscrites dans `.last/VERSIONS.json`, et c'est exactement ce qu'on lui
//   demande — une mesure de MON portillon, prise sur un amont qui ne bouge pas sous elle.

// ⛔ CE QUI VIVAIT ICI EST MORT AVEC L'OUVERTURE — 2026-09-04, et l'élagage se fait dans le mouvement
// qui le rend mort. Trois pièces y répondaient au gel :
//   · la RELECTURE de la fenêtre — « une ouverture qu'on ne relit pas est une ouverture supposée » ;
//   · sa FERMETURE sur la sortie, parce que ce script a cinq chemins de sortie ;
//   · sa fermeture sur SIGINT/SIGTERM/SIGHUP, qui portait une promesse que je ne tenais pas — un
//     appel synchrone rendait le gestionnaire injoignable pendant l'essentiel de la mesure.
//
// ⇒ Aucune des trois n'a de sujet sans fenêtre. Les garder aurait produit le pire cas : la relecture
//   ne trouve jamais de fenêtre à mon nom, donc elle refuse de tracer À CHAQUE FOIS — un relevé qui
//   ne peut plus rien mesurer, pour protéger un gel qui n'existe plus.
// ⚠️ *Un garde dont la condition disparaît ne devient pas inoffensif : il devient toujours vrai.*

// ⛔ LE VERDICT AUX GELÉS EST MORT AVEC LE GEL — 2026-09-04. Il partait aux douze parce que douze
// subissaient ma fenêtre : « une levée sans verdict ne dit PAS tout va bien, elle dit que la fenêtre
// est fermée ». Sans fenêtre, personne n'attend, et un message à qui n'attend rien est du bruit.
// ⇒ Ce que la leçon garde : *un gelé qui n'a pas demandé n'a pas renoncé à savoir.* Elle vaudra pour
//   le mécanisme qui remplace celui-ci, si jamais il fait attendre quelqu'un.


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
