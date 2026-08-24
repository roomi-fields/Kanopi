#!/usr/bin/env node
// ⛔ MES DOCUMENTS ENVOIENT DES AGENTS LIRE CHEZ MES VOISINS, ET AUCUN DE CES CHEMINS NE ROUGISSAIT.
//
// La population, nommée par runtime-audio et close par BPscript le 2026-08-24 : *« envoyer un AGENT
// lire un document chez un voisin »*. Aucun import, aucune clé, aucun condensat, aucune ouverture de
// fichier par du code — **elle resterait à zéro sur toutes les questions qu'un producteur sait
// poser, et serait quand même cassée.**
//
// ⇒ ELLE CASSE À L'ENVERS DES AUTRES, et c'est ce qui la rend dangereuse :
//
//     un reformatage chez le voisin   ne la touche pas — un agent lit la prose
//     un RENOMMAGE ou un DÉPLACEMENT  la tue EN SILENCE
//
// La phrase de runtime-audio : *« un garde rouge est un avertissement ; un agent qui n'a pas trouvé
// sa source est un oracle silencieusement faux. »* ⚠️ Et kairos a nommé le pire : son oracle répond
// « absent des trois documents » quand il ne trouve pas, et **cette réponse est précieuse** — elle
// nomme un trou de spécification. ⇒ Un chemin mort fabrique donc exactement le verdict le plus
// dangereux : **un trou de spécification INVENTÉ, rendu avec l'autorité de la charte.**
//
// ⛔ MESURÉ CHEZ MOI LE 2026-08-24, avant ce garde : 59 chemins sortants, 57 vivants, UN mort —
// `kronos/decisions/2026-06-26-kai9-adresse-dans-arbre.md`, déménagé chez le hub sous le même nom.
// Et kronos m'a signalé le symétrique le même soir : trois chemins de son skill vers chez moi, morts.
//
// ⚠️ LA CASSE EST UNE CAUSE DE FAUX MORT, ET ELLE A DÉJÀ FAILLI FAIRE PARTIR UNE ALERTE À QUINZE
// DÉPÔTS : `bpscript` contre `BPscript`, `bpx` contre `BPx`, `runtime-midi` contre `runtime-MIDI`.
// Le nom écrit dans un document n'est pas le nom du dossier — ce garde résout les deux.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ATELIER = join(homedir(), "dev", "bp");

/** Les documents qui peuvent envoyer un agent : ma charte, mes skills, mes documents. */
const PORTEE = ["CLAUDE.md", ".claude", "docs"];

/** Un chemin sortant : `<depot>/<reste>.<ext>`, tel qu'un agent le lirait. */
const MOTIF =
  /(BPscript|BPx|bpx|bpscript|kairos|kronos|bp3-frontend|bp3-engine|runtime-[a-zA-Z]+|atlas|hub|dedale)\/[A-Za-z0-9_./-]+\.(md|ts|js|mjs|cjs|json|gr|bps|py|sh)/g;

/**
 * ⛔ LES ABSENCES CONSTATÉES NE SONT PAS DES CHEMINS MORTS, ET LES CONFONDRE SUR-COMPTE.
 *
 * Mesuré à la pose : ma carte écrit « Aucun `hub/contrats/kanopi-runtime-osc.md` n'existe » — le
 * chemin est cité POUR DIRE QU'IL MANQUE. Un instrument qui le compte mort accuse le document d'un
 * défaut qui est son propos. C'est la faute exacte que BPscript a payée deux fois ce soir :
 * sur-compter et sous-compter par le même motif.
 *
 * ⇒ Une absence se DÉCLARE, avec sa raison. Et l'inscription se retourne : elle échoue aussi quand
 *   le chemin se met à EXISTER — sinon elle couvrirait la mort suivante du même chemin.
 */
const ABSENCES_DECLAREES = new Map([
  [
    "hub/contrats/kanopi-runtime-osc.md",
    "cité par `docs/arch/contrat-DRAFT.md` §E5 POUR DIRE QU'IL N'EXISTE PAS : la frontière OSC " +
      "n'est décrite que par un stub local et reste à figer. Le chemin est l'objet du constat, " +
      "pas une adresse à suivre.",
  ],
]);

