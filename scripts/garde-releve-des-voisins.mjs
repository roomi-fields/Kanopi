#!/usr/bin/env node
/**
 * LE RELEVÉ DES VOISINS MORD-IL ENCORE ? — l'épreuve par injection du garde de bascule.
 *
 * Ce garde protège l'ATTRIBUABILITÉ d'une campagne : si un voisin bascule pendant mes quinze
 * minutes de mesure, le résultat porte sur deux états, donc sur aucun. Le 2026-08-21 son périmètre
 * a été borné deux fois — aux racines que la campagne LIT dans son régime, et hors des bancs du
 * voisin. Un garde qu'on borne sans reprouver sa morsure est un garde qu'on a éteint, et il ne
 * préviendra jamais qu'il s'est tu. Condition posée par l'architecte avec l'arbitrage.
 *
 * L'INJECTION NE TOUCHE AUCUN ARBRE. Le comparateur reçoit un relevé d'AVANT fabriqué et lit le
 * disque RÉEL : altérer une marque dans l'avant produit exactement ce qu'aurait produit un voisin
 * qui écrit. Écrire chez lui pour l'éprouver serait faire la chose que ce garde existe pour voir.
 */
import {
  voisinsLies,
  racinesLuesParRegime,
  empreinteDuVoisin,
  cequiABascule,
} from "./lib/voisins-lies.mjs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RACINE = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const BANC = /\.(test|spec)\.[cm]?[jt]sx?$/;

const echecs = [];
const dire = (ok, quoi) => {
  console.log(`  ${ok ? "✓" : "✗"} ${quoi}`);
  if (!ok) echecs.push(quoi);
};

const voisins = voisinsLies(RACINE);
const racines = racinesLuesParRegime(RACINE, voisins, "bancs");
const reel = empreinteDuVoisin(RACINE, racines);
const clone = (m) => new Map([...m].map(([k, x]) => [k, new Map(x)]));

// ⛔ LE DÉNOMINATEUR AVANT TOUT LE RESTE. Un garde compte ce qu'il a examiné et refuse d'avoir
// examiné zéro : sans ce seuil, un relevé en panne rendrait « rien n'a bougé » avec la même forme
// qu'un atelier parfaitement calme.
//
// ⛔ ET IL SE COMPTE PAR VOISIN, PAS SEULEMENT EN SOMME. Mesuré le 2026-08-23 : le total valait 921 et
// cachait la question que kairos et bp3-frontend ont posée le même quart d'heure — « des chemins que
// tu gèles n'existent pas chez moi ; si ton banc les lit, il lit du vide ». La réponse était non, et
// il a fallu la produire À LA MAIN parce que ce garde ne la portait pas. Un seul voisin muet — racine
// renommée chez lui, manifeste qui cesse de l'exposer — disparaît sous une somme que les dix autres
// maintiennent au-dessus du seuil.
//
// LE SEUIL PAR VOISIN EST ZÉRO, ET IL N'EST PAS CHOISI : un voisin lié expose ses racines par son
// PROPRE manifeste, donc une racine relevée existe chez lui par construction. Zéro entrée n'est pas
// « un voisin calme », c'est une racine qui a disparu sous le relevé.
const voisinsMuets = (releve) =>
  [...releve].filter(([, m]) => m.size === 0).map(([nom]) => nom);

let entrees = 0;
for (const m of reel.values()) entrees += m.size;
const muets = voisinsMuets(reel);
if (voisins.length < 8 || entrees < 200) {
  console.error(
    `[garde-releve] RELEVÉ TROP MAIGRE POUR PROUVER QUOI QUE CE SOIT — ${voisins.length} voisin(s), ` +
      `${entrees} entrée(s). L'épreuve qui suit ne mesurerait que sa propre panne.`,
  );
  process.exit(1);
}
if (muets.length) {
  console.error(
    `[garde-releve] ${muets.length} VOISIN(S) RELEVÉ(S) À ZÉRO ENTRÉE — ${muets.join(", ")}. ` +
      `Leur manifeste expose des racines que ce relevé ne trouve pas : sur eux, « rien n'a bougé » et ` +
      `« rien n'a été lu » rendent le même vert.`,
  );
  process.exit(1);
}
// LE DÉTAIL PAR VOISIN EST IMPRIMÉ, PAS SEULEMENT VÉRIFIÉ : un chiffre qui s'effondre chez un seul se
// lit alors dans le journal de la campagne, avant d'atteindre le seuil zéro.
console.log(
  `[garde-releve] ${voisins.length} voisins, ${entrees} entrées en régime bancs — ` +
    `${[...reel].map(([n, m]) => `${n}:${m.size}`).join(" ")}`,
);

