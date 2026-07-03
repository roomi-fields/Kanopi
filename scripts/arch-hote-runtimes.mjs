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
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
// Surface de BRANCHEMENT hôte auditée (là où vivent les 9 écarts).
const SCAN_ROOTS = [
  "packages/ui/src/lib/runtimes",
  "packages/ui/src/lib/core-real",
  "packages/ui/src/stores",
];
const EXCLUDE_FILE = /\.(test|spec)\.|\.d\.ts$|output-runtime-contract\.ts$/;

// CLIQUET (ratchet) : une fois une runtime MIGRÉE (ses écarts retirés, thermomètre à 0 pour ses
// motifs), ses motifs deviennent VERROUILLÉS — s'ils réapparaissent, le garde MORD (exit 1), pour
// cette runtime, même si le reste est encore en mesure. C'est ainsi que « §Garde 4 mord pour MIDI »
// (Phase 2 MIDI) sans attendre la Phase 3 globale. Chaque nouvelle runtime migrée ajoute ses motifs.
const LOCKED = [
  {
    runtime: "midi",
    label: "construction de transport MIDI dans l'hôte (#6)",
    re: /\bMidiTransport\b/,
  },
  {
    runtime: "midi",
    label: "canal MIDI résolu dans l'hôte (#4)",
    re: /\.chan\b\s*=/,
  },
  {
    runtime: "osc",
    label: "dérivation des liaisons OSC dans l'hôte (#5)",
    re: /\bderiveOscBindings\b/,
  },
  {
    runtime: "audio",
    label: "AudioContext créé dans l'hôte (#7)",
    re: /\bnew\s+AudioContext\b/,
  },
  {
    runtime: "audio",
    label: "source de temps audioCtx dans l'hôte (#8)",
    re: /\baudioCtx\.currentTime\b/,
  },
  {
    runtime: "code",
    label: "sink backtick des voix de code dans l'hôte (#9)",
    re: /\bbacktickSink\b/,
  },
  {
    runtime: "code",
    label: "relais lifecycle des voix de code dans l'hôte (#9)",
    re: /\battachCodeVoiceLifecycle\b/,
  },
];

