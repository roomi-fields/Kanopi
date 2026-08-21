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
let entrees = 0;
for (const m of reel.values()) entrees += m.size;
if (voisins.length < 8 || entrees < 200) {
  console.error(
    `[garde-releve] RELEVÉ TROP MAIGRE POUR PROUVER QUOI QUE CE SOIT — ${voisins.length} voisin(s), ` +
      `${entrees} entrée(s). L'épreuve qui suit ne mesurerait que sa propre panne.`,
  );
  process.exit(1);
}
console.log(
  `[garde-releve] ${voisins.length} voisins, ${entrees} entrées en régime bancs.`,
);

// 0. Le vert honnête. Un garde qui mord toujours ne garde rien : il se fait désarmer à la première
//    campagne propre, et c'est déjà arrivé ici (comparaison rendue en promesse, 2026-08-20).
dire(
  cequiABascule(reel, RACINE, racines).length === 0,
  "un relevé intact ne dénonce personne",
);

// 1. Il mord sur une SOURCE VIVE — ce que la campagne charge vraiment.
for (const cible of ["bpscript", "@kairos/core"]) {
  const faux = clone(reel);
  const marques = faux.get(cible);
  const source = [...marques.keys()].find((k) => k.startsWith("src/"));
  if (!source) {
    dire(false, `${cible} : aucune source vive relevée, injection impossible`);
    continue;
  }
  marques.set(source, "MARQUE-INJECTEE");
  const vu = cequiABascule(faux, RACINE, racines).find((b) => b.nom === cible);
  dire(Boolean(vu), `${cible} : une source vive qui bascule est dénoncée (${source})`);
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
    const vu = cequiABascule(faux, RACINE, racines).find((b) => b.nom === "bpx");
    dire(Boolean(vu), `bpx : une déclaration de types qui bascule est dénoncée (${dts})`);
  } else {
    dire(false, "bpx : aucune déclaration de types relevée");
  }
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
  dire(releves === 0, `aucun banc de voisin n'entre dans le relevé (${releves})`);
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
refuse("un régime inventé", () => racinesLuesParRegime(RACINE, voisins, "regime-qui-n-existe-pas"));
refuse("une comparaison sans relevé d'avant", () => cequiABascule(new Map(), RACINE, racines));
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
console.log(`[garde-releve] vert — ${echecs.length === 0 ? "morsure et bornes prouvées" : ""}.`);