// 0. Le vert honnête. Un garde qui mord toujours ne garde rien : il se fait désarmer à la première
//    campagne propre, et c'est déjà arrivé ici (comparaison rendue en promesse, 2026-08-20).
dire(
  cequiABascule(reel, RACINE, racines).length === 0,
  "un relevé intact ne dénonce personne",
);

// 0 bis. LE DÉNOMINATEUR PAR VOISIN MORD. Le seuil zéro ci-dessus sort avant les épreuves, donc il
//    ne peut pas s'éprouver sur `reel` : c'est sa FONCTION qu'on injecte, sur un clone, comme le reste.
{
  const faux = clone(reel);
  const cible = [...faux.keys()][0];
  faux.set(cible, new Map());
  dire(
    voisinsMuets(faux).includes(cible),
    `un voisin relevé à ZÉRO entrée est dénoncé (${cible})`,
  );
  dire(
    voisinsMuets(reel).length === 0,
    "…et aucun ne l'est aujourd'hui — sinon la morsure ci-dessus ne prouverait rien",
  );
}

// 1. Il mord sur CE QUE LA CAMPAGNE CHARGE VRAIMENT chez ce voisin.
// ⛔ L'INJECTION VISAIT UNE ENTRÉE SOUS `src/`, ET CE N'ÉTAIT PAS LA BONNE QUESTION. Le 2026-08-24,
//    kairos a fermé sa condition de développement : ses portes ne mènent plus qu'à `dist`, plus
//    aucune entrée en `src/` n'est relevée, et ce contrôle a rendu « injection impossible » — donc
//    fait rougir mon pré-vol pour un geste annoncé, mesuré et attendu. C'est la troisième fois du
//    jour qu'un de mes contrôles est calé sur l'état d'un voisin au lieu de sa forme.
// ⇒ Ce qui compte n'est pas le dossier d'où vient l'entrée, c'est qu'elle soit RELEVÉE : le relevé
//   ne contient que ce qui m'atteint, quel que soit le régime du voisin.
for (const cible of ["bpscript", "@kairos/core"]) {
  const faux = clone(reel);
  const marques = faux.get(cible);
  const source = [...marques.keys()][0];
  if (!source) {
    dire(false, `${cible} : relevé VIDE, injection impossible`);
    continue;
  }
  marques.set(source, "MARQUE-INJECTEE");
  const vu = cequiABascule(faux, RACINE, racines).find((b) => b.nom === cible);
  dire(
    Boolean(vu),
    `${cible} : une entrée lue qui bascule est dénoncée (${source})`,
  );
}

// 2. Il mord sur la porte de TYPES. Node ne l'ouvre jamais — `svelte-check`, lui, la lit, et il
//    tourne dans cette campagne. Mesuré le 2026-08-21 : `tsconfig.json` renvoie `bpx/dist/index.js`
//    vers `BPx/dist/index.d.ts`, et mon propre fichier de déclarations l'emprunte trois fois.
{
  const faux = clone(reel);
  const marques = faux.get("bpx");
  const dts = [...marques.keys()].find((k) => k.endsWith(".d.ts"));
  if (dts) {
    marques.set(dts, "MARQUE-INJECTEE");
    const vu = cequiABascule(faux, RACINE, racines).find(
      (b) => b.nom === "bpx",
    );
    dire(
      Boolean(vu),
      `bpx : une déclaration de types qui bascule est dénoncée (${dts})`,
    );
  } else {
    dire(false, "bpx : aucune déclaration de types relevée");
  }
}