// Une règle §Garde = un ou plusieurs motifs de contenu, rattachés aux écarts du draft.
const RULES = [
  {
    garde: 1,
    ecarts: "#1,#2",
    label:
      "Adaptateur/mise en forme écrits côté hôte (wrapper `send`, prep/coerce)",
    patterns: [
      /\b\w+Adapter\s*:\s*RuntimeAdapter\s*=\s*\{/, // wrapper hôte sur mesure (#1)
      /\bfunction\s+prep\b/, //                         normalisation de content hôte (#2)
      /\bcoerceControlValues\s*\(/, //                   coercion de contrôles hôte (#2)
    ],
  },
  {
    garde: 2,
    ecarts: "#7",
    label:
      "Contexte audio créé/piloté par l'hôte (`new AudioContext`, resume/suspend)",
    patterns: [/\bnew\s+AudioContext\b/, /\baudioCtx\.(resume|suspend)\s*\(/],
  },
  {
    garde: 3,
    ecarts: "#3,#4,#5,#8",
    label:
      "Mapping de sortie côté hôte (vélocité /127, canal, liaisons OSC, horloge audioCtx)",
    patterns: [
      /\/\s*127\b/, //                     vel → velocity (#3)
      /\.chan\b\s*=/, //                   canal MIDI résolu hôte (#4)
      /\.channel\b/, //                    lecture du canal côté hôte (#4)
      /\bderiveOscBindings\b/, //          dérivation des liaisons OSC (#5)
      /\baudioCtx\.currentTime\b/, //       horloge partagée fabriquée par l'hôte (#8)
    ],
  },
  {
    garde: 4,
    ecarts: "#6",
    label: "Transport de sortie CONSTRUIT par l'hôte (`MidiTransport`)",
    patterns: [/\bMidiTransport\b/],
  },
  {
    garde: 5,
    ecarts: "#9",
    label:
      "État transport relayé hôte→runtime (sink backtick, relais de cycle de vie)",
    patterns: [/\battachCodeVoiceLifecycle\b/, /\bbacktickSink\b/],
  },
  {
    // §Garde 6 (contrat hote-runtimes-sortie.md, RATIFIÉE Romain — KRONOS SEUL gardien du temps).
    // Toute HORLOGE PIRATE dans l'hôte : une lecture de temps réel (Date.now / performance.now /
    // new Date / AudioContext.currentTime) ou une pompe (setInterval/Timeout/rAF) utilisée comme
    // SOURCE de temps MUSICAL (planification / position / tempo). Le temps vient de Kronos, lu via
    // la vue horloge — jamais fabriqué ici. Le retrait audio (#8 : audioCtx.currentTime →
    // performance.now/1000 DANS createTransport) doit FAIRE DESCENDRE ce compteur.
    garde: 6,
    ecarts: "temps",
    label: "Horloge PIRATE dans l'hôte (temps musical fabriqué hors Kronos)",
    patterns: [
      /\bDate\.now\s*\(/,
      /\bperformance\.now\s*\(/,
      /\bnew\s+Date\s*\(/,
      /\.currentTime\b/,
      /\bsetInterval\s*\(/,
      /\bsetTimeout\s*\(/,
      /\brequestAnimationFrame\s*\(/,
    ],
    // WHITELIST (usages LÉGITIMES — ne comptent PAS) :
    //  - la base de temps INJECTÉE dans createTransport (`performance.now()/1000`, décision
    //    temps-audio-multicontextes) : c'est l'horloge PROPRE de Kronos, pas une pirate ;
    //  - un curseur/afficheur qui LIT la position de Kronos (`position()`/`beatPosition()`),
    //    éventuellement via rAF pour le rendu — il lit, il ne fabrique pas ;
    //  - l'offset audio-LOCAL d'un sink (`ctx.currentTime` recalé sur `view.now()`), qui traduit
    //    le temps de Kronos vers l'échantillon, sans le reconstruire.
    whitelist: [
      /performance\.now\(\)\s*\/\s*1000/,
      /\b(position|beatPosition)\s*\(\)/,
      /currentTime\b.*\bnow\s*\(\)|\bnow\s*\(\).*currentTime\b/,
      // Le curseur/afficheur LIT la position de Kronos via une boucle rAF (rendu, pas source de
      // temps) — item whitelist « curseur UI qui lit position() » (le `position()` est appelé
      // dans `#loop`, à une autre ligne que le rAF, d'où le ciblage par fichier).
      { re: /\brequestAnimationFrame\s*\(/, file: "kronos-cursor" },
      // Générateur d'ID de fichier (non-musical) — pas une horloge.
      { re: /\bDate\.now\s*\(/, file: "workspace.svelte" },
    ],
  },
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
    else if (/\.(ts|svelte)$/.test(name) && !EXCLUDE_FILE.test(name))
      out.push(p);
  }
  return out;
}

// Une ligne de commentaire pur ne compte pas (elle DÉCRIT souvent l'écart sans l'être).
const isCommentLine = (line) => {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
};

const files = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r)));
let grandTotal = 0;
const report = [];

for (const rule of RULES) {
  const hits = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      // WHITELIST explicite d'une règle (usages LÉGITIMES qui ne comptent pas — ex. la base de
      // temps de Kronos, un curseur qui LIT position()). Une entrée = un RegExp, ou `{re, file}`
      // pour cibler un fichier précis (ex. le curseur/afficheur). Documentée dans la règle.
      if (
        rule.whitelist &&
        rule.whitelist.some((w) => {
          if (w instanceof RegExp) return w.test(line);
          return (
            (!w.file || relative(ROOT, file).includes(w.file)) &&
            w.re.test(line)
          );
        })
      )
        return;
      if (rule.patterns.some((re) => re.test(line))) {
        hits.push(`${relative(ROOT, file)}:${i + 1}`);
      }
    });
  }
  // Le total de BURNDOWN frontière = écarts #1-#9 (§Garde 1-5). §Garde 6 (temps) est un axe
  // DISTINCT (gardien du temps), reporté à part — il descend avec le retrait audio, pas MIDI/OSC.
  if (rule.garde <= 5) grandTotal += hits.length;
  report.push({ rule, count: hits.length, hits });
}

// ---- Rapport (thermomètre) ----
console.log(
  "\n🌡  Garde frontière hôte↔runtimes — MODE MESURE (ne bloque pas, Phase 1)",
);
console.log(
  "   Contrat : hub/contrats/hote-runtimes-sortie.md · draft : docs/arch/contrat-hote-runtimes-DRAFT.md",
);
console.log(
  `   Surface auditée : ${SCAN_ROOTS.join(", ")} (${files.length} fichiers)\n`,
);
for (const { rule, count, hits } of report) {
  console.log(`   §Garde ${rule.garde} (écarts ${rule.ecarts}) — ${count}`);
  console.log(`      ${rule.label}`);
  for (const h of hits) console.log(`        · ${h}`);
}
console.log(
  `\n   TOTAL occurrences comptées : ${grandTotal}  (lignes de code, réparties sur les écarts #1-#9)`,
);
console.log(
  "   Baseline de burndown : ce nombre doit DÉCROÎTRE à chaque runtime migrée (Phase 2), viser 0.",
);
console.log(
  "   (écart #10 « voix de code muettes » = effet de #7/#9, prouvé à l'écran, non compté ici)\n",
);

// ---- Cliquet des runtimes migrées : ces motifs-là MORDENT (exit 1 s'ils réapparaissent) ----
const regressions = [];
for (const lock of LOCKED) {
  const hits = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!isCommentLine(line) && lock.re.test(line))
        hits.push(`${relative(ROOT, file)}:${i + 1}`);
    });
  }
  if (hits.length) regressions.push({ lock, hits });
}
const lockedRuntimes = [...new Set(LOCKED.map((l) => l.runtime))].join(", ");
if (regressions.length) {
  console.log(
    `   ⛔ CLIQUET — régression sur une runtime MIGRÉE (${lockedRuntimes}) :`,
  );
  for (const { lock, hits } of regressions) {
    console.log(`      [${lock.runtime}] ${lock.label}`);
    for (const h of hits) console.log(`        · ${h}`);
  }
  console.log(
    "   La mise en forme de cette runtime est repartie dans l'hôte → refuser (garde §4 mord).\n",
  );
  process.exit(1);
}
console.log(
  `   ✅ Cliquet OK : runtimes migrées (${lockedRuntimes}) restent à 0 dans l'hôte (§Garde 4 mord).\n`,
);
// Le RESTE est en MODE MESURE : non bloquant tant que sa runtime n'est pas migrée.
process.exit(0);
