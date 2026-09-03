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
import { readdirSync, readFileSync } from "node:fs";
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

// ⛔ UN BANC DÉSARMÉ RESTE VERT DES DEUX CÔTÉS — mesuré le 2026-09-04 par injection.
//   `describe.skip` posé sur un bloc de `tempo.test.ts` : ce méta-garde a rendu « 126 test(s) vus »,
//   inchangé — il compte des DÉCLARATIONS dans le texte, et un test sauté reste déclaré — et vitest
//   a rendu « Test Files 1 passed », parce qu'un test sauté n'est pas un test rouge. Personne ne
//   voyait rien. (Le cas voisin, un fichier qui ne se CHARGE plus, est bien attrapé : vitest rougit
//   sur « Failed to resolve import ». Et un fichier déplacé HORS PORTÉE mord au contrôle ci-dessus.
//   C'était le seul des trois angles sans gardien.)
//
// CE QUI PASSE, ET C'EST LA SEULE FORME ADMISE : un saut CONDITIONNEL motivé —
//   `test.skip(!isProd, 'requires KANOPI_BASE_URL…')`. Il dit à quelle condition le cas ne
//   s'applique pas, et il s'exécute partout ailleurs. Un `it.skip('…')` ne dit rien et ne
//   s'exécute jamais : c'est un banc retiré du service sans que rien ne le signale.
//   `it.fails` n'est pas concerné — il EXÉCUTE, et exige l'échec ; le jour où le cas passe, vitest
//   le dit. C'est une exception qui expire seule, l'inverse d'un saut.
// ⛔ ET IL EXIGE UNE DATE, PARCE QU'UN COMMENTAIRE N'EXPIRE PAS. Ma première rédaction refusait tout
//   saut, et elle était TROP LARGE : les quatre sauts vivants ici portent leur motif juste au-dessus,
//   en commentaire — « la forme qui préserverait ces réglages n'existe pas encore dans le parseur,
//   sera revue avec FaustX ». Une description fausse d'une situation juste envoie corriger le mauvais
//   objet. ⇒ Mais le défaut de fond restait : ce motif ne rougit JAMAIS. Le jour où FaustX arrive,
//   rien ne rappelle ces bancs, et ils dorment un mois de plus. Un `it.fails` expire seul ; un saut
//   commenté, non. ⇒ La date le rend mortel : le garde la lit et REFUSE au-delà de PEREMPTION_JOURS.
const PEREMPTION_JOURS = 90;
const RE_SAUT =
  /\b(?:describe|it|test)\.only\b|\b(?:describe|it)\.skip\s*\(|\btest\.skip\s*\(\s*['"`]|\bx(?:it|describe)\s*\(/;
const RE_TOUJOURS_REFUSE = /\b(?:describe|it|test)\.only\b/; // `.only` éteint TOUS les autres
const RE_DATE = /\b(20\d\d)-(\d\d)-(\d\d)\b/;
const sansCommentaires = (t) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, " ");

/** Le motif d'un saut se lit dans les lignes de COMMENTAIRE qui le précèdent immédiatement — c'est
 *  là qu'il s'écrit vraiment, et un garde se prouve sur la graphie que le code écrit. */
const motifAuDessus = (brutes, i) => {
  const bloc = [];
  for (let k = i - 1; k >= 0; k--) {
    const l = brutes[k].trim();
    if (l.startsWith("//") || l.startsWith("*") || l.startsWith("/*"))
      bloc.unshift(l);
    else break;
  }
  return bloc.join(" ");
};

const desarmes = [];
let sautsExamines = 0;
for (const f of [...couvertsVitest, ...couvertsPlaywright]) {
  const brutes = readFileSync(path.join(RACINE, f), "utf-8").split("\n");
  const nues = sansCommentaires(brutes.join("\n")).split("\n");
  nues.forEach((l, i) => {
    if (!RE_SAUT.test(l)) return;
    sautsExamines++;
    const ou = `${f}:${i + 1}`;
    const extrait = l.trim().slice(0, 72);
    if (RE_TOUJOURS_REFUSE.test(l))
      return desarmes.push(`${ou} — ${extrait}\n         (un \`.only\` ÉTEINT tous les autres cas)`);
    const motif = motifAuDessus(brutes, i);
    const d = motif.match(RE_DATE);
    if (!d)
      return desarmes.push(
        `${ou} — ${extrait}\n         (aucune DATE dans le motif au-dessus : rien ne le fera expirer)`,
      );
    const jours = Math.floor((Date.now() - Date.parse(d[0])) / 86400000);
    if (jours > PEREMPTION_JOURS)
      desarmes.push(
        `${ou} — ${extrait}\n         (motif du ${d[0]}, soit ${jours} jours : PÉRIMÉ au-delà de ${PEREMPTION_JOURS})`,
      );
  });
}
// ⛔ CE SOUS-GARDE COMPTE CE QU'IL A EXAMINÉ. Zéro saut vu n'est pas « aucun saut » : c'est un motif
//   qui ne reconnaît plus la graphie que le code écrit, ou une liste de fichiers vide. Le plancher
//   est à UN parce que la population réelle vaut quatre au 2026-09-04 ; le jour où le dernier saut
//   part, cette ligne rougit et se retire avec lui — c'est voulu, elle dit alors la vérité.
if (sautsExamines === 0) {
  echecs++;
  console.error(
    "FAIL méta-garde — ZÉRO saut examiné : le motif ne reconnaît plus la graphie des sauts, ou la " +
      "liste de fichiers est vide. Un garde qui n'a rien regardé ne prouve rien.",
  );
}

if (desarmes.length > 0) {
  echecs++;
  console.error(
    `FAIL méta-garde — ${desarmes.length} banc(s) DÉSARMÉ(S) sans motif daté et vivant : ils sont ` +
      "déclarés, comptés ici, et ne mesurent rien. Ni ce garde ni le lanceur ne rougit dessus.",
  );
  for (const d of desarmes) console.error(`       ${d}`);
  console.error(
    `       ⇒ Réparer le cas et retirer le saut ; ou écrire au-dessus un motif portant sa DATE ` +
      `(AAAA-MM-JJ), qui rougira de lui-même passé ${PEREMPTION_JOURS} jours ; ou, si la condition ` +
      "est mesurable, un saut CONDITIONNEL : `test.skip(<condition>, '<raison>')`.",
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
    `${nonCouverts.length - horsGateNonAdmis.length} hors-gate admis motivés, ${sautsExamines} saut(s) examiné(s)).`,
);
process.exit(echecs ? 1 : 0);
