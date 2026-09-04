#!/usr/bin/env node
// ⛔ CE GARDE A ÉTÉ RETOURNÉ LE 2026-08-24, IL N'A PAS ÉTÉ SUPPRIMÉ.
//
// Il EXIGEAIT que chaque amont compilé expose `development → ./src/index.ts` — décision du
// 2026-06-30, dont la raison était juste à l'époque : un `dist` jamais rebâti servait du vieux code
// en silence, et la parade était de ne pas avoir de `dist` dans la boucle.
//
// La décision de Romain du 2026-08-24 — « un dépôt ne consomme que le paquet publié d'un voisin,
// ni en production, ni dans un banc, ni par une condition de résolution » — dit exactement
// l'inverse. Le 2026-08-24, kronos a retiré sa condition et CE GARDE L'A FAIT ROUGIR : il
// réclamait la faute que la nouvelle règle interdit.
//
// ⇒ CE QUI EST VERROUILLÉ MAINTENANT EST L'ABSENCE, et le verrou tient dans les DEUX SENS. La
//   liste des voisins encore consommés en source vit dans `lib/regimes-des-voisins.json` : elle
//   est une DETTE datée, un voisin qui expose `development` sans y être inscrit fait rougir, et
//   une entrée qui n'est plus vraie doit sortir — sinon elle couvrirait la réapparition suivante.
//
// Garde « deps-fraîches » — filet des amonts compilés (BPx, kairos, kronos).
//
// Le problème historique (LAN-14) : ces amonts exposaient leur `dist` compilé
// (`exports → ./dist/index.js`), jamais rebâti quand leur `src` changeait → le
// serveur de dev servait du vieux code en silence. La remédiation : chaque amont
// expose une condition d'export `development → ./src/index.ts` que le Vite UNIQUE
// (5173) choisit en dev, et Kanopi les EXCLUT du pré-bundling → Vite compile leur
// source à la volée (zéro dist dans la boucle de dev → impossible de périmer).
//
// CETTE GARDE (portée KANOPI) vérifie que la CONVENTION reste uniforme : les 3
// deps consommées-en-source gardent leur condition d'export `development` pointant
// vers un `./src/index.ts` réel, ET que le Vite intégrateur les exclut du
// pré-bundling. Si une régresse (un amont retire l'export, ou on oublie l'exclude),
// la boucle de dev retomberait silencieusement sur le `dist` périmé — c'est
// EXACTEMENT ce qu'on interdit. Erreur bloquante au portillon.
//
// HORS PORTÉE ICI : la fraîcheur du `dist` de CHAQUE amont (« dist pas en retard
// sur src pour la prod ») appartient au portillon de CET amont (il possède son
// build), pas à celui de Kanopi. La garde jumelle y est définie séparément.

