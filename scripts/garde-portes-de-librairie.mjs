#!/usr/bin/env node
/**
 * GARDE — MA SOURCE NOMME LA PORTE D'UN CATALOGUE, JAMAIS SON FICHIER.
 *
 * LA RÈGLE
 *   Un catalogue de bpscript s'atteint par `LIBS.<clé>`. Son FICHIER source (`lib/<clé>.json`,
 *   `lib/<clé>.bpsl`) n'est pas ma porte, et son format n'est pas une information utile ici :
 *   bpscript convertit ses catalogues de JSON vers BPScript au fil de l'eau, la donnée publiée ne
 *   bougeant pas d'un octet. Tout ce qui nomme le fichier devient faux au premier renommage, sans
 *   qu'une ligne de code cesse de fonctionner. Sept lecteurs se sont rendus aveugles ainsi, dont
 *   le générateur de paquet de bpscript lui-même.
 *
 * POURQUOI IL REFUSE MÊME UN CHEMIN JUSTE
 *   Un chemin exact aujourd'hui est un chemin périmé demain, et rien ne rougira ce jour-là. Le
 *   garde tient donc l'ABSENCE de la graphie, pas sa validité — sinon il faudrait le rejouer après
 *   chaque conversion de bpscript pour savoir s'il ment. L'état vert attendu est ZÉRO chemin.
 *
 * CE QU'IL REFUSE
 *   1. toute occurrence de `lib/<clé>.<ext>` dans ma source suivie, `<clé>` étant une clé de `LIBS` ;
 *   2. avoir lu ZÉRO clé de `LIBS` — le paquet de bpscript serait illisible, et le garde aveugle ;
 *   3. avoir balayé ZÉRO fichier — l'énumération serait cassée.
 *
 * CE QU'IL LAISSE PASSER, ET C'EST VOULU
 *   `lib/<clé>/<fichier>` — un RÉPERTOIRE d'authoring (`lib/digital/transpose.ts`) n'est pas un
 *   catalogue et ne se convertit pas. Et `lib/<nom>.<ext>` dont le nom n'est plus une clé : c'est
 *   une pierre tombale, qui nomme un catalogue disparu précisément pour dire qu'il l'est.
 *
 * MORSURE : `--injecter` ajoute en mémoire, au texte du premier fichier balayé, un chemin bâti sur
 * une clé réelle du paquet. Rejouable, sans écrire dans l'arbre.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const injecter = process.argv.includes('--injecter');

// ── Les clés du paquet, résolues DEPUIS `packages/ui` — là où mon application le résout, donc
//    par le même chemin qu'elle : source liée ou paquet publié, le garde suit ce qu'elle voit.
let CLES;
try {
  const depuis = createRequire(join(RACINE, 'packages/ui/package.json'));
  const mod = await import(pathToFileURL(depuis.resolve('bpscript/libs-data')).href);
  CLES = Object.keys(mod.LIBS ?? {});
} catch (e) {
  console.error(`[garde-portes] IMPOSSIBLE DE LIRE LE PAQUET DE BPSCRIPT — ${e.message}`);
  console.error("   Sans ses clés le garde ne reconnaît aucun catalogue : il refuse de passer pour vert.");
  process.exit(1);
}
if (CLES.length === 0) {
  console.error('[garde-portes] ZÉRO CLÉ LUE DANS `LIBS` — le paquet de bpscript est vide ou illisible.');
  process.exit(1);
}

// ── Ma source suivie, par git (jamais un parcours à la main) ─────────────────────────────────
const suivis = execFileSync('git', ['ls-files', 'packages/ui/src', 'packages/core/src', 'scripts', 'docs'], {
  cwd: RACINE,
  encoding: 'utf-8'
})
  .split('\n')
  .filter((f) => /\.(ts|tsx|js|mjs|cjs|svelte|md)$/.test(f));

if (suivis.length === 0) {
  console.error("[garde-portes] ZÉRO FICHIER BALAYÉ — l'énumération est cassée, le dépôt n'est pas vide.");
  process.exit(1);
}

// `lib/<clé>.<ext>` seulement : un répertoire d'authoring (`lib/<clé>/<x>`) ne se convertit pas.
const alternance = CLES.map((c) => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|');
const MOTIF = new RegExp(`\\blib/(${alternance})\\.(json|bpsl)(?![\\w/])`, 'g');

const fautes = [];
for (const [i, f] of suivis.entries()) {
  let texte = readFileSync(join(RACINE, f), 'utf-8');
  if (injecter && i === 0) texte += `\n// injection de morsure : lib/${CLES[0]}.json\n`;
  for (const [n, ligne] of texte.split('\n').entries()) {
    MOTIF.lastIndex = 0;
    let m;
    while ((m = MOTIF.exec(ligne)) !== null) fautes.push({ fichier: f, ligne: n + 1, chemin: m[0], cle: m[1] });
  }
}

if (fautes.length) {
  console.error(`[garde-portes] ${fautes.length} FICHIER(S) DE CATALOGUE NOMMÉ(S) DANS MA SOURCE :`);
  for (const p of fautes) console.error(`   ${p.fichier}:${p.ligne} — \`${p.chemin}\`  ⇒  \`LIBS.${p.cle}\``);
  console.error('   ⇒ NOMMER LA PORTE, JAMAIS LE FICHIER. bpscript convertit ses catalogues de JSON');
  console.error("     vers BPScript au fil ; la donnée publiée ne bouge pas, le chemin devient faux.");
  process.exit(1);
}

console.log(
  `[garde-portes] ${suivis.length} fichiers balayés contre ${CLES.length} clés du paquet — ` +
    'aucun fichier de catalogue nommé, la porte est la seule adresse.'
);
