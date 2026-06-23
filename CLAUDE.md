# Kanopi — Claude project instructions

## What this is

Kanopi is the IDE product. BPscript is the optional native sequencer language (separate repo). BPx is the JS engine for BPscript (lives in bpscript repo). osc-bridge is the hardware sidecar (separate repo).

## Architecture — LOI NON NÉGOCIABLE (lire AVANT de coder)

Contrats contraignants, à respecter sans dérogation (les contourner = bug, pas « choix sain ») :
- **`hub/contrats/kanopi-architecture.md`** — Kanopi ne détient **AUCUN état d'autorité** ;
  chaque store est une **projection** d'une source amont. Tout ce que l'hôte *invente* est un bug.
- **`hub/contrats/kronos-transport.md`** — le **temps, la position et l'état de transport
  appartiennent à Kronos**. Kanopi **émet des commandes** (`play/pause/stop/step/seek/tempo/loop`)
  et **lit** la position/état ; il ne tient ni compteur de position ni machine d'état.
- Étude : `hub/projets/design-frontiere-hote-moteur.md` (SOTA + openDAW). Cause des bugs
  passés : `hub/projets/audit-etat-kanopi.md`.

**Modèle (magnétophone)** : BPx = les bandes (contenu) · Kronos = la tête de lecture + le
mécanisme (temps/transport/position) · **Kanopi = les boutons + l'afficheur** (intention +
rendu) · runtimes = les sorties. Le magnétophone **ne fabrique rien**.

**Carte d'autorité** : position/transport → Kronos ; structure (acteurs/blocs/scène) → BPx
(scène compilée, jamais re-parsée du texte) ; fichiers → workspace réel (jamais auto-créés) ;
charge → opaque. Seul état mutable propre = la saisie utilisateur locale avant compilation.

**Anti-patterns INTERDITS** (à supprimer, pas à polir) : compteur de position maison ;
2ᵉ machine d'état de transport ; `$effect`/subscribe qui recopie un store dans un autre
(dériver ≠ synchroniser) ; blocs re-parsés du texte alimentant la lecture ; `active` fabriqué
côté hôte ; auto-création de fichiers/entités sans support réel.

**Discipline** : cause racine AVANT patch ; vérifier sur la VRAIE scène avant « fait » (le
« corrigé en 2 s, toujours cassé » est interdit) ; toute dérogation se remonte à l'architecte
AVANT de dévier.

## DÉFINITION DE « FAIT » — honnêteté (violation = faute grave, pas une approximation)

Des rapports « migration complète, gate vert » ont été rendus alors que des scènes réelles
(`.gr`, alphabet `arabic`) étaient **MUETTES**, et un auto-audit « 14 stores conformes » a
**raté** une 2ᵉ autorité de transport (`MockClock`) bien présente. C'est ce qui est interdit.

Règles **non négociables** :
1. **« FAIT » = prouvé sur les VRAIES scènes que l'utilisateur utilise**, À L'ÉCRAN (Playwright/
   navigateur) : au minimum un `.gr`, une scène à alphabet non-anglais (ex. `arabic`), une scène
   audio `.bps`. **Un gate e2e vert est NÉCESSAIRE mais JAMAIS SUFFISANT** — les e2e étaient verts
   pendant que `.gr`/`arabic` ne sonnaient pas. Si tu ne peux pas vérifier à l'écran, dis-le
   explicitement ; ne déclare pas « fait ».
2. **Une affirmation « c'est propre / conforme » se prouve de façon ADVERSARIALE** : tu CHERCHES
   activement la violation (grep, lecture), tu ne déclares pas conforme « de mémoire ». Un audit
   qui rate une violation présente est un échec, pas un détail.
3. **Déclarer « fait/complet/vert » sur preuve insuffisante = MALHONNÊTETÉ**, traitée comme telle.
   Mieux vaut « pas encore vérifié sur X » que « fait » faux.
4. **Aucun contournement pour faire passer un test/gate** (skip, valeur en dur, assertion ajustée) :
   c'est tricher. Le test reflète le réel ; si le réel est cassé, on corrige le réel.
