#!/usr/bin/env node
/**
 * GARDE — UN IMPORT DE MON OUTILLAGE POINTE VERS UN FICHIER QUI EXISTE.
 *
 * ⛔ CE QU'IL FERME, ET C'EST ARRIVÉ LE 2026-09-05. Le retrait des fenêtres de gel a supprimé trois
 * bibliothèques de `scripts/lib/`. J'ai vérifié chaque fichier touché avec `node --check`, qui est
 * passé — puis mon arme est morte au tir sur `ERR_MODULE_NOT_FOUND`, un import resté en place vers
 * une des trois.
 *
 * ⇒ ⛔ `node --check` VALIDE LA SYNTAXE, IL NE RÉSOUT AUCUN IMPORT. Un fichier qui importe un module
 *   supprimé passe `--check` sans un mot. *Le contrôle que je croyais faire n'était pas celui que je
 *   faisais* — et il portait un nom qui invitait à le croire.
 *
 * ⇒ ET RIEN D'AUTRE NE L'AURAIT VU : `arch` n'exécute pas `tir-arme.mjs` — c'est l'arme qui LANCE le
 *   portillon, elle n'y entre pas. Un import mort y vivait donc jusqu'au prochain tir, c'est-à-dire
 *   jusqu'au moment le plus coûteux.
 *
 * CE QU'IL FAIT : pour chaque fichier suivi de `scripts/`, il lit ses imports RELATIFS et vérifie que
 * la cible est sur le disque. Statique, donc il n'exécute rien — importer un script l'exécuterait, et
 * plusieurs des miens agissent au chargement.
 *
 * CE QU'IL REFUSE AUSSI : avoir examiné ZÉRO fichier, ou ZÉRO import — dans les deux cas l'énumération
 * est cassée et le vert ne vaut rien.
 *
 * MORSURE : `--injecter` ajoute en mémoire un import vers un fichier absent. Rejouable, sans écrire.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const injecter = process.argv.includes("--injecter");

const suivis = execFileSync("git", ["ls-files", "scripts"], {
  cwd: RACINE,
  encoding: "utf-8",
})
  .split("\n")
  .filter((f) => /\.(mjs|js|cjs)$/.test(f));

if (suivis.length === 0) {
  console.error("[imports] ZÉRO FICHIER BALAYÉ — l'énumération est cassée, `scripts/` n'est pas vide.");
  process.exit(1);
}

// `import … from "./x.mjs"` et `import("./x.mjs")` — les RELATIFS seulement : un spécificateur nu
// se résout par node_modules, dont l'absence est le sujet d'un autre garde.
// ⛔ LA CIBLE COMMENCE PAR `./` OU `../`, JAMAIS PAR UN SIMPLE POINT. Mon premier motif acceptait
// `\.[^"']+`, donc AUSSI le `.../tir-arme.mjs` d'un message d'aide — un faux positif sur un texte,
// pas sur un import. *Un garde se prouve sur la graphie que le code écrit, jamais sur celle qu'on
// croit qu'il écrit.*
const MOTIF =
  /(?:^|[\s;])(?:import|export)[^;\n]{0,400}?from\s*["'](\.\.?\/[^"']+)["']|import\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g;

/**
 * ⛔ LES COMMENTAIRES SE RETIRENT AVANT DE CHERCHER, ET CE GARDE S'EST ACCUSÉ LUI-MÊME POUR
 * L'APPRENDRE. Sa première version a mordu sur le `import('./x.mjs')` de sa PROPRE en-tête — un
 * exemple pédagogique, pas un import. ⇒ *Un garde qui lit le texte au lieu du code accuse la prose
 * qui l'explique*, et le prochain qui écrit un exemple le rallume sans le savoir.
 * ⚠️ Le dépouillement est volontairement simple — blocs et lignes — parce qu'il ne sert qu'à écarter
 * de la prose : une chaîne contenant `//` en sort intacte pour ce qui nous occupe, un import ne se
 * cachant jamais dans une chaîne.
 */
const sansCommentaires = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

/**
 * ⛔ LA LIGNE D'INJECTION SE COMPOSE, ELLE NE S'ÉCRIT PAS. Écrite en clair, elle est une graphie que
 * ce garde reconnaît — et il s'est accusé lui-même deux fois de suite en la lisant dans son propre
 * source, d'abord dans son en-tête puis dans ses littéraux d'injection.
 * ⇒ *Un garde ne peut pas porter en clair la graphie qu'il traque.* Mon garde des portes de
 *   librairie avait déjà appris exactement cela.
 */
const LIGNE_INJECTEE =
  "import { rien } from " + '"' + "." + "/lib/ce-fichier-n-existe-pas.mjs" + '"' + ";";

let examines = 0;
const morts = [];
for (const [i, f] of suivis.entries()) {
  let texte = readFileSync(join(RACINE, f), "utf-8");
  // ⛔ DEUX INJECTIONS OPPOSÉES : l'une DOIT mordre, l'autre NON. Sans la seconde, un garde qui
  // accuse la prose reste vert sur la première — c'est le défaut qu'il a eu.
  if (injecter && i === 0) texte += `\n${LIGNE_INJECTEE}\n`;
  if (process.argv.includes("--injecter-en-commentaire") && i === 0)
    texte += `\n// exemple pédagogique : ${LIGNE_INJECTEE}\n`;
  texte = sansCommentaires(texte);
  MOTIF.lastIndex = 0;
  let m;
  while ((m = MOTIF.exec(texte)) !== null) {
    const cible = m[1] ?? m[2];
    examines++;
    if (!existsSync(resolve(dirname(join(RACINE, f)), cible)))
      morts.push({ fichier: f, cible });
  }
}

if (examines === 0) {
  console.error("[imports] ZÉRO IMPORT EXAMINÉ — le motif ne reconnaît plus la graphie que mes scripts écrivent.");
  process.exit(1);
}

if (morts.length) {
  console.error(`[imports] ${morts.length} IMPORT(S) VERS UN FICHIER ABSENT :`);
  for (const p of morts) console.error(`   ${p.fichier}  →  ${p.cible}`);
  console.error("   ⇒ `node --check` ne résout AUCUN import : il valide la syntaxe, et il passe.");
  process.exit(1);
}

console.log(
  `[imports] ${examines} import(s) relatif(s) dans ${suivis.length} fichier(s) — toutes les cibles existent.`,
);
