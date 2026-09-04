#!/usr/bin/env node
/**
 * GARDE — UNE SUITE QUI PERD DES CAS RESTE VERTE, ET PERSONNE NE LE VOIT.
 *
 * ⛔ LA FORME, mesurée par deux dépôts indépendamment le 2026-09-04 :
 *   · runtime-ui — sa passe effondrée rend `123 passed` au lieu de `213`. QUATRE-VINGT-DIX cas
 *     disparus, pas une ligne pour le dire.
 *   · kairos — un cas retiré d'un fichier : suite 694 → 693, VERTE, son garde de suspensions
 *     annonçant « 108 fichiers examinés », et rien sur le cas manquant.
 *   ⇒ *Un compte de cas verts ne distingue pas une suite qui passe d'une suite dont la moitié n'a
 *     pas été chargée.* Ni rouge ni vide : PARTIELLE, la forme la plus coûteuse.
 *
 * ⚠️ ET C'ÉTAIT MON TROU. Le 2026-09-04, mes 37 fichiers effondrés sur une dépendance absente m'ont
 * rendu `731 passed` au lieu de 939 : j'ai confronté ces deux nombres À LA MAIN, une fois, parce que
 * l'architecte me l'avait demandé. Rien chez moi ne l'aurait fait. Mon méta-garde compte des fichiers
 * DÉCLARÉS et des sauts ; il ne descend jamais au cas.
 *
 * DEUX POINTS DE FORME QUI DÉCIDENT DE SON MORDANT, et ils viennent de la mesure de kairos :
 *   1. LE COMPTE, PAS LA SEULE PRÉSENCE — une liste de fichiers ne mord pas sur un fichier
 *      EFFONDRÉ, qui reste listé par le lanceur tout en ne produisant plus rien.
 *   2. PAR FICHIER, PAS EN TOTAL — un total ne mord qu'au SECOND retrait, quand un ajout ailleurs
 *      a cessé de compenser le premier. Le registre par fichier mord au premier.
 *
 * CE QU'IL REFUSE
 *   · un fichier qui rend MOINS de cas qu'inscrit          (effondré, ou un cas retiré)
 *   · un fichier inscrit que le lanceur ne rend PLUS       (renommé, déplacé, éteint)
 *   · un fichier que le lanceur rend et qui n'est PAS inscrit  (banc neuf non déclaré)
 *   · un rapport vide ou illisible                          (la mesure a raté, elle n'a pas trouvé zéro)
 *
 * ⛔ UN FICHIER QUI REND PLUS DE CAS N'EST PAS UN DÉFAUT — c'est un cas ajouté. Le garde le dit et
 *   demande de graver, il ne refuse pas : refuser l'ajout enseignerait à ne pas ajouter de cas.
 *
 * LE REGISTRE se grave par `--graver`, jamais à la main : il est la PHOTO de ce que le lanceur rend,
 * et une photo retouchée ne mesure plus rien.
 *
 * MORSURE : `--injecter=<forme>` fabrique le rapport correspondant en mémoire, sans toucher l'arbre.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRE = join(RACINE, "scripts", "bancs-attendus.json");
const RAPPORT = join(RACINE, "packages", "ui", ".vitest-rapport.json");

const graver = process.argv.includes("--graver");
const injection = (process.argv.find((a) => a.startsWith("--injecter=")) ?? "")
  .split("=")
  .slice(1)
  .join("=");

/** Ce que le lanceur a RÉELLEMENT exécuté : fichier → nombre de cas. */
function populationMesuree() {
  if (!existsSync(RAPPORT)) {
    console.error(
      `[population-bancs] RAPPORT ABSENT — ${RAPPORT}\n` +
        "  Ce garde lit la sortie de la passe de bancs ; sans elle il ne mesure RIEN et refuse\n" +
        "  plutôt que de passer pour vert. Lancez la suite avant lui.",
    );
    process.exit(1);
  }
  let brut;
  try {
    brut = JSON.parse(readFileSync(RAPPORT, "utf-8"));
  } catch (e) {
    console.error(`[population-bancs] RAPPORT ILLISIBLE — ${e.message}`);
    process.exit(1);
  }
  const out = {};
  for (const t of brut.testResults ?? []) {
    const f = String(t.name ?? "").replace(/.*packages\/ui\//, "");
    if (f) out[f] = (t.assertionResults ?? []).length;
  }
  return out;
}

let mesuree = populationMesuree();

// ── La morsure, sur le rapport en mémoire : rejouable, sans écrire dans l'arbre.
if (injection) {
  const cles = Object.keys(mesuree).sort();
  if (injection === "cas-perdu") mesuree[cles[0]] = mesuree[cles[0]] - 1;
  else if (injection === "banc-disparu") delete mesuree[cles[0]];
  else if (injection === "banc-neuf") mesuree["src/lib/banc-fabrique.test.ts"] = 3;
  else if (injection === "rapport-vide") mesuree = {};
  else {
    console.error(`[population-bancs] forme d'injection inconnue : ${injection}`);
    process.exit(2);
  }
}

// ⛔ UN GARDE COMPTE CE QU'IL A EXAMINÉ ET REFUSE D'AVOIR EXAMINÉ ZÉRO. Un rapport vide a exactement
// l'apparence d'une suite qui n'a rien à dire.
if (Object.keys(mesuree).length === 0) {
  console.error(
    "[population-bancs] ZÉRO fichier dans le rapport — la passe n'a rien exécuté, ou le rapport ne\n" +
      "  décrit plus ce que le lanceur produit. Ce n'est pas une suite vide, c'est une mesure ratée.",
  );
  process.exit(1);
}

if (graver) {
  writeFileSync(REGISTRE, JSON.stringify(mesuree, null, 2) + "\n");
  const total = Object.values(mesuree).reduce((a, b) => a + b, 0);
  console.log(
    `[population-bancs] registre gravé — ${Object.keys(mesuree).length} fichier(s), ${total} cas.`,
  );
  process.exit(0);
}

if (!existsSync(REGISTRE)) {
  console.error(
    `[population-bancs] REGISTRE ABSENT — ${REGISTRE}\n` +
      "  Gravez-le une fois sur un état sain : node scripts/garde-population-bancs.mjs --graver",
  );
  process.exit(1);
}
const attendue = JSON.parse(readFileSync(REGISTRE, "utf-8"));

const perdus = [];
const disparus = [];
const neufs = [];
const enrichis = [];

for (const [f, n] of Object.entries(attendue)) {
  if (!(f in mesuree)) {
    disparus.push(f);
    continue;
  }
  if (mesuree[f] < n) perdus.push(`${f} — ${mesuree[f]} cas au lieu de ${n}`);
  else if (mesuree[f] > n) enrichis.push(`${f} — ${mesuree[f]} cas au lieu de ${n}`);
}
for (const f of Object.keys(mesuree)) if (!(f in attendue)) neufs.push(f);

let echecs = 0;
const crier = (titre, liste, remede) => {
  if (liste.length === 0) return;
  echecs++;
  console.error(`[population-bancs] ${titre} :`);
  for (const l of liste) console.error(`       ${l}`);
  console.error(`       ⇒ ${remede}`);
};

crier(
  `${perdus.length} fichier(s) rendent MOINS de cas qu'inscrit`,
  perdus,
  "Un fichier qui perd des cas reste VERT : le lanceur ne compte pas une absence comme un rouge. " +
    "Réparez le cas, ou gravez le registre si le retrait est voulu.",
);
crier(
  `${disparus.length} fichier(s) inscrits que le lanceur ne rend PLUS`,
  disparus,
  "Renommé, déplacé, ou effondré à l'import. Un fichier hors du champ ne rougit nulle part.",
);
crier(
  `${neufs.length} fichier(s) exécutés et NON inscrits`,
  neufs,
  "Un registre qui retarde ne voit plus le retrait suivant : gravez-le.",
);

if (enrichis.length > 0) {
  console.log(
    `[population-bancs] ${enrichis.length} fichier(s) rendent PLUS de cas — un ajout, pas un défaut :`,
  );
  for (const l of enrichis) console.log(`       ${l}`);
  console.log("       ⇒ gravez le registre pour que le prochain retrait morde.");
}

if (echecs > 0) process.exit(1);

const total = Object.values(mesuree).reduce((a, b) => a + b, 0);
console.log(
  `[population-bancs] vert — ${Object.keys(mesuree).length} fichier(s) et ${total} cas, ` +
    "chacun confronté à son compte inscrit.",
);