5. **Rapport = sur pièces** : commit + sortie réelle des commandes + ce qui a été vu à l'écran
   (RMS, capture, log console). Pas de résumé vague.
6. **JAMAIS de repli hôte / 2e autorité / chemin parallèle — même « en attendant », même comme
   « défaut si pas de réponse ».** C'est l'anti-pattern que tout ce projet élimine. Si tu te
   retrouves à PROPOSER un bricolage (clock hôte, fallback, état dupliqué, contournement) comme
   solution OU comme défaut, c'est DÉJÀ une dérive : ton réflexe doit être l'inverse. Bloqué sur
   une vraie décision → tu **ESCALADES à l'architecte et tu ATTENDS** ; tu ne bricoles pas un
   repli. Le « défaut si pas de réponse » d'une question bloquante est **toujours** « j'attends »,
   jamais « je prends le hack ». Faire le contraire = faute, pas un compromis raisonnable.

## Boundaries

- **In Kanopi scope**: UI (Svelte/CodeMirror), saisie, session parser (@actor/@scene/@map),
  **branchement** (instancier Kronos + BPx + runtimes), routage des commandes, rendu, library
  management, osc-bridge integration, packaging (Tauri).
- **Out of scope — Kanopi ne possède PAS** (cf. contrats ci-dessus) :
  - **Temps / transport / position / ordonnancement → `kronos`** (autorité du temps)
  - Language parser/encoder → `bpscript` repo
  - BP3 WASM engine → `bp3-engine` repo
  - **BPx derivation engine + structure/scène compilée → `bpscript` (BPx)**
  - Synthèse / sorties / format natif → runtimes (`runtime-midi`, `runtime-osc`, …)
  - Hardware JSON profiles + Rust bridge → `osc-bridge` repo

## Structure

- `packages/core/` — runtime (dispatcher, map-engine, bridge)
- `packages/ui/` — Svelte 5 + CodeMirror 6 app
- `packages/library/` — bundled content
- `docs/plan/` — strategic plans (local only, gitignored)
- `docs/design/` — architecture
- `docs/mockups/` — UI mockups

## Related repos

- `/home/romi/dev/bp/BPscript/` — the language (parser, encoder, BPx engine spec)
- `/home/romi/dev/music/osc-bridge/` — hardware bridge
- bp3-engine submodule

## Stack

- UI: Svelte 5 + TypeScript + CodeMirror 6 + Vite
- Desktop packaging: Tauri (later)
- Runtime: TypeScript, Web Audio, Web MIDI, WebSocket (for osc-bridge)

## Environment

This project runs on **PC2 (native Ubuntu Linux)** since 2026-06-14 (VSCode SSH; previously WSL2). Native inotify works, so Vite's file watcher needs no polling — `packages/ui/vite.config.ts` ships with polling **OFF by default**.

Dev server: `cd packages/ui && npm run dev`.
Legacy WSL2 fallback (only if editing across a Windows/Linux boundary): `VITE_FORCE_POLLING=1 CHOKIDAR_USEPOLLING=1 npm run dev` re-enables polling; if HMR still misbehaves there, the `vite-hmr-reset` skill applies.

## Visual verification is mandatory, not optional

Claude cannot see the UI on its own. Any change under `packages/ui/src/` that affects rendered pixels, editor behavior, or Strudel/Hydra wiring MUST be verified before declaring "done". The **`live-coding-verify` skill** describes the full protocol.

The baseline tool is **Playwright MCP**. If it is not installed in this session:

```
claude mcp add playwright npx @playwright/mcp@latest
```

With Playwright MCP available, Claude navigates to `localhost:5173`, takes screenshots, clicks, presses keys, and reads `browser_console_messages` itself — no human-in-the-loop ping-pong. Without it, Claude must say "I cannot verify visually" explicitly instead of guessing.

Forbidden answers: "c'est fait, recharge", "ça devrait marcher maintenant", "tu peux tester ?" without having verified or having explicitly flagged the inability to verify.

