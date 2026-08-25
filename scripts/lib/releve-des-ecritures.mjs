#!/usr/bin/env node
// ⛔ CE QUE JE SURVEILLE CHEZ UN VOISIN, ET L ÉPREUVE QUI LE PROUVE — sur une COPIE, jamais chez lui.
//
// LA RÈGLE : les racines que son manifeste expose, PLUS ce manifeste. Relevé par kronos le
// 2026-08-25 : mon relevé LIT le manifeste pour en DÉRIVER les racines, et ne le surveillait pas —
// un voisin qui bascule `exports` ou `files` pendant ma fenêtre fait changer la liste SOUS ma mesure,
// et mon témoin reste vert en attestant l immobilité d un périmètre qui a bougé.
//
// ⛔ POURQUOI CE MODULE EXISTE À PART, ET C EST LA MOITIÉ DU SUJET. J avais écrit, en frappant cette
// règle : « je n ai pas pu la faire mordre par injection — injecter voudrait dire toucher un fichier
// chez l un d eux, ce que ma propre règle interdit ». C EST FAUX, et kronos l a nommé : ma règle
// interdit d injecter DANS leurs arbres, elle n interdit pas d injecter. J avais pris une
// interdiction pour une impossibilité, et publié un vert muet en me contentant de le NOMMER.
//
// ⇒ UNE INJECTION S ÉPROUVE SUR UNE COPIE. L arbre balayé est donc un PARAMÈTRE — même forme que
//   `gardeCeQueLaPorteEmbarque(racinePaquet, …)` chez kronos, où la racine était déjà un paramètre
//   qu il ne s était pas servi (dix injections écrites cette nuit dans son `dist/` vivant, dont deux
//   qui ont réduit `index.js` à `export const rien = 1` pendant que je le lisais en direct).
//
// ⇒ ET LA COPIE EST LE SEUL ENDROIT OÙ LE CAS DISCRIMINANT PEUT EXISTER. Mesuré le 2026-08-25 : chez
//   les onze voisins, une racine est TOUJOURS plus récente que le manifeste. Je rendais ce constat
//   comme rassurant ; il dit l inverse — aucune mesure sur le réel ne peut distinguer un relevé qui
//   voit le manifeste d un relevé qui l ignore. Sur une copie, je fabrique le cas : manifeste le plus
//   récent, racines figées.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Les racines à surveiller chez un voisin.
 *
 * `lireRacines` est injecté pour que l épreuve puisse décrire un manifeste sans en poser un sur le
 * disque — et pour que le cas « le manifeste n est PAS dans ses `files` » soit exerçable, qui est
 * précisément celui que la règle vise.
 */
export function racinesSurveillees(depot, lireRacines) {
  return new Set([...(lireRacines(depot) ?? []), "package.json"]);
}

/** Chaque fichier sous un dossier. Un lien symbolique ne se suit pas : il désignerait un arbre qui
 *  n appartient pas au voisin. Même règle que le relevé d empreinte. */
