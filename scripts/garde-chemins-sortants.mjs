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

import { readFileSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ATELIER = join(homedir(), "dev", "bp");

/** Les documents qui peuvent envoyer un agent : ma charte, mes skills, mes documents. */
const PORTEE = ["CLAUDE.md", ".claude", "docs"];

/**
 * Un chemin sortant : `<depot>/<reste>.<ext>`, tel qu'un agent le lirait.
 *
 * ⛔ L'ORDRE DE L'ALTERNANCE FABRIQUE DES FAUX MORTS, ET C'EST MESURÉ. Avec `…|js|mjs|cjs|json…`,
 * `BPx/package.json` rend `BPx/package.js` : un fichier VIVANT annoncé mort **sous un nom que
 * personne n'a jamais écrit**. Une alternance essaie ses branches dans l'ordre, et `js` gagne avant
 * `json` sur la même position. ⇒ Les extensions LONGUES passent d'abord, et une frontière ferme la
 * fin — sans elle, `…index.tsx` rendrait `…index.ts`.
 *
 * Relevé par l'architecte en portant ce garde au hub, le 2026-08-25. Il n'avait pas mordu ici parce
 * qu'aucun de mes chemins sortants ne portait ces extensions-là ; **un garde qui change de dépôt
 * rencontre des formes que son auteur n'a jamais vues.**
 */
const MOTIF =
  /(BPscript|BPx|bpx|bpscript|kairos|kronos|bp3-frontend|bp3-engine|runtime-[a-zA-Z]+|atlas|hub|dedale)\/[A-Za-z0-9_./-]+\.(json|mjs|cjs|bps|md|ts|js|gr|py|sh)(?![A-Za-z0-9])/g;

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
// ⛔ ET IL SE CHERCHE DANS DEUX ESPACES DEPUIS LE 2026-09-04. Ma session tourne sous enveloppe :
// l'atelier ne me montre plus que `hub` et `kanopi`, donc CHAQUE renvoi vers un voisin était déclaré
// mort et ce garde refusait le portillon en bloc — six renvois parfaitement vivants, dont la bible du
// langage. ⇒ L'espace publié porte les mêmes arbres à leur référence publiée ; un renvoi documentaire
// désigne un DOCUMENT, pas un état de travail, donc l'y trouver répond exactement à la question posée.
// ⇒ L'atelier reste en premier : hors enveloppe les deux coïncident, et l'arbre vif fait foi quand il
//   est là. Rendre les DEUX moitiés — l'espace et le nom — parce que l'appelant doit reconstruire le
//   chemin complet, et qu'un dépôt trouvé dans un espace ne vit pas dans l'autre.
function depotSurDisque(nom) {
  const candidats = [
    nom,
    nom.toLowerCase(),
    { bpscript: "BPscript", bpx: "BPx", "runtime-midi": "runtime-MIDI" }[
      nom.toLowerCase()
    ],
  ].filter(Boolean);
  for (const espace of [ATELIER, join(ATELIER, ".publie")])
    for (const c of candidats)
      if (existsSync(join(espace, c))) return join(espace, c);
  return null;
}

const fichiers = [];
// ⛔ UN LIEN SYMBOLIQUE NE SE SUIT PAS. Relevé par l'architecte au portage : `.claude/worktrees/`
// porte chez certains des liens vers des DÉPÔTS ENTIERS — le garde les explorait au complet et ne
// rendait pas la main. Il ne mordait pas ici faute de tels liens, et c'est exactement la raison de
// le fermer : un garde qui change de dépôt rencontre des formes de disque que son auteur n'a jamais
// vues. `lstatSync` regarde le lien, `statSync` regarde sa cible.
const explorer = (rel) => {
  const abs = join(RACINE, rel);
  let st;
  try {
    st = lstatSync(abs);
    if (st.isSymbolicLink()) return;
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
      const vit = depot !== null && existsSync(join(depot, reste));
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

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ SECONDE PASSE — UNE ANCRE VERS UN VOISIN NE SE PORTE PAS PAR UN NUMÉRO DE LIGNE
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// Le chemin peut vivre pendant que la LIGNE ment, et c'est pire qu'un chemin mort : *un chemin mort
// rend une alerte ; un numéro de ligne périmé rend une CITATION FAUSSE QUI A L'AIR JUSTE* (kairos,
// 2026-08-25). Et elles ne meurent pas franchement — *elles n'ont pas vieilli, elles ont GLISSÉ, et
// un glissement atterrit toujours sur du vocabulaire du même domaine* (BPscript, même nuit).
//
// ⛔ MESURÉ CHEZ MOI, ET LE GLISSEMENT AVAIT DÉJÀ COMMENCÉ. Treize ancres lignées vers cinq voisins.
// Celle que quatre de mes fichiers portaient — `runtime-in/src/devices/keyboard.js:9-11` — vise un
// texte qui est aujourd'hui en 10-11 : sa ligne 9 porte un chemin de décision. **Elle tombe encore
// sur le bon paragraphe**, donc aucun instrument des deux côtés ne l'aurait dite fausse.
//
// ⇒ LA FORME QUI NE VIEILLIT PAS EST LE NOM DU SYMBOLE OU DE LA SECTION — rendue par
//   runtime-codevoices : *« mes symboles survivent à mes réécritures ; mes numéros non. »* Et par
//   kairos, la règle qui survit aux deux graphies d'un même document : *une ancre se COPIE de la
//   source, jamais ne se retape.*
//
// La portée est plus large que la première passe : les ancres vivent dans le CODE et les BANCS, pas
// seulement dans les documents.
const PORTEE_ANCRES = ["packages/ui/src", "packages/ui/tests", "scripts", "docs", "CLAUDE.md"];
// ⛔ `docs/plan/` est HORS DU DÉPÔT PUBLIÉ — `.gitignore:23`, zéro fichier suivi. Ce que j'y écris
// n'atteint personne et ne se relit par aucun tiers : y refuser une ancre lignée ferait rougir mon
// portillon sur un texte qui ne sort jamais d'ici.
const HORS_PORTEE_ANCRES = ["docs/plan"];
const ANCRE_LIGNEE =
  /(BPscript|BPx|bpx|bpscript|kairos|kronos|bp3-frontend|bp3-engine|runtime-[a-zA-Z]+|atlas|hub|dedale)\/[A-Za-z0-9_./-]+\.(json|mjs|cjs|bps|md|ts|js|gr|py|sh):[0-9]+/g;

const fichiersAncres = [];
const explorerAncres = (rel) => {
  if (HORS_PORTEE_ANCRES.some((h) => rel === h || rel.startsWith(h + "/"))) return;
  const abs = join(RACINE, rel);
  let st;
  try {
    st = lstatSync(abs);
    if (st.isSymbolicLink()) return;
  } catch {
    return;
  }
  if (!st.isDirectory()) {
    if (/\.(md|ya?ml|ts|js|mjs|cjs|svelte)$/.test(rel)) fichiersAncres.push(rel);
    return;
  }
  for (const e of readdirSync(abs)) explorerAncres(join(rel, e));
};
for (const p of PORTEE_ANCRES) explorerAncres(p);

/**
 * ⛔ UNE ANCRE CITÉE POUR MONTRER LE DÉFAUT N'EST PAS LE DÉFAUT — même règle que les absences
 * déclarées au-dessus, et même piège : un instrument qui la compte accuse le texte d'un défaut qui
 * est son propos. Ici, c'est ce garde lui-même qui porte l'exemple mesuré du glissement.
 * ⇒ L'entrée se retourne comme l'autre : si plus personne ne la cite, elle sort.
 */
const ANCRES_ILLUSTRATIVES = new Map([
  [
    "runtime-in/src/devices/keyboard.js:9",
    "l'en-tête de ce garde la cite comme l'EXEMPLE MESURÉ du glissement — le texte annoncé est " +
      "aujourd'hui en 10-11. C'est la démonstration, pas une adresse à suivre.",
  ],
]);

const ancres = [];
const illustrationsVues = new Set();
for (const rel of fichiersAncres) {
  readFileSync(join(RACINE, rel), "utf8")
    .split("\n")
    .forEach((ligne, i) => {
      for (const m of ligne.matchAll(ANCRE_LIGNEE)) {
        if (ANCRES_ILLUSTRATIVES.has(m[0])) {
          illustrationsVues.add(m[0]);
          continue;
        }
        ancres.push(`${m[0]}\n      cité par ${rel}:${i + 1}`);
      }
    });
}

for (const [a] of ANCRES_ILLUSTRATIVES)
  if (!illustrationsVues.has(a))
    ancres.push(
      `${a}\n      ⛔ ILLUSTRATION DÉCLARÉE QUI NE DÉSIGNE PLUS RIEN : plus aucun texte ne la cite. ` +
        `Retire son entrée — une inscription qui survit à sa cause couvre la suivante.`,
    );

if (ancres.length) {
  console.error(
    "✗ chemins-sortants — une ancre vers un voisin porte un NUMÉRO DE LIGNE :",
  );
  for (const a of ancres) console.error(`  • ${a}`);
  console.error(
    "\n⛔ Un chemin mort rend une alerte ; un numéro de ligne périmé rend une CITATION FAUSSE QUI A\n" +
      "   L'AIR JUSTE — elle glisse et atterrit sur du vocabulaire du même domaine.\n" +
      "   ⇒ Ancre par le NOM DU SYMBOLE ou de la SECTION, COPIÉ depuis la source. Le numéro peut\n" +
      "     accompagner, jamais porter.",
  );
  process.exit(1);
}

console.log(
  `✓ chemins-sortants — ${examines} chemin(s) vers un voisin examiné(s) dans ${fichiers.length} ` +
    `document(s), tous vivants ; ${ABSENCES_DECLAREES.size} absence(s) déclarée(s) ; ` +
    `${fichiersAncres.length} fichier(s) balayé(s), aucune ancre lignée.`,
);
