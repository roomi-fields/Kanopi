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

import { readdirSync, lstatSync, realpathSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
    else if (v && typeof v === "object") for (const x of Object.values(v)) recolter(x);
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
    if (segment && segment !== "." && !segment.startsWith("*")) racines.add(segment);
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

      let depot;
      try {
        depot = git(cible, ["rev-parse", "--show-toplevel"]);
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
      const modifications = git(depot, ["status", "--porcelain"])
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
 * Le texte que le refus de production affiche : ce qui bloque, et où le régler.
 *
 * NE COMPTE QUE CE QUI ENTRE DANS LE PAQUET. Un backlog en cours, une note, de l'outillage
 * d'agent chez un voisin ne changent rien à l'artefact livré : les compter arrêterait la
 * construction sur du bruit, et un refus qui se déclenche sur du bruit finit désarmé.
 * Rend `null` quand rien n'entre — c'est un feu vert, jamais un silence : la légende du
 * portillon nomme et chiffre le reste à chaque passage.
 */
export function raisonDuRefus(voisins) {
  const sales = voisins
    .map((v) => ({ v, entrantes: v.modifications.filter((m) => m.atteintLeBuild) }))
    .filter(({ entrantes }) => entrantes.length > 0);
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
