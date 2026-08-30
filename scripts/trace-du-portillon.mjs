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
// douze mille chemins sous `packages`, sans fenêtre pour protéger qui me lit. C'est le prix de la
// décision, et il est rare par construction : une frappe de portillon, pas une campagne.

import { execFileSync } from "node:child_process";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ecrituresSous, parRacineDeTete } from "./lib/ecritures-du-portillon.mjs";
import {
  empreinteDuPortillon,
  ecrireReleve,
  lireReleve,
  CHEMIN_DU_RELEVE,
} from "./lib/releve-du-portillon.mjs";

const RACINE = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const TOUR = join(process.env.HOME, "dev", "bp", "hub", "tour");

// ⛔ HORS FENÊTRE VEUT DIRE : AUCUNE FENÊTRE OUVERTE, PAS SEULEMENT PAS LA MIENNE. Une trace lancée
// pendant qu'un voisin mesure ferait exactement ce que ce relevé sert à documenter.
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
if (fenetres.length) {
  console.error(
    "⛔ UNE FENÊTRE EST OUVERTE — je ne trace pas :\n" +
      fenetres
        .map((f) => `   ${f.demandeur} jusqu'à ${f.fin} · ${(f.depots ?? []).join(", ")}`)
        .join("\n") +
      "\n   Ce relevé se prend HORS fenêtre : le prendre pendant celle d'un autre le gèlerait pour ma mesure.",
  );
  process.exit(1);
}

const { empreinte, pieces, bancs } = empreinteDuPortillon();
const quand = new Date().toISOString();
console.log(
  `TRACE DU PORTILLON — empreinte ${empreinte} (${pieces} pièce(s) de définition, ${bancs} banc(s)), départ ${quand}`,
);

// ⛔ LE RELEVÉ PRÉCÉDENT SE GARDE EN MAIN — UNE TENTATIVE RATÉE NE DOIT PAS DÉTRUIRE UNE MESURE
// VALIDE. Mesuré le 2026-08-30 : deux traces de suite ont rendu 1 pour des causes qui ne sont pas
// le portillon — du courrier arrivé pendant l'une, l'arbre sale d'un voisin pendant l'autre. Chacune
// écrasait le fichier. Un troisième essai réussi n'aurait rien restauré du tout.
const ancien = lireReleve();

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
// que le refus écrit, jamais une déduction sur l'étape : mon arme tient déjà la même distinction.
if (sortie !== "0") {
  const journal = lireTexte(JOURNAL);
  const duVoisin = journal.includes("CONSTRUCTION DE PRODUCTION REFUSÉE");
  const courrier = journal.includes("message(s) NON LU(S)");
  if (ancien) ecrireReleve(ancien);
  else ecrireReleve({ quand, empreinte, sortieDuPortillon: sortie, mesure: null, pourquoi: "portillon rouge" });
  rmSync(TRACE, { force: true });
  rmSync(JOURNAL, { force: true });
  console.error(
    `⛔ RIEN MESURÉ — le portillon a rendu ${sortie}. ` +
      (duVoisin
        ? "La cause est l'arbre de travail d'un VOISIN, pas mon portillon : sa construction est refusée tant qu'il n'enregistre pas."
        : courrier
          ? "La cause est mon COURRIER non lu, arrivé pendant la trace."
          : "La cause est chez moi — elle est écrite ci-dessus.") +
      (ancien
        ? "\n   Le relevé précédent est INTACT : une tentative ratée n'écrase pas une mesure valide."
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