import { readFileSync, existsSync, lstatSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import {
  legendeDesVoisins,
  voisinsLies,
  raisonDuRefus,
  racinesExposees,
  atteintLePaquet,
} from "./lib/voisins-lies.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// Les amonts compilés consommés EN SOURCE par le Vite intégrateur.
const SOURCE_DEPS = ["@kairos/core", "@kronos/core", "bpx"];
const EXPECTED_DEV = "./src/index.ts";

const errors = [];

// 1) LE RÉGIME DE CHAQUE AMONT COMPILÉ, CONFRONTÉ À LA DETTE INSCRITE.
const REGISTRE = JSON.parse(
  readFileSync(join(__dirname, "lib", "regimes-des-voisins.json"), "utf8"),
);
const DETTE = REGISTRE["encore-en-source"] ?? {};
let examines = 0;

for (const dep of SOURCE_DEPS) {
  const pkgPath = join(repoRoot, "node_modules", dep, "package.json");
  if (!existsSync(pkgPath)) {
    errors.push(
      `${dep} : package.json introuvable (${pkgPath}) — dépendance non installée ?`,
    );
    continue;
  }
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch (e) {
    errors.push(`${dep} : package.json illisible (${e.message})`);
    continue;
  }
  examines++;
  const dev = pkg.exports?.["."]?.development;
  const inscrit = Object.prototype.hasOwnProperty.call(DETTE, dep);

  if (dev !== undefined && !inscrit) {
    errors.push(
      `${dep} : expose une condition d'export "development" (\"${dev}\") et n'est PAS inscrit à la ` +
        `dette de lib/regimes-des-voisins.json. Un dépôt ne consomme que le paquet publié d'un ` +
        `voisin (décision Romain 2026-08-24) : soit ce voisin la retire, soit la dette le nomme ` +
        `avec sa date et ce qui la lèvera.`,
    );
    continue;
  }
  if (dev === undefined && inscrit) {
    errors.push(
      `${dep} : n'expose plus de condition "development" — la dette inscrite le ${DETTE[dep].le} ne ` +
        `décrit plus rien. Retire son entrée de lib/regimes-des-voisins.json : une inscription qui ` +
        `survit à sa cause couvre la réapparition suivante.`,
    );
    continue;
  }
  if (dev === undefined) {
    // Consommé par son paquet : ce qui doit répondre est la porte publiée, pas une source.
    const publiee = pkg.exports?.["."]?.import;
    const cible = publiee && join(repoRoot, "node_modules", dep, publiee);
    if (!publiee || !existsSync(cible)) {
      errors.push(
        `${dep} : consommé par son paquet, et sa porte publiée ne répond pas ` +
          `(exports["."].import = ${publiee ? `"${publiee}"` : "ABSENTE"}). Ce qui passe par cette ` +
          `porte résoudrait ZÉRO fichier.`,
      );
    }
    continue;
  }
  // Dette inscrite : la cible source doit exister, sinon la résolution échoue.
  if (dev !== EXPECTED_DEV) {
    errors.push(
      `${dep} : inscrit à la dette, mais sa condition "development" vaut "${dev}" au lieu de ` +
        `"${EXPECTED_DEV}" — la dette décrit un régime qui n'est pas celui-là.`,
    );
    continue;
  }
  const srcEntry = join(repoRoot, "node_modules", dep, dev);
  if (!existsSync(srcEntry)) {
    errors.push(`${dep} : la cible "${dev}" n'existe pas (${srcEntry}).`);
  }
}

// ⛔ UN GARDE COMPTE CE QU'IL A EXAMINÉ ET REFUSE D'AVOIR EXAMINÉ ZÉRO.
if (examines === 0) {
  errors.push(
    "aucun amont compilé n'a été examiné — la mesure a raté, elle n'a pas trouvé zéro dette.",
  );
}

// 2) Le Vite intégrateur doit EXCLURE ces deps du pré-bundling (sinon Vite les
//    fige en un chunk pré-bundlé = re-périmable). Vérif textuelle du vite.config.
const viteConfig = join(repoRoot, "packages", "ui", "vite.config.ts");
if (!existsSync(viteConfig)) {
  errors.push(`vite.config.ts introuvable (${viteConfig}).`);
} else {
  const txt = readFileSync(viteConfig, "utf8");
  const excludeMatch = txt.match(/exclude\s*:\s*\[([^\]]*)\]/);
  const excluded = excludeMatch ? excludeMatch[1] : "";
  // Seuls les voisins ENCORE consommés en source doivent sortir du pré-bundling : un paquet publié
  // est immuable, le pré-bundler ne peut pas le périmer.
  //
  // ⛔ ET UN ZÉRO SE DÉCLARE ICI, il ne se traverse pas en silence. Depuis le retrait de la dernière
  // condition `development` de la tour (bpx, 2026-08-30), cette boucle n'examine RIEN — et une boucle
  // muette sur un ensemble vide a exactement l'apparence d'une boucle qui a tout vérifié.
  if (Object.keys(DETTE).length === 0)
    console.log(
      "• dette de consommation en source : ZÉRO voisin inscrit — cette vérification n'examine " +
        "rien, et c'est l'état visé. Elle mord de nouveau dès qu'une entrée réapparaît.",
    );
  for (const dep of Object.keys(DETTE)) {
    if (!excluded.includes(`'${dep}'`) && !excluded.includes(`"${dep}"`)) {
      errors.push(
        `vite.config.ts : optimizeDeps.exclude doit lister "${dep}" (consommation en source hors pré-bundling).`,
      );
    }
  }
}

