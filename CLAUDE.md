# Kanopi — Claude project instructions

## What this is

Kanopi is the IDE product. BPscript is the optional native sequencer language (separate repo). BPx is the JS engine for BPscript (lives in bpscript repo). osc-bridge is the hardware sidecar (separate repo).

## Boundaries

- **In Kanopi scope**: UI, session parser (@actor/@scene/@map), runtime orchestration (dispatcher, clock, actors), library management, osc-bridge integration, packaging (Tauri).
- **Out of scope (other repos)**:
  - Language parser/encoder → `bpscript` repo
  - BP3 WASM engine → `bp3-engine` repo
  - BPx derivation engine → `bpscript` repo
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
- **Rapport avant idle.** Ne JAMAIS m'arrêter en silence. La **dernière action** avant de rendre
  la main est un `~/dev/bp/hub/tour send architecte` qui dit soit `FINI: <quoi> + commit`, soit
  `BLOQUÉ: <sur quoi>`. Pas de stop-hook : l'architecte pilote les réveils, l'utilisateur monitore
  en central via la tour.

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
