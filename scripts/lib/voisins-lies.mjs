// LES VOISINS LIÉS — une seule mesure de « quel état d'un voisin j'ai sous la main ».
//
// Un dépôt lié est consommé VIVANT : ce que le voisin ENREGISTRE m'atteint sans construction ni
// publication, et la frontière d'un changement chez lui est l'enregistrement du fichier, jamais
// son commit. Deux lecteurs ont besoin de la même mesure, et ils doivent la partager plutôt que
// de la refaire chacun de son côté — sinon ils finissent par se contredire à l'écran :
//
//   • la LÉGENDE du portillon (`deps-fraicheur.mjs`) — contre quel état ce vert a-t-il été mesuré ;
//   • le REFUS de production (greffon Vite de `packages/ui/vite.config.ts`) — Kanopi refuse de
//     démarrer en production quand un dépôt consommé par lien symbolique porte des modifications
//     non enregistrées QUI ENTRENT DANS SON PAQUET (décision Romain 2026-08-13, précisée le même
//     jour : le refus regarde ce qui rentre, pas l'arbre de travail entier).
//
// LA LISTE N'EST PAS ÉCRITE : elle se DÉCOUVRE. Une liste en dur des voisins vieillit en silence —
// un lien ajouté n'y entrerait pas et ne serait donc jamais mesuré. On énumère les liens
// symboliques réels de `node_modules`, y compris à portée (`@kairos/core`), aux deux niveaux où
// npm les pose (racine hoistée et paquet).

import {
  readdirSync,
  lstatSync,
  realpathSync,
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import { relative } from "node:path";
import { execFileSync } from "node:child_process";
import { loadavg, cpus } from "node:os";
import { join } from "node:path";

/**
 * LES RACINES QU'UN PAQUET EXPOSE — dérivées de SON manifeste, jamais énumérées ici.
 *
 * CE QUALIFICATIF EST CE SUR QUOI LE REFUS SE PRONONCE. Mesuré le 2026-08-13 : la lecture
 * littérale — refuser sur l'arbre de travail ENTIER — rendait le portillon définitivement rouge.
 * Cinq voisins, neuf fichiers, et pas un seul n'arrivait dans le paquet. Romain a tranché sur ce
 * fait : le refus regarde ce qui RENTRE.
 *
 * ⛔ ET LA PREMIÈRE VERSION DE CE QUALIFICATIF ÉNUMÉRAIT DES EMPLACEMENTS PAR LEUR NOM —
 * `docs/`, `test/`, `.claude/` — ce qui l'a fait mordre à tort le jour même : kairos a pris une
 * copie de mon corpus dans `fixtures/`, un nom que la liste ne connaissait pas, et ma construction
 * de production a refusé de démarrer sur des données de banc qui n'entrent nulle part chez moi.
 * Un garde trop large fait remiser du travail pour rien, et c'est exactement ce que l'arbitrage
 * voulait éviter. LA LISTE NE S'ÉCRIT DONC PLUS : chaque paquet DIT lui-même ce qu'il expose, dans
 * son manifeste, et c'est cela qu'on lit. Un manifeste illisible fait tout compter — l'ignorance
 * penche du côté du refus, jamais du laissez-passer.
 */
export function racinesExposees(depot) {
  let manifeste;
  try {
    manifeste = JSON.parse(readFileSync(join(depot, "package.json"), "utf8"));
  } catch {
    return null; // manifeste illisible → on ne qualifie pas, tout compte
  }

  const cibles = [];
  const recolter = (v) => {
    if (typeof v === "string") cibles.push(v);
    else if (v && typeof v === "object")
      for (const x of Object.values(v)) recolter(x);
  };
  recolter(manifeste.exports);
  for (const champ of ["main", "module", "types", "browser", "bin"]) {
    recolter(manifeste[champ]);
  }
  // `files` dit ce que le paquet EMPORTE à la publication — même autorité, même lecture.
  if (Array.isArray(manifeste.files)) recolter(manifeste.files);

  const racines = new Set();
  for (const c of cibles) {
    const segment = c.replace(/^\.?\//, "").split("/")[0];
    if (segment && segment !== "." && !segment.startsWith("*"))
      racines.add(segment);
  }
  return racines.size > 0 ? racines : null;
}

/** Ce fichier peut-il atteindre mon paquet ? Vrai dès qu'il vit sous une racine que le voisin
 *  expose lui-même — et vrai par défaut quand son manifeste ne dit rien. */
export function atteintLePaquet(fichier, racines) {
  if (racines === null) return true;
  const segment = fichier.split("/")[0];
  return racines.has(segment);
}

/** Sortie BRUTE de git, sans `trim` global : `status --porcelain` code l'état sur DEUX colonnes
 *  de largeur fixe, et un fichier modifié non indexé commence par une ESPACE (` M chemin`). Un
 *  `trim` sur la sortie entière mange celle de la PREMIÈRE ligne et décale son chemin d'un
 *  caractère — mesuré : « BACKLOG.md » s'affichait « ACKLOG.md ». Les colonnes se coupent, elles
 *  ne se rognent pas. */
function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).replace(/\n$/, "");
}

/** Les emplacements où npm pose un lien : la racine hoistée et chaque paquet de l'atelier. */
function basesNodeModules(racine) {
  const bases = [join(racine, "node_modules")];
  const paquets = join(racine, "packages");
  if (existsSync(paquets)) {
    for (const p of readdirSync(paquets, { withFileTypes: true })) {
      if (p.isDirectory()) bases.push(join(paquets, p.name, "node_modules"));
    }
  }
  return bases.filter((b) => existsSync(b));
}

/** Les entrées d'un `node_modules`, en descendant d'un cran dans les portées (`@kairos/…`). */
function entrees(base) {
  const out = [];
  for (const e of readdirSync(base, { withFileTypes: true })) {
    if (e.name === ".bin") continue;
    if (e.name.startsWith("@") && e.isDirectory() && !e.isSymbolicLink()) {
      for (const s of readdirSync(join(base, e.name), {
        withFileTypes: true,
      })) {
        out.push([`${e.name}/${s.name}`, join(base, e.name, s.name)]);
      }
    } else {
      out.push([e.name, join(base, e.name)]);
    }
  }
  return out;
}

/**
 * Chaque dépôt voisin consommé par lien symbolique, avec l'état de son arbre de TRAVAIL.
 *
 * Rend, par dépôt (dédupliqué : plusieurs spécificateurs peuvent viser le même dépôt) :
 *   { depot, chemin, tete, specificateurs[], modifications[{etat, fichier, atteintLeBuild}] }
 * Un dépôt hors git est rendu avec `tete: null` — son état n'est pas mesurable, ce qui est en
 * soi une information et jamais un silence.
 */
