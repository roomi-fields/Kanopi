#!/usr/bin/env node
/**
 * GARDE ANTI-RÉTROCOMPAT — un fichier À PART, pas un bloc du lanceur.
 *
 * Mandat Romain [847], décision hub/decisions/2026-07-19-confronter-via-oracle-et-restaurer-tous-les-guards.md.
 * Pattern de référence : scripts/meta-garde-tests.mjs (mêmes principes : script `node` autonome,
 * balaie le SYSTÈME DE FICHIERS, ANTI-VACUITÉ, allowlist motivée ≥ 20 caractères, exit 1 si échec).
 *
 * CE QUE « RÉTROCOMPAT INTERDITE » VEUT DIRE ICI : un symbole marqué legacy/deprecated qui a UN
 * APPELANT VIVANT n'est pas retiré, il est RÉUTILISÉ — c'est une voie de code parallèle qui traîne,
 * pas un vestige inerte. Le garde échoue sur CE cas précis, sauf exclusion motivée sur pièces.
 *
 * DÉTECTION (2 familles, indépendantes) :
 *   1. annotation JSDoc `@deprecated` sur une déclaration exportée (fonction/const/classe/méthode/
 *      champ) — la déclaration est la première ligne non-commentaire après le bloc de commentaire
 *      qui porte le tag ;
 *   2. symbole EXPORTÉ (fonction/const/classe/let/var) dont le nom matche `[Ll]egacy`.
 *
 * PORTÉE DE LA RECHERCHE D'APPELANT VIVANT — DEUX RÉGIMES, PAS UN SEUL :
 *   - Symbole export TOP-LEVEL (`export function|const|class|let|var NOM`, matché par la famille 2
 *     ou par la famille 1 quand la déclaration est elle-même top-level) : recherche du nom NU
 *     dans TOUT le périmètre balayé, hors la ligne de déclaration et hors commentaires. Sûr : ces
 *     noms sont des identifiants nominaux importés explicitement (peu de collision plausible).
 *   - Symbole membre (champ d'interface, méthode de classe — la déclaration NE commence PAS par
 *     `export`, ex. `bpm?: number;` dans une interface exportée) : recherche restreinte au SEUL
 *     fichier déclarant, hors la ligne de déclaration et hors commentaires.
 *     POURQUOI CETTE RESTRICTION (vérifié sur pièces, pas une supposition) : un nom de champ comme
 *     `bpm` est structurel, pas nominal — il colle par coïncidence à des dizaines de symboles sans
 *     rapport dans ce dépôt (`clock.state.bpm`, `setTempo(bpm)`, `readonly bpm: number` d'un AUTRE
 *     type dans events/types.ts, etc. : 134 occurrences du mot nu `bpm` au moment T, dont AUCUNE
 *     n'est un accès au champ `PersistedWorkspace.bpm`). Une recherche repo-wide du mot nu pour un
 *     champ ferait crier loup sur du bruit homonyme au lieu de trouver de vrais appelants. La seule
 *     recherche fiable sans compilateur TS est celle déjà restreinte à son propre fichier.
 *
 * Il NE RE-DÉRIVE PAS un vrai vérificateur de types : c'est un balayage textuel pragmatique, pas un
 * compilateur. Il n'exclut pas les chaînes de caractères (seulement les commentaires) — limite
 * connue, assumée, dans le même esprit que meta-garde-tests.mjs.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ICI = path.dirname(new URL(import.meta.url).pathname);
const RACINE = path.resolve(ICI, "..");

const RACINES_BALAYAGE = ["packages/ui/src", "packages/core/src"];
const EXCLUS_DOSSIERS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".svelte-kit",
  "test-results",
]);
const EXT_SOURCE = new Set([".ts", ".svelte", ".js"]);

/**
 * ALLOWLIST — Map nom → motif écrit (≥ 20 caractères, vérifié sur pièces, jamais inventé).
 * Une seule entrée à ce jour (2026-07-19) : c'est le SEUL legacy à appelant vif du dépôt.
 */
