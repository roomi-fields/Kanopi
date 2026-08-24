#!/usr/bin/env node
/**
 * ⛔ LE GARDE QUI MESURE MA PRODUCTION SUR LES PAQUETS PUBLIÉS DE MES VOISINS.
 *
 * VOIE B, arbitrage de l'architecte du 2026-08-24 : un garde qui juge la production s'exécute dans
 * les CONDITIONS de la production. On construit `garde/production-sur-paquets.ts` comme ma
 * production se construit — donc en résolvant `exports['.'].import` chez mes voisins — puis on
 * exécute le résultat en Node nu.
 *
 * ⛔ POURQUOI PAS UN BANC. Mesuré le 2026-08-24 : la campagne fourche Node avec
 * `--conditions development --conditions node`, donc un banc qui charge le paquet construit d'un
 * voisin obtient la SOURCE de ceux qu'il tire derrière lui. Il mesurerait un hybride. Un instrument
 * qui ment ne se garde pas au motif qu'il serait vert.
 *
 * ⚠️ LA CONSTRUCTION EST LA MOITIÉ DE LA MESURE : si elle échoue, ma production est cassée, et ce
 * garde doit rougir pour cette raison-là. On ne rattrape donc rien en silence.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RACINE = resolve(import.meta.dirname, '..');
const UI = join(RACINE, 'packages', 'ui');
// ⛔ LA SORTIE VIT SOUS `node_modules`, ET C'EST LA MOITIÉ DU DISPOSITIF : les voisins restent
// EXTERNES au paquet construit, donc Node les résout À L'EXÉCUTION — par `exports['.'].import`,
// c'est-à-dire leur PAQUET PUBLIÉ, exactement comme ma production. Bâtir ailleurs (dans /tmp) les
// rend introuvables et le garde échoue pour une raison qui n'est pas la sienne.
const sortie = join(UI, 'node_modules', '.garde-production');
rmSync(sortie, { recursive: true, force: true });
mkdirSync(sortie, { recursive: true });

const debut = Date.now();
try {
  // La construction, avec les conditions de PRODUCTION (mode `production`, cible `node`).
  execFileSync(
    'npx',
    [
      'vite',
      'build',
      '--ssr',
      'garde/production-sur-paquets.ts',
      '--config',
      'vite.garde.config.ts',
      '--outDir',
      sortie,
      '--mode',
      'production',
      '--logLevel',
      'error'
    ],
    { cwd: UI, stdio: ['ignore', 'inherit', 'inherit'] }
  );
  const construction = ((Date.now() - debut) / 1000).toFixed(1);

  // ⛔ UN DÉCOR DE NAVIGATEUR, PARCE QUE LE CODE MESURÉ EST CELUI DU NAVIGATEUR. Mon hôte instancie
  // des magasins au chargement du module — le curseur de Kronos demande une trame d'animation dès
  // son constructeur. Sans décor, le garde échouerait sur l'absence d'écran et non sur ce qu'il
  // mesure. Le décor ne remplace AUCUN de mes modules ni de ceux de mes voisins : le paquet mesuré
  // est celui que la construction vient de produire, entier.
  const { JSDOM } = await import('jsdom');
  const decor = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/'
  });
  // ⛔ ON COPIE LE DÉCOR ENTIER, JAMAIS UNE LISTE CHOISIE : une liste laisse `document` dans un
  // univers et `CustomEvent` dans un autre, et le code mesuré échoue sur un événement qui n'est pas
  // « de type Event ». Le premier essai a fait exactement ça.
  // ⛔ ET ON ÉCRASE MÊME CE QUE NODE DÉFINIT DÉJÀ : Node 22 porte son PROPRE `Event`, et le décor
  // porte le sien. Sauter les clés existantes laissait le code mesuré fabriquer un `Event` de Node
  // et le remettre à un `document` du décor — « parameter 1 is not of type Event ». Deux univers.
  const GARDER = new Set(['process', 'Buffer', 'global', 'globalThis', 'require', 'module', 'exports', 'setImmediate', 'clearImmediate']);
  for (const cle of Object.getOwnPropertyNames(decor.window)) {
    if (cle.startsWith('_') || GARDER.has(cle)) continue;
    try {
      const v = decor.window[cle];
      // ⛔ LES FONCTIONS SE LIENT AU DÉCOR, LES CLASSES NON. `setTimeout` du décor rappelle le
      // `setTimeout` GLOBAL ; posé non lié, il s'appelle lui-même — récursion infinie au chargement.
      globalThis[cle] =
        typeof v === 'function' && !/^\s*class\s/.test(Function.prototype.toString.call(v))
          ? v.bind(decor.window)
          : v;
    } catch {
      /* certaines propriétés du décor refusent d'être relues — elles ne servent pas ici */
    }
  }
  for (const cle of ['window', 'document', 'navigator'])
    Object.defineProperty(globalThis, cle, {
      value: cle === 'window' ? decor.window : decor.window[cle],
      configurable: true,
      writable: true
    });

  const { mesurer } = await import(
    pathToFileURL(join(sortie, 'production-sur-paquets.js')).href
  );
  const echec = mesurer(RACINE);
  const total = ((Date.now() - debut) / 1000).toFixed(1);

  if (echec) {
    console.error('\n[garde-production] ⛔ MA PRODUCTION EST CASSÉE SUR LES PAQUETS PUBLIÉS :\n');
    console.error(echec);
    console.error(
      '\nUn rouge se lève de deux façons : le voisin republie, ou tu inscris la cause dans ' +
        'packages/ui/src/lib/runtimes/rouges-de-production.ts — nommée, datée, avec son amont et sa sortie.'
    );
    process.exit(1);
  }
  console.log(
    `[garde-production] vert — construction ${construction} s, mesure comprise ${total} s.`
  );
} finally {
  rmSync(sortie, { recursive: true, force: true });
}
