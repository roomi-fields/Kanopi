#!/usr/bin/env node
// GARDE « les polices sont locales » (décision Romain 2026-08-13,
// `hub/decisions/2026-08-13-les-polices-sont-locales.md`) : Kanopi héberge ses polices dans son
// dépôt, et l'application ne les charge chez aucun service tiers.
//
// POURQUOI IL EXISTE : la forme retirée était trois lignes d'`index.html` appelant le service de
// polices de Google. Elle coûtait deux défauts — un 404 sur ce service teintait six bancs audio en
// rouge (leur assertion « aucune console.error »), et l'application empaquetée perdait sa
// typographie sans réseau (KAN-48). Rien n'empêchait mécaniquement de la réécrire ; ce fichier est
// ce qui l'en empêche.
//
// ICI ET PAS EN BANC VITEST : lire le disque demande les modules Node, que `svelte-check` refuse
// sous `packages/ui/src` (`types: ["vite/client", "svelte"]`) — mesuré, le portillon a rejeté la
// première version. Les gardes structurels de ce dépôt vivent à la racine, celui-ci les rejoint.
//
// IL MESURE DEUX ÉTATS : la SOURCE (ce qu'on écrit) et, quand elle existe, la CONSTRUCTION
// (`packages/ui/dist` — ce qui part réellement à l'utilisateur). Un garde qui ne lit que la source
// laisserait passer une adresse arrivée par une dépendance.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, relative } from "node:path";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UI = join(racine, "packages/ui");
const DOSSIER_POLICES = join(UI, "src/assets/fonts");
const FONTS_CSS = join(UI, "src/styles/fonts.css");

/** Les services d'hébergement de polices. C'est l'ADRESSE qui est interdite, quelle que soit la
 *  balise ou la propriété qui la porte. */
const SERVICES_TIERS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "use.typekit.net",
  "fonts.bunny.net",
  "cdn.jsdelivr.net/npm/@fontsource",
];

/** Une déclaration de police qui va chercher ses octets ailleurs que dans ce dépôt. */
const SRC_DISTANT = /@font-face[\s\S]{0,400}?url\(\s*['"]?https?:/i;

function violations(texte) {
  const trouvees = SERVICES_TIERS.filter((h) => texte.includes(h));
  if (SRC_DISTANT.test(texte)) trouvees.push("@font-face vers une URL absolue");
  return trouvees;
}

/** Les fichiers à lire sous `dir`, par extension. */
function fichiers(dir, extensions, exclus = /\.(test|spec)\./) {
  const out = [];
  const parcourir = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") parcourir(p);
      } else if (extensions.test(e.name) && !exclus.test(e.name)) out.push(p);
    }
  };
  if (existsSync(dir)) parcourir(dir);
  return out;
}

const erreurs = [];

// ── 1) Ni la page d'entrée ni le code de l'hôte ne citent un service de polices.
const SOURCES = [join(UI, "index.html"), ...fichiers(join(UI, "src"), /\.(css|ts|svelte|html)$/)];
let luNonVide = 0;
for (const f of SOURCES) {
  const texte = readFileSync(f, "utf8");
  if (texte.trim().length > 0) luNonVide++;
  const v = violations(texte);
  if (v.length) erreurs.push(`${relative(racine, f)} — ${v.join(", ")}`);
}
// Anti-scan-creux : un parcours cassé ne trouve jamais rien et rendrait le même vert.
if (luNonVide < 50) {
  erreurs.push(
    `le scan n'a lu que ${luNonVide} fichier(s) non vides — parcours cassé, son vert ne prouve rien.`,
  );
}

