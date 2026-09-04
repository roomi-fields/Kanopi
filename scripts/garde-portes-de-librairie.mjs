#!/usr/bin/env node
/**
 * GARDE — MA SOURCE NOMME LA PORTE D'UN CATALOGUE, JAMAIS SON FICHIER.
 *
 * LA RÈGLE
 *   Un catalogue de bpscript s'atteint par sa PORTE — `bpscript/objets`, `famille(mot)`. Son FICHIER
 *   source n'est pas ma porte, et son format n'est pas une information utile ici :
 *   bpscript convertit ses catalogues de JSON vers BPScript au fil de l'eau, la donnée publiée ne
 *   bougeant pas d'un octet. Tout ce qui nomme le fichier devient faux au premier renommage, sans
 *   qu'une ligne de code cesse de fonctionner. Sept lecteurs se sont rendus aveugles ainsi, dont
 *   le générateur de paquet de bpscript lui-même.
 *
 * POURQUOI IL REFUSE MÊME UN CHEMIN JUSTE
 *   Un chemin exact aujourd'hui est un chemin périmé demain, et rien ne rougira ce jour-là. Le
 *   garde tient donc l'ABSENCE de la graphie, pas sa validité — sinon il faudrait le rejouer après
 *   chaque conversion de bpscript pour savoir s'il ment. L'état vert attendu est ZÉRO chemin.
 *
 * CE QU'IL REFUSE
 *   1. toute occurrence de `lib/<nom>.<ext>` dans ma source suivie, `<nom>` étant un fichier de
 *      catalogue RÉEL de bpscript ;
 *   2. avoir lu ZÉRO nom de catalogue — sa source serait illisible, et le garde aveugle ;
 *   3. avoir balayé ZÉRO fichier — l'énumération serait cassée.
 *
 * CE QU'IL LAISSE PASSER, ET C'EST VOULU
 *   `lib/<nom>/<fichier>` — un RÉPERTOIRE d'authoring (`lib/transpo/transpose.ts`) n'est pas un
 *   catalogue et ne se convertit pas. Et `lib/<nom>.<ext>` dont le nom n'est plus un catalogue :
 *   c'est une pierre tombale, qui nomme un catalogue disparu précisément pour dire qu'il l'est.
 *
 * ⛔ D'OÙ VIENT LA LISTE, ET POURQUOI ELLE A CHANGÉ DE SOURCE — 2026-09-03.
 *   Ce garde IMPORTAIT `bpscript/libs-data` pour en tirer les clés. C'était mon DERNIER lecteur de
 *   ce paquet, et le paquet SORT (décision de Romain, phase 5) : un garde qui, pour tenir sa règle,
 *   dépend de la chose que la règle fait disparaître.
 *   ⚠️ DEUX RÉÉCRITURES ONT ÉCHOUÉ AVANT CELLE-CI, ET LEUR MESURE EST CE QUI A TROUVÉ LA BONNE :
 *     · lire les FAMILLES de la porte des objets — les populations ne se recouvrent pas : 24 clés
 *       qui sont des noms de fichier (`alphabets`, `scales`, `tunings`…) contre 20 familles qui sont
 *       des mots d'invocation (`alphabet`, `scale`, `tuning`…). Dix clés sans famille : le motif
 *       n'aurait plus trouvé le fichier du catalogue des alphabets ;
 *       ⚠️ et cette phrase ne porte PAS la graphie en clair — ce garde ne saute pas les
 *       commentaires, délibérément : il tient l'ABSENCE du chemin, pas sa validité, et il s'est
 *       accusé lui-même quand je l'ai écrite. Un garde qui s'exempte de sa propre règle ment ;
 *     · retirer la liste et refuser tout `lib/<mot>.<ext>` — l'instrument a rendu des FAUX POSITIFS
 *       en trois secondes, dont `scripts/lib/regimes-des-voisins.json`, mon propre fichier. La liste
 *       avait une fonction que je n'avais pas vue : distinguer un catalogue de l'amont d'un `lib/`
 *       quelconque.
 *   ⇒ ELLE VIENT MAINTENANT DES FICHIERS EUX-MÊMES, dans l'espace PUBLIÉ de bpscript. C'est le
 *     sujet exact du garde — des noms de FICHIER — au lieu d'une projection en clés, et ça ne
 *     dépend plus d'un paquet voué au retrait. ⇒ Deux propriétés en prime : la liste porte une
 *     EMPREINTE citable, et `.publie` est monté sous enveloppe — ce garde survit au cloisonnement.
 *
 * MORSURE : `--injecter` ajoute en mémoire, au texte du premier fichier balayé, un chemin bâti sur
 * un catalogue réel. Rejouable, sans écrire dans l'arbre.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const injecter = process.argv.includes("--injecter");

// ── Les catalogues de bpscript, lus à son état PUBLIÉ — leurs noms de fichier, sans extension.
//    ⛔ Un fichier seulement : un sous-dossier de `lib/` est un répertoire d'authoring, pas un
//    catalogue, et le motif le laisse déjà passer.
const LIB_AMONT = "/home/romi/dev/bp/.publie/BPscript/lib";
let CLES;
try {
  CLES = readdirSync(LIB_AMONT, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(json|bpsl)$/.test(e.name))
    .map((e) => e.name.replace(/\.(json|bpsl)$/, ""));
} catch (e) {
  console.error(
    `[garde-portes] IMPOSSIBLE DE LIRE LES CATALOGUES DE BPSCRIPT — ${e.message}`,
  );
  console.error(
    // ⛔ LA PORTE DE PUBLICATION A CHANGÉ LE 2026-09-04 À 17:06, ET CE MESSAGE PRESCRIVAIT L'ANCIENNE.
    // `hub/tools/publier.sh` REFUSE désormais l'appel direct : tout passe par `tour publie`, qui prend
    // un verrou de quelques secondes — parce que la publication VIDE le dossier avant de recopier, et
    // qu'un lecteur tombé au milieu voyait un dépôt à moitié effacé.
    // ⇒ Un message d'erreur qui prescrit une commande morte envoie son lecteur dans un mur, au moment
    //   précis où il cherche de l'aide. Une prescription est une affirmation du code comme une autre.
    `   Attendu sous ${LIB_AMONT} — bpscript a-t-il publié (node ~/dev/bp/hub/tour.cjs publie bpscript) ?`,
  );
  console.error(
    "   Sans ses noms le garde ne reconnaît aucun catalogue : il refuse de passer pour vert.",
  );
  process.exit(1);
}
if (CLES.length === 0) {
  console.error(
    "[garde-portes] ZÉRO CATALOGUE LU — la source publiée de bpscript est vide ou illisible.",
  );
  process.exit(1);
}

// ── Ma source suivie, par git (jamais un parcours à la main) ─────────────────────────────────
const suivis = execFileSync(
  "git",
  ["ls-files", "packages/ui/src", "packages/core/src", "scripts", "docs"],
  {
    cwd: RACINE,
    encoding: "utf-8",
  },
)
  .split("\n")
  .filter((f) => /\.(ts|tsx|js|mjs|cjs|svelte|md)$/.test(f));

if (suivis.length === 0) {
  console.error(
    "[garde-portes] ZÉRO FICHIER BALAYÉ — l'énumération est cassée, le dépôt n'est pas vide.",
  );
  process.exit(1);
}

// `lib/<clé>.<ext>` seulement : un répertoire d'authoring (`lib/<clé>/<x>`) ne se convertit pas.
const alternance = CLES.map((c) =>
  c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"),
).join("|");
const MOTIF = new RegExp(`\\blib/(${alternance})\\.(json|bpsl)(?![\\w/])`, "g");

const fautes = [];
for (const [i, f] of suivis.entries()) {
  let texte = readFileSync(join(RACINE, f), "utf-8");
  if (injecter && i === 0)
    texte += `\n// injection de morsure : lib/${CLES[0]}.json\n`;
  for (const [n, ligne] of texte.split("\n").entries()) {
    MOTIF.lastIndex = 0;
    let m;
    while ((m = MOTIF.exec(ligne)) !== null)
      fautes.push({ fichier: f, ligne: n + 1, chemin: m[0], cle: m[1] });
  }
}

if (fautes.length) {
  console.error(
    `[garde-portes] ${fautes.length} FICHIER(S) DE CATALOGUE NOMMÉ(S) DANS MA SOURCE :`,
  );
  for (const p of fautes)
    console.error(
      `   ${p.fichier}:${p.ligne} — \`${p.chemin}\`  ⇒  la porte des objets, jamais ce fichier`,
    );
  console.error(
    "   ⇒ NOMMER LA PORTE, JAMAIS LE FICHIER. bpscript convertit ses catalogues de JSON",
  );
  console.error(
    "     vers BPScript au fil ; la donnée publiée ne bouge pas, le chemin devient faux.",
  );
  console.error(
    "     Les librairies se lisent par `bpscript/objets` — famille(mot), objet('a.b').",
  );
  process.exit(1);
}

console.log(
  `[garde-portes] ${suivis.length} fichiers balayés contre ${CLES.length} catalogues publiés par bpscript — ` +
    "aucun fichier de catalogue nommé, la porte est la seule adresse.",
);
