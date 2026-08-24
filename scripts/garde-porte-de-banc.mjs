#!/usr/bin/env node
/**
 * LA PORTE DES SOURCES DE BANC EST UNIQUE — et ce garde en interdit toute autre.
 *
 * ⛔ CE QU'IL FERME, ET POURQUOI CE N'EST PAS UN BALAYAGE. Une source BPScript écrite dans un
 * littéral n'est pas un fichier : le corpus de 329 scènes, qui est mon autre passage obligé, ne peut
 * pas la voir. Le 2026-08-20, un banc de parité a comparé pendant des mois deux arbres issus d'une
 * compilation REFUSÉE (`tuning.maqam_rast`, qui est une GAMME) sans qu'une assertion rougisse.
 *
 * Balayer les littéraux aurait raté le prochain banc. UN PÉRIMÈTRE NE S'ÉLARGIT PAS EN AJOUTANT DES
 * FICHIERS, IL SE FERME EN SUPPRIMANT LES ENTRÉES QUI NE PASSENT PAS PAR LUI (arbitrage de
 * l'architecte, 2026-08-21). Ce garde ne lit donc AUCUNE chaîne de scène : il ne pose qu'une
 * question sur les IMPORTS, et un banc qui l'oublie ne compile pas du tout.
 *
 * LA PORTE : `packages/ui/src/lib/library/scene-de-banc.ts`, seul importateur autorisé du
 * compilateur. Elle expose `sceneQuiPasse` et `sceneQuiEchoue` — le nom dit l'intention, et
 * l'intention est vérifiée.
 *
 * Pattern : scripts/meta-garde-tests.mjs (script `node` autonome, balaie le système de fichiers,
 * ANTI-VACUITÉ, exit 1 si échec), et ses exemptions se déclarent avec un motif ÉCRIT.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ICI = path.dirname(new URL(import.meta.url).pathname);
const RACINE = path.resolve(ICI, "..");

const PORTEE = "packages/ui/src";
const PORTE = "packages/ui/src/lib/library/scene-de-banc.ts";

/** Ce qu'un banc ne doit plus importer : le compilateur amont, et mon mémo qui l'enveloppe. */
const INTERDITS = [
  "bpscript/src/transpiler/index.js",
  "compile-cache",
];

/**
 * Bancs admis HORS de la porte, avec leur raison écrite (≥ 20 caractères).
 *
 * ⛔ UNE EXEMPTION SE DÉCLARE, ELLE NE SE CONSTATE PAS. Un banc laissé hors de la porte en silence
 * est exactement le trou que ce garde ferme.
 */
const HORS_PORTE_ADMIS = new Map([
  [
    "packages/ui/src/lib/library/corpus-compile.test.ts",
    "c'est l'AUTRE passage obligé : il RAPPORTE le statut de chaque scène du corpus au lieu de " +
      "refuser dessus, et distingue l'étage d'analyse de l'étage de dérivation. La porte lèverait " +
      "là où son travail est de nommer.",
  ],
]);

const EXCLUS = new Set(["node_modules", "dist", "build", "test-results"]);

const bancs = [];
const explore = (rel) => {
  let entrees;
  try {
    entrees = readdirSync(path.join(RACINE, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entrees) {
    if (EXCLUS.has(e.name) || e.name.startsWith(".")) continue;
    const sous = `${rel}/${e.name}`;
    if (e.isDirectory()) explore(sous);
    else if (e.name.endsWith(".test.ts")) bancs.push(sous);
  }
};
explore(PORTEE);

let echecs = 0;
const fail = (msg) => {
  echecs++;
  console.error(`FAIL porte-de-banc — ${msg}`);
};

// --- Volet 1 : aucun banc n'importe le compilateur hors de la porte ---------------------------
const fautifs = [];
for (const banc of bancs) {
  if (HORS_PORTE_ADMIS.has(banc)) continue;
  const src = readFileSync(path.join(RACINE, banc), "utf8");
  const trouves = INTERDITS.filter((i) => src.includes(i));
  if (trouves.length > 0) fautifs.push(`${banc} → ${trouves.join(", ")}`);
}
if (fautifs.length > 0) {
  fail(
    `${fautifs.length} banc(s) compilent HORS de la porte. Une source qui n'y passe pas peut être ` +
      `REFUSÉE sans que le banc le sache — il mesure alors sur un arbre que le compilateur rejette, ` +
      `et il est vert pour cette raison même. Passez par \`${PORTE}\` : ` +
      `sceneQuiPasse(source) si le banc affirme qu'elle compile, sceneQuiEchoue(source) si son sujet ` +
      `EST le refus.`,
  );
  for (const f of fautifs) console.error(`       ${f}`);
}

// --- Volet 2 : les exemptions portent un motif écrit -------------------------------------------
const sansMotif = [...HORS_PORTE_ADMIS].filter(
  ([, motif]) => !motif || motif.trim().length < 20,
);
if (sansMotif.length > 0) {
  fail(
    `exemption(s) sans motif écrit (≥ 20 car) : ${sansMotif.map(([f]) => f).join(", ")}`,
  );
}

// --- Volet 3 : ANTI-VACUITÉ, sur les DEUX bouts ------------------------------------------------
// Un garde qui a examiné zéro n'a rien examiné. Et une porte que personne n'emprunte est une porte
// morte : le volet 1 passerait alors trivialement, en disant « aucun banc ne compile hors de la
// porte » alors que plus aucun banc ne compile du tout.
const PLANCHER_BANCS = 60;
if (bancs.length < PLANCHER_BANCS) {
  fail(
    `${bancs.length} banc(s) vu(s), au moins ${PLANCHER_BANCS} attendus : le balayage ne regarde ` +
      `plus au bon endroit (racine changée, extension renommée), pas que le dépôt s'est vidé.`,
  );
}

const emprunteurs = bancs.filter((b) =>
  readFileSync(path.join(RACINE, b), "utf8").includes("scene-de-banc"),
);
const PLANCHER_EMPRUNTEURS = 8;
if (emprunteurs.length < PLANCHER_EMPRUNTEURS) {
  fail(
    `${emprunteurs.length} banc(s) empruntent la porte, au moins ${PLANCHER_EMPRUNTEURS} attendus : ` +
      `une porte que personne n'emprunte rend le volet 1 trivialement vert.`,
  );
}

console.log(
  `${echecs === 0 ? "PASS" : "FAIL"} porte-de-banc — ${bancs.length} banc(s) examiné(s), ` +
    `${emprunteurs.length} empruntent la porte, ${HORS_PORTE_ADMIS.size} exemption(s) motivée(s), ` +
    `${fautifs.length} hors porte.`,
);
process.exit(echecs ? 1 : 0);
