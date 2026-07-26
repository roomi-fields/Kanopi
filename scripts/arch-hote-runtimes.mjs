#!/usr/bin/env node
/**
 * Garde-thermomètre de la frontière hôte↔runtimes de sortie (contrat RATIFIÉ
 * `hub/contrats/hote-runtimes-sortie.md`). Ce que dependency-cruiser NE voit PAS : des motifs de
 * CONTENU (mise en forme d'événement, /127, canal, contexte audio, relais transport) que la surface
 * de branchement hôte ne doit PAS porter.
 *
 * PHASE 3 — BLOQUANT ([566], 2026-07-04) : les 4 runtimes sont migrées (thermomètre #1-#9 à 0) →
 * §Garde 1-5 basculent de MESURE en MORDANT (comme §6/§7). Toute réapparition d'un écart #1-#9 dans
 * la surface hôte REFUSE au portillon (exit 1). Le garde imprime encore le compte (0, informatif),
 * mais il n'est plus un simple thermomètre : c'est la clôture de la normalisation (contrat §Garde).
 *
 * Les 9 motifs correspondent aux écarts #1-#9 du diagnostic
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
// Exclus : tests/specs, DÉCLARATIONS de types (.d.ts — pas du code exécuté), le fichier de CONTRAT
// (qui NOMME les facettes pour les interdire), et les AIDES DE TEST (`*-test-helpers.ts` — infra de
// test qui SIMULE la projection d'une runtime, donc lit légitimement des facettes ; non-production).
const EXCLUDE_FILE =
  /\.(test|spec)\.|test-helpers\.|\.d\.ts$|output-runtime-contract\.ts$/;

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
  {
    // KRO-24 / KAI-9-10 (cv-sur-arbre, [565]) : la COMPOSITION CV appartient à Kairos (il lit les
    // cvInstances SUR l'arbre et compose à l'aplatissement). L'hôte PORTE l'arbre, ne compose plus.
    runtime: "cv",
    label: "composition CV (buildModulators) dans l'hôte — appartient à Kairos",
    re: /\bbuildModulators\b/,
  },
];

// Une règle §Garde = un ou plusieurs motifs de contenu, rattachés aux écarts du draft.
const RULES = [
  {
    garde: 1,
    bite: true, // PHASE 3 BLOQUANT ([566]) : 4 runtimes migrées, écarts #1-#9 à 0 → verrouillé.
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
    bite: true, // PHASE 3 BLOQUANT ([566]).
    ecarts: "#7",
    label:
      "Contexte audio créé/piloté par l'hôte (`new AudioContext`, resume/suspend)",
    patterns: [/\bnew\s+AudioContext\b/, /\baudioCtx\.(resume|suspend)\s*\(/],
  },
  {
    garde: 3,
    bite: true, // PHASE 3 BLOQUANT ([566]).
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
    bite: true, // PHASE 3 BLOQUANT ([566]).
    ecarts: "#6",
    label: "Transport de sortie CONSTRUIT par l'hôte (`MidiTransport`)",
    patterns: [/\bMidiTransport\b/],
  },
  {
    garde: 5,
    bite: true, // PHASE 3 BLOQUANT ([566]).
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
    bite: true, // MORDANT (audit horloges clos, [559]) : toute horloge pirate non-whitelistée refuse.
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
      // Horodatage d'un ÉVÉNEMENT de télémétrie (adapterEvents.emit d'un 'trigger' eval/stop, lu
      // par le pilote) — un timestamp de log, pas un temps musical (ne planifie/positionne/tempo rien).
      { re: /\bt:\s*performance\.now\(\)/, file: "bpx-adapter" },
      // TAP-TEMPO : mesure les intervalles entre les FRAPPES de l'utilisateur pour en déduire un BPM
      // — timing d'un GESTE d'entrée (la saisie utilisateur, seul état propre à l'hôte), pas une
      // reconstruction du temps de Kronos. Ne suit aucune position, n'ordonnance rien.
      { re: /const now = performance\.now\(\)/, file: "clock.svelte" },
      // LA BASE DE TEMPS MURAL DU BUS, remise au périphérique d'ENTRÉE dans son puits
      // (`sink.now()`). Ce n'est PAS du temps musical et ce n'est pas une seconde autorité : c'est
      // l'horloge murale que TOUT événement du bus porte déjà (`events/types.ts` : « t: wall-clock
      // ms via performance.now() »), et le contrat d'entrée l'EXIGE de l'hôte —
      // `hub/contrats/hote-runtime-in.md` § La règle de temps : un périphérique ne lit JAMAIS
      // d'horloge lui-même, il convertit son estampille native sur `sink.now()`. C'est cette règle,
      // et elle seule, qui rend une note MIDI et un message OSC comparables ; un `now()` différent
      // de la base du bus les rendrait incomparables EN SILENCE. Ne positionne rien, n'ordonnance
      // rien, ne fabrique aucun tempo — la position et le transport restent à Kronos.
      { re: /now:\s*\(\)\s*=>\s*performance\.now\(\)/, file: "real-core" },
    ],
  },
  {
    // §Garde 7 (KAN-kairos, KAI-9/10 + kanopi-architecture.md — l'ARBRE de production est autorité
    // BPx/Kairos ; l'hôte le LIT, ne le MUTE JAMAIS, ne touche pas l'AST). Toute ÉCRITURE sur la
    // structure dérivée (arbre/AST/metadata) dans la surface hôte = mutation d'autorité amont =
    // refus. Une modification (tempo/mute/arm) passe par une demande à Kairos, pas par une mutation.
    // Vérifié [562] : le code hôte actuel est à 0 (arm/mute = flags + re-éval ; AST via options de
    // createSession). MORDANT dès la pose.
    garde: 7,
    bite: true,
    ecarts: "arbre",
    label:
      "Mutation de l'arbre de production / AST par l'hôte (autorité BPx/Kairos)",
    patterns: [
      /\b(rawTree|ast)\.\w+\s*=[^=]/, //        écriture sur l'arbre brut / l'AST
      /\bderived\.tree\.\w+\s*=[^=]/, //         écriture sur l'arbre dérivé
      /\.metadata\.\w+\s*=[^=]/, //              écriture sur les métadonnées de l'arbre (tempo/meter/actors)
      /\.cvInstances\s*=[^=]/, //                réécriture du sidecar CV de l'AST
    ],
    // Pas de whitelist (aucune écriture d'arbre/AST hôte n'est légitime — cf. définition). Si un
    // faux positif apparaît (une var locale homonyme), resserrer le motif aux vrais noms d'arbre.
    whitelist: [],
  },
  {
    // §Garde 8 (contrat `hub/contrats/kronos-transport.md` « interdits durs » — garde 2 BORDS,
    // [238] 2026-07-04, posé par Kronos) : l'hôte ne tient NI un COMPTEUR DE POSITION (le
    // `lastBeat`/`beatCount` historique, une transition calculée `(x+1)%n`, une intégration
    // `+=`), NI une 2ᵉ MACHINE D'ÉTAT transport (assignation d'un littéral d'état hors miroir
    // `onStateChange`). La position se LIT de Kronos (`position()`/`beatPosition()`), l'état se
    // MIROITE (affichage seul). Au-delà du §6 : le §6 interdit de FABRIQUER le temps, le §8
    // interdit de RECONSTRUIRE position/état par-dessus le temps de Kronos. Bord jumeau côté
    // Kronos : la surface publique resserrée est FIGÉE par test (les moteurs de reconstruction
    // ne sont pas exportés — `kronos/src/frontiere-hote-surface.test.ts`, gate verify).
    garde: 8,
    bite: true, // MORDANT dès la pose : baseline 0 vérifiée sur toute la surface hôte ([238]).
    ecarts: "transport",
    label:
      "Compteur de position / 2e machine d'état transport dans l'hôte (kronos-transport.md)",
    // L'UI transport vit AUSSI hors des racines communes (boutons topbar, palette de commandes,
    // raccourcis clavier) → cette règle scanne la surface commune PLUS ces racines-là.
    extraRoots: [
      "packages/ui/src/components",
      "packages/ui/src/lib/commands",
      "packages/ui/src/lib/keybindings",
    ],
    patterns: [
      /\b(lastBeat|beatCount)\b/, //                        les compteurs historiques (bugs figés)
      /\b(beat|round|step|bar|pos)\w*\s*\+\s*1\s*\)\s*%/i, // transition calculée ((x+1)%n)
      /\b(position|beat|scene|playhead)\w*\s*\+=/i, //      intégration de position hôte
      /\b(mode|state)\s*=\s*['"](playing|running|paused|stopped)['"]/, // 2e FSM (littéral assigné)
    ],
    whitelist: [
      // Le miroir réactif (kronos-cursor) REPOSE sa valeur d'affichage à 'stopped' au démontage
      // du handle (AUCUN transport : rien à miroiter). Recopie pour affichage prévue au contrat
      // — les transitions réelles arrivent par `onStateChange` (mêmes lignes au-dessus) ; jamais
      // une autorité (la vérité reste `active.transport.state`).
      { re: /\bstate\s*=\s*'stopped'/, file: "kronos-cursor" },
    ],
  },
  {
    // §Garde 9 (frontière kanopi-bpx-tree, KAI-9/10 + hote-runtimes-sortie.md:6-8 — l'hôte FORWARDE
    // l'arbre/l'événement OPAQUE ; toute lecture de FACETTE résolue (`content.pitch.hz`,
    // `content.sounds`, `payload.*`, `controls.vel`…) se fait DANS la runtime, JAMAIS dans l'hôte.
    // BPx/Kairos GRAVENT ces facettes sur l'arbre ; un hôte qui les LIT recompose au lieu de porter
    // (cas d'école KAI-9 : une propriété déduite « en douce » au lieu d'être lue par la runtime).
    // Distinct de §7 (qui interdit d'ÉCRIRE l'arbre) : §9 interdit de LIRE ses facettes résolues.
    // Vérifié [566] sur pièces : production hôte à 0 (les seules lectures vivent dans les aides de
    // test — `*-test-helpers.ts`, exclues, qui SIMULENT une runtime). MORDANT dès la pose.
    garde: 9,
    bite: true,
    ecarts: "facettes",
    label:
      "Lecture d'une facette de l'arbre/événement dérivé par l'hôte (payload/content.* — autorité runtimes)",
    patterns: [
      /\.payload\b/, //                                    lecture du payload d'un événement/nœud dérivé
      /\bcontent\.(pitch|sounds|frequency|hz|duration|controls|params|modulations)\b/, // facette résolue
    ],
    whitelist: [],
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
  // Une règle peut ÉLARGIR sa surface (`extraRoots`, ex. §8 : l'UI transport vit aussi dans
  // components/commands/keybindings) — la surface commune reste SCAN_ROOTS pour toutes.
  const ruleFiles = rule.extraRoots
    ? [...files, ...rule.extraRoots.flatMap((r) => walk(join(ROOT, r)))]
    : files;
  for (const file of ruleFiles) {
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
  "\n🛡  Garde frontière hôte↔runtimes — PHASE 3 BLOQUANT (§Garde 1-7 mordants)",
);
console.log(
  "   Contrat : hub/contrats/hote-runtimes-sortie.md · draft : docs/arch/contrat-hote-runtimes-DRAFT.md",
);
console.log(
  `   Surface auditée : ${SCAN_ROOTS.join(", ")} (${files.length} fichiers)\n`,
);

// ANTI-VACUITÉ (mesuré, pas supposé — 2026-07-27). Ce garde ANNONÇAIT son compte mais ne le
// REFUSAIT pas : pointé sur une racine dérivée (script recopié ailleurs), il lisait 0 fichier,
// trouvait 0 écart partout, et rendait ✅ exit 0. Son silence ressemblait à un succès le jour même
// où quelque chose avait bougé — la famille « l'absence de signal prise pour un bon signal »
// (signalée par runtime-in, routée par l'architecte, troisième occurrence en une nuit).
// Un verdict qui ne dit pas SUR QUOI il conclut n'est pas un verdict. Plancher fixé nettement sous
// le compte réel (39 au moment T) pour tolérer la croissance et les suppressions normales.
const PLANCHER_FICHIERS = 20;
if (files.length < PLANCHER_FICHIERS) {
  console.error(
    `FAIL garde frontière — ${files.length} fichier(s) vu(s), au moins ${PLANCHER_FICHIERS} ` +
      "attendus : le balayage ne regarde plus au bon endroit (racines déplacées/renommées), " +
      "pas que l'hôte est devenu parfait.",
  );
  process.exit(1);
}
for (const { rule, count, hits } of report) {
  console.log(`   §Garde ${rule.garde} (écarts ${rule.ecarts}) — ${count}`);
  console.log(`      ${rule.label}`);
  for (const h of hits) console.log(`        · ${h}`);
}
console.log(
  `\n   TOTAL écarts #1-#9 : ${grandTotal}  (attendu 0 — normalisation close, §Garde 1-5 mordants)`,
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

// ---- §Garde MORDANTS (bite:true) : §1-5 (normalisation close, Phase 3 [566]) + §6 (horloge
//      pirate, [559]) + §7 (mutation d'arbre/AST, [562]). Baseline légitime 0 → toute occurrence
//      NON-whitelistée refuse (exit 1). C'est la clôture de la normalisation de la frontière. ----
const biting = report.filter((entry) => entry.rule.bite && entry.count > 0);
if (biting.length) {
  for (const { rule, hits } of biting) {
    console.log(`   ⛔ §Garde ${rule.garde} MORD — ${rule.label} :`);
    for (const h of hits) console.log(`        · ${h}`);
  }
  console.log(
    "   La frontière hôte↔runtimes est CLOSE : la mise en forme/le mapping/le contexte/le transport\n" +
      "   de sortie appartiennent aux runtimes ; le temps à Kronos ; l'arbre à BPx/Kairos. L'hôte\n" +
      "   BRANCHE et FORWARDE — il ne fabrique rien. Usage légitime → whitelist de la règle AVEC sa raison.\n",
  );
  process.exit(1);
}
const bitingGardes = report
  .filter(({ rule }) => rule.bite)
  .map(({ rule }) => `§${rule.garde}`)
  .join("+");
console.log(
  `   ✅ Gardes mordants OK (${bitingGardes}) : normalisation close (mise en forme/mapping/contexte/\n` +
    "      transport aux runtimes), aucune horloge pirate, aucune mutation d'arbre/AST dans l'hôte.\n",
);
process.exit(0);
