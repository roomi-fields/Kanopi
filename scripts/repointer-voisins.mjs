#!/usr/bin/env node
// ⛔ LA COMMANDE UNIQUE QUI REPOINTE MES LIENS — le second tiers de la pièce consommateur.
//
// Arbitrage de l'architecte du 2026-08-24 : « une commande unique repointe tes liens quand TU le
// décides ». ⇒ Ce que cette commande achète est le mot DÉCIDES : sans elle, l'état pris se subit
// (le lien suit), et le rendre volontaire coûterait un geste manuel qu'on n'écrit nulle part et
// qu'on refait de mémoire à chaque fois.
//
// ⛔ ET ELLE EXISTE PARCE QU'UNE SOMME DE CONTRÔLE NE SE RETROUVE PAS. Pièce de runtime-MIDI,
// versée au patron le 2026-08-24 : son empreinte DÉTECTE une dérive et ne permet à personne de
// RETROUVER l'état — « d'une somme de contrôle on ne tire aucune commande ». Le garde
// `garde-etat-pris.mjs` nomme cette commande dans chacun de ses échecs ; c'est ce qui fait d'un
// rouge une réparation au lieu d'une énigme.
//
//   npm run repointer                       repose chaque lien sur l'état DÉCLARÉ
//   npm run repointer -- --dernier          prend le dernier publié PARTOUT et réécrit la déclaration
//   npm run repointer -- --dernier <nom>…   idem, borné aux voisins nommés
//
// ⛔ LE SENS DES DEUX FORMES N'EST PAS LE MÊME, ET C'EST VOULU. Sans `--dernier`, la déclaration
// fait autorité et le disque se plie ; avec, le disque fait autorité et la déclaration s'écrit.
// Une commande qui ferait les deux à la fois ne permettrait jamais de dire lequel a bougé.

import {
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  renameSync,
} from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { etatPrisReel } from "./lib/etat-pris.mjs";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRE = join(RACINE, "scripts", "lib", "regimes-des-voisins.json");

const args = process.argv.slice(2);
const prendreLeDernier = args.includes("--dernier");
const bornes = args.filter((a) => !a.startsWith("--"));

const registre = JSON.parse(readFileSync(REGISTRE, "utf8"));
const declaration = registre["etat-pris"] ?? {};
const reel = etatPrisReel(RACINE);
const parNom = new Map(reel.map((e) => [e.nom, e]));
const aujourdhui = new Date().toISOString().slice(0, 10);

/** Repose un lien symbolique sur une nouvelle cible, sans jamais laisser le lien absent. */
function reposer(chemin, cible) {
  const provisoire = chemin + ".repointage";
  if (existsSync(provisoire)) unlinkSync(provisoire);
  symlinkSync(cible, provisoire);
  renameSync(provisoire, chemin);
}

/** Le lien symbolique qui porte ce spécificateur, aux deux niveaux où npm les pose. */
function cheminDuLien(nom) {
  for (const base of ["node_modules", "packages/ui/node_modules"]) {
    const p = join(RACINE, base, nom);
    try {
      if (lstatSync(p).isSymbolicLink()) return p;
    } catch {
      /* absent à ce niveau */
    }
  }
  return null;
}

const faits = [];
const refus = [];
let declarationModifiee = false;

for (const [nom, d] of Object.entries(declaration)) {
  if (bornes.length && !bornes.includes(nom)) continue;
  const e = parNom.get(nom);
  if (!e) {
    refus.push(`${nom} : déclaré et plus lié — rien à repointer, retire son entrée.`);
    continue;
  }

  if (d.etage !== "épinglé") {
    // ⛔ « SUIVRE LE DERNIER » EST DÉJÀ CE QUE FAIT UN LIEN VERS UNE SOURCE VIVE : le repointer
    // n'aurait aucun effet, et le prétendre ferait croire à un geste. Deux zéros ne se comptent
    // pas pareil — celui-ci se dit, il ne se compte pas comme un succès.
    if (prendreLeDernier && bornes.includes(nom))
      refus.push(
        `${nom} : déclaré « ${d.etage} » — il suit déjà ce que sa cible porte, il n'y a pas de ` +
          `dernier à prendre. Bascule-le sur « épinglé » d'abord si tu veux fixer un état.`,
      );
    continue;
  }

  const lien = cheminDuLien(nom);
  if (lien === null) {
    refus.push(`${nom} : aucun lien symbolique trouvé — l'installation ne l'a pas posé.`);
    continue;
  }

  // Le dossier des paquets se dérive de la cible actuelle : il ne s'écrit nulle part ici, et une
  // valeur écrite en dur ne se lit ni ne se surcharge.
  const dossierDesPaquets = dirname(realpathSync(lien));
  const nomDuPaquet = basename(realpathSync(lien)).replace(/-[0-9a-f]{7,40}$/, "");

  let empreinte = d.empreinte;
  if (prendreLeDernier) {
    const reference = join(dossierDesPaquets, nomDuPaquet);
    if (!existsSync(reference)) {
      refus.push(
        `${nom} : la référence publiée ${reference} n'existe pas — aucun « dernier » à prendre.`,
      );
      continue;
    }
    const m = /-([0-9a-f]{7,40})$/.exec(realpathSync(reference));
    if (!m) {
      refus.push(
        `${nom} : la référence publiée ne désigne pas un paquet empreint — rien de nommable à prendre.`,
      );
      continue;
    }
    empreinte = m[1];
  }

  const cible = join(dossierDesPaquets, `${nomDuPaquet}-${empreinte}`);
  if (!existsSync(cible)) {
    refus.push(
      `${nom} : l'état ${empreinte} n'existe plus sur le disque (${cible}). Un paquet publié peut ` +
        `être nettoyé ; l'épinglage, lui, ne le retient pas.`,
    );
    continue;
  }

  // ⛔ ON REPOSE MÊME QUAND `realpath` REND DÉJÀ LA BONNE CIBLE. Un lien qui vise la référence
  // MOUVANTE résout aujourd'hui l'état déclaré et un autre demain : c'est la cible ÉCRITE qui
  // fixe, jamais la cible résolue. Sauter le geste ici laisserait l'épinglage à l'état d'ornement,
  // et le garde le dirait — mais après la bascule.
  const avant = e.cibleEcrite;
  reposer(lien, cible);
  faits.push(
    `${nom} : lien reposé sur ${nomDuPaquet}-${empreinte}` +
      (avant === cible ? " (cible écrite inchangée)" : ` (visait ${avant})`),
  );

  if (prendreLeDernier && d.empreinte !== empreinte) {
    registre["etat-pris"][nom] = { ...d, empreinte, le: aujourdhui };
    declarationModifiee = true;
    faits.push(`${nom} : déclaration réécrite — ${d.empreinte} → ${empreinte} (le ${aujourdhui})`);
  }
}

if (declarationModifiee) {
  writeFileSync(REGISTRE, JSON.stringify(registre, null, 2) + "\n");
  console.log(`• déclaration réécrite : ${REGISTRE.replace(RACINE + "/", "")}`);
}

for (const f of faits) console.log(`  ✓ ${f}`);
for (const r of refus) console.log(`  ⚠ ${r}`);

if (!faits.length && !refus.length)
  console.log(
    "  · rien à repointer : aucun voisin n'est déclaré « épinglé »" +
      (bornes.length ? ` parmi ${bornes.join(", ")}` : "") +
      ".",
  );

// Un refus n'est pas une panne du repointage : il nomme un état que le disque ne porte pas.
process.exit(refus.length && !faits.length ? 1 : 0);