## Skills (project scope)

Located in `.claude/skills/`:

- **`live-coding-verify`** — triggers on any UI/Svelte/CSS/CM6 edit. Forces Playwright-based verification before "done".
- **`svelte-5-patterns`** — Svelte 5 runes rules ($state / $derived / $effect / $props / $bindable), compiler traps (await rewriting), CodeMirror-inside-Svelte pattern.
- **`vite-hmr-reset`** — deterministic HMR recovery procedure (legacy WSL2 fallback; rarely needed on native PC2). Use if HMR misbehaves under forced polling.
- **`cv-verify-node`** — prove modulation/envelope/clock/re-random behavior in Node/vitest on the pure functions (+ mocked AudioParam), NOT via a slow headless browser. Browser reserved for the final "does it sound" smoke.

## Protocole tour (hub `/home/romi/dev/bp/hub`, CLI `tour`)

Kanopi est coordonné via la tour. Le protocole est **mécanisé par le CLI `~/dev/bp/hub/tour`** —
fini les éditions markdown du courrier à la main. Non optionnel.

### Règle de boucle (hub/README.md §1-2, validée Romain — NON OPTIONNELLE)

- **Réveil = courrier d'abord.** À CHAQUE réveil (début de session ou ping), la **première
  action** est `~/dev/bp/hub/tour inbox`. Rien d'autre avant d'avoir lu mon courrier.
- **Rapport avant idle — RÈGLE DURE, NON NÉGOCIABLE (violée 2×, recadrage architecte [208]).**
  Ne JAMAIS rendre la main en silence. La **TOUTE DERNIÈRE action** de chaque tour, AVANT de
  m'endormir, est **TOUJOURS** : `~/dev/bp/hub/tour send architecte` (`FINI: <quoi> + commit/preuve`
  ou `BLOQUÉ: <sur quoi>`) **PUIS** `~/dev/bp/hub/tour inbox --ack` de tout courrier traité.
  - **Committer/pousser N'EST PAS un rapport.** Un commit/push sans `tour send` derrière =
    « endormi en silence » = VIOLATION. Le push est l'avant-dernière action, le `tour send` la dernière.
  - Vaut même quand le `tour wake` est « sauté (architecte busy) » : le message déposé suffit, mais
    il DOIT être déposé. « FINI mais pas reporté » n'existe pas.
  - Pas de stop-hook : l'architecte pilote les réveils, l'utilisateur monitore via la tour. C'est à
    MOI de ne jamais terminer un tour sans le `tour send` final.

1. **Identité (1× par session)** : `export BP_AGENT=kanopi` (ou `--from kanopi` sur chaque appel ;
   l'env ne persiste pas entre commandes shell d'une session Claude).
2. **Début de session** : `~/dev/bp/hub/tour inbox` (mes non-lus) + lire `TABLEAU.md` et mes
   `contrats/`. Quand un message est traité : `tour inbox --ack`.
3. **Écrire / demander un arbitrage** : `~/dev/bp/hub/tour send <dest> "message"` (`architecte` est
   un destinataire valide). **Jamais** écrire dans ma propre boîte. Décision :
   `tour decide <slug> -m "titre" --impacts a,b,c` (notifie auto les impactés).
4. **Fin de session** : MAJ moi-même ma ligne du `TABLEAU.md` + ma fiche `projets/kanopi.md` + ma
   colonne `baseline-status.json`. L'architecte ne corrige plus mes pièces — il recadre.
   « Le code fait foi » : un statut se vérifie sur pièces, jamais de mémoire.

Détail : `hub/README.md` (§Le protocole + §Outil tour).

## Memory

Kanopi session-specific memory at `~/.claude/projects/-home-romi-dev-bp-kanopi/memory/` (separate from BPscript memory).

## RTFM — Indexed Knowledge Base

This project has been indexed with RTFM.

For any **exploratory search** (finding which files/modules/classes are relevant
to a topic), use `rtfm_search` instead of Glob, find, ls, or broad Grep.
Then use `rtfm_expand` to read easily most relevant files/sections.
