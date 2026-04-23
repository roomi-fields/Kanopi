# Kanopi Architecture

Topologie physique (repos, dépendances, flux) et logique (hub + adapters +
plugins langage) de Kanopi.

## Specs connexes

| Document                  | Couvre                                                  |
| ------------------------- | ------------------------------------------------------- |
| `KANOPI_PRINCIPLES.md`    | 10 principes fondateurs (arbitrages inclus)             |
| `ADAPTER_SPEC.md`         | Contract `RuntimeAdapter` : moteur + UX native + events |
| `LANGUAGE_SPEC.md`        | Parsers CM6 + tags Lezer + colorimétrie                 |
| `LIBRARY_SPEC.md`         | Format `catalog.json` + items par catégorie             |
| `EVENTS.md`               | Bus `KanopiEvent` — schéma et consommateurs             |
| `SCENES.md`               | Système de scènes (`@scene`)                            |
| `LIBRARY.md`              | Product doc library (vision, UX, roadmap)               |
| `spec/KANOPI_LANGUAGE.md` | Syntaxe du langage `.kanopi`                            |

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

## Topologie logique : hub + adapters + plugins langage

Séparation stricte imposée par `KANOPI_PRINCIPLES §9`. Un adapter
n'importe **que** depuis le hub et depuis son module langage upstream —
jamais d'autres adapters, jamais de code UI langage-spécifique dans le
hub.

```
┌────────────────────────────────────────────────────────────────┐
│                        HUB Kanopi                              │
│                                                                │
│  ┌──────────────┐   ┌───────────────┐   ┌──────────────────┐   │
│  │  Transport   │   │  EventBus     │   │  Session parser  │   │
│  │  (Clock,     │◄──│  KanopiEvent  │◄──│  .kanopi →       │   │
│  │   BPM, bar)  │   │               │   │   actors/scenes  │   │
│  └──────┬───────┘   └───────┬───────┘   └─────────┬────────┘   │
│         │                   │                     │            │
│  ┌──────▼────────────────────▼─────────────────────▼────────┐  │
│  │     Dispatcher (scene-manager, map-engine, resolver)     │  │
│  └──────┬────────┬────────┬────────┬────────┬──────────┬────┘  │
└─────────┼────────┼────────┼────────┼────────┼──────────┼───────┘
          │        │        │        │        │          │
          ▼        ▼        ▼        ▼        ▼          ▼
     ┌────────┐┌──────┐┌──────┐┌──────┐┌──────┐┌────────────┐
     │ Strudel││ Tidal││ Hydra││  JS  ││  SC  ││ …autres    │
     │ adapter││adapter││adapter││adapter││adapter││           │
     └───┬────┘└──┬───┘└──┬───┘└──┬───┘└──┬───┘└─────┬──────┘
         │        │       │       │       │          │
         ▼        ▼       ▼       ▼       ▼          ▼
   ┌─────────┐┌──────┐┌──────────┐┌───────┐┌──────┐┌────────┐
   │@strudel ││idem  ││hydra-    ││WebAudio││osc-  ││plugins │
   │/web     ││(port)││synth     ││native ││bridge││langage │
   │/codemir ││      ││          ││       ││      ││        │
   │/draw    ││      ││          ││       ││      ││        │
   └─────────┘└──────┘└──────────┘└───────┘└──────┘└────────┘

   └── MOTEURS + MODULES ÉDITEUR UPSTREAM (npm ou externes) ──┘
```

Un adapter fait **trois** choses, rien de plus :

1. Charger son moteur upstream et lui transmettre le code à évaluer.
2. Installer les extensions CM6 upstream dans l'éditeur Kanopi (widgets,
   highlight, autocomplete natifs du langage).
3. Publier ses events dans `KanopiEvent` et consommer le transport.

Toute logique métier du langage reste upstream. Cf `ADAPTER_SPEC.md §2`
pour les 6 zones d'intégration détaillées.

## Progressive enhancement : 3 niveaux

