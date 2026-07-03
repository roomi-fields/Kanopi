#!/usr/bin/env node
// Partition complète + preuve "zéro orphelin" + carte mermaid, à partir d'un graphe dependency-cruiser.
//
// Usage : node partition.cjs <dc-report.json> <blocks.json>
//   dc-report.json : sortie `depcruise ... --output-type json`
//   blocks.json    : définition des blocs du dépôt, format :
//     {
//       "exclude":  ["\\.(json|bps|gr|txt|d\\.ts)$"],   // données/assets, mis de côté
//       "external": ["node_modules", "^svelte(/|$)", "^@codemirror"],  // librairies tierces
//       "blocks": [                                       // ORDRE = priorité de match
//         { "name": "KRONOS", "match": "kronos/dist" },
//         { "name": "adaptateur", "match": "lib/runtimes" },
//         { "name": "stores", "match": "(^|/)stores(/|$)" }
//       ]
//     }
// Sortie : la preuve d'honnêteté (modules rangés / orphelins) + flèches entre/internes + mermaid.
const fs = require('fs');
const [, , reportPath, blocksPath] = process.argv;
if (!reportPath || !blocksPath) {
  console.error('Usage: node partition.cjs <dc-report.json> <blocks.json>');
  process.exit(1);
}
const j = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const cfg = JSON.parse(fs.readFileSync(blocksPath, 'utf8'));
const reData = (cfg.exclude || []).map((r) => new RegExp(r));
const reExt = (cfg.external || []).map((r) => new RegExp(r));
const blocks = (cfg.blocks || []).map((b) => ({ name: b.name, re: new RegExp(b.match, 'i') }));

const isData = (s) => reData.some((r) => r.test(s));
const isExt = (s) => reExt.some((r) => r.test(s));
const blockOf = (s) => (blocks.find((b) => b.re.test(s)) || {}).name || null;

const mods = j.modules || [];
const modBlock = {};
let data = 0, ext = 0;
const unmapped = [];
const count = {};
for (const m of mods) {
  const s = m.source;
  if (isData(s)) { data++; continue; }
  if (isExt(s)) { ext++; continue; }
  const b = blockOf(s);
  if (!b) { unmapped.push(s); continue; }
  modBlock[s] = b;
  count[b] = (count[b] || 0) + 1;
}
// classer les dépendances
let inter = 0, intra = 0, toData = 0, toExt = 0, unres = 0;
const interEdges = {}, intraCount = {};
for (const m of mods) {
  const a = modBlock[m.source];
  if (!a) continue;
  for (const d of m.dependencies || []) {
    const t = d.resolved;
    if (isData(t)) { toData++; continue; }
    if (isExt(t)) { toExt++; continue; }
    const b = modBlock[t];
    if (!b) { unres++; continue; }
    if (a === b) { intra++; intraCount[a] = (intraCount[a] || 0) + 1; }
    else { inter++; interEdges[a + ' --> ' + b] = (interEdges[a + ' --> ' + b] || 0) + 1; }
  }
}
const coded = Object.values(count).reduce((x, y) => x + y, 0);
console.log('=== PREUVE D\'HONNETETE ===');
console.log(`modules: ${mods.length} = code rangé: ${coded} + données: ${data} + ext: ${ext} + NON RANGES: ${unmapped.length}`);
if (unmapped.length) { console.log('--- NON RANGES (corriger blocks.json jusqu\'à 0) ---'); unmapped.forEach((s) => console.log('  ' + s)); }
console.log(`\nflèches CODE: ${inter + intra} = entre-blocs: ${inter} + internes: ${intra}  (+ données: ${toData}, ext: ${toExt}, non résolu: ${unres})`);
console.log('\n=== blocs (fichiers, liens internes) ===');
Object.keys(count).sort().forEach((b) => console.log(`  ${b}: ${count[b]} fichiers, ${intraCount[b] || 0} liens internes`));
console.log('\n=== FLECHES ENTRE BLOCS ===');
Object.keys(interEdges).sort().forEach((e) => console.log('  ' + e));
// mermaid
const ids = {}; let i = 0;
const id = (b) => ids[b] || (ids[b] = 'N' + i++);
let mm = 'flowchart TD\n';
Object.keys(count).forEach((b) => { mm += `  ${id(b)}["${b} (${count[b]} fichiers, ${intraCount[b] || 0} internes)"]\n`; });
Object.keys(interEdges).forEach((e) => { const [a, b] = e.split(' --> '); mm += `  ${id(a)} --> ${id(b)}\n`; });
fs.writeFileSync('carte.mmd', mm);
console.log('\nmermaid écrit dans ./carte.mmd');