// 3) Anti-rechute COPIE MANUELLE : un dep consommé en source ne doit JAMAIS exister en `node_modules`
//    sous forme de DOSSIER RÉEL (copie). npm le pose en SYMLINK (lockfile `link:true`) ; une copie
//    manuelle (rsync de debug) le SHADOW et PÉRIME en silence — c'est exactement le bug bpscript
//    2026-06-30. Règle d'or : JAMAIS de rsync dans node_modules. Le dep doit être ABSENT du root ou un
//    symlink (jamais un dossier réel). On vérifie aux 2 niveaux (root hoisté + packages/ui non hoisté).
for (const dep of ["bpscript", ...SOURCE_DEPS]) {
  for (const base of ["node_modules", "packages/ui/node_modules"]) {
    const p = join(repoRoot, base, dep);
    if (!existsSync(p)) continue;
    const st = lstatSync(p);
    if (st.isDirectory() && !st.isSymbolicLink()) {
      errors.push(
        `${base}/${dep} est un DOSSIER RÉEL (copie) — doit être un SYMLINK (npm) ou absent. Une copie ` +
          `manuelle shadow le symlink npm et périme. Règle : jamais de rsync dans node_modules → \`rm -rf ${base}/${dep}\`.`,
      );
    }
  }
}

// 4) LA LÉGENDE DU VERT — de quel ÉTAT voisin ce portillon a-t-il mesuré (2026-07-30).
//
// POURQUOI, ET CE N'EST PAS UNE PRÉCAUTION THÉORIQUE : ces deps sont des SYMLINKS vers les
// ARBRES DE TRAVAIL des voisins. Une modification non commitée chez eux est donc dans MON build
// à la seconde où elle est écrite (règle d'atelier 2026-07-29, `hub/AGENT_WELCOME.md`, section « Coordination via la tour »).
// Le 2026-07-30, bpscript m'a demandé si une ancre qu'il n'avait PAS ENCORE POUSSÉE risquait de
// faire sonner une de mes scènes : mesuré, elle sonnait DÉJÀ (11 hauteurs gravées), et mon
// portillon vert de l'heure précédente avait tourné AVEC. Un revert chez lui aurait changé le
// SENS de mon vert sans qu'un seul de mes fichiers bouge, et RIEN chez moi ne l'aurait signalé.
//
// ICI, CE N'EST PAS UNE ERREUR, ET LE VETO VIT AILLEURS. Ce fichier tourne dans la boucle de
// DÉVELOPPEMENT et au portillon, où un voisin a le droit d'avoir un arbre en cours : échouer
// là-dessus rendrait cette boucle otage de leurs brouillons. Ce qu'il rend est une LÉGENDE — un
// vert doit dire contre QUOI il a été mesuré.
//
// LE REFUS, LUI, EST EN PRODUCTION (décision Romain 2026-08-13) : le greffon `vite.config.ts`
// arrête la construction dès qu'un voisin porte du non enregistré QUI ENTRE DANS LE PAQUET.
// Deux lieux, une seule mesure (`voisinsLies`) — ce n'est pas une seconde autorité, c'est la même
// lue à deux moments, et la légende ci-dessous nomme AUSSI ce que le refus laisse passer.
//
// ET LE DOSAGE COMPTE, il a été mesuré : au moment d'écrire ceci, kairos portait un seul fichier
// modifié — son BACKLOG. Un compte brut aurait crié au loup dès la première note de backlog, et
// un signal qui crie pour rien est un signal qu'on cesse de lire. La légende QUALIFIE donc ce
// qu'elle compte — « dans le build » ou non — au lieu de le cacher.
// LA LISTE NE S'ÉCRIT PLUS ICI, ELLE SE DÉCOUVRE. Elle était en dur et comptait QUATRE deps ;
// mesuré le 2026-08-13, l'atelier en lie ONZE — bp3-frontend et les six runtimes manquaient à
// l'appel, donc leur état ne figurait dans aucune légende. `voisinsLies` énumère les liens réels,
// et c'est LA MÊME mesure que le refus de production (`vite.config.ts`) : deux lecteurs, une
// seule vérité, jamais deux chiffres qui se contredisent à l'écran.
const etats = legendeDesVoisins(voisinsLies(repoRoot), repoRoot);
console.log("• état des voisins lus VIVANTS (la légende du vert) :");
for (const e of etats) console.log(`    ${e}`);
if (etats.some((e) => e.includes("NON COMMITÉ"))) {
  console.log(
    "    ⚠ Ce portillon mesure donc contre du travail non poussé chez un voisin : un revert chez lui\n" +
      "      changerait le SENS de ce résultat sans qu’un fichier bouge ici. À citer dans tout rapport.",
  );
}