| Niveau               | Install                    | Runtimes                                                      | Moteur |
| -------------------- | -------------------------- | ------------------------------------------------------------- | ------ |
| **1. Web pur**       | Rien                       | BPscript, JS, WebAudio, WebMIDI                               | WASM   |
| **2. Web enrichi**   | Rien                       | + Strudel, SC-lite, Csound, Faust, Hydra, p5.js, ORCA, Gibber | WASM   |
| **3. Package local** | Tauri desktop + osc-bridge | + SC natif, Tidal, Python, Sonic Pi, Chuck, Pd, Max           | Natif  |

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

### Library (`packages/library/` + `packages/ui/src/lib/library/`)

- JSON bundled dans le repo (audio-banks aujourd'hui ; starters, scenes,
  snippets, devices, scales à venir)
- Loader qui unifie sources BUNDLED / MINE / COMMUNITY
- Product doc : [LIBRARY.md](LIBRARY.md). Format technique (catalog +
  items) : [LIBRARY_SPEC.md](LIBRARY_SPEC.md).

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

## Bridge OSC (hardware)

Kanopi tourne dans le navigateur et ne peut pas ouvrir de sockets UDP ni
parler SysEx directement. Le **bridge OSC** est un sidecar (process
séparé) qui traduit les messages entre Kanopi (WebSocket) et le monde
hardware (UDP, MIDI, SysEx).

### Séparation des responsabilités

| Canal              | Transport                         | Quand l'utiliser                         |
| ------------------ | --------------------------------- | ---------------------------------------- |
| WebMIDI            | browser natif (USB-MIDI direct)   | CC, notes, clock, SysEx simple. Couvre ~80% des besoins. |
| WebSocket → osc-bridge | WS (Kanopi) → UDP (SC) ou SysEx (synths) | Routage OSC (SuperCollider, SuperDirt), SysEx complexes, réseau, multi-device orchestration. |

Règle : tant que WebMIDI suffit, on reste sur WebMIDI (pas de dépendance
à un process externe). Le bridge est pour les cas où Node/Rust natif est
nécessaire (OSC UDP, SysEx avancés, Ableton Link plus tard).

### Deux implémentations à distinguer

- **`packages/core/src/bridge/osc-bridge.js`** (~80 lignes) — mini-bridge
  Node.js de développement. Relai WebSocket → UDP OSC nu, sans logique
  par device. Fourni pour tests locaux SuperCollider
  (ws://localhost:9000 → udp://localhost:57120). **Pas la cible prod.**
- **[`osc-bridge`](https://github.com/roomi-fields/osc-bridge)** (repo
  Rust séparé, cf §Topologie repos) — **le vrai pont**. Déclaratif JSON
  par device (840+ synths supportés), bidirectionnel, multi-client,
  orchestration N-to-N. Écoute par défaut sur **UDP 7777**. Consommé par
  Kanopi via un client WebSocket (à écrire côté Kanopi, prévu v2 Tauri).

### Détection côté Kanopi

Au boot, `packages/core/src/bridge/` (à venir, pas encore livré)
tente un handshake WebSocket sur `ws://localhost:7777`. Trois issues :

- Connecté → niveau 3 « package local » actif. Les adapters SC / Tidal
  natif / synths hardware deviennent disponibles.
- Timeout/refus → niveau 3 désactivé, UI n'affiche pas les adapters
  dépendants, runtime-status pills restent grises.
- Disconnect pendant session → bannière d'alerte + retry exponentiel en
  arrière-plan.

### Protocole

Le repo osc-bridge expose à la fois OSC natif (UDP) et un endpoint
WebSocket. Kanopi parle OSC-over-WebSocket avec un frame JSON ≈
`{ address: "/synth/cutoff", args: [0.5] }`. L'encodage binaire OSC (cf
le mini-bridge dev) n'est utilisé que quand Kanopi doit parler direct
à un client OSC non-bridge (rare).

### Lifecycle des cibles V1 / V2

- **V1 web** : WebMIDI pour tout ce qui est faisable sans sidecar. Pour
  Ableton Link, SC natif, Tidal-GHCi → exiger l'install manuelle de
  osc-bridge comme daemon local.
- **V2 Tauri** : osc-bridge bundlé et lancé automatiquement comme
  process enfant. L'utilisateur n'a rien à installer.

