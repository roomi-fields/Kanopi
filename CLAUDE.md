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

## Memory

Kanopi session-specific memory at `~/.claude/projects/-mnt-d-Claude-kanopi/memory/` (separate from BPscript memory).
