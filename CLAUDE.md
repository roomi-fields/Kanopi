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
- `docs/plan/` — strategic plans
- `docs/design/` — architecture
- `docs/mockups/` — UI mockups

## Related repos

- `/mnt/d/Claude/BPscript/` — the language (parser, encoder, BPx engine spec)
- `/mnt/d/Claude/matrixbrute/osc-bridge/` — hardware bridge
- bp3-engine submodule

## Stack

- UI: Svelte 5 + TypeScript + CodeMirror 6 + Vite
- Desktop packaging: Tauri (later)
- Runtime: TypeScript, Web Audio, Web MIDI, WebSocket (for osc-bridge)

## Environment

This project is developed on **WSL2**. Vite's file watcher does NOT reliably catch edits across the Windows/Linux boundary without polling. `packages/ui/vite.config.ts` ships with `server.watch.usePolling: true` — if you remove it or HMR breaks, run the `vite-hmr-reset` skill.

Dev server: `cd packages/ui && npm run dev` (polling is the default in config).
Belt-and-braces: `VITE_FORCE_POLLING=1 CHOKIDAR_USEPOLLING=1 npm run dev`.

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
- **`vite-hmr-reset`** — deterministic WSL2 HMR recovery procedure. Use the moment HMR misbehaves.

## Memory

Kanopi session-specific memory at `~/.claude/projects/-mnt-d-Claude-kanopi/memory/` (separate from BPscript memory).

## RTFM — Indexed Knowledge Base

This project has been indexed with RTFM.

For any **exploratory search** (finding which files/modules/classes are relevant
to a topic), use `rtfm_search` instead of Glob, find, ls, or broad Grep.
Then use `rtfm_expand` to read easily most relevant files/sections.