Doc osc-bridge détaillée : [README upstream](https://github.com/roomi-fields/osc-bridge).

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

| Module                              | Rôle                                   |
| ----------------------------------- | -------------------------------------- |
| `dispatcher/clock.js`               | clock partagé, tick bus                |
| `dispatcher/dispatcher.js`          | scheduler central                      |
| `dispatcher/scene-manager.js`       | gestion scènes                         |
| `dispatcher/map-engine.js`          | routage CC/OSC/note                    |
| `dispatcher/resolver.js`            | résolution note names → fréquence      |
| `dispatcher/transports/midi.js`     | WebMIDI in/out                         |
| `dispatcher/transports/osc.js`      | OSC via WebSocket                      |
| `dispatcher/transports/webaudio.js` | synthèse native                        |
| `dispatcher/evals/sclang.js`        | adapter SuperCollider                  |
| `dispatcher/evals/python.js`        | adapter Python (Sardine via WebSocket) |
| `bridge/osc-bridge.js`              | client WebSocket vers osc-bridge       |

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
- **MIDI jitter** : < 2 ms (web), < 0.5 ms (Tauri v2)
- **Scheduler tick rate** : 1 kHz minimum
- **UI 60 fps** en utilisation normale

## Précision d'horloge — limites et stratégie

### Sources d'horloge disponibles sur le web

| Horloge                         | Précision effective                           | Usage Kanopi                                          |
| ------------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| `AudioContext.currentTime`      | sample-accurate (~22 μs @ 44.1 kHz)           | **seule** source fiable pour scheduling audio         |
| `performance.now()`             | 0.1–1 ms (dégrade sous Spectre mitigation)    | wall-clock des `KanopiEvent` (visualizers, logs)      |
| `setTimeout` / event loop       | 4–16 ms jitter ; **1 s** en onglet caché      | **jamais** utiliser pour l'audio                      |
| `requestAnimationFrame`         | ~16.6 ms @ 60 Hz                              | visuels uniquement                                    |
| WebMIDI `send(data, timestamp)` | ~1–2 ms jitter sous charge (Chrome > Firefox) | bon pour la plupart, pas pour IDM sub-ms              |
| Ableton Link                    | sub-ms en natif                               | **inaccessible** depuis le navigateur (UDP multicast) |

### Règles de conception

1. **AudioContext clock = source de vérité audio**, pattern "Two clocks" (Chris Wilson). Lookahead ~25 ms + scheduler JS qui écrit dans le futur AudioContext.
2. **`performance.now()` = source de vérité visualizer/event bus**. Chaque adapter convertit son horloge native en wall-clock ms à l'émission (cf. [EVENTS.md §`t`](EVENTS.md)).
3. **Pour les events audio-critiques** (`token` Strudel/WebAudio) → `KanopiEvent` expose un champ optionnel `audioTime` (secondes AudioContext) en plus de `t`, consommé par les re-schedulers audio, ignoré par les visualizers.
4. **Onglet en arrière-plan = mort.** Chrome throttle à 1 Hz. Deal-breaker pour un live. À gérer via `navigator.wakeLock` + warning UI explicite ("gardez l'onglet focus").

### Ableton Link

- **V1 web** : via osc-bridge (relay UDP multicast Link ↔ WebSocket). Fonctionne si osc-bridge est installé.
- **V2 Tauri** : binding natif Rust (crate `ableton-link-sys` ou équivalent), thread audio RT-priority.
- **Pas de Link pur-web** : la spec Link = UDP multicast, hors navigateur par design.

### Synchro inter-runtime

Strudel schedule sur AudioContext (précis), Hydra est calé sur rAF (16 ms jitter), un adapter JS pur peut être sur l'un ou l'autre. Trois natures d'horloges coexistent. Le bus `KanopiEvent` unifie les *timestamps wall-clock* pour les visualizers. Pour le *planning audio cross-runtime*, chaque runtime reste sur son horloge native — on ne promet pas une synchro sub-ms entre un trigger Strudel et un flash Hydra.

---

## Historique de révision

- **2026-04-15** : rédaction initiale.
- **2026-04-23** : phase 2.3 task 5. Ajout de la table « Specs connexes »
  en tête, du diagramme **hub + adapters + plugins langage** (principe 9)
  après la topologie repos, et mise à jour du pointeur library vers le
  nouveau `LIBRARY_SPEC.md`.
