#!/usr/bin/env node
/**
 * LE MAILLON `arch` DU PORTILLON — il paie le MAXIMUM de ses gardes, jamais leur somme.
 *
 * ⛔ CE QU'IL REMPLACE, ET POURQUOI LA SOMME ÉTAIT LE DÉFAUT. `arch` enchaînait vingt-deux commandes
 * par `&&`, donc en série et avec arrêt au premier rouge. Deux conséquences, et la seconde est pire :
 *   · le temps était la SOMME de gardes qui ne se lisent pas l'un l'autre ;
 *   · la mesure du coût était FAUSSE — un enchaînement qui s'arrête au premier refus chronomètre un
 *     portillon interrompu. J'ai mesuré « 11 s » avant de m'apercevoir que la somme réelle des mêmes
 *     gardes est de 80 s : le rouge tombait au quatrième. *Une durée relevée sur un enchaînement
 *     court-circuité mesure l'endroit où il s'est arrêté, pas ce qu'il coûte.*
 *
 * ⛔ ET LE GAIN NE SE CHIFFRE PAS EN SECONDES ICI — RETIRÉ LE 2026-09-04, LE JOUR MÊME. J'avais écrit
 *   « 80 s → 18,9 s, ×4,2 » : deux durées AU MUR sur une machine à douze cœurs portant seize sessions.
 *   Quatre dépôts ont mesuré la même journée que ces durées varient du simple au double sur le même
 *   code, et l'architecte a retiré son propre chiffre pour la même raison. *Un rapport de durées sur
 *   une machine partagée n'est pas une mesure : c'est un instantané de charge.*
 *
 * ⇒ CE QUI RESTE VRAI SANS DÉPENDRE D'AUCUNE CHARGE, et qui se lit dans un seul tir :
 *     · le nombre d'attentes successives passe de N à UN par groupe — *la somme devient le maximum* ;
 *     · un lanceur `npm run` est retiré de chaque maillon, ce qui supprime du travail, pas de l'attente.
 *
 * ⚠️ LE PROFIL, LUI, RESTE UNE INFORMATION — c'est un RAPPORT entre postes, pas une durée absolue, et
 *   il survit à la charge qui les multiplie tous : l'amorçage de mes processus node pèse ~7 % du total,
 *   contre les deux tiers chez BPscript dont 212 gardes chargent un compilateur. C'est ce rapport, et
 *   lui seul, qui dit que le processus partagé ne paierait presque rien ici et que le parallélisme
 *   paie. ⇒ *Une recette se reprend avec sa mesure, jamais avec sa conclusion.*
 *
 * ⛔ LES DEUX CONDITIONS NON NÉGOCIABLES, ET ELLES SONT LA RAISON D'ÊTRE DE CE FICHIER :
 *   1. LE REFUS NOMME QUI REFUSE. Un lot parallèle qui rend « 1 » sans nom est indistinguable d'un
 *      refus survenu ailleurs, et le lecteur cherche au mauvais endroit.
 *   2. L'ABSENCE DE VERDICT REFUSE. Un garde qui n'a pas déposé de code de sortie n'a pas fini, ou il
 *      est mort avant d'écrire. Le compter comme vert serait exactement le faux vert qu'on combat.
 *
 * ⛔ ET UN GARDE QUI ÉCRIT NE PART PAS AVEC LES AUTRES. La déclaration se lit DANS le garde —
 *   `// @isole` en tête, la convention du hub — et non dans une liste ici : une liste est une seconde
 *   autorité, et elle se périme sans rougir. Ceux-là passent en série, avant les autres.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, "..");

/**
 * Les maillons, dans l'ordre où ils étaient enchaînés.
 *
 * ⚠️ CETTE LISTE EST ÉCRITE, ET C'EST UN DÉFAUT QUE JE NOMME PLUTÔT QUE DE LE TAIRE. La forme juste
 * serait un dossier `scripts/gardes/` que l'on énumère — une liste recopiée se périme quand un garde
 * s'ajoute ailleurs, et rien ne rougit. Elle est ici parce que `scripts/` porte AUSSI mon arme et mon
 * relevé : pointer un lanceur sur le dossier entier déclencherait une campagne. Le déplacement est
 * reporté au registre ; d'ici là, cette liste est celle que `package.json` portait, déplacée sans être
 * réécrite.
 */
