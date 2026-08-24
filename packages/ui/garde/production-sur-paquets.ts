// ⛔ CE GARDE MESURE CE QUI PART À L'UTILISATEUR, ET IL S'EXÉCUTE DANS LES CONDITIONS DE LA PRODUCTION.
//
// LE 2026-08-24, 306 SCÈNES SUR 306 ONT REFUSÉ DE SE PROJETER PENDANT QUE MES 111 ESSAIS ÉTAIENT
// VERTS. Le paquet publié de Kairos refusait un membre que la frappe de BPscript venait de poser sur
// le registre des voix ; la lecture qui désarme ce refus vivait dans sa SOURCE et pas dans son
// PAQUET. Mes bancs lisent la source de mes voisins, ma construction de production résout leur
// paquet — aucun banc ne pouvait voir la casse.
//
// ⇒ CE QU'IL MESURE N'EST PAS « MON VOISIN EST-IL À JOUR ». C'est « ma production fonctionne-t-elle
//   sur le paquet publié de mon voisin ». Quand il échoue, ma production est cassée à cet instant.
//   Il BARRE la poussée — arbitrage de l'architecte du 2026-08-24, rendu en son nom et daté. Ce qui
//   évite le blocage est un rouge inscrit avec sa cause : `rouges-de-production.ts`.
//
// ⛔ ET IL NE PEUT PAS VIVRE DANS UN BANC — MESURÉ, PAS SUPPOSÉ. La campagne fourche Node avec
// `--conditions development --conditions node` : tout import y résout mes voisins par leur SOURCE, y
// compris ceux qu'un paquet construit tire derrière lui. Un banc qui charge le paquet de BPx obtient
// la SOURCE de Kronos et mesure un HYBRIDE — ni ma source, ni ma production. Une première version a
// été écrite ainsi, puis retirée : un instrument qui ment ne se garde pas au motif qu'il est vert.
// ⇒ D'où la voie retenue : ce fichier est CONSTRUIT avec les conditions de production, puis exécuté.
//   `scripts/garde-production-sur-paquets.mjs` porte les deux gestes.
//
// ⛔ ET IL VIT HORS DE `src/`, DÉLIBÉRÉMENT : `src/` est l'application, typée pour le navigateur —
// `types: ["vite/client","svelte"]`, sans les types de Node. Posé là, ce programme de Node faisait
// échouer le typage sur `node:fs` et barrait ma poussée. Un programme de Node n'a pas sa place dans
// le dossier du navigateur.
//
// TÉMOIN MINIMAL (règle du dépôt) : une grammaire `.gr`, une scène à alphabet non anglais, une scène
// audio `.bps`. En dessous, la mesure porte sur un sous-ensemble et ne vaut pas rapport.

import { readFileSync } from 'node:fs';
import { parseBP3 } from 'bp3-frontend';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { createSession } from 'bpx';
import { Kairos } from '@kairos/core';
import {
  contexteDeProjection,
  resolveGrAux,
  resolveSeSettings,
  resolveSeText
} from '../src/lib/runtimes/bpx-adapter';
import { BUNDLED_AL, BUNDLED_SOUND } from '../src/lib/runtimes/bp3-aux';
import { ROUGES_INSCRITS } from '../src/lib/runtimes/rouges-de-production';

/** Le témoin minimal, en chemins relatifs à la racine du dépôt. */
const TEMOINS = [
  { nom: 'bp-acceleration.gr', chemin: 'packages/library/scenes/bp3/bp-acceleration.gr' },
  {
    nom: 'kairos-hauteur-ancre-alphabet-sargam.bps',
    chemin: 'packages/library/scenes/BPScript-tests/kairos-hauteur-ancre-alphabet-sargam.bps'
  },
  { nom: '01-strudel-solo.bps', chemin: 'packages/library/scenes/code-voices/01-strudel-solo.bps' }
] as const;

const loaderGr = (p: string, n: string) => (p === 'al' ? BUNDLED_AL[n] : BUNDLED_SOUND[n]);

type Compte = { nom: string; feuilles: number };