// 5bis) LE QUALIFICATIF SE DÉRIVE DU MANIFESTE DU VOISIN, et il doit trancher DANS LES DEUX SENS.
//    Éprouvé sur MON PROPRE voisin, pas sur un manifeste inventé : kairos expose `dist` et `src`,
//    et rien d'autre. C'est le cas qui a fait mordre à tort la première version — elle énumérait
//    des dossiers par leur nom et ne connaissait pas `fixtures/`, où kairos venait de copier mon
//    corpus. Un manifeste illisible fait TOUT compter : l'ignorance penche du côté du refus.
// ⛔ LE CHEMIN SE DÉRIVE, IL NE S'ÉCRIT PAS. Il portait `/home/romi/dev/bp/kairos` en absolu :
// sur une autre machine ce garde aurait déclaré le manifeste illisible et mon portillon serait
// devenu rouge pour une cause étrangère au dépôt. Un chemin absolu ne se déclare nulle part et
// ne se voit qu'au moment où il échoue, ailleurs que là où il a été écrit (atlas, 2026-08-14).
// ⛔ ET IL LIT L'ÉTAT PUBLIÉ, PLUS L'ARBRE DE TRAVAIL — 2026-09-04. Ce chemin remontait vers le
// dossier vif du voisin : la moindre frappe de kairos changeait ce que ce garde dérivait, sans qu'il
// ait rien enregistré ni publié. C'était la forme ÉCLATÉE — le nom du voisin passé en segment
// séparé plutôt que collé au chemin — celle que le
// garde des sources voisines ne voyait pas avant sa définition du 2026-09-04 — mon compte est donc
// passé de 7 à 12 sans qu'aucun geste n'ait régressé : l'instrument voyait moins qu'il n'affirmait.
// ⇒ Mesurer la fraîcheur contre l'état PUBLIÉ est aussi la seule lecture cohérente : c'est celui-là
//   que je consomme depuis la migration, et un qualificatif dérivé d'un autre état parlerait d'un
//   voisin que je n'utilise pas.
const RACINES_KAIROS = racinesExposees(
  resolve(repoRoot, "..", ".publie", "kairos"),
);
if (RACINES_KAIROS === null) {
  errors.push(
    "le manifeste de kairos n'est plus lisible — le qualificatif du refus ne se dérive plus, tout compterait.",
  );
} else {
  // ⛔ LES CAS SE DÉRIVENT DU MANIFESTE, ILS NE S'ÉCRIVENT PAS. Ils portaient `src/index.ts` comme
  // cas VRAI — juste tant que kairos exposait `src`. Le 2026-08-24 il a retiré sa condition de
  // développement, `src` a quitté ses portes, et ce contrôle a fait rougir mon pré-vol pour un
  // geste ANNONCÉ, mesuré et attendu. Un contrôle calé sur l'état d'un voisin se casse à chaque
  // frappe de ce voisin, et il accuse alors le seul innocent de l'affaire.
  // ⇒ Le cas VRAI se prend sur une porte réellement déclarée ; les cas FAUX sur des dossiers dont
  //   on vérifie d'abord qu'ils n'en sont pas. L'épreuve reste sur le VOISIN RÉEL — c'est ce qui
  //   lui a fait connaître `fixtures/` là où une liste inventée l'ignorait.
  const HORS = [
    "fixtures/scenes/vina.bps",
    "docs/note.md",
    "BACKLOG.md",
  ].filter((f) => !RACINES_KAIROS.has(f.split("/")[0]));
  const CAS = [
    [`${[...RACINES_KAIROS][0]}/index.js`, true],
    ...HORS.map((f) => [f, false]),
  ];
  if (RACINES_KAIROS.size === 0 || HORS.length === 0) {
    errors.push(
      "l'épreuve du qualificatif n'a plus de cas des DEUX côtés — un contrôle qui n'exerce qu'un " +
        "sens ne distingue plus un garde juste d'un garde qui dit toujours la même chose.",
    );
  }
  for (const [fichier, attendu] of CAS) {
    if (atteintLePaquet(fichier, RACINES_KAIROS) !== attendu) {
      errors.push(
        `le qualificatif se trompe sur « ${fichier} » : attendu ${attendu ? "DANS" : "HORS"} le paquet. ` +
          "Un garde trop large fait remiser du travail pour rien, un garde trop étroit laisse passer une source vive.",
      );
    }
  }
  if (atteintLePaquet("n-importe-quoi", null) !== true) {
    errors.push(
      "un manifeste illisible doit faire TOUT compter — l'ignorance penche du côté du refus.",
    );
  }
}