const ANTI_RETROCOMPAT_ADMIS = new Map([
  [
    "migrateLegacyWorkspace",
    "migration ONE-SHOT de données utilisateur persistées (localStorage pré-compte → espace " +
      "par-compte, main.ts:36) ; préserve l'existant, n'évolue pas — compat de DONNÉES, pas une " +
      "voie de code parallèle. Retrait = perte de données.",
  ],
]);

// --- 1. Lister les fichiers source du périmètre ---------------------------------------------

const fichiers = [];
const explore = (relDir) => {
  let entries;
  try {
    entries = readdirSync(path.join(RACINE, relDir), { withFileTypes: true });
  } catch {
    return; // racine absente : rien à explorer ici
  }
  for (const e of entries) {
    if (EXCLUS_DOSSIERS.has(e.name) || e.name.startsWith(".")) continue;
    const sous = `${relDir}/${e.name}`;
    if (e.isDirectory()) explore(sous);
    else if (EXT_SOURCE.has(path.extname(e.name))) fichiers.push(sous);
  }
};
for (const racine of RACINES_BALAYAGE) explore(racine);

// ANTI-VACUITÉ : si le balayage ne voit quasiment aucun fichier, il ne regarde plus au bon
// endroit (racines déplacées/renommées) — pas que le dépôt est parfait. Plancher fixé nettement
// sous le compte réel constaté (189 au moment T) pour tolérer la croissance/suppression normale.
const PLANCHER_FICHIERS = 100;
if (fichiers.length < PLANCHER_FICHIERS) {
  console.error(
    `FAIL anti-rétrocompat — ${fichiers.length} fichier(s) source vu(s), au moins ` +
      `${PLANCHER_FICHIERS} attendus : le balayage ne regarde plus au bon endroit (racines ` +
      "cassées), pas que le dépôt est devenu parfait.",
  );
  process.exit(1);
}

// --- 2. Charger le contenu de chaque fichier une fois -----------------------------------------

const contenuParFichier = new Map();
for (const f of fichiers) {
  try {
    contenuParFichier.set(
      f,
      readFileSync(path.join(RACINE, f), "utf8").split("\n"),
    );
  } catch {
    /* fichier illisible (lien mort, permissions) : ignoré, pas fatal */
  }
}

const estLigneCommentaire = (ligne) => {
  const t = ligne.trim();
  return t.startsWith("//") || t.startsWith("/*") || t.startsWith("*");
};

const RE_EXPORT_TOPLEVEL =
  /^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;
