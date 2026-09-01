#!/usr/bin/env node
/**
 * LE FILET REND-IL ENCORE LA NULLITÉ ? — l'épreuve par injection du verdict de campagne tuée.
 *
 * ⛔ CE QUE CE FILET EXISTE POUR EMPÊCHER, MESURÉ LE 2026-09-01. Une arme a été tuée par un délai
 * d'outillage à 09:58, la tour a levé le gel, et AUCUN verdict n'est parti. Les DOUZE dépôts gelés
 * ont alors signalé le signe que l'avis leur demande de rendre — « un second avis avant le verdict
 * du précédent » — alors qu'aucune seconde arme n'existait. La levée dit que la fenêtre est close ;
 * elle ne dit PAS qu'aucune mesure n'en sort, et c'est exactement ce qu'un lecteur ne peut deviner.
 *
 * ⇒ LE RANG EST LE POINT, relevé par runtime-ui : le verdict de nullité a bien fini par partir, à la
 *   main, UNE MINUTE APRÈS l'avis suivant. Tant qu'il peut suivre l'avis d'après, la clause crie.
 *   Émis par le filet lui-même, il précède toujours la campagne suivante.
 *
 * ⛔ ET UN FILET QU'ON N'A PAS VU MORDRE EST UNE HYPOTHÈSE. Celui-ci vit dans un gestionnaire de
 * signal : il ne s'exerce jamais pendant une campagne saine, donc il pourrit sans qu'un rouge le
 * dise. Ce garde le tire à chaque portillon.
 *
 * ⛔ L'ÉPREUVE NE GÈLE PERSONNE ET N'ENVOIE RIEN. Elle exerce le VRAI code de `tir-arme.mjs` — une
 * copie dont la SEULE ligne modifiée est la destination de la tour, déviée vers un mouchard qui
 * enregistre au lieu d'envoyer. Éprouver en tuant une vraie campagne ferait précisément la chose que
 * ce filet existe pour réparer.
 *
 * LES DEUX MOITIÉS, ET IL FAUT LES DEUX :
 *   fenêtre OUVERTE   → signal → un verdict de nullité par gelé, PUIS la fermeture
 *   AVANT l'ouverture → signal → AUCUN verdict — personne n'a été gelé, il n'y a rien à annuler
 * Sans la seconde, un filet qui écrirait toujours rendrait la même sortie et n'aurait rien prouvé.
 */
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  symlinkSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const ARME = join(ICI, "tir-arme.mjs");

/** La ligne d'injection : elle pose l'état de campagne puis lève le signal, et n'existe QUE dans la
 *  copie. Le reste du fichier est celui que le dépôt porte. */
const INJECTION = [
  "if (process.env.EPREUVE_CAS) {",
  '  if (process.env.EPREUVE_CAS === "fenetre-ouverte") {',
  '    identifiant = "kanopi-EPREUVE0001Z";',
  '    geles = ["voisin-a", "voisin-b", "voisin-c"];',
  "  }",
  '  process.kill(process.pid, "SIGTERM");',
  "  await new Promise((r) => setTimeout(r, 4000));",
  "}",
].join("\n");

/** Le point d'ancrage : la déclaration après laquelle les deux variables existent. Un ancrage qui ne
 *  se trouve plus fait ÉCHOUER — il veut dire que l'arme a bougé sous ce garde. */
const ANCRE = "let identifiant = null;";
const LIGNE_TOUR = /^const TOUR = .*$/m;