export function voisinsLies(racine) {
  // Une racine passée avec une barre finale (`new URL('../..', …).pathname` en rend une) ferait
  // échouer le test d'appartenance ci-dessous, et l'atelier se compterait LUI-MÊME parmi ses
  // voisins : son propre travail en cours refuserait sa propre construction. Mesuré.
  racine = realpathSync(racine.replace(/\/+$/, ""));
  const parDepot = new Map();

  for (const base of basesNodeModules(racine)) {
    for (const [specificateur, chemin] of entrees(base)) {
      let cible;
      try {
        if (!lstatSync(chemin).isSymbolicLink()) continue;
        cible = realpathSync(chemin);
      } catch {
        continue;
      }
      // Un lien interne à l'atelier (paquet à paquet) n'est pas un voisin.
      if (cible === racine || cible.startsWith(racine + "/")) continue;

      // ⛔ UN VOISIN EST UN DÉPÔT DONT LA CIBLE EST LA RACINE — pas « un dossier qui se trouve dans un
      // dépôt ». Mesuré le 2026-08-24, à la première bascule vers un paquet publié : runtime-OSC
      // publie sous `~/dev/bp/.paquets/`, et `~/dev` est lui-même un dépôt git SANS AUCUN COMMIT.
      // `--show-toplevel` remontait donc jusqu'à lui, et je prenais l'atelier entier pour un voisin :
      // `rev-parse HEAD` échouait sur une tête qui n'existe pas, et `status --porcelain` m'aurait
      // rendu les modifications de TOUT l'atelier comme entrant dans mon paquet.
      // ⇒ Un paquet publié n'a pas d'arbre de travail à juger : il porte son empreinte, et c'est elle
      //   qui le nomme. Il tombe donc dans la branche « sans dépôt » ci-dessous, comme il doit.
      let depot;
      try {
        const sommet = git(cible, ["rev-parse", "--show-toplevel"]);
        depot = realpathSync(sommet) === cible ? sommet : null;
      } catch {
        depot = null;
      }
      const cle = depot ?? cible;
      if (parDepot.has(cle)) {
        parDepot.get(cle).specificateurs.push(specificateur);
        continue;
      }

      if (depot === null) {
        parDepot.set(cle, {
          depot: cible,
          chemin: cible,
          tete: null,
          specificateurs: [specificateur],
          modifications: [],
        });
        continue;
      }

      const racines = racinesExposees(depot);
      // ⛔ `status` RAFRAÎCHIT L'INDEX ET PREND `.git/index.lock` DANS LE DÉPÔT DU VOISIN — sa
      // commande git échoue alors sur « Unable to create '.git/index.lock' », rarement et sans que
      // rien chez lui ne le nomme. Trouvé par runtime-UI, routé par l'architecte le 2026-08-30 ; la
      // cause est la décision « un verdict porte le régime sous lequel il a été pris », qui oblige à
      // nommer l'état d'un voisin.
      //
      // ⇒ MESURÉ CHEZ MOI PAR LA TRACE D'EXÉCUTION, APPEL PAR APPEL — un banc prouve ma porte, jamais
      //   mon branchement. Un seul relevé, `tir-arme.mjs --releve` :
      //     72 `status --porcelain` vers un voisin  ⇒ 9 verrous pris, chez NEUF dépôts
      //     64 `rev-parse --show-toplevel`          ⇒ 0
      //     64 `rev-parse --short HEAD`             ⇒ 0
      //   ⇒ Le drapeau va donc ICI ET NULLE PART AILLEURS : posé sur les `rev-parse` il ne répare
      //     rien et devient du bruit qu'un lecteur suivant prendrait pour une règle.
      //
      // ⛔ ET 72 APPELS NE FONT QUE 9 VERROUS : git ne réécrit l'index que s'il l'a rafraîchi. Une
      //   mesure prise alors que les index des voisins sont à jour rend ZÉRO chez un dépôt coupable.
      //   Le témoin de non-vacuité doit donc porter sur le VERROU, jamais sur le nombre d'accès.
      const modifications = git(depot, ["--no-optional-locks", "status", "--porcelain"])
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          const fichier = l.slice(3).trim();
          return {
            etat: l.slice(0, 2).trim(),
            fichier,
            atteintLeBuild: atteintLePaquet(fichier, racines),
          };
        });

      parDepot.set(cle, {
        depot,
        chemin: cible,
        tete: git(depot, ["rev-parse", "--short", "HEAD"]),
        specificateurs: [specificateur],
        modifications,
      });
    }
  }

  return [...parDepot.values()].sort((a, b) => a.depot.localeCompare(b.depot));
}

/**
 * L'état de chaque voisin lu vivant, une ligne par dépôt — la LÉGENDE d'un résultat : ce sur quoi
 * il a été obtenu. Un vert mesuré contre l'arbre de travail d'un voisin change de sens si ce voisin
 * revient en arrière, sans qu'un fichier bouge ici ; la ligne le dit à qui lit le résultat.
 *
 * Une seule fabrique pour tous les producteurs de légende (portillon, campagne de bancs) : deux
 * vocabulaires pour le même état laisseraient l'un dériver pendant que l'autre reste juste.
 */
/**
 * Les PORTES qu'un voisin déclare, et celles qui répondent.
 *
 * Une porte est une cible d'entrée écrite dans son manifeste — `exports` (toutes conditions
 * confondues), `main`, `module`, `types`, `browser`. Chaque consommateur en emprunte une, et
 * laquelle dépend de lui : le vérificateur de types passe par `types`, la construction de
 * production par `default`, le serveur de développement par `development`.
 *
 * ⛔ ON COMPTE PAR PORTE, ET C'EST MESURÉ. Un voisin qui bascule son paquet construit par
 * renommage a, l'instant du renommage, sa porte `types` VIDE pendant que sa porte `development`
 * répond encore. Un compte global le dirait « partiellement là » ; le consommateur, lui, résout
 * ZÉRO fichier — c'est arrivé le 2026-08-19, et le rouge a accusé trois de mes fichiers pour une
 * signature qui n'arrivait pas.
 *
 * Les cibles à joker (`./*`) sortent : elles ne désignent pas un fichier.
 */
export function portesDuVoisin(v) {
  let manifeste;
  try {
    manifeste = JSON.parse(
      readFileSync(join(v.chemin, "package.json"), "utf8"),
    );
  } catch {
    return { declarees: [], muettes: [], manifesteIllisible: true };
  }
  const cibles = [];
  const recolter = (x) => {
    if (typeof x === "string") cibles.push(x);
    else if (x && typeof x === "object")
      for (const y of Object.values(x)) recolter(y);
  };
  recolter(manifeste.exports);
  for (const champ of ["main", "module", "types", "browser"])
    recolter(manifeste[champ]);

  const declarees = [...new Set(cibles)].filter(
    (c) => c.startsWith(".") && !c.includes("*"),
  );
  const muettes = declarees.filter((c) => !existsSync(join(v.chemin, c)));
  return { declarees, muettes, manifesteIllisible: false };
}

/** Chaque fichier sous un dossier, en descendant. Un lien symbolique ne se suit pas : il désignerait
 *  un arbre qui n'appartient pas au voisin, et le relevé compterait deux fois. */
function sousArbre(base) {
  const out = [];
  // Une racine exposée n'est pas forcément un DOSSIER : un manifeste peut lister un fichier seul
  // (`files: ["package.json"]`). Mesuré sur BPscript, qui expose le sien.
  if (!statSync(base).isDirectory()) return [base];
  for (const e of readdirSync(base, { withFileTypes: true })) {
    const p = join(base, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) out.push(...sousArbre(p));
    else out.push(p);
  }
  return out;
}