const RE_CHAMP = /^(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:/;
const RE_METHODE =
  /^(?:public\s+|private\s+|protected\s+|static\s+|async\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*\(/;
const RE_LEGACY_NOM = /[Ll]egacy/;

/** symboles détectés : { nom, fichier, ligne (1-based), topLevel } */
const symboles = [];
const vusParNom = new Set(); // dédup (même nom détecté 2 fois par les 2 familles)

const ajouterSymbole = (nom, fichier, ligneIdx, topLevel) => {
  const cle = `${nom}@${fichier}`;
  if (vusParNom.has(cle)) return;
  vusParNom.add(cle);
  symboles.push({ nom, fichier, ligne: ligneIdx + 1, topLevel });
};

for (const [fichier, lignes] of contenuParFichier) {
  for (let i = 0; i < lignes.length; i++) {
    const brute = lignes[i];
    const t = brute.trim();

    // --- Famille 2 : symbole exporté nommé [Ll]egacy ---
    if (!estLigneCommentaire(brute)) {
      const mTop = t.match(RE_EXPORT_TOPLEVEL);
      if (mTop && RE_LEGACY_NOM.test(mTop[1])) {
        ajouterSymbole(mTop[1], fichier, i, true);
      }
    }

    // --- Famille 1 : JSDoc @deprecated sur une déclaration exportée ---
    if (estLigneCommentaire(brute) && t.includes("@deprecated")) {
      let j = i;
      while (j < lignes.length && estLigneCommentaire(lignes[j])) j++;
      while (j < lignes.length && lignes[j].trim() === "") j++;
      if (j >= lignes.length) continue;
      const decl = lignes[j].trim();

      const mTop = decl.match(RE_EXPORT_TOPLEVEL);
      if (mTop) {
        ajouterSymbole(mTop[1], fichier, j, true);
        continue;
      }
      const mChamp = decl.match(RE_CHAMP);
      if (mChamp) {
        ajouterSymbole(mChamp[1], fichier, j, false);
        continue;
      }
      const mMethode = decl.match(RE_METHODE);
      if (mMethode) {
        ajouterSymbole(mMethode[1], fichier, j, false);
        continue;
      }
      console.error(
        `NOTE anti-rétrocompat — @deprecated vu à ${fichier}:${i + 1} mais déclaration non ` +
          `parsable (« ${decl.slice(0, 80)} ») : ni exporté top-level, ni champ, ni méthode. ` +
          "Ignoré (pas fatal), à vérifier à l'œil si ça se reproduit.",
      );
    }
  }
}

// --- 3. Recherche d'appelant vivant, par régime de portée --------------------------------------

const aUnAppelantVivant = (symbole) => {
  const RE_NOM = new RegExp(`\\b${symbole.nom.replace(/[$]/g, "\\$")}\\b`);
  const fichiersACherche = symbole.topLevel
    ? [...contenuParFichier.keys()]
    : [symbole.fichier];

  for (const f of fichiersACherche) {
    const lignes = contenuParFichier.get(f);
    if (!lignes) continue;
    for (let i = 0; i < lignes.length; i++) {
      if (f === symbole.fichier && i === symbole.ligne - 1) continue; // sa propre déclaration
      if (estLigneCommentaire(lignes[i])) continue;
      if (RE_NOM.test(lignes[i])) return true;
    }
  }
  return false;
};

let echecs = 0;
const aAppelant = [];
for (const s of symboles) {
  if (aUnAppelantVivant(s)) aAppelant.push(s);
}

const nonAdmis = aAppelant.filter((s) => !ANTI_RETROCOMPAT_ADMIS.has(s.nom));
const admisSansMotif = [...ANTI_RETROCOMPAT_ADMIS].filter(
  ([, motif]) => !motif || motif.trim().length < 20,
);

if (nonAdmis.length > 0) {
  echecs++;
  console.error(
    `FAIL anti-rétrocompat — ${nonAdmis.length} symbole(s) legacy/deprecated ont un APPELANT ` +
      "VIVANT (réutilisés, pas retirés) et ne sont PAS dans ANTI_RETROCOMPAT_ADMIS :",
  );
  for (const s of nonAdmis) {
    console.error(
      `       ${s.nom} — ${s.fichier}:${s.ligne} (portée ${s.topLevel ? "repo" : "fichier"})`,
    );
  }
  console.error(
    "       Retirez l'appelant (vraie suppression), ou déclarez l'exclusion dans " +
      "ANTI_RETROCOMPAT_ADMIS avec un motif écrit (≥ 20 caractères, vérifié sur pièces).",
  );
}

if (admisSansMotif.length > 0) {
  echecs++;
  console.error(
    `FAIL anti-rétrocompat — exclusion(s) ANTI_RETROCOMPAT_ADMIS sans motif écrit (≥ 20 car) : ` +
      admisSansMotif.map(([n]) => n).join(", "),
  );
}

const admisUtilises = aAppelant.filter((s) =>
  ANTI_RETROCOMPAT_ADMIS.has(s.nom),
);
console.log(
  `${echecs === 0 ? "PASS" : "FAIL"} anti-rétrocompat — ${symboles.length} symbole(s) ` +
    `legacy/deprecated vu(s), ${aAppelant.length} à appelant vif (${admisUtilises.length} admis motivés).`,
);
process.exit(echecs ? 1 : 0);