const MAILLONS = [
  ["deps-fraicheur", "node", ["scripts/deps-fraicheur.mjs"]],
  ["releve-des-voisins", "node", ["scripts/garde-releve-des-voisins.mjs"]],
  ["filet-de-nullite", "node", ["scripts/garde-filet-de-nullite.mjs"]],
  ["etat-pris", "node", ["scripts/garde-etat-pris.mjs"]],
  ["eprouve:qualifier-ecriture", "node", ["scripts/lib/qualifier-ecriture.mjs", "--eprouver"]],
  ["eprouve:releve-des-ecritures", "node", ["scripts/lib/releve-des-ecritures.mjs", "--eprouver"]],
  ["eprouve:gel-recu", "node", ["scripts/lib/gel-recu.mjs", "--eprouver"]],
  ["eprouve:cause-du-rouge", "node", ["scripts/lib/cause-du-rouge.mjs", "--eprouver"]],
  ["eprouve:voisins-lus-par-chemin", "node", ["scripts/lib/voisins-lus-par-chemin.mjs", "--eprouver"]],
  ["eprouve:ecritures-du-portillon", "node", ["scripts/lib/ecritures-du-portillon.mjs", "--eprouver"]],
  ["eprouve:releve-du-portillon", "node", ["scripts/lib/releve-du-portillon.mjs", "--eprouver"]],
  ["releve-du-portillon", "node", ["scripts/garde-releve-du-portillon.mjs"]],
  ["chemins-sortants", "node", ["scripts/garde-chemins-sortants.mjs"]],
  ["depcruise", "npx", [
    "depcruise",
    "packages/ui/src/**/*.{ts,svelte}",
    "packages/core/src/**/*.js",
    "--config", ".dependency-cruiser.cjs",
    "--output-type", "err",
  ]],
  ["hote-runtimes", "node", ["scripts/arch-hote-runtimes.mjs"]],
  ["meta-garde-tests", "node", ["scripts/meta-garde-tests.mjs"]],
  ["anti-retrocompat", "node", ["scripts/anti-retrocompat-garde.mjs"]],
  ["correspondance-bp3", "node", ["scripts/garde-correspondance-bp3.mjs"]],
  ["porte-de-banc", "node", ["scripts/garde-porte-de-banc.mjs"]],
  ["copies-miroir", "node", ["scripts/garde-copies-miroir.mjs"]],
  ["portes-de-librairie", "node", ["scripts/garde-portes-de-librairie.mjs"]],
  // ⛔ LE GARDE DE TRAVERSÉE ET CELUI DES SOURCES VOISINES ONT ÉTÉ RETIRÉS D'ICI LE 2026-09-04. Je les
  // appelais en direct ; depuis `f8995aa9`, le point d'entrée partagé du hub les porte — et il les
  // appelle avec `--depot`, que mes appels ne passaient pas. Deux exemplaires du même garde, dont le
  // mien était le moins correct.
  // ⚠️ EN REVANCHE LE GARDE DE FENÊTRE RESTE DANS MON CROCHET, en tête, et ce n'est PAS un doublon :
  //   il est sorti du point d'entrée le même jour (`83c263b4`) parce que celui-ci est appelé depuis
  //   `verify` — un gel doit refuser une POUSSÉE, jamais une vérification locale. Le crochet est son
  //   seul site correct.
];

/** ⛔ La déclaration se lit DANS le garde — jamais ici. Illisible ⇒ on n'affirme rien : on isole. */
function estIsole([, commande, args]) {
  const fichier = args.find((a) => /\.(mjs|js|py)$/.test(a));
  if (!fichier) return false;
  try {
    return /^\s*(\/\/|#)\s*@isole\b/m.test(
      readFileSync(join(RACINE, fichier), "utf8").slice(0, 2048),
    );
  } catch {
    try {
      return /^\s*(\/\/|#)\s*@isole\b/m.test(readFileSync(fichier, "utf8").slice(0, 2048));
    } catch {
      return true;
    }
  }
}

function lancer([nom, commande, args]) {
  return new Promise((resoudre) => {
    const debut = Date.now();
    const p = spawn(commande, args, { cwd: RACINE, encoding: "utf8" });
    let sortie = "";
    p.stdout.on("data", (d) => (sortie += d));
    p.stderr.on("data", (d) => (sortie += d));
    // ⛔ `code` est NUL quand un signal a tué le processus : c'est précisément « pas de verdict ».
    p.on("close", (code, signal) => {
      resoudre({ nom, code: signal ? null : code, signal, sortie, ms: Date.now() - debut });
    });
    p.on("error", (e) => {
      resoudre({ nom, code: null, signal: null, sortie: `⛔ ${e.message}`, ms: Date.now() - debut });
    });
  });
}

const isoles = MAILLONS.filter(estIsole);
const paralleles = MAILLONS.filter((m) => !estIsole(m));

const debut = Date.now();
const resultats = [];
// Les gardes qui écrivent, d'abord et un par un — ils ne partagent rien avec personne.
for (const m of isoles) resultats.push(await lancer(m));
// Puis tout le reste ensemble : le coût devient celui du plus lent.
resultats.push(...(await Promise.all(paralleles.map(lancer))));

const total = ((Date.now() - debut) / 1000).toFixed(1);
const refus = resultats.filter((r) => r.code !== 0);

for (const r of resultats.sort((a, b) => b.ms - a.ms).slice(0, 3))
  console.log(`[arch] ${r.nom} — ${(r.ms / 1000).toFixed(1)} s`);

if (refus.length) {
  console.error(
    `\n[arch] ⛔ ${refus.length} maillon(s) sur ${resultats.length} REFUSENT — ${total} s :\n`,
  );
  for (const r of refus) {
    // ⛔ CONDITION 2 : un maillon sans code de sortie n'a PAS fini. Il ne se compte pas vert.
    const verdict =
      r.code === null
        ? `AUCUN VERDICT${r.signal ? ` (tué par ${r.signal})` : ""} — il n'a pas fini, ou il est mort avant d'écrire`
        : `code ${r.code}`;
    console.error(`  ✗ ${r.nom} — ${verdict}`);
    console.error(
      r.sortie
        .trimEnd()
        .split("\n")
        .map((l) => `      ${l}`)
        .join("\n"),
    );
    console.error("");
  }
  process.exit(1);
}

console.log(
  `[arch] vert — ${resultats.length} maillon(s) en ${total} s ` +
    `(${isoles.length} isolé(s), ${paralleles.length} ensemble).`,
);
