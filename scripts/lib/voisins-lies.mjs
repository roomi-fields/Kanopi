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
    manifeste = JSON.parse(readFileSync(join(v.chemin, "package.json"), "utf8"));
  } catch {
    return { declarees: [], muettes: [], manifesteIllisible: true };
  }
  const cibles = [];
  const recolter = (x) => {
    if (typeof x === "string") cibles.push(x);
    else if (x && typeof x === "object") for (const y of Object.values(x)) recolter(y);
  };
  recolter(manifeste.exports);
  for (const champ of ["main", "module", "types", "browser"]) recolter(manifeste[champ]);

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
 * ⛔ ET ON EMPREINT TOUT CE QUE LE VOISIN EXPOSE, PAS SES SEULES PORTES D'ENTRÉE. Une porte dit ce
 * qu'on peut IMPORTER ; elle ne dit pas ce que le code FAIT. Le paquet de Kairos porte 156 fichiers
 * sous sa racine exposée, dont DEUX sont des portes : une reconstruction qui ne réécrit pas les
 * fichiers d'entrée — un compilateur incrémental saute ce qui n'a pas changé — laisserait les deux
 * portes intactes pendant que le comportement change derrière elles. Le garde serait vert et muet.
 * Mesuré le 2026-08-20, sur la publication qui l'a rendu visible.
 */
export function empreinteDuVoisin(racine) {
  const empreinte = new Map();
  for (const v of voisinsLies(racine)) {
    // ⛔ LA CLÉ EST LE SPÉCIFICATEUR QUE JE DÉCLARE, pas le nom du dépôt derrière le lien. Mesuré :
    // clé par dépôt, un lien redirigé vers un AUTRE dépôt fait disparaître l'ancienne clé et le
    // constat devient « le voisin n'est plus lié du tout » — faux, il est lié ailleurs. Ce que je
    // suis, c'est la dépendance ; ce qu'elle désigne peut changer sous elle, et c'est le fait à voir.
    const nom = v.specificateurs[0];
    const { declarees } = portesDuVoisin(v);
    const marques = new Map();

    // Les portes d'abord, nommées telles quelles : ce sont elles que le refus « porte muette »
    // désigne, et une entrée déclarée qui ne répond pas doit se distinguer d'un fichier absent.
    for (const cible of declarees) {
      try {
        const st = statSync(join(v.chemin, cible));
        marques.set(cible, `${st.ino}:${st.mtimeMs}:${st.size}`);
      } catch {
        marques.set(cible, "muette");
      }
    }

    // Puis TOUT ce que le voisin expose, en descendant chaque racine de son manifeste.
    const racines = racinesExposees(v.depot);
    for (const racine of racines ?? []) {
      const base = join(v.chemin, racine);
      if (!existsSync(base)) continue;
      for (const fichier of sousArbre(base)) {
        const cle = relative(v.chemin, fichier);
        if (marques.has(`./${cle}`)) continue; // déjà pris comme porte
        try {
          const st = statSync(fichier);
          marques.set(cle, `${st.ino}:${st.mtimeMs}:${st.size}`);
        } catch {
          marques.set(cle, "disparu");
        }
      }
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
export function cequiABascule(avant, racine) {
  if (!(avant instanceof Map) || avant.size === 0) {
    throw new Error(
      "COMPARAISON IMPOSSIBLE — aucun relevé n'a été pris avant cette campagne. Sans lui, une " +
        "bascule survenue pendant la mesure serait invisible, et le résultat porterait sur deux " +
        "états de voisin sans que rien ne le dise.",
    );
  }
  const apres = empreinteDuVoisin(racine);
  const bouges = [];
  for (const [nom, portesAvant] of avant) {
    const portesApres = apres.get(nom);
    if (!portesApres) {
      bouges.push({ nom, quoi: ["le voisin n'est plus lié du tout"] });
      continue;
    }
    const quoi = [];
    for (const [cible, marque] of portesAvant) {
      const maintenant = portesApres.get(cible);
      if (maintenant === marque) continue;
      quoi.push(
        marque === "muette"
          ? `${cible} était muette, elle répond maintenant`
          : maintenant === "muette"
            ? `${cible} répondait, elle est muette maintenant`
            : `${cible} a été REMPLACÉE (fichier différent)`,
      );
    }
    if (quoi.length) bouges.push({ nom, quoi });
  }
  return bouges;
}

export function legendeDesVoisins(voisins) {
  return voisins.map((v) => {
    const nom = v.depot.split("/").pop();
    if (v.tete === null) return `${nom} : hors git (${v.chemin}) — état non mesurable`;
    const atteignant = v.modifications.filter((m) => m.atteintLeBuild);
    // Le compte des portes est sur CHAQUE forme, et c'est mesuré : posé d'abord sur la seule
    // branche « propre », il manquait exactement sur le voisin en travail — celui dont on veut
    // savoir si son paquet répond encore.
    const { declarees, muettes } = portesDuVoisin(v);
    const portes = `${declarees.length - muettes.length}/${declarees.length} porte(s)`;
    if (v.modifications.length === 0) return `${nom} @ ${v.tete} — propre, ${portes}`;
    if (atteignant.length === 0) {
      return `${nom} @ ${v.tete} — ${v.modifications.length} non enregistré(s), aucun dans le build, ${portes}`;
    }
    return (
      `${nom} @ ${v.tete} — ⚠ ${atteignant.length} fichier(s) NON COMMITÉ(S) dans le build, ${portes} : ` +
      atteignant
        .slice(0, 4)
        .map((m) => m.fichier)
        .join(", ") +
      (atteignant.length > 4 ? `, +${atteignant.length - 4}` : "")
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
  const aveugles = voisins.filter((v) => v.tete === null).map((v) => v.chemin);
  if (aveugles.length > 0) {
    throw new Error(
      "MENTION DE RÉGIME INCOMPLÈTE — l'état de ces dépôts liés n'est pas mesurable (hors git) :\n" +
        aveugles.map((c) => `  • ${c}`).join("\n") +
        "\nLa campagne s'arrête : elle ne peut pas dire contre quel état elle mesure ceux-là.",
    );
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
    "• voisins lus VIVANTS — l'état sur lequel cette campagne mesure :\n" +
    legendeDesVoisins(voisins)
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