// ── 2) La déclaration locale est complète et pointe des fichiers présents.
if (!existsSync(FONTS_CSS)) {
  erreurs.push("packages/ui/src/styles/fonts.css absent — les polices ne sont plus déclarées.");
} else {
  const css = readFileSync(FONTS_CSS, "utf8");
  for (const famille of ["IBM Plex Mono", "IBM Plex Sans", "JetBrains Mono"]) {
    if (!css.includes(`font-family: '${famille}'`)) {
      erreurs.push(`fonts.css ne déclare plus la famille « ${famille} ».`);
    }
  }
  const sources = [...css.matchAll(/src:\s*url\('([^']+)'\)/g)].map((m) => m[1]);
  if (sources.length === 0) erreurs.push("fonts.css ne déclare aucun fichier de police.");
  for (const s of sources) {
    if (!/^\.\.\/assets\/fonts\/[a-z0-9-]+\.woff2$/.test(s)) {
      erreurs.push(`fonts.css : « ${s} » n'est pas un fichier de ce dépôt.`);
      continue;
    }
    const fichier = join(UI, "src/styles", s);
    if (!existsSync(fichier)) erreurs.push(`fonts.css : « ${s} » déclarée mais absente du dépôt.`);
    else if (statSync(fichier).size < 1000) erreurs.push(`fonts.css : « ${s} » est vide ou tronquée.`);
  }

  // Chaque graisse que les feuilles de style demandent doit être déclarée localement.
  const declarees = new Set([...css.matchAll(/font-weight:\s*(\d+)/g)].map((m) => Number(m[1])));
  const demandees = new Set();
  for (const f of SOURCES) {
    if (f === FONTS_CSS) continue;
    for (const m of readFileSync(f, "utf8").matchAll(/font-?[Ww]eight:\s*'?(\d{3})'?/g)) {
      demandees.add(Number(m[1]));
    }
  }
  const manquantes = [...demandees].filter((g) => !declarees.has(g));
  if (manquantes.length) {
    erreurs.push(
      `graisse(s) demandée(s) par les styles mais non embarquée(s) : ${manquantes.join(", ")}.`,
    );
  }
}

// ── 3) La licence accompagne les fichiers de police.
if (!existsSync(DOSSIER_POLICES)) {
  erreurs.push("packages/ui/src/assets/fonts absent — aucune police dans le dépôt.");
} else {
  const licences = readdirSync(DOSSIER_POLICES).filter((f) => f.startsWith("LICENSE"));
  if (licences.length === 0) erreurs.push("les fichiers de police n'ont pas leur licence jointe.");
  for (const l of licences) {
    if (!readFileSync(join(DOSSIER_POLICES, l), "utf8").includes("SIL Open Font License")) {
      erreurs.push(`${l} ne porte pas la licence attendue.`);
    }
  }
}

// ── 4) LA CONSTRUCTION, quand elle est là : ce qui part vraiment à l'utilisateur.
//
// À LANCER APRÈS `vite build`, jamais avant : `dist/` est un artefact, et un artefact périmé
// ment dans les deux sens — il ferait rougir sur une forme déjà retirée, ou verdir sur une
// forme réintroduite depuis. Branché dans `verify` juste après la construction.
//
// LA DOCUMENTATION EMBARQUÉE EST COMPTÉE À PART, ET CE N'EST PAS UNE INDULGENCE. `dist/docs/`
// n'est pas écrit ici : mkdocs le GÉNÈRE depuis `atlas/doc-utilisateur`, et c'est le thème qui
// va chercher Roboto sur un service tiers. La cause vit donc dans le `mkdocs.yml` d'atlas, hors
// de mon périmètre — je la ROUTE, je ne la répare pas, et surtout je ne la maquille pas en
// post-traitant le HTML produit (ce serait une seconde voie, et le vrai réglage resterait faux).
// Elle est donc NOMMÉE et chiffrée à chaque passage, jamais tue.
const DIST = join(UI, "dist");
const DOCS_GENEREES = join(DIST, "docs");
let distLu = 0;
const docsFautives = [];
if (existsSync(DIST)) {
  for (const f of fichiers(DIST, /\.(html|css|js)$/, /$^/)) {
    const v = violations(readFileSync(f, "utf8"));
    if (f.startsWith(DOCS_GENEREES + "/")) {
      if (v.length) docsFautives.push(relative(racine, f));
      continue;
    }
    distLu++;
    if (v.length) erreurs.push(`CONSTRUITE — ${relative(racine, f)} — ${v.join(", ")}`);
  }
}

// ── 5) Le détecteur MORD — sans quoi un vert ne distingue pas la conformité de l'aveuglement.
const MORSURES = [
  [
    `<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono" rel="stylesheet" />`,
    "fonts.googleapis.com",
  ],
  [
    `@font-face { font-family: 'X'; src: url("https://exemple.test/x.woff2"); }`,
    "@font-face vers une URL absolue",
  ],
];
for (const [echantillon, attendu] of MORSURES) {
  if (!violations(echantillon).includes(attendu)) {
    erreurs.push(`le détecteur NE MORD PAS sur « ${attendu} » — ce garde ne prouve rien.`);
  }
}

if (erreurs.length) {
  console.error("✗ garde polices-locales — l'application irait chercher une police ailleurs :");
  for (const e of erreurs) console.error(`  • ${e}`);
  console.error(
    "\nRappel : Kanopi héberge ses polices dans son dépôt (décision Romain 2026-08-13).\n" +
      "Une police se déclare dans `packages/ui/src/styles/fonts.css` sur un fichier de `src/assets/fonts/`.",
  );
  process.exit(1);
}

console.log(
  `✓ polices locales — ${SOURCES.length} fichier(s) source` +
    (distLu ? ` + ${distLu} fichier(s) construit(s)` : " (construction absente, non mesurée)") +
    " : aucune adresse de service tiers, déclaration locale complète, licence jointe.",
);

if (docsFautives.length) {
  console.log(
    `⚠ ROUTÉ À ATLAS — ${docsFautives.length} page(s) de documentation embarquée appellent encore un\n` +
      "  service tiers pour leurs polices. Elles sont GÉNÉRÉES par mkdocs depuis atlas/doc-utilisateur :\n" +
      "  le réglage est `theme.font` de leur `mkdocs.yml`, pas un fichier de ce dépôt. Exemples : " +
      docsFautives.slice(0, 3).join(", ") +
      ".",
  );
}