/**
 * UN BANC DU VOISIN N'ATTEINT AUCUNE DE SES PORTES — il vit sous une racine exposée sans que rien
 * ne l'importe, et le publier ne le charge dans aucun de mes bancs. Le relever fait rougir ma
 * campagne pour un fichier qu'elle n'ouvrira jamais : mesuré le 2026-08-21, deux `.test.ts` de
 * Kairos ont invalidé quinze minutes de mesure. Borne posée sur arbitrage de l'architecte le même
 * jour, avec la borne de régime ci-dessous.
 */
function estUnBancDuVoisin(cle) {
  return /(^|\/)__tests__\//.test(cle) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(cle);
}

/**
 * L'EMPREINTE de ce que chaque voisin EXPOSE, à un instant donné — le relevé qui se prend AVANT.
 *
 * ⛔ LE RELEVÉ SE FAIT AVANT, ET C'EST TOUT LE POINT. Un contrôle passé après la panne mesure le
 * mauvais instant : la fenêtre est refermée, le paquet est de nouveau entier, et il répond que
 * tout va bien. Prélevée avant et comparée après, l'empreinte dit si le paquet a bougé PENDANT.
 *
 * ⛔ L'INODE **ET** LA DATE, ET IL FAUT LES DEUX — aucune des deux ne suffit seule.
 *
 * La date seule ne voit rien : une bascule par renommage remplace le fichier **en préservant sa
 * date**. L'inode seul peut mentir : celui que la suppression de l'ancien paquet libère est
 * RÉATTRIBUABLE au chantier suivant, et l'empreinte serait alors identique des deux côtés d'une
 * vraie bascule — muette exactement quand elle compte. Mesuré chez Kairos : trois cycles, trois
 * inodes différents, donc ça tient *la plupart du temps* ; « la plupart du temps » n'est pas une
 * propriété tenue. Le risque croît avec le nombre de voisins surveillés, et j'en surveille onze
 * quand il en surveille deux.
 *
 * La taille reste, à coût nul : elle sépare deux contenus qu'inode et date verraient identiques.
 *
 * ⛔ CE QUE CE RELEVÉ SUIT, EXACTEMENT : TOUT CE QUI PEUT ATTEINDRE MA PRODUCTION, LA TRANSITIVITÉ
 * COMPRISE — chaque fichier sous chaque racine que le manifeste du voisin expose, et non ses seules
 * portes déclarées. Les portes n'y ont qu'un statut à part : elles peuvent être MUETTES, un état
 * qu'un fichier ordinaire n'a pas.
 *
 * DEUX MESURES IMPOSENT CETTE LARGEUR, et elles sont d'ordres différents.
 *
 * Une porte dit ce qu'on peut IMPORTER ; elle ne dit pas ce que le code FAIT. Le paquet de Kairos
 * porte 156 fichiers sous sa racine exposée, dont DEUX sont des portes : une reconstruction qui ne
 * réécrit pas les fichiers d'entrée — un compilateur incrémental saute ce qui n'a pas changé —
 * laisserait les deux portes intactes pendant que le comportement change derrière elles. Le garde
 * serait vert et muet. Mesuré le 2026-08-20, sur la publication qui l'a rendu visible.
 *
 * Et un fichier qui n'est PAS une porte m'atteint quand une porte l'importe. Mesuré le même jour :
 * `src/transpiler/parser.js` chez BPscript a bougé pendant une campagne de treize minutes. Il ne
 * figure dans aucune de ses six portes déclarées ; sa porte principale l'importe, donc il entre
 * dans ce que j'exécute. Ce relevé l'a vu parce qu'il balaie la RACINE, pas la liste des portes.
 *
 * ⛔ ET C'EST POURQUOI CETTE DESCRIPTION EST ÉCRITE ICI, AU LONG. J'ai décrit ce garde comme
 * surveillant « les six portes » du voisin — vrai à la mesure, faux à la citation. Une description
 * plus étroite que le mécanisme désigne la « correction » qui le casserait : l'aligner sur la
 * phrase lui ferait cesser de voir exactement ce qu'il venait d'attraper. Arbitrage de l'architecte
 * le 2026-08-20 : corriger la phrase, jamais le garde.
 *
 * ⛔ CETTE LARGEUR RESTE ENTIÈRE SOUS CHAQUE RACINE. Ce qui se borne, c'est l'ENSEMBLE DES RACINES,
 * et il se borne à celles que la campagne LIT dans SON régime — `racinesLuesParRegime`. Un voisin
 * publie deux instances : mes bancs ouvrent sa source (serveur de développement, la surface de
 * pilotage `window.kanopi` est absente d'un build de production), ma construction de production
 * ouvre son paquet. Relever les deux fait refuser une campagne de bancs parce qu'un paquet qu'elle
 * n'a jamais chargé a été republié : mesuré le 2026-08-21, 245 fichiers de `dist` chez BPx pendant
 * que mes 121 bancs lisaient son `src` — intact.
 *
 * LA DISTINCTION EXISTAIT DÉJÀ, ÉCRITE ET AFFICHÉE PAR MA LÉGENDE, ET ELLE N'ÉTAIT PAS BRANCHÉE.
 * Ce n'est donc pas une exigence qu'on baisse, c'est un instrument qu'on recalibre sur une cause
 * établie. Arbitrage de l'architecte du 2026-08-21, avec sa condition : éprouver que le garde mord
 * encore sur une source vive lue par la campagne.
 */
