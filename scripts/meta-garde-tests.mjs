#!/usr/bin/env node
/**
 * MÉTA-GARDE ANTI-CONTOURNEMENT — un fichier À PART, pas un bloc du lanceur.
 *
 * Mandat Romain [845], décision hub/decisions/2026-07-19-confronter-via-oracle-et-restaurer-tous-les-guards.md.
 * Pattern de référence : BPscript/test/test_meta_garde.mjs (mêmes principes, portés à Kanopi).
 *
 * POURQUOI À PART. S'il vivait dans `npm run arch` sans être un fichier lançable seul, il ne
 * pourrait rien dire du portillon lui-même : c'est le portillon qui déciderait de l'exécuter.
 * Un garde qui dépend de ce qu'il surveille n'est pas un garde. Ici il est un script `node`
 * autonome — lancé par `npm run arch` (inclusion par défaut) ET lançable seul.
 *
 * Ce qu'il vérifie réellement (interroge le SYSTÈME DE FICHIERS, pas le rapport d'un lanceur) :
 *   1. tout fichier de test vivant HORS de la portée déclarée des deux lanceurs Kanopi :
 *      - vitest ne lance que `packages/ui/src/**\/*.test.ts` (packages/ui/vitest.config.ts:28) ;
 *      - playwright ne lance que `packages/ui/tests/e2e/**\/*.spec.ts` (packages/ui/playwright.config.ts:47).
 *      Un fichier `.test.ts`/`.spec.ts` ailleurs n'est lancé par RIEN, sauf déclaration explicite
 *      dans HORS_GATE_ADMIS avec un motif écrit ;
 *   2. les entrées de HORS_GATE_ADMIS SANS motif écrit (motif < 20 caractères = pourri, du genre
 *      « retiré pour l'instant » qui ne dit rien) ;
 *   3. ANTI-VACUITÉ : si le balayage voit moins de PLANCHER_TESTS fichiers au total, c'est que le
 *      balayage ne regarde plus au bon endroit (repo déplacé, extension renommée, racines
 *      changées) — PAS que le dépôt est devenu parfait. Le garde échoue plutôt que de devenir un
 *      figurant qui sort toujours zéro trouvé.
 *
 * Il NE RE-DÉRIVE PAS la vérité des lanceurs par magie : les racines de portée ci-dessous sont
 * recopiées à la main depuis les fichiers de config cités — si ces config changent, ce garde doit
 * être mis à jour EN MÊME TEMPS (aucun import partagé possible : les configs sont dans
 * packages/ui, ce script tourne depuis la racine, avant que quoi que ce soit ne soit construit).
 */
import { readdirSync } from "node:fs";
import path from "node:path";

const ICI = path.dirname(new URL(import.meta.url).pathname);
const RACINE = path.resolve(ICI, "..");

// Portée EXACTE des deux lanceurs (recopiée depuis leurs config — voir en-tête).
const PORTEE_VITEST = "packages/ui/src/";
const PORTEE_PLAYWRIGHT = "packages/ui/tests/e2e/";

/** Fichiers de test hors des deux portées ci-dessus, admis avec leur raison écrite (≥ 20 car). */
const HORS_GATE_ADMIS = new Map([
  // Vide au moment T (2026-07-19) : le balayage ne trouve aucun fichier hors-portée réel.
  // Si un jour un fichier de test légitime doit vivre hors de packages/ui/src ou
  // packages/ui/tests/e2e (ex. outil de mise au point sans assertion), le déclarer ICI avec un
  // vrai motif — jamais en le laissant simplement hors-portée en silence.
]);

/** Motif de détection des fichiers de test — calqué sur le pattern de référence bpscript. */
const RE_TEST =
  /(^|\/)(test|spec)[._-].*\.(ts|js|mjs|cjs)$|\.(test|spec)\.(ts|js|mjs|cjs)$/;

const EXCLUS_DOSSIERS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".svelte-kit",
  "test-results",
  "playwright-report",
]);

const trouves = [];
const explore = (rel) => {
  let entries;
  try {
    entries = readdirSync(path.join(RACINE, rel), { withFileTypes: true });
  } catch {
    return; // dossier absent : rien à explorer
  }
  for (const e of entries) {
    if (EXCLUS_DOSSIERS.has(e.name) || e.name.startsWith(".")) continue;
    const sous = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) explore(sous);
    else if (RE_TEST.test(e.name)) trouves.push(sous);
  }
};
explore("");

let echecs = 0;

const estCouvertVitest = (f) =>
  f.startsWith(PORTEE_VITEST) && f.endsWith(".test.ts");
const estCouvertPlaywright = (f) =>
  f.startsWith(PORTEE_PLAYWRIGHT) && f.endsWith(".spec.ts");

const couvertsVitest = trouves.filter(estCouvertVitest);
const couvertsPlaywright = trouves.filter(estCouvertPlaywright);
const nonCouverts = trouves.filter(
  (f) => !estCouvertVitest(f) && !estCouvertPlaywright(f),
);

const horsGateNonAdmis = nonCouverts.filter((f) => !HORS_GATE_ADMIS.has(f));
if (horsGateNonAdmis.length > 0) {
  echecs++;
  console.error(
    `FAIL méta-garde — ${horsGateNonAdmis.length} fichier(s) de test vivent HORS des portées ` +
      `déclarées (${PORTEE_VITEST}**/*.test.ts pour vitest, ${PORTEE_PLAYWRIGHT}**/*.spec.ts pour ` +
      `playwright) et ne sont lancés par RIEN :`,
  );
  for (const f of horsGateNonAdmis) console.error(`       ${f}`);
  console.error(
    "       Déplacez-les dans la portée du lanceur concerné, ou déclarez-les dans HORS_GATE_ADMIS " +
      "avec un motif écrit (≥ 20 caractères).",
  );
}

const admisSansMotif = [...HORS_GATE_ADMIS].filter(
  ([, motif]) => !motif || motif.trim().length < 20,
);
if (admisSansMotif.length > 0) {
  echecs++;
  console.error(
    `FAIL méta-garde — exclusion(s) HORS_GATE_ADMIS sans motif écrit (≥ 20 car) : ${admisSansMotif
      .map(([f]) => f)
      .join(", ")}`,
  );
}

// ANTI-VACUITÉ : le balayage doit voir un nombre significatif de fichiers ; sinon il ne regarde
// plus au bon endroit. Compte réel au moment T : 91 (59 vitest + 32 playwright). Plancher fixé
// nettement en dessous pour tolérer la croissance/suppression normale du repo sans être un
// figurant qui laisserait passer un balayage cassé (0 ou quelques fichiers vus).
const PLANCHER_TESTS = 60;
if (trouves.length < PLANCHER_TESTS) {
  echecs++;
  console.error(
    `FAIL méta-garde — ${trouves.length} fichier(s) de test vu(s), au moins ${PLANCHER_TESTS} ` +
      "attendus : le balayage ne regarde plus au bon endroit (racines/motif cassés), pas que le " +
      "dépôt est devenu parfait.",
  );
}

console.log(
  `${echecs === 0 ? "PASS" : "FAIL"} méta-garde — ${trouves.length} test(s) vu(s) ` +
    `(${couvertsVitest.length} couverts vitest, ${couvertsPlaywright.length} couverts playwright, ` +
    `${nonCouverts.length - horsGateNonAdmis.length} hors-gate admis motivés).`,
);
process.exit(echecs ? 1 : 0);