// 2 bis. Il mord sur le MANIFESTE, chez CHACUN — et ce cas manquait.
//   ⛔ Le 2026-09-01, une mesure a montré que sur ONZE manifestes que mon avis gèle, QUATRE seulement
//   entraient au relevé : le manifeste n'y venait que chez les voisins qui l'exposent ou dont le
//   régime courant le compte parmi ses racines. Chez les sept autres, une bascule de manifeste sous
//   ma fenêtre n'était vue par personne.
//   ⇒ ET CE GARDE NE POUVAIT PAS LE DIRE : il éprouvait sa morsure sur des `dist/` et sur une
//     déclaration de types, jamais sur un manifeste. Un garde ne prouve que ce qu'il a examiné, et le
//     trou a survécu chez moi sans rougir parce que rien ne le visait.
//   ⇒ POURQUOI LE MANIFESTE COMPTE MÊME QUAND JE NE LE LIS PAS, argument de kronos du 2026-08-25 :
//     il DÉFINIT la liste de mes racines. S'il bascule sous ma mesure, mon périmètre a changé et mon
//     témoin reste vert en attestant l'immobilité d'un périmètre qui a bougé.
{
  let examines = 0;
  const muets = [];
  for (const [nom, marques] of reel) {
    const cle = [...marques.keys()].find(
      (k) => k === "package.json" || k === "./package.json",
    );
    if (!cle) {
      muets.push(`${nom} : AUCUN manifeste au relevé`);
      continue;
    }
    // Un voisin sans manifeste porte la marque qui le dit — elle ne se fait pas passer pour une
    // empreinte, et l'injecter ne prouverait rien.
    if (marques.get(cle) === "sans manifeste") continue;
    examines++;
    const faux = clone(reel);
    faux.get(nom).set(cle, "MARQUE-INJECTEE");
    if (!cequiABascule(faux, RACINE, racines).find((b) => b.nom === nom))
      muets.push(`${nom} : manifeste basculé et NON dénoncé`);
  }
  // ⛔ UN GARDE COMPTE CE QU'IL A EXAMINÉ ET REFUSE D'AVOIR EXAMINÉ ZÉRO.
  if (examines === 0) muets.push("aucun manifeste examiné — ce cas ne teste rien");
  dire(
    muets.length === 0,
    muets.length === 0
      ? `le manifeste de chaque voisin est relevé et sa bascule dénoncée (${examines})`
      : muets.join(" · "),
  );
}

// 3. Il NE mord PAS sur un banc du voisin — et l'épreuve porte sur du réel, pas sur du vide.
{
  const sous = (base) => {
    const out = [];
    for (const e of readdirSync(base, { withFileTypes: true })) {
      const p = join(base, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) out.push(...sous(p));
      else out.push(p);
    }
    return out;
  };
  let surDisque = 0;
  let releves = 0;
  for (const v of voisins) {
    const nom = v.specificateurs[0];
    for (const r of racines.get(nom)) {
      const base = join(v.chemin, r);
      let fichiers = [];
      try {
        fichiers = statSync(base).isDirectory() ? sous(base) : [];
      } catch {
        /* une racine absente ne se compte pas */
      }
      for (const f of fichiers) if (BANC.test(f)) surDisque++;
    }
    for (const k of reel.get(nom).keys()) if (BANC.test(k)) releves++;
  }
  dire(
    surDisque > 0,
    `des bancs de voisins vivent bien sous mes racines lues (${surDisque}) — sinon la borne ne prouverait rien`,
  );
  dire(
    releves === 0,
    `aucun banc de voisin n'entre dans le relevé (${releves})`,
  );
}

// 4. Les refus d'instrument. Chacun garde une manière de rendre « rien n'a bougé » sans avoir
//    regardé — la seule réponse qu'une panne donne spontanément.
const refuse = (quoi, f) => {
  try {
    f();
    dire(false, `${quoi} : AUCUN REFUS`);
  } catch {
    dire(true, `${quoi} : refusé`);
  }
};
refuse("un relevé sans périmètre", () => empreinteDuVoisin(RACINE, null));
refuse("un périmètre vide", () => empreinteDuVoisin(RACINE, new Map()));
refuse("un régime inventé", () =>
  racinesLuesParRegime(RACINE, voisins, "regime-qui-n-existe-pas"),
);
refuse("une comparaison sans relevé d'avant", () =>
  cequiABascule(new Map(), RACINE, racines),
);
refuse("un périmètre amputé d'un voisin", () => {
  const ampute = new Map(racines);
  ampute.delete([...racines.keys()][0]);
  empreinteDuVoisin(RACINE, ampute);
});

if (echecs.length) {
  console.error(
    `\n[garde-releve] ${echecs.length} épreuve(s) échouée(s) — le garde de bascule ne tient plus ce ` +
      "qu'il annonce. Une campagne verte ne prouverait plus qu'aucun voisin n'a bougé pendant.",
  );
  process.exit(1);
}
console.log(
  `[garde-releve] vert — ${echecs.length === 0 ? "morsure et bornes prouvées" : ""}.`,
);