function sousArbre(base, out = []) {
  for (const e of readdirSync(base, { withFileTypes: true })) {
    const p = join(base, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) sousArbre(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * La dernière écriture sous les racines surveillées, et le fichier concerné.
 *
 * Rend aussi `examines` : un relevé qui a regardé ZÉRO fichier n a rien relevé, et le dire vaut mieux
 * que rendre un `quand: 0` qu on lira comme « rien n a bougé ».
 */
export function derniereEcriture(chemin, racines) {
  let quand = 0;
  let quoi = null;
  let examines = 0;
  for (const r of racines) {
    const base = join(chemin, r);
    let fichiers;
    try {
      fichiers = statSync(base).isDirectory() ? sousArbre(base) : [base];
    } catch {
      continue; // la racine n existe pas chez lui — ce n est pas une erreur, c est un fait
    }
    for (const f of fichiers) {
      examines++;
      const st = statSync(f);
      if (st.mtimeMs > quand) {
        quand = st.mtimeMs;
        quoi = f.replace(chemin + "/", "");
      }
    }
  }
  return { quand, quoi, examines };
}

// ── L ÉPREUVE, SUR UNE COPIE ────────────────────────────────────────────────────────────────────
// Un arbre factice sous le dossier temporaire du système : aucun voisin n est touché, et le cas que
// le réel ne porte jamais — un manifeste plus récent que toutes les racines — y est FABRIQUÉ.
{
  const { pathToFileURL } = await import("node:url");
  const lanceDirectement =
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
  if (lanceDirectement && process.argv.includes("--eprouver")) {
    const { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");

    const racine = mkdtempSync(join(tmpdir(), "kanopi-epreuve-releve-"));
    const faux = join(racine, "voisin-factice");
    mkdirSync(join(faux, "src"), { recursive: true });
    writeFileSync(join(faux, "src", "index.js"), "export const rien = 1;\n");
    writeFileSync(join(faux, "package.json"), '{"files":["src"]}\n');

    // Le manifeste du voisin n expose QUE `src` — c est exactement le cas que la règle vise :
    // `package.json` n est pas dans ses `files`, et doit être surveillé quand même.
    const sesRacines = () => new Set(["src"]);
    const surveillees = racinesSurveillees(faux, sesRacines);

    const dater = (f, secondes) => {
      const t = new Date("2026-01-01T00:00:00Z").getTime() / 1000 + secondes;
      utimesSync(join(faux, f), t, t);
    };

    const cas = [];
    const juge = (dit, r, attendu) => cas.push({ dit, obtenu: r, ok: r === attendu, attendu });

    // ⛔ LE CAS DISCRIMINANT, celui qui n existe nulle part dans le réel : le manifeste est le plus
    // récent. Un relevé qui ne le surveille pas rendrait `src/index.js` et se dirait immobile.
    dater("src/index.js", 100);
    dater("package.json", 200);
    juge(
      "manifeste PLUS RÉCENT que la racine → c est lui que le relevé nomme",
      derniereEcriture(faux, surveillees).quoi,
      "package.json",
    );

    // TÉMOIN EN SENS INVERSE — sans lui, un relevé qui rendrait TOUJOURS le manifeste passerait le
    // cas précédent pour la mauvaise raison.
    dater("package.json", 100);
    dater("src/index.js", 200);
    juge(
      "racine PLUS RÉCENTE que le manifeste → c est la racine que le relevé nomme",
      derniereEcriture(faux, surveillees).quoi,
      "src/index.js",
    );

    // La règle elle-même : le manifeste entre, alors que le voisin ne l expose pas.
    juge(
      "le manifeste est surveillé même hors des `files` du voisin",
      surveillees.has("package.json"),
      true,
    );

    // Une racine annoncée qui n existe pas chez lui ne casse rien et ne compte rien.
    juge(
      "une racine absente est sautée, le relevé tient",
      derniereEcriture(faux, new Set(["dist", "src", "package.json"])).quoi,
      "src/index.js",
    );

    // ⛔ ANTI-VACUITÉ : un relevé qui a examiné zéro fichier n a rien relevé. Sans ce cas, un balayage
    // cassé rendrait `quand: 0`, qui se lit exactement comme « rien n a bougé ».
    juge(
      "un arbre sans aucune racine lisible rend ZÉRO fichier examiné",
      derniereEcriture(faux, new Set(["nexiste-pas"])).examines,
      0,
    );
    juge(
      "et le relevé réel, lui, examine plus que zéro",
      derniereEcriture(faux, surveillees).examines > 0,
      true,
    );

    rmSync(racine, { recursive: true, force: true });

    let echecs = 0;
    for (const c of cas) {
      if (!c.ok) echecs++;
      console.log(
        `${c.ok ? "✓" : "✗"} ${c.dit}` +
          (c.ok ? "" : `\n    obtenu ${JSON.stringify(c.obtenu)}, attendu ${JSON.stringify(c.attendu)}`),
      );
    }
    const PLANCHER = 6;
    if (cas.length < PLANCHER) {
      console.error(`⛔ ${cas.length} cas éprouvés, ${PLANCHER} attendus — l épreuve ne distingue plus rien.`);
      process.exit(1);
    }
    console.log(
      `${echecs === 0 ? "PASS" : "FAIL"} releve-des-ecritures — ${cas.length} cas éprouvés sur une COPIE, ${echecs} échec(s).`,
    );
    process.exit(echecs ? 1 : 0);
  }
}
