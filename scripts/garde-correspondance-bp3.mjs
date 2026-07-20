#!/usr/bin/env node
/**
 * GARDE DE COHÉRENCE INTERNE DE LA TABLE DE CORRESPONDANCE BP3 — un fichier À PART.
 *
 * Arbitrage architecte [878], suite au trou que j'avais remonté : la table
 * `packages/library/test-assets/bp3/correspondance.json` VIT CHEZ MOI, mais son garde
 * (bp3-engine/scripts/gate-correspondance.py) tourne CHEZ BP3-ENGINE. Résultat : on cassait la
 * table dans MON dépôt et mon portillon passait au vert.
 *
 * CE N'EST PAS UNE COPIE DU GARDE AMONT — c'est un garde DIFFÉRENT sur un objet DIFFÉRENT.
 * Écrit sans lire une ligne du sien. Le partage arbitré :
 *   · ICI, la COHÉRENCE INTERNE : la table existe, elle se parse, chaque chemin qu'elle
 *     référence existe dans MON arbre, et chaque `.gr` de scenes/BP3-tests a une entrée.
 *     Répondre à ça ne demande AUCUNE connaissance de bp3-engine — mon seul dépôt suffit.
 *   · CHEZ BP3-ENGINE, la VÉRITÉ SÉMANTIQUE (les couples décrits sont-ils les vrais couples ?).
 *     Je ne peux pas la vérifier et je ne dois pas essayer. Si ce fichier se met un jour à
 *     juger la JUSTESSE d'un couple, il a débordé — le supprimer plutôt que l'étendre.
 *
 * POURQUOI LA TABLE MÉRITE UN GARDE (à ne pas perdre de vue en le lisant) : elle est la SEULE
 * porteuse du couple grammaire↔auxiliaires. Le renommage `-gr.trial.mohanam` → `mohanam.gr`,
 * obligatoire pour que le scan de la bibliothèque voie les fichiers, a détruit le nom partagé
 * qui le portait. Et les en-têtes des `.gr` ne peuvent PAS le remplacer : le moteur les lit
 * pour les SAUTER (CompileGrammar.c:251) et elles mentent pour 20 des 113. Voir l'en-tête de
 * correspondance.json lui-même.
 *
 * Pattern : scripts/meta-garde-tests.mjs et scripts/anti-retrocompat-garde.mjs (script `node`
 * autonome, balaie le système de fichiers, ANTI-VACUITÉ, exit 1 si échec).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ICI = path.dirname(new URL(import.meta.url).pathname);
const RACINE = path.resolve(ICI, "..");

const TABLE = "packages/library/test-assets/bp3/correspondance.json";
const DOSSIER_GRAMMAIRES = "packages/library/scenes/BP3-tests";

let echecs = 0;
const fail = (msg) => {
  echecs++;
  console.error(`FAIL correspondance — ${msg}`);
};

// --- Volet 1 : la table existe et se parse ----------------------------------------------------
// Sans elle, plus rien ne dit quel auxiliaire va avec quelle grammaire. Sa disparition doit
// rougir le portillon, pas passer inaperçue.

if (!existsSync(path.join(RACINE, TABLE))) {
  console.error(
    `FAIL correspondance — ${TABLE} est ABSENTE. C'est la SEULE porteuse du couple ` +
      "grammaire↔auxiliaires (le renommage a détruit le nom partagé, et les en-têtes des .gr " +
      "mentent pour 20 des 113). Restaurez-la ; ne la reconstruisez pas depuis les en-têtes.",
  );
  process.exit(1);
}

let table;
try {
  table = JSON.parse(readFileSync(path.join(RACINE, TABLE), "utf8"));
} catch (e) {
  console.error(
    `FAIL correspondance — ${TABLE} ne se parse pas : ${e.message}`,
  );
  process.exit(1);
}

const entrees = Array.isArray(table.grammaires) ? table.grammaires : null;
if (!entrees) {
  console.error(
    `FAIL correspondance — ${TABLE} n'a pas de liste \`grammaires\` : sa forme a changé, ` +
      "ce garde ne sait plus la lire (il vaut mieux échouer que faire semblant de vérifier).",
  );
  process.exit(1);
}

// ANTI-VACUITÉ : une table vidée de ses entrées passerait tous les tests d'existence ci-dessous
// sans rien vérifier. Plancher nettement sous le compte réel (113 au moment T).
const PLANCHER_ENTREES = 80;
if (entrees.length < PLANCHER_ENTREES) {
  fail(
    `${entrees.length} entrée(s) dans la table, au moins ${PLANCHER_ENTREES} attendues : la ` +
      "table a été vidée ou tronquée, ce n'est pas que le corpus a rétréci.",
  );
}

// --- Volet 2 : chaque chemin référencé existe dans MON arbre -------------------------------
// Le cas concret : quelqu'un déplace ou supprime un auxiliaire chez moi, la table pointe dans
// le vide, et plus rien ne permet de reconstituer le couple.

const racineChemins = table.racine_des_chemins ?? "packages/library";
const resoudre = (rel) => path.join(RACINE, racineChemins, rel);

const cheminsMorts = [];
let nbAux = 0;
for (const e of entrees) {
  if (e.grammaire && !existsSync(resoudre(e.grammaire))) {
    cheminsMorts.push(`${e.nom} → ${e.grammaire} (grammaire)`);
  }
  for (const [facette, aux] of Object.entries(e.auxiliaires ?? {})) {
    if (!aux?.chemin) continue;
    nbAux++;
    if (!existsSync(resoudre(aux.chemin))) {
      cheminsMorts.push(`${e.nom} → ${aux.chemin} (${facette})`);
    }
  }
}

if (cheminsMorts.length > 0) {
  fail(
    `${cheminsMorts.length} chemin(s) de la table ne correspondent à AUCUN fichier de cet arbre :`,
  );
  for (const c of cheminsMorts.slice(0, 20)) console.error(`       ${c}`);
  if (cheminsMorts.length > 20) {
    console.error(`       … et ${cheminsMorts.length - 20} autre(s)`);
  }
}

// --- Volet 3 : les deux ensembles de noms coïncident ------------------------------------------
// Dans les DEUX sens, parce que les deux dérives sont réelles et opposées :
//   · une grammaire versée sans entrée = orpheline, ses auxiliaires sont introuvables ;
//   · une entrée sans grammaire = fantôme, elle décrit un couple qui n'existe plus.

const surDisque = new Set(
  readdirSync(path.join(RACINE, DOSSIER_GRAMMAIRES))
    .filter((f) => f.endsWith(".gr"))
    .map((f) => f.slice(0, -3)),
);
const dansTable = new Set(entrees.map((e) => e.nom));

const orphelines = [...surDisque].filter((n) => !dansTable.has(n));
const fantomes = [...dansTable].filter((n) => !surDisque.has(n));

if (orphelines.length > 0) {
  fail(
    `${orphelines.length} grammaire(s) de ${DOSSIER_GRAMMAIRES} n'ont AUCUNE entrée dans la ` +
      `table (leurs auxiliaires sont donc introuvables) : ${orphelines.slice(0, 10).join(", ")}` +
      (orphelines.length > 10 ? " …" : ""),
  );
}
if (fantomes.length > 0) {
  fail(
    `${fantomes.length} entrée(s) de la table décrivent une grammaire ABSENTE de ` +
      `${DOSSIER_GRAMMAIRES} : ${fantomes.slice(0, 10).join(", ")}` +
      (fantomes.length > 10 ? " …" : ""),
  );
}

console.log(
  `${echecs === 0 ? "PASS" : "FAIL"} correspondance — ${entrees.length} grammaire(s), ` +
    `${nbAux} référence(s) d'auxiliaires, ${surDisque.size} .gr sur disque ; ` +
    `${cheminsMorts.length} chemin(s) mort(s), ${orphelines.length} orpheline(s), ` +
    `${fantomes.length} fantôme(s).`,
);
process.exit(echecs ? 1 : 0);