function projeter(ast: unknown, settings?: unknown): number {
  const session = createSession(ast as never, {
    seed: 12345,
    ...(settings !== undefined ? { settings: settings as never } : {})
  });
  const derive = session.derive() as { tree: unknown };
  const base = (
    session as unknown as { buildProjectionContext(): unknown }
  ).buildProjectionContext();
  const kairos = new Kairos();
  kairos.charger(derive.tree as never, contexteDeProjection(base));
  const tl = kairos.arbreCourant();
  return (tl.query(0, tl.duration + 1) as readonly unknown[]).length;
}

function mesurerUn(racine: string, t: (typeof TEMOINS)[number]): Compte {
  const source = readFileSync(racine + '/' + t.chemin, 'utf8');
  if (t.chemin.endsWith('.gr')) {
    const premiere = parseBP3(source);
    const seText = resolveSeText(premiere.fileRefs);
    const { alphabetNames, soundSymbols } = resolveGrAux(premiere.fileRefs, loaderGr);
    const relue =
      soundSymbols.length > 0 || alphabetNames !== undefined || seText !== undefined
        ? parseBP3(source, { alphabetNames, soundSymbols, seText })
        : premiere;
    if (relue.errors.length > 0)
      throw new Error(`${t.nom} refuse à l'analyse : ${relue.errors[0]?.message}`);
    return { nom: t.nom, feuilles: projeter(relue.ast, resolveSeSettings(relue.fileRefs)) };
  }
  const c = compileToBPxAST(source) as { ast: unknown; errors: { message?: string }[] };
  if (c.errors.length > 0)
    throw new Error(`${t.nom} refuse à l'analyse : ${c.errors[0]?.message ?? ''}`);
  return { nom: t.nom, feuilles: projeter(c.ast) };
}

/** Rend un message d'échec, ou `null` si tout tient. */
export function mesurer(racine: string): string | null {
  // ⛔ LE REGISTRE SE VALIDE AVANT DE SERVIR : une entrée sans sa cause entière ne couvre rien.
  for (const r of ROUGES_INSCRITS) {
    if (!r.temoin || !r.amont || !r.sortie || !(r.motif instanceof RegExp))
      return `registre : le rouge « ${r.temoin ?? '(sans témoin)'} » n'a pas sa cause entière — témoin, motif, amont et sortie sont exigés`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.le)) return `registre : « ${r.temoin} » n'a pas de date`;
  }

  const comptes: Compte[] = [];
  const echecs: string[] = [];
  for (const t of TEMOINS) {
    try {
      comptes.push(mesurerUn(racine, t));
    } catch (e) {
      echecs.push(`${t.nom} :: ${String((e as Error).message)}`);
    }
  }

  // ⛔ UN GARDE COMPTE CE QU'IL A EXAMINÉ ET REFUSE D'AVOIR EXAMINÉ ZÉRO.
  if (comptes.length + echecs.length !== TEMOINS.length)
    return `le témoin minimal exige ${TEMOINS.length} pièces, ${comptes.length + echecs.length} examinées`;

  const muettes = comptes.filter((c) => c.feuilles === 0);
  for (const m of muettes)
    echecs.push(`${m.nom} :: projeté en ZÉRO feuille par les paquets publiés — rien ne sonnerait`);

  // Un rouge INSCRIT passe s'il échoue POUR SA RAISON ; sinon il barre.
  const restants = echecs.filter(
    (e) => !ROUGES_INSCRITS.some((r) => e.startsWith(r.temoin + ' ::') && r.motif.test(e))
  );
  // ⛔ ET IL ÉCHOUE AUSSI QUAND SON TÉMOIN REDEVIENT VERT : l'entrée doit sortir du registre.
  const perimes = ROUGES_INSCRITS.filter(
    (r) => !echecs.some((e) => e.startsWith(r.temoin + ' ::'))
  ).map(
    (r) =>
      `le rouge inscrit « ${r.temoin} » (${r.le}) ne décrit plus rien : son témoin passe. ` +
      `Sortie prévue : ${r.sortie}. Retire l'entrée — une inscription qui survit à sa cause couvre la casse SUIVANTE.`
  );

  const bilan =
    `[garde-production] ${comptes.length}/${TEMOINS.length} témoins projetés par les paquets publiés : ` +
    comptes.map((c) => `${c.nom} → ${c.feuilles} feuilles`).join(' · ');
  console.log(bilan);

  if (restants.length === 0 && perimes.length === 0) return null;
  return [...restants, ...perimes].join('\n');
}