/** Le nom du dossier sur disque, qui n'est pas toujours celui qu'un document écrit. */
function depotSurDisque(nom) {
  const candidats = [
    nom,
    nom.toLowerCase(),
    { bpscript: "BPscript", bpx: "BPx", "runtime-midi": "runtime-MIDI" }[
      nom.toLowerCase()
    ],
  ].filter(Boolean);
  for (const c of candidats) if (existsSync(join(ATELIER, c))) return c;
  return null;
}

const fichiers = [];
const explorer = (rel) => {
  const abs = join(RACINE, rel);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return;
  }
  if (!st.isDirectory()) {
    if (/\.(md|ya?ml)$/.test(rel)) fichiers.push(rel);
    return;
  }
  for (const e of readdirSync(abs)) explorer(join(rel, e));
};
for (const p of PORTEE) explorer(p);

const morts = [];
const ressuscites = [];
let examines = 0;
const vus = new Set();

for (const rel of fichiers) {
  const lignes = readFileSync(join(RACINE, rel), "utf8").split("\n");
  lignes.forEach((ligne, i) => {
    for (const m of ligne.matchAll(MOTIF)) {
      const cible = m[0];
      examines++;
      const declaree = ABSENCES_DECLAREES.has(cible);
      const depot = depotSurDisque(cible.slice(0, cible.indexOf("/")));
      const reste = cible.slice(cible.indexOf("/") + 1);
      const vit = depot !== null && existsSync(join(ATELIER, depot, reste));
      if (declaree) {
        vus.add(cible);
        // ⛔ LE VERROU SE RETOURNE : une absence déclarée qui se met à exister doit sortir.
        if (vit) ressuscites.push(`${cible} (${rel}:${i + 1})`);
        continue;
      }
      if (!vit)
        morts.push(
          `${cible}\n      cité par ${rel}:${i + 1}` +
            (depot === null
              ? "\n      ⛔ le DÉPÔT lui-même est introuvable dans l'atelier"
              : ""),
        );
    }
  });
}

// ⛔ UN GARDE COMPTE CE QU'IL A EXAMINÉ ET REFUSE D'AVOIR EXAMINÉ ZÉRO. Un motif cassé, une portée
// déplacée ou un dossier renommé rendraient « zéro chemin sortant, donc aucun mort » — le vert qui
// dit exactement le contraire de ce qu'il mesure. Mesuré à la pose : 59.
if (examines < 20) {
  console.error(
    `✗ chemins-sortants — RELEVÉ TROP MAIGRE : ${examines} chemin(s) examiné(s) sur ${fichiers.length} ` +
      `document(s). La mesure a raté ; elle n'a pas trouvé zéro chemin.`,
  );
  process.exit(1);
}

for (const [cible] of ABSENCES_DECLAREES)
  if (!vus.has(cible))
    morts.push(
      `${cible}\n      ⛔ ABSENCE DÉCLARÉE QUI NE DÉSIGNE PLUS RIEN : plus aucun document ne cite ` +
        `ce chemin. Retire son entrée — une inscription qui survit à sa cause couvre la suivante.`,
    );

if (morts.length || ressuscites.length) {
  console.error("✗ chemins-sortants — un de mes documents envoie un agent nulle part :");
  for (const m of morts) console.error(`  • ${m}`);
  for (const r of ressuscites)
    console.error(
      `  • ${r}\n      ⛔ déclaré ABSENT et il EXISTE maintenant. Retire l'entrée : la déclaration ` +
        `couvrirait sa mort suivante.`,
    );
  console.error(
    "\n⛔ Un agent qui ne trouve pas sa source ne rougit pas : il répond « absent », avec l'autorité\n" +
      "   de sa charte. Corrige le chemin, ou déclare l'absence avec sa raison dans ce garde.",
  );
  process.exit(1);
}

console.log(
  `✓ chemins-sortants — ${examines} chemin(s) vers un voisin examiné(s) dans ${fichiers.length} ` +
    `document(s), tous vivants ; ${ABSENCES_DECLAREES.size} absence(s) déclarée(s).`,
);
