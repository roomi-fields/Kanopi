# Kanopi Architecture

## Topologie repos

```
github.com/roomi-fields/
├── kanopi         ← l'IDE/DAW (ce repo)
│   ├── packages/core/      runtime: dispatcher, map-engine, session parser, bridge
│   ├── packages/ui/        Svelte 5 + TS + CodeMirror 6
│   ├── packages/library/   contenu bundled + loader
│   └── docs/
│
├── bpscript       ← le langage
│   ├── src/parser/         tokenizer + parser AST
│   ├── src/encoder/        AST → BP3 grammar
│   ├── src/bpx/            moteur de dérivation JS (en dev)
│   ├── docs/spec/          LANGUAGE, AST, EBNF
│   └── test/grammars/
│
├── bp3-engine     ← fork Bernard (WASM engine)
│
└── osc-bridge     ← pont hardware (Rust, déclaratif JSON + Lua)
```

**Dépendances :**
```
kanopi ──┬── bpscript (npm import: parser + BPx engine)
         ├── osc-bridge (sidecar WebSocket)
         └── bp3-engine (via bpscript)
```

Dépendances linéaires, aucune circulaire.

## Progressive enhancement : 3 niveaux

| Niveau | Install | Runtimes | Moteur |
|--------|---------|----------|--------|
| **1. Web pur** | Rien | BPscript, JS, WebAudio, WebMIDI | WASM |
| **2. Web enrichi** | Rien | + Strudel, SC-lite, Csound, Faust, Hydra, p5.js, ORCA, Gibber | WASM |
| **3. Package local** | Tauri desktop + osc-bridge | + SC natif, Tidal, Python, Sonic Pi, Chuck, Pd, Max | Natif |

L'UI détecte automatiquement le bridge local (WebSocket localhost:7777). Présent → niveau 3 actif. Absent → niveaux 1-2.

**V1 public** = niveaux 1-2 seulement.
**V2** = ajout niveau 3 via Tauri.

## Stack technique

### Frontend (`packages/ui/`)

- **Framework** : Svelte 5 + TypeScript (pas React, pas de v-DOM overhead)
- **Éditeur** : CodeMirror 6 (extensions par langage)
- **Build** : Vite
- **Style** : CSS variables + système de design cohérent (cf mockup)
- **Fonts** : IBM Plex Mono (UI) + JetBrains Mono (code)

**Justification Svelte vs alternatives :**
- TypeScript pur (style openDAW) : trop coûteux en vélocité pour un v1 solo
- React : écosystème lourd, v-DOM inutile, state management complexe
- Solid : excellent mais communauté plus petite
- Svelte 5 : compile léger, réactivité native, intégration CodeMirror propre

### Core (`packages/core/`)

- **TypeScript** (migration progressive depuis JS existant)
- **WebMIDI** pour MIDI input/output
- **WebAudio** pour synthesis native
- **WebSocket** pour bridge OSC local
- **IndexedDB** pour persistance (workspaces, library MINE)

### Library (`packages/library/`)

- JSON bundled dans le repo (starters, scenes, devices, scales)
- Loader qui unifie sources BUNDLED / MINE / COMMUNITY
- Voir [LIBRARY.md](LIBRARY.md)

### Desktop (v2, reporté)

- **Tauri 2** (Rust) — léger, intégration Rust native avec osc-bridge
- Même UI Svelte servie dans WebView
- Bundling : osc-bridge embarqué ou lancé comme process enfant

## Data flow runtime

```
session.kanopi (texte)
     │
     ▼
SessionParser → AST actors/scenes/maps
     │
     ▼
CoreRuntime (orchestrateur)
     ├─► Clock ─────────► tick bus (beat/bar events)  ──┐
     │                                                  │
     ├─► ActorManager ──► charge fichiers code          │
     │                    par runtime                    │
     ├─► SceneManager ──► applique snapshots on/off     │
     │                                                  │
     ├─► MapEngine ─────► route CC/OSC/note → actions   │
     │                                                  │
     ├─► EventBus ──────► KanopiEvent unifié ◄──────────┤
     │                    (cf. EVENTS.md)               │
     │                                                  │
     └─► Dispatcher ────► schedule events → Transports ◄┘
                               │
                               ├─► MIDI (WebMIDI)
                               ├─► OSC (WebSocket → osc-bridge)
                               ├─► WebAudio
                               └─► Runtime-specific (Strudel API, Hydra, SC…)
```

Le **EventBus UI** (`core.events`) est le point d'entrée unique pour tout
consommateur qui a besoin de réagir à ce que produit un runtime ou le clock :
visualizers, devtools, futur pont OSC. Les adapters runtime publient dedans
via un bus local relayé par le core. Spécification complète : [`EVENTS.md`](EVENTS.md).

## Session parser

V1 subset de BPscript exposé à l'utilisateur :

```kanopi
@workspace myset
@tempo 128
@quantize bar

@actor drums    file:drums.tidal    transport:tidal
@actor sub37                         transport:osc(/sub37)

@scene intro = { drums: off, visuals: on }
@scene drop  = { drums: on,  bass: on, sub37: on, visuals: on }

@map cc:20  -> tempo              range:[60, 180]
@map cc:21  -> sub37.cutoff
@map pad:0  -> scene:intro
```

**Le parser réutilise la base BPscript** (tokenizer + AST) mais se limite aux directives `@actor`, `@scene`, `@map`, `@tempo`, `@quantize`, `@workspace`. Les règles de grammaire (3 mots / 24 symboles) sont cachées en v1.

**V2** : expose le reste de BPscript pour séquençage natif.

## Module `core` (packages/core/src/)

| Module | Rôle |
|--------|------|
| `dispatcher/clock.js` | clock partagé, tick bus |
| `dispatcher/dispatcher.js` | scheduler central |
| `dispatcher/scene-manager.js` | gestion scènes |
| `dispatcher/map-engine.js` | routage CC/OSC/note |
| `dispatcher/resolver.js` | résolution note names → fréquence |
| `dispatcher/transports/midi.js` | WebMIDI in/out |
| `dispatcher/transports/osc.js` | OSC via WebSocket |
| `dispatcher/transports/webaudio.js` | synthèse native |
| `dispatcher/evals/sclang.js` | adapter SuperCollider |
| `dispatcher/evals/python.js` | adapter Python (Sardine via WebSocket) |
| `bridge/osc-bridge.js` | client WebSocket vers osc-bridge |

Hérités de `BPscript/src/dispatcher/` et `src/bridge/`. À migrer progressivement vers TypeScript.

## Principes de design

1. **Transport dans la scène, pas dans l'UI.** Le binding `@actor foo transport:xxx` détermine la sortie. L'UI reflète.
2. **Multi-output = conséquence de la scène.** Deux actors avec deux transports = dual output auto.
3. **Crash-isolation.** Un runtime qui plante (Strudel error, SC segfault) ne casse pas Kanopi. Web Workers et try/catch systématiques.
4. **State observable.** Tout ce qui change (clock, scène, flags, CC) est observable par l'UI et le MapEngine.
5. **Progressive enhancement.** Fonctionne sans bridge, mieux avec.
6. **Local-first.** Pas de serveur obligatoire. Workspace local. Community = optionnel.

## Performance cibles

- **Load time** : < 2s sur laptop moyen (comme openDAW)
- **Audio latency** : < 10 ms via WebAudio, < 5 ms via bridge local
- **MIDI jitter** : < 2 ms
- **Scheduler tick rate** : 1 kHz minimum
- **UI 60 fps** en utilisation normale
