// POURQUOI CE BANC EXISTE.
//
// Deux fois en six jours, une scène BPScript écrite EN DUR dans du TypeScript de production est
// passée sous tous les inventaires par extension `.bps` et sous tous les bancs existants (qui
// compilent leurs PROPRES entrées, jamais celles de la production) : l'application s'ouvrait sur
// une scène refusée par le compilateur réel, avec un portillon entièrement vert. La source de ce
// que l'écran ouvre au démarrage, `starterFiles()` dans `./fixtures`, n'était compilée par AUCUN
// banc — un vert de gate ne disait rien de ce que voyait l'utilisateur.
//
// Ce fichier ferme le trou par trois voies complémentaires (A compile le réel, B verrouille la
// liste pour que A ne puisse pas devenir vert-en-ne-regardant-rien, C garde qu'un futur porteur de
// scène en dur hors `fixtures.ts` ne passe plus inaperçu).

import { describe, it, expect } from 'vitest';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { starterFiles } from './fixtures';

// ————————————————————————————————————————————————————————————————————————
// Test A — les scènes que l'application ouvre RÉELLEMENT compilent.
// ————————————————————————————————————————————————————————————————————————

describe('les scènes de démarrage (starterFiles) compilent avec le compilateur réel', () => {
  const starters = starterFiles().filter((f) => f.path.endsWith('.bps'));

  it('starterFiles() rend au moins une scène (garde non vacuant, cf. test B)', () => {
    expect(starters.length).toBeGreaterThan(0);
  });

  for (const f of starters) {
    it(`${f.path} compile sans erreur`, () => {
      const { errors } = compileToBPxAST(f.contents);
      const premiere = errors[0] ? `${errors[0].message} (ligne ${errors[0].line})` : '';
      expect(errors, `${f.path} — refusée par le compilateur : ${premiere}`).toEqual([]);
    });
  }
});

// ————————————————————————————————————————————————————————————————————————
// Test B — témoin FIGÉ, écrit à la main, qui ne se dérive de rien.
//
// Pourquoi ce test existe alors que A existe déjà : si `starterFiles()` rendait un jour une liste
// VIDE (régression d'assemblage, filtre trop large, refactor cassé), le test A passerait au vert
// en ne compilant RIEN — un vert qui ne mesure rien est indiscernable d'un vert qui a vérifié.
// Ce témoin fige ce que l'application est CENSÉE ouvrir ; un écart force une décision consciente
// (mettre à jour le témoin si le changement est délibéré, ou traiter comme régression sinon).
// ————————————————————————————————————————————————————————————————————————

const STARTERS_ATTENDUS = ['main.bps', 'second.bps'];

describe('la liste des scènes de démarrage est celle attendue (témoin figé)', () => {
  it('starterFiles() rend exactement les chemins .bps attendus', () => {
    const reel = starterFiles()
      .filter((f) => f.path.endsWith('.bps'))
      .map((f) => f.path)
      .sort();
    const attendu = [...STARTERS_ATTENDUS].sort();
    expect(
      reel,
      `starterFiles() rend ${JSON.stringify(reel)}, le témoin attend ${JSON.stringify(attendu)}. ` +
        `Si l'ajout/retrait est délibéré, mettre à jour STARTERS_ATTENDUS ; sinon c'est une régression.`
    ).toEqual(attendu);
  });
});

// ————————————————————————————————————————————————————————————————————————
// Test C — garde de découverte : aucune scène en dur AILLEURS que fixtures.ts.
//
// Balaie TOUT le code de production via le glob Vite natif (pas de types Node — `node:fs` est
// rejeté par le tsconfig de `src/`, piège déjà rencontré dans ce dépôt), même idiome que
// `runtimes/host-time-purity.test.ts` et `runtimes/pas-de-question-de-note.test.ts`.
// ————————————————————————————————————————————————————————————————————————

const SOURCES = import.meta.glob('/src/**/*.{ts,svelte}', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

const FICHIERS_A_BALAYER = Object.keys(SOURCES).filter(
  (p) => !p.includes('.test.') && !p.includes('.spec.') && !p.endsWith('/lib/workspace/fixtures.ts')
);

/** Retire les commentaires `//…` et `/* … *\/` : les quatre exemples de règles cités en
 *  commentaire dans bpx-adapter.ts (~605, 607, 642, 1768) ne doivent PAS mordre — ce sont des
 *  citations documentaires, pas des scènes exécutées. Même idiome que host-time-purity.test.ts. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const REGLE = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*->/m;

interface Porteur {
  readonly path: string;
  readonly ligne: string;
}

/** Cherche, dans le code décommenté, les gabarits entre accents graves dont le contenu contient
 *  une ligne ressemblant à une règle BPScript (`Sujet -> Cible`). Une scène en dur écrite dans un
 *  fichier de production hors `fixtures.ts` n'est compilée par AUCUN banc de ce dépôt. */
function trouvePorteurs(src: string): Porteur[] {
  const decommente = stripComments(src);
  const porteurs: Porteur[] = [];
  const gabarits = decommente.matchAll(/`([^`]*)`/gs);
  for (const g of gabarits) {
    const m = g[1].match(REGLE);
    if (m) porteurs.push({ path: '', ligne: m[0].trim() });
  }
  return porteurs;
}

describe('aucune scène BPScript en dur hors fixtures.ts (garde de découverte)', () => {
  // ANTI-VACUITÉ : un glob qui ne résout rien rendrait ce garde vert en ne regardant aucun
  // fichier — seuil bas, il prouve que le balayage a mordu, pas qu'il compte le dépôt à l'exact.
  it('balaie vraiment le code de production (plusieurs dizaines de fichiers)', () => {
    expect(FICHIERS_A_BALAYER.length).toBeGreaterThan(30);
  });

  it('le détecteur mord sur un gabarit-règle synthétique (non-vacuité du détecteur)', () => {
    expect(trouvePorteurs('const x = `S -> C4 D4`;').length).toBeGreaterThan(0);
    // une citation en commentaire ne doit PAS mordre
    expect(trouvePorteurs('// exemple : `S -> C4 D4`').length).toBe(0);
  });

  it('aucun fichier de production hors fixtures.ts ne porte de scène en dur', () => {
    const trouves = FICHIERS_A_BALAYER.map((p) => ({
      path: p,
      hits: trouvePorteurs(SOURCES[p])
    })).filter((f) => f.hits.length > 0);

    const message = trouves
      .map(
        (f) =>
          `  ${f.path.replace(/^\//, 'packages/ui/')} : ${f.hits.map((h) => h.ligne).join(', ')}`
      )
      .join('\n');

    expect(
      trouves,
      `Scène BPScript en dur hors fixtures.ts (non compilée par aucun banc) :\n${message}\n` +
        `→ la déplacer dans fixtures.ts, ou étendre ce garde délibérément si c'est un faux positif.`
    ).toEqual([]);
  });
});