// 5) LE REFUS DE PRODUCTION MORD, ET SUR LA BONNE FRONTIÈRE. `raisonDuRefus` ne s'exerce qu'au
//    `vite build`, où l'atelier est presque toujours propre : sans ces échantillons, il pourrait
//    être devenu aveugle depuis des semaines sans qu'un seul vert le dise. Deux échantillons, et
//    le second compte autant que le premier — depuis l'arbitrage du 2026-08-13 la frontière n'est
//    plus « un fichier modifié » mais « un fichier QUI ENTRE », et un garde trop large ferait
//    remiser du travail pour rien.
const ECHANTILLONS = [
  [
    "un fichier de source non enregistré",
    [{ etat: "M", fichier: "src/index.ts", atteintLeBuild: true }],
    true,
  ],
  [
    "un backlog et de l'outillage d'agent",
    [
      { etat: "M", fichier: "BACKLOG.md", atteintLeBuild: false },
      { etat: "??", fichier: ".claude/settings.json", atteintLeBuild: false },
    ],
    false,
  ],
];
for (const [quoi, modifications, doitRefuser] of ECHANTILLONS) {
  const rendu = raisonDuRefus([
    {
      depot: "/tmp/voisin-temoin",
      chemin: "/tmp/voisin-temoin",
      tete: "0000000",
      specificateurs: [],
      modifications,
    },
  ]);
  if (Boolean(rendu) !== doitRefuser) {
    errors.push(
      `le refus de production ${doitRefuser ? "NE MORD PAS" : "MORD À TORT"} sur ${quoi} — ` +
        "il ne prouve plus rien (décision Romain 2026-08-13 : le refus porte sur ce qui entre dans le paquet).",
    );
  }
}

if (errors.length) {
  console.error(
    "✗ garde deps-fraîches — convention de consommation en source ROMPUE :",
  );
  for (const e of errors) console.error(`  • ${e}`);
  console.error(
    "\nRappel : un dépôt ne consomme que le PAQUET PUBLIÉ d'un voisin (décision Romain " +
      "2026-08-24). La consommation en source est une DETTE inscrite, datée, et elle ne peut " +
      "que rétrécir : scripts/lib/regimes-des-voisins.json.",
  );
  process.exit(1);
}

console.log(
  `✓ deps-fraîches — ${examines} amont(s) examiné(s) ; dette de consommation en source : ` +
    `${Object.keys(DETTE).length ? Object.keys(DETTE).join(", ") : "AUCUNE"}.`,
);
