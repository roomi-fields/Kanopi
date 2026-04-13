# Kanopi

**The VSCode of live coding.** A local-first multi-runtime IDE for live coding music — Tidal, SuperCollider, Strudel, Hydra, Python, BPscript, and more, orchestrated in one workspace with shared clock, scenes, and hardware.

Status: **v0.1.0-alpha — in design**. See `docs/plan/UI_WEB.md` for the master plan.

## Why

No existing tool integrates multiple live-coding runtimes with shared temporal state, scene hierarchy, and bidirectional hardware surfaces. Flok does multi-runtime editing, Estuary does shared clock, Max/MSP does hardware — no one combines the three.

## Architecture

- `packages/core/` — runtime: session parser, dispatcher, actors, scenes, clock, map engine
- `packages/ui/` — Svelte 5 + CodeMirror 6 desktop/web app
- `packages/library/` — bundled content (starters, scenes, devices, scales)

## Dependencies

- [bpscript](https://github.com/roomi-fields/bpscript) — native sequencer language (optional runtime)
- [osc-bridge](https://github.com/roomi-fields/osc-bridge) — hardware bidirectional sidecar
- [bp3-engine](https://github.com/roomi-fields/bp3-engine) — WASM derivation engine (via bpscript)

## Docs

- `docs/plan/UI_WEB.md` — master plan, 3-level progressive enhancement
- `docs/plan/MARKET_STUDY.md` — competitive landscape
- `docs/plan/ICLC_2027.md` — academic publication plan
- `docs/design/SCENES.md` — scene hierarchy + flag scoping
- `docs/mockups/kanopi-v1-mockup.html` — v1 UI mockup
- `docs/reference/HARDWARE_COLLECTION.md` — target hardware surfaces

## License

[AGPL-3.0-or-later](LICENSE) — copyleft including network use. If you run Kanopi as a service, you must share your modifications.