export function empreinteDuVoisin(racine, racinesLues) {
  if (!(racinesLues instanceof Map) || racinesLues.size === 0) {
    throw new Error(
      "RELEVÉ SANS PÉRIMÈTRE — `empreinteDuVoisin` exige les racines que la campagne LIT, rendues " +
        "par `racinesLuesParRegime`. Sans elles il faudrait deviner un périmètre, et un périmètre " +
        "deviné se trompe dans les deux sens : trop large il refuse pour ce qu'il ne lira jamais, " +
        "trop étroit il laisse passer une source vive.",
    );
  }
  const empreinte = new Map();
  for (const v of voisinsLies(racine)) {
    // ⛔ LA CLÉ EST LE SPÉCIFICATEUR QUE JE DÉCLARE, pas le nom du dépôt derrière le lien. Mesuré :
    // clé par dépôt, un lien redirigé vers un AUTRE dépôt fait disparaître l'ancienne clé et le
    // constat devient « le voisin n'est plus lié du tout » — faux, il est lié ailleurs. Ce que je
    // suis, c'est la dépendance ; ce qu'elle désigne peut changer sous elle, et c'est le fait à voir.
    const nom = v.specificateurs[0];
    const racines = racinesLues.get(nom);
    if (!racines || racines.size === 0) {
      throw new Error(
        `PÉRIMÈTRE ABSENT POUR « ${nom} » — ce voisin est lié et la campagne ne sait pas ce ` +
          "qu'elle lit chez lui. Le relever à vide reviendrait à le déclarer immobile sans " +
          "l'avoir regardé, et c'est le seul verdict qu'un instrument en panne rend spontanément.",
      );
    }
    const { declarees } = portesDuVoisin(v);
    const marques = new Map();

    // Les portes d'abord, nommées telles quelles : ce sont elles que le refus « porte muette »
    // désigne, et une entrée déclarée qui ne répond pas doit se distinguer d'un fichier absent.
    // ⛔ CELLES DE CE RÉGIME SEULEMENT : un manifeste déclare les cibles de TOUTES ses conditions,
    // donc la porte de production d'un voisin figure dans `declarees` pendant qu'une campagne de
    // bancs ouvre sa source. La relever ferait refuser une republication que la campagne n'a
    // jamais lue.
    for (const cible of declarees) {
      if (!racines.has(cible.replace(/^\.\//, "").split("/")[0])) continue;
      try {
        const st = statSync(join(v.chemin, cible));
        marques.set(cible, `${st.ino}:${st.mtimeMs}:${st.size}`);
      } catch {
        marques.set(cible, "muette");
      }
    }

    // Puis TOUT ce qui vit sous chaque racine LUE, en descendant. La largeur sous une racine reste
    // entière — c'est elle qui a attrapé `parser.js` — seul l'ensemble des racines se borne.
    for (const racine of racines) {
      const base = join(v.chemin, racine);
      if (!existsSync(base)) continue;
      for (const fichier of sousArbre(base)) {
        const cle = relative(v.chemin, fichier);
        if (marques.has(`./${cle}`)) continue; // déjà pris comme porte
        if (estUnBancDuVoisin(cle)) continue;
        try {
          const st = statSync(fichier);
          marques.set(cle, `${st.ino}:${st.mtimeMs}:${st.size}`);
        } catch {
          marques.set(cle, "disparu");
        }
      }
    }
    if (marques.size === 0) {
      throw new Error(
        `RELEVÉ VIDE CHEZ « ${nom} » — aucune entrée sous ${[...racines].join(", ")}. Un relevé ` +
          "qui n'a rien examiné rend le même verdict qu'un voisin parfaitement immobile.",
      );
    }
    empreinte.set(nom, marques);
  }
  return empreinte;
}

/**
 * Ce qui a BOUGÉ chez un voisin entre le relevé et maintenant, voisin par voisin.
 *
 * Rend une liste vide quand rien n'a bougé — et JAMAIS un silence quand le relevé manque : un
 * relevé absent se distingue d'un relevé sans écart, et se traite comme un échec de mesure.
 */
export function cequiABascule(avant, racine, racinesLues) {
  if (!(avant instanceof Map) || avant.size === 0) {
    throw new Error(
      "COMPARAISON IMPOSSIBLE — aucun relevé n'a été pris avant cette campagne. Sans lui, une " +
        "bascule survenue pendant la mesure serait invisible, et le résultat porterait sur deux " +
        "états de voisin sans que rien ne le dise.",
    );
  }
  // ⛔ LE MÊME PÉRIMÈTRE DES DEUX CÔTÉS. Deux relevés pris sur des racines différentes rendraient
  // « APPARU » et « RETIRÉ » sur des fichiers que personne n'a touchés.
  const apres = empreinteDuVoisin(racine, racinesLues);
  const bouges = [];
  for (const [nom, marquesAvant] of avant) {
    const marquesApres = apres.get(nom);
    if (!marquesApres) {
      bouges.push({ nom, quoi: ["le voisin n'est plus lié du tout"] });
      continue;
    }
    const quoi = [];
    // ⛔ CE QUI EST APPARU DEPUIS LE RELEVÉ. Trouvé le 2026-08-20, par accident, en éprouvant tout
    // autre chose : la comparaison n'itérait que sur le relevé d'AVANT, donc un fichier AJOUTÉ par
    // le voisin pendant la campagne était invisible — et une publication qui ajoute un module sans
    // toucher aux autres est précisément une bascule.
    for (const cible of marquesApres.keys()) {
      if (!marquesAvant.has(cible))
        quoi.push(`${cible} : APPARU depuis le relevé`);
    }
    for (const [cible, marque] of marquesAvant) {
      const maintenant = marquesApres.get(cible);
      if (maintenant === marque) continue;
      // ⛔ UN FICHIER RETIRÉ N'EST PAS UN FICHIER REMPLACÉ, et les confondre envoie chercher un
      // autre contenu là où il n'y a plus rien. Trouvé par injection le 2026-08-20 : une
      // suppression sortait « REMPLACÉ » parce que l'absence d'une marque après coup tombait dans
      // la branche par défaut.
      quoi.push(
        maintenant === undefined
          ? `${cible} : RETIRÉ depuis le relevé`
          : marque === "muette"
            ? `${cible} : porte déclarée muette, elle répond maintenant`
            : maintenant === "muette"
              ? `${cible} : porte déclarée qui répondait, muette maintenant`
              : `${cible} : REMPLACÉ (fichier différent)`,
      );
    }
    if (quoi.length) bouges.push({ nom, quoi });
  }
  return bouges;
}

/** D'où ma résolution part : mon code applicatif, jamais la racine de l'atelier. Un spécificateur
 *  se cherche en remontant depuis le fichier qui l'écrit, et deux points de départ ne trouvent pas
 *  forcément le même paquet. */
const PARENT_APPLICATIF = "packages/ui/src";

/** Le témoin d'assiette de la sonde de résolution : un spécificateur dont la résolution est
 *  certaine. Sans lui, un enfant qui échoue en bloc rendrait « aucun voisin à deux régimes » —
 *  c'est-à-dire la bonne nouvelle, produite par la panne de l'instrument. */
const TEMOIN_DE_RESOLUTION = "svelte";

/** Un enfant Node court, lancé sous un jeu de conditions donné, depuis mon code applicatif. Les
 *  conditions ne se changent pas dans un processus en cours : c'est ce qui impose l'enfant. */
function sousConditions(racine, conditions, script) {
  const args = ["--experimental-import-meta-resolve"];
  for (const c of conditions) args.push(`--conditions=${c}`);
  args.push("--input-type=module", "-e", script);
  return JSON.parse(
    execFileSync(process.execPath, args, {
      cwd: join(racine, PARENT_APPLICATIF),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
}

/** Les conditions de résolution de chaque régime — celles que la campagne emploie RÉELLEMENT.
 *  Les bancs tournent sur un serveur de développement (`playwright.config.ts`, la surface de
 *  pilotage est absente d'un build de production) ; la construction de production emploie l'autre. */
const CONDITIONS_DU_REGIME = {
  bancs: ["browser", "development"],
  production: ["browser", "production"],
};

/** Les sous-chemins qu'un voisin DÉCLARE : les CLÉS de son champ `exports`, plus le paquet nu.
 *  Ce sont des demandes de résolution, pas des cibles — les cibles, elles, mélangent les régimes. */
function sousCheminsDeclares(v) {
  let manifeste;
  try {
    manifeste = JSON.parse(readFileSync(join(v.chemin, "package.json"), "utf8"));
  } catch {
    return ["."];
  }
  const exports = manifeste.exports;
  const cles =
    exports && typeof exports === "object" && !Array.isArray(exports)
      ? Object.keys(exports).filter((c) => c.startsWith(".") && !c.includes("*"))
      : [];
  return cles.includes(".") ? cles : [".", ...cles];
}

/**
 * LES RACINES QUE CETTE CAMPAGNE LIT CHEZ CHAQUE VOISIN — mesurées sur le RÉSOLVEUR, jamais
 * déduites du manifeste.
 *
 * ⛔ UN MANIFESTE DÉCLARE LES CIBLES DE TOUTES SES CONDITIONS À LA FOIS. Lu à plat, il annonce
 * `src` ET `dist` chez un voisin qui n'en sert qu'un seul à la campagne en cours. Seule la
 * résolution sous les conditions du régime dit lequel s'ouvre, et c'est la même sonde que celle
 * qui alimente la légende — un seul mécanisme, deux emplois.
 *
 * Chaque sous-chemin déclaré est demandé, pas seulement le paquet nu : un voisin sert des portes
 * qui vivent sous des racines différentes, et n'en résoudre qu'une rendrait un périmètre partiel
 * sans le dire.
 */
export function racinesLuesParRegime(racine, voisins, regime) {
  const conditions = CONDITIONS_DU_REGIME[regime];
  if (!conditions) {
    throw new Error(
      `RÉGIME INCONNU « ${regime} » — les régimes mesurés sont ${Object.keys(CONDITIONS_DU_REGIME).join(", ")}. ` +
        "Un régime inventé rendrait un périmètre vide, et un périmètre vide passe pour un voisin immobile.",
    );
  }

  const parSpec = new Map();
  const aResoudre = [TEMOIN_DE_RESOLUTION];
  for (const v of voisins) {
    const spec = v.specificateurs[0];
    const demandes = sousCheminsDeclares(v).map((c) =>
      c === "." ? spec : `${spec}/${c.replace(/^\.\//, "")}`,
    );
    parSpec.set(spec, { v, demandes });
    aResoudre.push(...demandes);
  }

  const resolus = sousConditions(
    racine,
    conditions,
    `const out = {}; for (const s of ${JSON.stringify(aResoudre)}) {` +
      ` try { out[s] = import.meta.resolve(s).replace("file://", ""); }` +
      ` catch (e) { out[s] = null; } } console.log(JSON.stringify(out));`,
  );

  // Le témoin d'assiette : sans lui, une sonde en panne rendrait « aucune racine » partout, et
  // « aucune racine » est exactement le résultat qui fait taire le garde sans le dire.
  if (!resolus[TEMOIN_DE_RESOLUTION]) {
    throw new Error(
      `SONDE DE PÉRIMÈTRE INVALIDE — le témoin \`${TEMOIN_DE_RESOLUTION}\` ne se résout pas ` +
        `depuis ${PARENT_APPLICATIF} sous les conditions ${conditions.join(" + ")}. Tout périmètre ` +
        "rendu ici serait produit par sa propre panne.",
    );
  }

  const racines = new Map();
  for (const [spec, { v, demandes }] of parSpec) {
    const set = new Set();
    for (const d of demandes) {
      const chemin = resolus[d];
      if (!chemin) continue;
      const rel = relative(v.chemin, chemin);
      // Une porte qui sort de l'arbre du voisin ne dit rien de ce qu'il expose.
      if (!rel || rel.startsWith("..")) continue;
      set.add(rel.split("/")[0]);
    }
    // ⛔ LES DÉCLARATIONS DE TYPES NE SE RÉSOLVENT PAS PAR NODE, ET MA CAMPAGNE LES LIT. Mesuré à
    // la pose : `runtime-codevoices` expose `dist-types`, que la sonde ne rend jamais — Node
    // n'ouvre pas un `.d.ts`. Or `svelte-check` tourne DANS ma campagne et le lit. Sans cette
    // clause, une republication de ses types pendant une campagne resterait invisible au garde
    // pendant qu'elle change ce que le vérificateur mesure.
    if (regime === "bancs") {
      for (const cible of portesDuVoisin(v).declarees) {
        if (cible.endsWith(".d.ts")) set.add(cible.replace(/^\.\//, "").split("/")[0]);
      }
    }
    if (set.size === 0) {
      throw new Error(
        `AUCUNE PORTE RÉSOLUE CHEZ « ${spec} » sous ${conditions.join(" + ")} — ce voisin est lié ` +
          "et la campagne ne saurait pas quoi surveiller chez lui. Un périmètre vide ne se " +
          "distingue pas d'un voisin immobile.",
      );
    }
    racines.set(spec, set);
  }
  return racines;
}

/**
 * LES DEUX ÉTATS D'UN VOISIN — sa SOURCE VIVE, et le PAQUET que ma production exécute.
 *
 * ⛔ MA LÉGENDE DONNAIT LA TÊTE D'UNE SOURCE PENDANT QUE MA PRODUCTION EXÉCUTAIT UN PAQUET. Les deux
 * coïncidaient par accident de chaîne ; depuis que publier a cessé d'être un maillon de pousser
 * (décision 2026-08-20), un paquet peut être en retard sur sa source, légitimement — et rien ne le
 * disait. Un lecteur prenait donc la tête annoncée pour ce qui tourne.
 *
 * LA MESURE SE PREND SUR LE RÉSOLVEUR, JAMAIS SUR LE MANIFESTE. Un manifeste se lit et se déduit,
 * une résolution se demande. Deux jeux de conditions — celui du développement et celui de la
 * production — rendent chacun le fichier qu'il ouvre. Deux chemins identiques disent une instance
 * unique ; deux chemins différents disent deux états à porter.
 *
 * ⛔ ET LE TÉMOIN SE LIT PAR LA PORTE, PAS À UN CHEMIN ATTENDU. Mesuré : un premier relevé cherchait
 * `dist/empreinte.js` chez les trois voisins à deux régimes et déclarait BPx muet. Il grave, mais
 * ailleurs. La porte, elle, ne se devine pas — et c'est elle que ma production emprunte.
 *
 * LE RÉGIME SOURCE N'A BESOIN D'AUCUN TÉMOIN : `git` donne la tête et la propreté de l'arbre, et
 * la sonde ne peut de toute façon pas l'ouvrir — cette porte-là est en TypeScript, que Node nu ne
 * lit pas. Le régime PAQUET n'a QUE ce témoin, puisqu'un paquet vit hors du suivi de version.
 *
 * La forme lue est celle que les producteurs ont arrêtée : `kairos/docs/forme-empreinte-de-paquet.md`.
 */
/**
 * L'empreinte que chaque porte rend, lue PAR LA PORTE et sous les conditions de production.
 *
 * ⚠️ CETTE LECTURE EXÉCUTE LE PAQUET DU VOISIN — c'est le prix de la lire par la porte, et c'est
 * exactement ce que ma production fait. L'enfant l'isole : un paquet qui explose à l'import rend
 * « témoin illisible », il n'emporte pas le portillon avec lui.
 * La forme lue est celle que les producteurs ont arrêtée : `kairos/docs/forme-empreinte-de-paquet.md`.
 */
export function empreintesParPorte(racine, specificateurs) {
  if (specificateurs.length === 0) return {};
  // ⛔ LA PORTE DÉDIÉE D'ABORD, ET LE REPLI SE NOMME. Arbitrage de l'architecte du 2026-08-24 :
  // l'empreinte se lit par une porte secondaire déclarée, `<voisin>/empreinte`, du même nom chez
  // tous — la ré-exporter depuis les portes métier polluait une surface publique. Les producteurs
  // y passent l'un après l'autre.
  // ⇒ Un repli MUET sur la porte métier serait une voie parallèle : il rendrait la migration
  //   invisible et survivrait à sa fin. Celui-ci pose `parPorteMetier: true`, que la légende
  //   affiche à chaque ligne concernée — il se voit tant qu'il sert, et il disparaîtra avec elle.
  const script =
    `const out = {}; for (const s of ${JSON.stringify(specificateurs)}) {` +
    ` let e = null;` +
    ` try { const d = await import(s + "/empreinte");` +
    `   if (d.EMPREINTE) e = d.EMPREINTE; } catch {}` +
    ` if (!e) { try { const m = await import(s);` +
    `   if (m.EMPREINTE) e = { ...m.EMPREINTE, parPorteMetier: true }; }` +
    `   catch (err) { e = { echec: err.code || String(err.message).split("\\n")[0] }; } }` +
    ` out[s] = e ?? { absente: true }; }` +
    ` console.log(JSON.stringify(out));`;
  return sousConditions(racine, ["browser", "production"], script);
}

export function regimesDesVoisins(racine, voisins) {
  const specs = voisins.map((v) => v.specificateurs[0]);
  const aResoudre = [TEMOIN_DE_RESOLUTION, ...specs];

  const scriptResolution =
    `const out = {}; for (const s of ${JSON.stringify(aResoudre)}) {` +
    ` try { out[s] = import.meta.resolve(s).replace("file://", ""); }` +
    ` catch (e) { out[s] = null; } } console.log(JSON.stringify(out));`;

  const dev = sousConditions(
    racine,
    ["browser", "development"],
    scriptResolution,
  );
  const prod = sousConditions(
    racine,
    ["browser", "production"],
    scriptResolution,
  );

  if (!dev[TEMOIN_DE_RESOLUTION] || !prod[TEMOIN_DE_RESOLUTION]) {
    throw new Error(
      "SONDE DE RÉSOLUTION INVALIDE — le témoin d'assiette " +
        `\`${TEMOIN_DE_RESOLUTION}\` ne se résout pas depuis ${PARENT_APPLICATIF}. Tout ce que ` +
        "cette sonde rendrait serait produit par sa propre panne, à commencer par « aucun voisin " +
        "à deux régimes », qui est la réponse rassurante.",
    );
  }

  // Le témoin d'assiette du RELEVÉ lui-même : si personne n'a deux régimes, c'est peut-être vrai,
  // et la légende le dira voisin par voisin — chaque ligne porte sa mention, aucune ne se tait.
  const aDeuxRegimes = specs.filter(
    (s) => dev[s] && prod[s] && dev[s] !== prod[s],
  );

  let empreintes = {};
  if (aDeuxRegimes.length > 0) {
    // ⚠️ CETTE LECTURE EXÉCUTE LE PAQUET DU VOISIN — c'est le prix de la lire par la porte, et
    // c'est exactement ce que ma production fait. L'enfant l'isole : un paquet qui explose à
    // l'import rend « témoin illisible », il n'emporte pas le portillon avec lui.
    empreintes = empreintesParPorte(racine, aDeuxRegimes);
  }

  const parDepot = new Map();
  voisins.forEach((v, i) => {
    const s = specs[i];
    parDepot.set(v.depot, {
      cheminDev: dev[s],
      cheminProd: prod[s],
      deuxRegimes: aDeuxRegimes.includes(s),
      empreinte: empreintes[s] ?? null,
    });
  });
  return parDepot;
}

/**
 * DE COMBIEN LE PAQUET EST DERRIÈRE LA SOURCE — et si seulement il est derrière.
 *
 * Un paquet en retard sur sa source est LÉGITIME depuis que publier a cessé d'être un maillon de
 * pousser : le nombre de commits dit l'ampleur, et l'ascendance dit qu'il s'agit bien d'un retard.
 * Un paquet qui n'est PAS un ancêtre est tout autre chose — une lignée qui n'est pas celle que je
 * mesure — et les deux ne se rapportent pas de la même façon.
 */
function retardDuPaquet(depot, commitDuPaquet, teteDeSource) {
  try {
    execFileSync(
      "git",
      [
        "-C",
        depot,
        "merge-base",
        "--is-ancestor",
        commitDuPaquet,
        teteDeSource,
      ],
      { stdio: "ignore" },
    );
  } catch {
    return "hors de cette lignée — commit inconnu ici, ou branche divergente";
  }
  const n = git(depot, [
    "rev-list",
    "--count",
    `${commitDuPaquet}..${teteDeSource}`,
  ]);
  return `${n} commit(s) DERRIÈRE cette tête`;
}

/**
 * ⛔ LA VOIE, CLASSÉE DEPUIS UN CHEMIN DÉJÀ RÉSOLU — trois natures, jamais deux.
 *
 * `source` (son `src/`) · `construit` (son `dist/`, DANS son arbre de travail) · `paquet` (un
 * dossier immuable hors arbre). ⇒ Les deux premières vivent dans le même dépôt et n'ont pas le
 * même moment : ce qui bascule une source est une sauvegarde, ce qui bascule un `dist` est une
 * CONSTRUCTION.
 *
 * ⛔ ELLE VIT ICI, ET PAS DEUX FOIS. `etat-pris.mjs` prend sa propre résolution et classe avec
 * cette fonction ; la légende classe le `cheminProd` que la sonde a déjà résolu. Deux copies de ce
 * test dériveraient et rendraient deux voies pour le même voisin.
 */
export function voieDuChemin(chemin) {
  if (!chemin) return null;
  if (/\/\.paquets\//.test(chemin)) return "paquet";
  if (/\/dist(-types)?\//.test(chemin)) return "construit";
  return "source";
}

/** Ce que ma production exécute, en une phrase — ou l'aveu qu'elle ne le sait pas. */
function mentionDuPaquet(regime, teteDeSource, depot) {
  if (!regime) return " · régime non mesuré";
  if (!regime.deuxRegimes) {
    // ⛔ « INSTANCE UNIQUE » NE VEUT PAS DIRE « SOURCE ». Cette phrase a dit « ma production lit
    // cette source » jusqu'au 2026-08-30, pour trois voisins dont je résous le `dist` — kronos,
    // kairos, puis bpx à la fermeture de la dernière condition `development` de la tour. Le fait
    // mesuré ici est qu'il n'y a QU'UNE instance ; laquelle se lit sur le chemin de production, que
    // la sonde a déjà résolu sous `browser+production`. Une mesure juste nommait la mauvaise racine.
    const voie = voieDuChemin(regime.cheminProd);
    if (voie === "construit")
      return (
        " · instance unique, ma production exécute son `dist` — une racine CONSTRUITE dans son " +
        "arbre : sa RECONSTRUCTION m'atteint sans publication, sa frappe sous `src/` non"
      );
    if (voie === "paquet")
      return " · instance unique, ma production exécute un paquet hors de son arbre";
    if (voie === null)
      return " · instance unique, et JE NE SAIS PAS ce que ma production ouvre — la sonde n'a rendu aucun chemin de production";
    return " · instance unique, ma production lit cette source";
  }

  const e = regime.empreinte;
  if (!e || e.absente || e.echec) {
    const cause = e?.echec
      ? `témoin illisible : ${e.echec}`
      : "il n'exporte aucune empreinte";
    return (
      " · ⚠ ma production exécute son PAQUET et JE NE SAIS PAS LEQUEL — " +
      `${cause}. La tête ci-dessus décrit sa source, pas ce qui tourne.`
    );
  }
  if (e.regime !== "paquet") {
    return (
      ` · ⚠ CONTRADICTION — ma production ouvre ${regime.cheminProd} et le témoin qui s'y trouve ` +
      `annonce le régime « ${e.regime} ». L'un des deux ment ; ni l'un ni l'autre n'est utilisable.`
    );
  }
  const sale = e.propre === false ? ", CONSTRUIT SUR UN ARBRE MODIFIÉ" : "";
  const detail = `(${e.construitLe}, ${e.fichiers} fichiers${sale})`;
  const enEcart =
    e.abrege && teteDeSource && !e.commit?.startsWith(teteDeSource);
  return enEcart
    ? ` · ⚠ ma production exécute son PAQUET ${e.abrege} — ` +
        `${retardDuPaquet(depot, e.commit, teteDeSource)} ${detail}`
    : ` · ma production exécute son paquet ${e.abrege}, même tête ${detail}`;
}

export function legendeDesVoisins(voisins, racine) {
  // ⛔ LA RACINE N'EST PAS FACULTATIVE. Une légende qui saurait se passer d'elle rendrait la
  // moitié de la mesure — celle de la source vive — sans jamais dire que l'autre manque.
  const regimes = regimesDesVoisins(racine, voisins);
  // ⛔ UN PAQUET PUBLIÉ SE NOMME PAR SON EMPREINTE, pas par « état non mesurable ». Depuis le
  // 2026-08-24 un voisin peut être consommé par son paquet : il n'a pas d'arbre de travail, et
  // c'est le but. Le dire « non mesurable » serait un mensonge par omission dans la légende même
  // qui existe pour dire contre quoi la campagne mesure.
  const sansDepot = voisins.filter((v) => v.tete === null);
  const empreintesLiees = empreintesParPorte(
    racine,
    sansDepot.map((v) => v.specificateurs[0]),
  );
  return voisins.map((v) => {
    const nom = v.depot.split("/").pop();
    if (v.tete === null) {
      const e = empreintesLiees[v.specificateurs[0]];
      if (e?.regime === "paquet")
        return (
          `${nom} : PAQUET PUBLIÉ ${e.abrege ?? "(sans abrégé)"} — ` +
          `source ${e.propre ? "propre" : "⚠ MODIFIÉE"}, construit ${e.construitLe ?? "?"}, ` +
          `${e.fichiers ?? "?"} fichier(s) · aucun arbre de travail ne m'atteint` +
          (e.parPorteMetier
            ? " · ⚠ empreinte lue par sa porte MÉTIER, sa porte `/empreinte` ne répond pas encore"
            : "")
        );
      return `${nom} : hors git (${v.chemin}) — état non mesurable`;
    }
    const paquet = mentionDuPaquet(regimes.get(v.depot), v.tete, v.depot);
    const atteignant = v.modifications.filter((m) => m.atteintLeBuild);
    // Le compte des portes est sur CHAQUE forme, et c'est mesuré : posé d'abord sur la seule
    // branche « propre », il manquait exactement sur le voisin en travail — celui dont on veut
    // savoir si son paquet répond encore.
    const { declarees, muettes } = portesDuVoisin(v);
    const portes = `${declarees.length - muettes.length}/${declarees.length} porte(s)`;
    if (v.modifications.length === 0)
      return `${nom} @ ${v.tete} — propre, ${portes}${paquet}`;
    if (atteignant.length === 0) {
      return `${nom} @ ${v.tete} — ${v.modifications.length} non enregistré(s), aucun dans le build, ${portes}${paquet}`;
    }
    return (
      `${nom} @ ${v.tete} — ⚠ ${atteignant.length} fichier(s) NON COMMITÉ(S) dans le build, ${portes} : ` +
      atteignant
        .slice(0, 4)
        .map((m) => m.fichier)
        .join(", ") +
      (atteignant.length > 4 ? `, +${atteignant.length - 4}` : "") +
      paquet
    );
  });
}

/**
 * La mention que porte une CAMPAGNE DE BANCS en tête de sortie, et son REFUS.
 *
 * ⛔ ELLE S'ARRÊTE PLUTÔT QUE DE S'AFFICHER VIDE. Une mention absente se lit comme « rien à
 * signaler », alors qu'elle signifie « la mesure n'a pas eu lieu » : c'est le pire des deux
 * silences, parce qu'il rassure. Deux cas la font échouer, et ils sont l'un et l'autre le
 * symptôme d'un calcul qui n'a pas abouti :
 *   • AUCUN voisin trouvé — un garde qui a examiné zéro n'a rien examiné (racine fausse, atelier
 *     déplacé, liens non posés) ;
 *   • un voisin dont l'ÉTAT n'est pas mesurable (hors git) — la campagne ne pourrait pas dire
 *     contre quoi elle a mesuré ce dépôt-là.
 */
/**
 * LA CHARGE DE LA MACHINE, EN TÊTE DE CAMPAGNE — parce qu'un verdict qui ne la porte pas n'est pas
 * rejouable.
 *
 * ⛔ CE QUI L'A FAIT ÉCRIRE, ET C'EST UNE MESURE D'UN VOISIN, PAS UNE INTUITION. runtime-codevoices a
 * relevé le 2026-08-21, sur ce poste : 15,7 de charge pour 12 cœurs, 25 processus de moteur, 45
 * sessions d'agent vivantes — et SON portillon passait de 15,1 s au repos à 39 s sous charge, un
 * FACTEUR QUATRE sur le même travail.
 *
 * CE QUE ÇA EXPLIQUE CHEZ MOI : mes bancs d'écran qui rougissent PAR ROTATION — jamais deux fois le
 * même, jamais deux fois de suite. Un banc qui attend qu'un moteur audio démarre dans une fenêtre
 * FIXE échoue par tirage quand le poste est à ce régime, et le tirage change à chaque passage. La
 * rotation ne mesure aucune régression : ELLE MESURE LE POSTE.
 *
 * Sa doctrine, reprise telle quelle : c'est la même que le régime de lecture. Un verdict qui ne dit
 * pas CONTRE QUEL ÉTAT il a été pris ne se rejoue pas ; un verdict qui ne dit pas SOUS QUELLE CHARGE
 * non plus. La ligne ne corrige aucun instable — elle les rend LISIBLES au lieu de mystérieux.
 */
function mentionDeCharge() {
  const [m1, m5, m15] = loadavg();
  const coeurs = cpus().length;
  const tendu =
    m15 > coeurs
      ? "  ⚠ POSTE EN SURCHARGE — un instable d'écran ici mesure la machine"
      : "";
  return (
    `• charge du poste : ${m1.toFixed(1)} / ${m5.toFixed(1)} / ${m15.toFixed(1)} ` +
    `sur ${coeurs} cœurs (1/5/15 min)${tendu}\n`
  );
}

export function mentionDeRegime(racine) {
  const voisins = voisinsLies(racine);
  if (voisins.length === 0) {
    throw new Error(
      "MENTION DE RÉGIME IMPOSSIBLE — aucun voisin lu vivant n'a été trouvé sous " +
        `${racine}. Cette campagne consomme ses voisins par lien symbolique : en trouver ZÉRO ` +
        "veut dire que la mesure a raté, jamais qu'il n'y en a pas. La campagne s'arrête ici " +
        "plutôt que de rendre un vert dont personne ne pourrait dire sur quel état il porte.",
    );
  }
  // ⛔ UNE DÉPENDANCE SANS DÉPÔT N'EST PAS FORCÉMENT AVEUGLE — depuis le 2026-08-24, un voisin peut
  // être consommé par son PAQUET PUBLIÉ, qui n'a pas d'arbre de travail et n'a pas à en avoir. Ce
  // qui le nomme est son EMPREINTE, lue PAR SA PORTE : `regime: 'paquet'` plus le commit gravé.
  // ⇒ Le refus garde ses dents et change de critère : est aveugle ce qui n'a NI dépôt NI empreinte
  //   de paquet. Un lien vers un dossier quelconque reste refusé, comme avant.
  const sansDepot = voisins.filter((v) => v.tete === null);
  if (sansDepot.length > 0) {
    const empreintes = empreintesParPorte(
      racine,
      sansDepot.map((v) => v.specificateurs[0]),
    );
    const aveugles = sansDepot
      .filter((v) => empreintes[v.specificateurs[0]]?.regime !== "paquet")
      .map((v) => {
        const e = empreintes[v.specificateurs[0]];
        const pourquoi = e?.echec
          ? `témoin illisible : ${e.echec}`
          : e?.absente
            ? "n'exporte aucune empreinte"
            : `régime « ${e?.regime ?? "non dit"} », attendu « paquet »`;
        return `  • ${v.chemin} — ${pourquoi}`;
      });
    if (aveugles.length > 0) {
      throw new Error(
        "MENTION DE RÉGIME INCOMPLÈTE — ces dépendances liées ne disent pas contre quel état je " +
          "mesure : ni dépôt git, ni empreinte de paquet.\n" +
          aveugles.join("\n") +
          "\nLa campagne s'arrête plutôt que de rendre un vert dont personne ne pourrait dire sur " +
          "quel état il porte.",
      );
    }
  }
  // ⛔ LE REFUS EST À ZÉRO, ET ZÉRO N'EST PAS UN SEUIL — c'est une absence. Il ne se règle pas, il
  // ne vieillit pas, il ne devient pas faux au prochain fichier ajouté d'un côté ou de l'autre, et
  // aucun voisin ne peut le franchir en grossissant ou en maigrissant légitimement.
  // Une porte déclarée dont la cible ne répond pas, c'est ZÉRO fichier résolu par cette porte pour
  // qui l'emprunte — et le consommateur qui l'emprunte n'a aucun moyen de le voir : il constate une
  // signature absente, jamais son origine.
  const muets = voisins
    .map((v) => ({ v, ...portesDuVoisin(v) }))
    .filter((x) => x.manifesteIllisible || x.muettes.length > 0);
  if (muets.length > 0) {
    throw new Error(
      "PORTE MUETTE CHEZ UN VOISIN — ces entrées sont déclarées et ne répondent pas :\n" +
        muets
          .map((x) =>
            x.manifesteIllisible
              ? `  • ${x.v.depot.split("/").pop()} — manifeste illisible, aucune porte qualifiable`
              : `  • ${x.v.depot.split("/").pop()} — ${x.muettes.join(", ")}`,
          )
          .join("\n") +
        "\nLa campagne s'arrête : ce qui passe par cette porte résoudrait ZÉRO fichier, et le rouge " +
        "qui s'ensuit accuse les fichiers d'ici pour une cause qui est là-bas.",
    );
  }

  return (
    mentionDeCharge() +
    "• voisins lus VIVANTS — l'état sur lequel cette campagne mesure :\n" +
    legendeDesVoisins(voisins, racine)
      .map((l) => `    ${l}`)
      .join("\n")
  );
}

/**
 * Le texte que le refus de production affiche : ce qui bloque, et où le régler.
 *
 * NE COMPTE QUE CE QUI ENTRE DANS LE PAQUET. Un backlog en cours, une note, de l'outillage
 * d'agent chez un voisin ne changent rien à l'artefact livré : les compter arrêterait la
 * construction sur du bruit, et un refus qui se déclenche sur du bruit finit désarmé.
 * Rend `null` quand rien n'entre — c'est un feu vert, jamais un silence : la légende du
 * portillon nomme et chiffre le reste à chaque passage.
 */
/**
 * Les dépôts dont l'arbre de travail entre dans mon paquet et n'est pas enregistré.
 *
 * ⛔ EXTRAIT POUR QUE LE NOM SORTE. `tir-arme.mjs` n'affichait que « un arbre SALE ferme ma
 * construction de production », sans dire CHEZ QUI — mesuré le 2026-08-24 : trois relevés d'affilée
 * sans un seul nom, donc rien sur quoi agir. C'est la faute que ce dépôt a déjà corrigée une fois
 * sur le verdict de campagne : un refus qui ne permet à personne d'agir s'use aussi vite qu'un
 * refus absent. Une seule source pour le prédicat — le recopier chez l'appelant en ferait une
 * seconde autorité qui dériverait en silence.
 */
export function depotsSales(voisins) {
  return voisins
    .map((v) => ({
      v,
      entrantes: v.modifications.filter((m) => m.atteintLeBuild),
    }))
    .filter(({ entrantes }) => entrantes.length > 0);
}

export function raisonDuRefus(voisins) {
  const sales = depotsSales(voisins);
  if (sales.length === 0) return null;

  const lignes = sales.map(({ v, entrantes }) => {
    const nom = v.depot.split("/").pop();
    const detail = entrantes
      .slice(0, 6)
      .map((m) => `${m.etat || "??"} ${m.fichier}`)
      .join("\n        ");
    const reste =
      entrantes.length > 6 ? `\n        … +${entrantes.length - 6}` : "";
    const horsBuild = v.modifications.length - entrantes.length;
    const aparte = horsBuild
      ? ` (+ ${horsBuild} hors paquet, sans effet ici)`
      : "";
    return `  • ${nom} @ ${v.tete ?? "hors git"} — ${entrantes.length} non enregistré(s) dans le paquet${aparte}\n        ${detail}${reste}`;
  });

  return (
    "CONSTRUCTION DE PRODUCTION REFUSÉE — un dépôt consommé par lien symbolique porte des\n" +
    "modifications non enregistrées QUI ENTRENT DANS CE PAQUET (décision Romain 2026-08-13).\n\n" +
    "Ces dépôts sont lus VIVANTS : leur arbre de travail est DÉJÀ dans ce paquet. Construire ici\n" +
    "produirait un artefact bâti sur un état qui n'existe dans aucun historique — irreproductible,\n" +
    "et impossible à revenir en arrière.\n\n" +
    lignes.join("\n") +
    "\n\nPour débloquer : que chaque voisin enregistre son travail (ou le remise)."
  );
}
