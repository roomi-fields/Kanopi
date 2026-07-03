#!/usr/bin/env node
/**
 * Garde-thermomètre de la frontière hôte↔runtimes de sortie (contrat RATIFIÉ
 * `hub/contrats/hote-runtimes-sortie.md`). Ce que dependency-cruiser NE voit PAS : des motifs de
 * CONTENU (mise en forme d'événement, /127, canal, contexte audio, relais transport) que la surface
 * de branchement hôte ne doit PAS porter.
 *
 * MODE MESURE (Phase 1) : ce garde COMPTE les écarts et imprime une baseline chiffrée — le
 * thermomètre de burndown des Phases 2-3 — puis sort TOUJOURS 0 (ne bloque pas le gate). Le passage
 * en BLOQUANT est la Phase 3, une fois les runtimes migrées.
 *
 * Les 9 motifs comptés correspondent aux écarts #1-#9 du diagnostic
 * `docs/arch/contrat-hote-runtimes-DRAFT.md`. L'écart #10 (voix de code muettes) est l'EFFET
 * observable de #7/#9, pas un motif de code hôte statique — il se prouve à l'écran, pas ici.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
// Surface de BRANCHEMENT hôte auditée (là où vivent les 9 écarts).
const SCAN_ROOTS = [
  'packages/ui/src/lib/runtimes',
  'packages/ui/src/lib/core-real',
  'packages/ui/src/stores'
];
const EXCLUDE_FILE = /\.(test|spec)\.|\.d\.ts$|output-runtime-contract\.ts$/;

// Une règle §Garde = un ou plusieurs motifs de contenu, rattachés aux écarts du draft.
const RULES = [
  {
    garde: 1,
    ecarts: '#1,#2',
    label: "Adaptateur/mise en forme écrits côté hôte (wrapper `send`, prep/coerce)",
    patterns: [
      /\b\w+Adapter\s*:\s*RuntimeAdapter\s*=\s*\{/, // wrapper hôte sur mesure (#1)
      /\bfunction\s+prep\b/, //                         normalisation de content hôte (#2)
      /\bcoerceControlValues\s*\(/ //                   coercion de contrôles hôte (#2)
    ]
  },
  {
    garde: 2,
    ecarts: '#7',
    label: "Contexte audio créé/piloté par l'hôte (`new AudioContext`, resume/suspend)",
    patterns: [/\bnew\s+AudioContext\b/, /\baudioCtx\.(resume|suspend)\s*\(/]
  },
  {
    garde: 3,
    ecarts: '#3,#4,#5,#8',
    label: "Mapping de sortie côté hôte (vélocité /127, canal, liaisons OSC, horloge audioCtx)",
    patterns: [
      /\/\s*127\b/, //                     vel → velocity (#3)
      /\.chan\b\s*=/, //                   canal MIDI résolu hôte (#4)
      /\.channel\b/, //                    lecture du canal côté hôte (#4)
      /\bderiveOscBindings\b/, //          dérivation des liaisons OSC (#5)
      /\baudioCtx\.currentTime\b/ //       horloge partagée fabriquée par l'hôte (#8)
    ]
  },
  {
    garde: 4,
    ecarts: '#6',
    label: "Transport de sortie CONSTRUIT par l'hôte (`MidiTransport`)",
    patterns: [/\bMidiTransport\b/]
  },
  {
    garde: 5,
    ecarts: '#9',
    label: "État transport relayé hôte→runtime (sink backtick, relais de cycle de vie)",
    patterns: [/\battachCodeVoiceLifecycle\b/, /\bbacktickSink\b/]
  }
];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // dossier absent : ignoré
  }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|svelte)$/.test(name) && !EXCLUDE_FILE.test(name)) out.push(p);
  }
  return out;
}

// Une ligne de commentaire pur ne compte pas (elle DÉCRIT souvent l'écart sans l'être).
const isCommentLine = (line) => {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
};

const files = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r)));
let grandTotal = 0;
const report = [];

for (const rule of RULES) {
  const hits = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      if (rule.patterns.some((re) => re.test(line))) {
        hits.push(`${relative(ROOT, file)}:${i + 1}`);
      }
    });
  }
  grandTotal += hits.length;
  report.push({ rule, count: hits.length, hits });
}

// ---- Rapport (thermomètre) ----
console.log('\n🌡  Garde frontière hôte↔runtimes — MODE MESURE (ne bloque pas, Phase 1)');
console.log('   Contrat : hub/contrats/hote-runtimes-sortie.md · draft : docs/arch/contrat-hote-runtimes-DRAFT.md');
console.log(`   Surface auditée : ${SCAN_ROOTS.join(', ')} (${files.length} fichiers)\n`);
for (const { rule, count, hits } of report) {
  console.log(`   §Garde ${rule.garde} (écarts ${rule.ecarts}) — ${count}`);
  console.log(`      ${rule.label}`);
  for (const h of hits) console.log(`        · ${h}`);
}
console.log(`\n   TOTAL occurrences comptées : ${grandTotal}  (lignes de code, réparties sur les écarts #1-#9)`);
console.log('   Baseline de burndown : ce nombre doit DÉCROÎTRE à chaque runtime migrée (Phase 2), viser 0.');
console.log('   (écart #10 « voix de code muettes » = effet de #7/#9, prouvé à l\'écran, non compté ici)\n');

// MODE MESURE : jamais bloquant en Phase 1.
process.exit(0);
