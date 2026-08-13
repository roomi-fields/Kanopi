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
//     non enregistrées (décision Romain 2026-08-13).
//
// LA LISTE N'EST PAS ÉCRITE : elle se DÉCOUVRE. Une liste en dur des voisins vieillit en silence —
// un lien ajouté n'y entrerait pas et ne serait donc jamais mesuré. On énumère les liens
// symboliques réels de `node_modules`, y compris à portée (`@kairos/core`), aux deux niveaux où
// npm les pose (racine hoistée et paquet).

import { readdirSync, lstatSync, realpathSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/** Ce qui, chez un voisin, ne peut pas atteindre mon paquet : sa documentation et ses bancs.
 *  Sert à QUALIFIER une modification, jamais à la masquer — un voisin a le droit d'avoir un
 *  arbre en cours, et le refus se prononce sur la mesure entière. */
const HORS_BUILD =
  /(^|\/)(BACKLOG|CHANGELOG|README|MEMORY|TABLEAU)|\.md$|(^|\/)(docs|\.claude|\.codegraph)\//i;
const EST_BANC = /(^|\/)(test|tests)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

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

      const modifications = git(depot, ["status", "--porcelain"])
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          const fichier = l.slice(3).trim();
          return {
            etat: l.slice(0, 2).trim(),
            fichier,
            atteintLeBuild:
              !HORS_BUILD.test(fichier) && !EST_BANC.test(fichier),
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

/** Le texte que le refus de production affiche : ce qui bloque, et où le régler. */
export function raisonDuRefus(voisins) {
  const sales = voisins.filter((v) => v.modifications.length > 0);
  if (sales.length === 0) return null;

  const lignes = sales.map((v) => {
    const nom = v.depot.split("/").pop();
    const detail = v.modifications
      .slice(0, 6)
      .map(
        (m) =>
          `${m.etat || "??"} ${m.fichier}${m.atteintLeBuild ? "  ← dans le paquet" : ""}`,
      )
      .join("\n        ");
    const reste =
      v.modifications.length > 6
        ? `\n        … +${v.modifications.length - 6}`
        : "";
    return `  • ${nom} @ ${v.tete ?? "hors git"} — ${v.modifications.length} non enregistré(s)\n        ${detail}${reste}`;
  });

  return (
    "CONSTRUCTION DE PRODUCTION REFUSÉE — un dépôt consommé par lien symbolique porte des\n" +
    "modifications non enregistrées (décision Romain 2026-08-13).\n\n" +
    "Ces dépôts sont lus VIVANTS : leur arbre de travail est DÉJÀ dans ce paquet. Construire ici\n" +
    "produirait un artefact bâti sur un état qui n'existe dans aucun historique — irreproductible,\n" +
    "et impossible à revenir en arrière.\n\n" +
    lignes.join("\n") +
    "\n\nPour débloquer : que chaque voisin enregistre son travail (ou le remise)."
  );
}
