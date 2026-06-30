#!/usr/bin/env node
// Garde « deps-fraîches » (décision 2026-06-30) — filet anti-régression de la
// consommation EN SOURCE des amonts compilés (BPx, kairos, kronos).
//
// Le problème historique (LAN-14) : ces amonts exposaient leur `dist` compilé
// (`exports → ./dist/index.js`), jamais rebâti quand leur `src` changeait → le
// serveur de dev servait du vieux code en silence. La remédiation : chaque amont
// expose une condition d'export `development → ./src/index.ts` que le Vite UNIQUE
// (5173) choisit en dev, et Kanopi les EXCLUT du pré-bundling → Vite compile leur
// source à la volée (zéro dist dans la boucle de dev → impossible de périmer).
//
// CETTE GARDE (portée KANOPI) vérifie que la CONVENTION reste uniforme : les 3
// deps consommées-en-source gardent leur condition d'export `development` pointant
// vers un `./src/index.ts` réel, ET que le Vite intégrateur les exclut du
// pré-bundling. Si une régresse (un amont retire l'export, ou on oublie l'exclude),
// la boucle de dev retomberait silencieusement sur le `dist` périmé — c'est
// EXACTEMENT ce qu'on interdit. Erreur bloquante au portillon.
//
// HORS PORTÉE ICI : la fraîcheur du `dist` de CHAQUE amont (« dist pas en retard
// sur src pour la prod ») appartient au portillon de CET amont (il possède son
// build), pas à celui de Kanopi. La garde jumelle y est définie séparément.

import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// Les amonts compilés consommés EN SOURCE par le Vite intégrateur.
const SOURCE_DEPS = ['@kairos/core', '@kronos/core', 'bpx'];
const EXPECTED_DEV = './src/index.ts';

const errors = [];

// 1) Convention d'export `development` sur chaque amont.
for (const dep of SOURCE_DEPS) {
  const pkgPath = join(repoRoot, 'node_modules', dep, 'package.json');
  if (!existsSync(pkgPath)) {
    errors.push(`${dep} : package.json introuvable (${pkgPath}) — dépendance non installée ?`);
    continue;
  }
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch (e) {
    errors.push(`${dep} : package.json illisible (${e.message})`);
    continue;
  }
  const dev = pkg.exports?.['.']?.development;
  if (dev !== EXPECTED_DEV) {
    errors.push(
      `${dep} : condition d'export "development" attendue "${EXPECTED_DEV}", trouvée ${
        dev === undefined ? 'ABSENTE' : `"${dev}"`
      }. Sans elle, le dev retombe sur le dist périmé (deps-fraîches, décision 2026-06-30).`
    );
    continue;
  }
  // Le fichier source ciblé doit exister (sinon Vite échoue à la résolution).
  const srcEntry = join(repoRoot, 'node_modules', dep, dev);
  if (!existsSync(srcEntry)) {
    errors.push(`${dep} : la cible "${dev}" n'existe pas (${srcEntry}).`);
  }
}

// 2) Le Vite intégrateur doit EXCLURE ces deps du pré-bundling (sinon Vite les
//    fige en un chunk pré-bundlé = re-périmable). Vérif textuelle du vite.config.
const viteConfig = join(repoRoot, 'packages', 'ui', 'vite.config.ts');
if (!existsSync(viteConfig)) {
  errors.push(`vite.config.ts introuvable (${viteConfig}).`);
} else {
  const txt = readFileSync(viteConfig, 'utf8');
  const excludeMatch = txt.match(/exclude\s*:\s*\[([^\]]*)\]/);
  const excluded = excludeMatch ? excludeMatch[1] : '';
  for (const dep of SOURCE_DEPS) {
    if (!excluded.includes(`'${dep}'`) && !excluded.includes(`"${dep}"`)) {
      errors.push(
        `vite.config.ts : optimizeDeps.exclude doit lister "${dep}" (consommation en source hors pré-bundling).`
      );
    }
  }
}

// 3) Anti-rechute COPIE MANUELLE : un dep consommé en source ne doit JAMAIS exister en `node_modules`
//    sous forme de DOSSIER RÉEL (copie). npm le pose en SYMLINK (lockfile `link:true`) ; une copie
//    manuelle (rsync de debug) le SHADOW et PÉRIME en silence — c'est exactement le bug bpscript
//    2026-06-30. Règle d'or : JAMAIS de rsync dans node_modules. Le dep doit être ABSENT du root ou un
//    symlink (jamais un dossier réel). On vérifie aux 2 niveaux (root hoisté + packages/ui non hoisté).
for (const dep of ['bpscript', ...SOURCE_DEPS]) {
  for (const base of ['node_modules', 'packages/ui/node_modules']) {
    const p = join(repoRoot, base, dep);
    if (!existsSync(p)) continue;
    const st = lstatSync(p);
    if (st.isDirectory() && !st.isSymbolicLink()) {
      errors.push(
        `${base}/${dep} est un DOSSIER RÉEL (copie) — doit être un SYMLINK (npm) ou absent. Une copie ` +
          `manuelle shadow le symlink npm et périme. Règle : jamais de rsync dans node_modules → \`rm -rf ${base}/${dep}\`.`
      );
    }
  }
}

if (errors.length) {
  console.error('✗ garde deps-fraîches — convention de consommation en source ROMPUE :');
  for (const e of errors) console.error(`  • ${e}`);
  console.error(
    '\nRappel : BPx/kairos/kronos se consomment EN SOURCE en dev (zéro dist dans la boucle).'
  );
  process.exit(1);
}

console.log(`✓ deps-fraîches — ${SOURCE_DEPS.join(', ')} : export "development" + exclude pré-bundling OK.`);