function preparerLaCopie(atelier) {
  const source = readFileSync(ARME, "utf8");
  if (!source.includes(ANCRE))
    throw new Error(
      `l'ancre « ${ANCRE} » a disparu de tir-arme.mjs — ce garde ne sait plus où injecter, ` +
        `et un garde qui ne sait pas où mordre doit ÉCHOUER, jamais avertir`,
    );
  if (!LIGNE_TOUR.test(source))
    throw new Error(
      "la ligne qui désigne la tour a disparu de tir-arme.mjs — l'épreuve ne peut plus la dévier, " +
        "et sans déviation elle enverrait de VRAIS messages à de VRAIS voisins",
    );
  const copie = source
    .replace(LIGNE_TOUR, "const TOUR = process.env.TOUR_EPREUVE;")
    .replace(ANCRE, `${ANCRE}\n${INJECTION}`);
  const chemin = join(atelier, "arme-copie.mjs");
  writeFileSync(chemin, copie, "utf8");
  // Les librairies que l'arme importe par chemin relatif.
  symlinkSync(join(ICI, "lib"), join(atelier, "lib"));
  return chemin;
}

function poserLeMouchard(atelier) {
  const chemin = join(atelier, "tour-mouchard");
  writeFileSync(
    chemin,
    "#!/bin/bash\n" +
      'echo "$*" >> "$MOUCHARD"\n' +
      'if [ "$1" = "note" ] && [ "$3" = "--fichier" ]; then cat "$4" >> "$MOUCHARD.corps"; fi\n' +
      "exit 0\n",
    "utf8",
  );
  chmodSync(chemin, 0o755);
  return chemin;
}

function tirer(copie, mouchard, atelier, cas) {
  const journal = join(atelier, `${cas}.log`);
  try {
    execFileSync("node", [copie], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TOUR_EPREUVE: mouchard,
        MOUCHARD: journal,
        EPREUVE_CAS: cas,
      },
    });
  } catch {
    /* l'arme sort en 130 sur un signal — c'est le comportement éprouvé, pas un échec */
  }
  const lignes = existsSync(journal)
    ? readFileSync(journal, "utf8").split("\n").filter(Boolean)
    : [];
  const corps = existsSync(`${journal}.corps`)
    ? readFileSync(`${journal}.corps`, "utf8")
    : "";
  return { notes: lignes.filter((l) => l.startsWith("note ")), corps };
}

const atelier = mkdtempSync(join(tmpdir(), "kanopi-filet-"));
const manques = [];
try {
  const copie = preparerLaCopie(atelier);
  const mouchard = poserLeMouchard(atelier);

  const ouverte = tirer(copie, mouchard, atelier, "fenetre-ouverte");
  if (ouverte.notes.length !== 3)
    manques.push(
      `fenêtre OUVERTE : ${ouverte.notes.length} verdict(s) de nullité déposé(s), 3 attendus — un par ` +
        `gelé. Une arme tuée laisserait ses gelés sans savoir qu'aucune mesure ne sort de leur ` +
        `discipline, et leur signalement porterait sur le mauvais défaut.`,
    );
  if (!/VERDICT DE LA CAMPAGNE kanopi-EPREUVE0001Z : NULLE/.test(ouverte.corps))
    manques.push(
      "fenêtre OUVERTE : le corps déposé ne nomme pas la campagne comme NULLE. Un verdict qui ne " +
        "nomme pas sa campagne ne se rattache à rien chez le lecteur.",
    );

  const avant = tirer(copie, mouchard, atelier, "avant-ouverture");
  if (avant.notes.length !== 0)
    manques.push(
      `AVANT l'ouverture : ${avant.notes.length} verdict(s) déposé(s), zéro attendu. Un filet qui ` +
        `écrit toujours rendrait la même sortie que celui qui discrimine, et cette épreuve n'aurait ` +
        `rien prouvé.`,
    );
} catch (e) {
  manques.push(String(e.message));
} finally {
  rmSync(atelier, { recursive: true, force: true });
}

if (manques.length) {
  console.log("⛔ LE FILET DE NULLITÉ NE MORD PLUS :");
  for (const m of manques) console.log(`   · ${m}`);
  process.exit(1);
}
console.log(
  "✓ filet de nullité — 2 cas éprouvés : fenêtre ouverte → 3 verdicts, avant ouverture → 0",
);
