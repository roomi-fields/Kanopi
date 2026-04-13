# Plan d'action — Kanopi UI Web

Version 2.1 — 10 avril 2026

## Naming

| Niveau | Nom | Role |
|--------|-----|------|
| **Produit/Framework** | **Kanopi** | Le DAW des live coders — UI, runtimes, bridge, timeline |
| **Langage** | **BPscript** | Le meta-sequenceur — 3 mots, 24 symboles, descendant de BP3 |
| **Moteur** | **BPx** | Le deriveur de grammaires — remplace BP3, JS pur, multi-instance |

## Vision

Kanopi = le DAW des live coders. L'interface unique ou tous les runtimes
(SuperCollider, Tidal, Python, MIDI, WebAudio, DMX) cohabitent avec une clock
commune, un editeur multi-langage, et une timeline interactive.

Trois niveaux d'experience, un seul UI :

| Niveau | Install | Runtimes | Moteur |
|--------|---------|----------|--------|
| 1. Web pur | Rien | BPscript, BP3, JS, WebAudio, Web MIDI | WASM |
| 2. Web enrichi | Rien | + Strudel (Tidal JS), SC-lite, Csound WASM, Faust WASM, Hydra, p5.js, ORCA JS, Gibber | WASM |
| 3. Package local | Bridge | + vrai SC, vrai Tidal, Python, Sonic Pi, Chuck, Pure Data, Max/MSP (OSC), BP3 natif (200x) | Natif |

L'UI detecte automatiquement le bridge local. Present -> niveau 3 (natif + tous runtimes).
Absent -> niveaux 1-2 (tout dans le navigateur).

### Catalogue des runtimes

Chaque runtime a un modele de timing qui determine son integration :

**Esclaves (pas de clock interne — BPscript envoie des events):**

| Runtime | Domaine | Niveau | Integration |
|---------|---------|--------|-------------|
| JavaScript | Code/visuel/audio | 1 | `new Function()` dans le contexte navigateur |
| WebAudio | Synthese | 1 | Natif, meme AudioContext |
| Csound | Audio academique | 2 | csound-wasm, scoreline events |
| Faust | DSP fonctionnel | 2 | faust2wasm -> AudioWorklet |
| Hydra | Visuel (shaders) | 2 | JS pur, appels directs |
| p5.js | Visuel (canvas) | 2 | JS pur, appels directs |
| Gibber | Audio+visuel | 2 | JS pur |
| SC/scsynth | Audio | 3 | OSC avec timestamps |
| Python | Controle/data | 3 | WebSocket, process local |
| Pure Data | Audio | 3 | Messages Pd (WebPd existe aussi en niveau 2) |
| Max/MSP | Audio/media | 3 | OSC seulement (proprietaire) |

**Synchronises (clock propre — sync via Ableton Link):**

| Runtime | Domaine | Niveau | Integration |
|---------|---------|--------|-------------|
| Strudel | Patterns (Tidal JS) | 2 | Pattern extraction, schedule par notre clock |
| ORCA | Sequenceur 2D | 2 | JS, on controle le tick rate |
| Tidal | Patterns | 3 | ghci, sync Link |
| Sonic Pi | Audio/education | 3 | OSC + Link |
| Chuck | Audio temps reel | 3 | Process local + Link |
| FoxDot | Audio (Python+SC) | 3 | Python process + Link |
| Mercury | Audio | 2 | mercury-web (JS) |

**Notre moteur (integre):**

| Runtime | Niveau | Notes |
|---------|--------|-------|
| BP3 WASM | 1 | Moteur embarque |
| BP3 natif | 3 | 200x plus rapide, via bridge |

## Principes de design

1. **Les transports sont declares dans la scene**, pas dans l'UI. Le binding
   acteur -> transport (`@actor sitar transport:midi(ch:3)`) determine la sortie.
   L'UI reflete et permet de configurer ces declarations.

2. **Le dual output est une consequence de la scene.** Deux acteurs avec deux
   transports differents = dual output automatique. Le dispatcher route par acteur.

3. **L'UI doit etre interactive** — timeline, playback, controles visuels.
   BPscript est un instrument, pas juste un editeur de code.

4. **Multi-langage natif.** L'editeur supporte BPscript, BP3, JavaScript,
   SuperCollider, Tidal, Python — chacun avec sa coloration syntaxique et son
   mode d'evaluation. Comme un notebook Jupyter mais avec le temps en plus.

---

## Etat actuel

### Fonctionnel
- Editeur BPscript -> transpileur -> WASM -> dispatcher -> Web Audio -> son
- Timeline multi-voix avec visualisation controles + CV
- Playback : Produce / Play / Loop / Stop
- Live coding avec hot-swap entre cycles
- Bibliotheque de scenes (demos, Bernard, localStorage)
- Help integree
- Resolver 5 couches (alphabets, tunings, temperaments)
- CV objects (ADSR, LFO, ramp, backtick)
- Percussion/tabla synthese
- MIDI output fonctionnel avec actor routing (7 demos)
- Controls structures en sous-groupes (musical/midi/webaudio/dispatcher/generic)

### Manquant
- Panneau de controles interactifs (sliders, knobs)
- Editeur multi-langage (onglets/modes par runtime)
- Visualisation de la structure polymetrique
- Constraint solver (deformation temporelle)
- Mapping controleurs physiques -> parametres
- Bridge local (niveau 3)

---

## Phase 1 — Panneau de controle interactif

**Dependance :** aucune — `dispatcher.controlState` est deja modifiable en temps reel

**Resultat :** l'utilisateur manipule le son pendant le playback

### 1.1 — Controles par sous-groupes

Panneau genere dynamiquement depuis `controls.json` (v0.3.0, sous-groupes).
Les sections s'affichent/masquent selon le transport de l'acteur actif.

**Musical** (toujours visible) :

| Controle  | Widget | Range     | Default |
|-----------|--------|-----------|---------|
| `vel`     | slider | 0-127     | 64      |
| `pan`     | slider | 0-127     | 64      |
| `offvel`  | slider | 0-127     | 64      |

**MIDI** (visible si acteur MIDI actif) :

| Controle  | Widget   | Range  | Default |
|-----------|----------|--------|---------|
| `chan`    | dropdown | 1-16   | 1       |
| `ins`    | dropdown | 1-128  | 0       |
| `mod`    | slider   | 0-127  | 0       |

**Web Audio** (visible si acteur WebAudio actif) :

| Controle  | Widget   | Range                            | Default  |
|-----------|----------|----------------------------------|----------|
| `wave`    | dropdown | sine, triangle, square, sawtooth | triangle |
| `attack`  | slider   | 1-5000 ms                        | 20       |
| `release` | slider   | 1-5000 ms                        | 100      |
| `filter`  | slider   | 20-20000 Hz                      | 0 (off)  |
| `filterQ` | slider   | 0-30                             | 1        |
| `detune`  | slider   | -1200-1200 cents                 | 0        |

**Dispatcher** (toujours visible) :

| Controle    | Widget                   | Range         |
|-------------|--------------------------|---------------|
| `transpose` | slider + input           | +/-24 steps    |
| `rotate`    | slider + input           | 0 a N degres  |
| `keyxpand`  | 2 inputs (pivot, factor) | —             |
| `scale`     | dropdown                 | tunings.json  |

### 1.2 — Cascading visuel

Trois niveaux de priorite visibles dans le panel :
- **Grise** = default (controls.json)
- **Blanc** = acteur (`@actor X transport:midi(ch:3)`)
- **Highlight** = sequence en cours (`(vel:120)` inline, read-only pendant playback)

### 1.3 — Inspector temps reel

- Highlight du token courant sur la timeline pendant le playback
- Affichage en temps reel des valeurs de `controlState`
- Distinction visuelle : valeurs grammaire vs valeurs utilisateur (slider)

---

## Phase 2 — Editeur multi-langage

**Dependance :** CodeMirror 6 (deja prevu dans EDITOR.md)

**Resultat :** l'utilisateur edite et evalue du BPscript, BP3, JS, SC, Tidal dans le meme editeur

### 2.1 — Modes d'edition

Chaque onglet ou fichier a un mode qui determine :
- La coloration syntaxique (Lezer grammar par langage)
- L'autocompletion
- Le raccourci d'evaluation (Ctrl+Enter = evaluer la selection/cellule)
- Le runtime cible

| Mode | Coloration | Evaluation | Niveau requis |
|------|-----------|------------|---------------|
| BPscript | Lezer custom | Transpiler -> WASM -> dispatcher | 1 |
| BP3 | Lezer custom | Direct WASM (bypass transpiler) | 1 |
| JavaScript | CM built-in | `new Function()` dans le contexte dispatcher | 1 |
| SuperCollider | CM built-in | SC-lite (niveau 2) ou sclang via bridge (niveau 3) | 2/3 |
| Tidal | Lezer Haskell subset | Strudel (niveau 2) ou ghci via bridge (niveau 3) | 2/3 |
| Python | CM built-in | Bridge WebSocket (niveau 3 uniquement) | 3 |

### 2.2 — SC-lite (niveau 2)

Traducteur SynthDef -> WebAudio. Sous-ensemble de UGens supportes :

| SC UGen | WebAudio equivalent |
|---------|-------------------|
| SinOsc, Saw, Pulse | OscillatorNode |
| LPF, HPF, BPF | BiquadFilterNode |
| EnvGen + Env.adsr | Gain + automation |
| WhiteNoise, PinkNoise | AudioWorklet |
| PlayBuf, GrainBuf | AudioBufferSourceNode |
| Delay, CombL | DelayNode |
| Pan2 | StereoPannerNode |

L'utilisateur ecrit du SC, le traducteur genere un graphe WebAudio.
Si un UGen n'est pas supporte -> warning + fallback (silence ou substitution).
Pour les UGens exotiques -> niveau 3 (vrai scsynth).

### 2.3 — Strudel integration (niveau 2)

Import de `@strudel/core` pour evaluer des patterns Tidal dans le navigateur.
Le scheduling est reroute vers notre dispatcher (meme clock).

Note licence : Strudel est AGPL. Le code BPscript qui l'integre doit rester
public. Si un jour on commercialise, on retire Strudel et on remplace par un
evaluateur de patterns maison. Le module est isole pour faciliter ce swap.

### 2.5 — Autres runtimes web (niveau 2)

Tous ces runtimes sont du JS pur, integres progressivement selon la demande :

| Runtime | Package | Effort | Priorite |
|---------|---------|--------|----------|
| Hydra | hydra-synth (npm) | Faible — JS pur, pas de clock | Haute (visuel + audio = killer feature) |
| Csound | csound-wasm | Moyen — AudioWorklet | Moyenne (public academique) |
| Faust | faust2wasm | Moyen — AudioWorklet | Moyenne (DSP pur, remplace SC-lite a terme) |
| p5.js | p5 (npm) | Faible — JS pur | Basse (utile mais pas unique) |
| ORCA | orca-js | Faible — JS, tick controllable | Basse |
| Gibber | gibber (npm) | Faible — JS pur | Basse |
| Mercury | mercury-web | Faible — JS | Basse |

### 2.4 — MIDI input (controleurs physiques)

- Ecoute des CC entrants depuis les controleurs connectes
- Utilise en Phase 4 pour le mapping vers les parametres

---

## Phase 3 — Timeline interactive

**Dependance :** `bp3_get_timed_tokens()` verbose=2 (marqueurs structurels `{`, `,`, `}`
dans le flux de tokens — agent WASM)

### Choix technique : Canvas 2D from scratch

BPscript a un modele de donnees unique (structure polymetrique imbriquee) qui ne
correspond a aucune bibliotheque existante. Le rendu est plus simple qu'un DAW
(pas de waveforms, pas de recording, pas de mixer — juste des blocs avec des
proportions dans un arbre).

Reference visuelle : openDAW pour le style (sombre, accents colores par voix,
rendu Canvas anti-aliase, layout 3 zones synchronisees).

### 3.1 — Fondations timeline Canvas

Nouveau module `web/timeline.js`.

**Primitives :**
- `TimelineRange` : conversion temps <-> pixels, zoom continu
- `TimeRuler` : graduation adaptative (ticks ajustes au zoom)
- `TrackRenderer` : rendu d'une piste (blocs rectangulaires avec label)
- Layout : track headers (gauche, fixe) | contenu (scrollable) | minimap optionnel

**Interactions :**
- Zoom : Ctrl+scroll wheel (centre sur le curseur)
- Scroll horizontal : scroll wheel ou drag
- Selection : clic sur un bloc -> highlight + info dans l'inspector

### 3.2 — Visualisation structure polymetrique

**Parser** (`src/dispatcher/structureParser.js`) :
- Entree : timed tokens verbose=2 (avec `{`, `,`, `}`)
- Sortie : arbre structurel (type, span, voices, proportions, leaves)

**Rendu :**
- Groupes polymetriques `{...}` = conteneurs (bracket ou fond colore)
- Chaque voix sur une piste separee au sein du conteneur
- Largeur des blocs proportionnelle a la duree
- Couleur distincte par voix
- Imbrication visible (indentation ou nesting visuel)

### 3.3 — Constraint solver

Nouveau module `src/dispatcher/constraintSolver.js`.
Cf. [TEMPORAL_DEFORMATION.md](../design/TEMPORAL_DEFORMATION.md) pour le design complet.

Trois modes :

**Mode 1 — Span fixe** : le conteneur garde sa duree, les fratries se compriment.
**Mode 2 — Proportions fixes** : les fratries gardent leur duree, le conteneur s'etire.
**Mode 3 — Contrainte relachee** : les voix paralleles se dephasent (phasing).

### 3.4 — Manipulation sur la timeline

- Drag horizontal sur les bordures de blocs -> modifie la proportion
- Selecteur de mode de contrainte (3 boutons)
- A chaque drag : solver recalcule -> `dispatcher.load()` -> playback adapte
- En mode loop : la deformation persiste d'un cycle a l'autre

---

## Phase 4 — Mapping controles -> structure

**Dependance :** Phase 2.4 (MIDI input) + Phase 3.3 (solver)

**Resultat :** des potards physiques deforment la structure temporelle en live

### 4.1 — Mapping MIDI CC -> parametres
- CC N -> parametre (proportion d'un element, mode contrainte, controlState.xxx)
- Learn mode : toucher un potard -> selectionner une cible -> mapping cree

### 4.2 — CV internes comme source de modulation
- LFO, ramp, ADSR -> sources de modulation pour le solver
- Exemple : LFO -> proportion d'une voix -> oscillation temporelle automatique

### 4.3 — Interface de mapping
- Panneau : sources (MIDI CC, LFO, slider UI) -> cibles (proportions, controlState)
- Persiste dans la scene .bps

---

## Phase 5 — Bridge local (niveau 3)

**Dependance :** Phases 1-2 fonctionnelles en mode web pur

**Resultat :** l'utilisateur installe un package et deverrouille SC, Tidal, Python + BP3 natif

### 5.1 — Architecture bridge

```
UI Web (navigateur)  <-- WebSocket -->  Bridge local (Node)
                                        |-- bp3 natif (200x WASM)
                                        |-- sclang (SuperCollider)
                                        |-- ghci + Tidal
                                        |-- python
                                        |-- Sonic Pi (OSC)
                                        |-- Chuck
                                        |-- Pure Data
                                        |-- Max/MSP (OSC)
                                        |-- FoxDot (Python + SC)
                                        |-- Ableton Link (sync clock)
```

Un seul process Node qui :
- Ecoute sur `ws://localhost:9876`
- Expose un endpoint `/status` -> `{ bp3: true, sc: true, tidal: false, python: true }`
- Route les evaluations vers le bon runtime
- Retourne stdout/stderr + resultats structures

### 5.2 — Detection et switch automatique

L'UI fait un health check au demarrage :
- Connexion WebSocket reussie -> niveau 3 active
  - BP3 : switch WASM -> natif (transparent, meme format de sortie)
  - Onglets SC/Tidal/Python : deverrouilles
- Connexion refusee -> niveaux 1-2 (tout dans le navigateur)
  - Modes non disponibles grises avec lien "Installer le package local"

### 5.3 — Installation

```bash
npx bpscript-bridge install    # verifie les deps, installe le relay
npx bpscript-bridge start      # lance le bridge
```

Le bridge detecte les runtimes presents :
- BP3 : binaire fourni (compile pour Windows/Linux/macOS)
- SC : detecte sclang dans le PATH
- Tidal : detecte ghci + tidal dans le PATH
- Python : detecte python3 dans le PATH
- Sonic Pi : detecte sonic-pi-tool ou OSC port
- Chuck : detecte chuck dans le PATH
- Pure Data : detecte pd dans le PATH
- Max/MSP : detecte via OSC (port configurable)
- FoxDot : detecte via Python (import FoxDot)
- Ableton Link : lib C (abletonlink), integree dans le bridge

Chaque runtime manquant = feature grisee avec instructions d'installation.
Pas de bundle monolithique — on s'appuie sur ce que l'utilisateur a deja.

### 5.4 — Plateformes

| Composant | Windows | Linux | macOS |
|-----------|---------|-------|-------|
| BP3 natif | oui (build.sh) | oui (build.sh) | oui (Bernard) |
| Bridge Node | oui | oui | oui |
| Ableton Link | oui (lib C) | oui (lib C) | oui (lib C) |
| SuperCollider | installeur officiel | apt/pacman | brew/installeur |
| Tidal/ghci | ghcup | ghcup | ghcup |
| Python | installeur | pre-installe | pre-installe |
| Sonic Pi | installeur officiel | apt/snap | brew/installeur |
| Chuck | installeur | apt/build | brew/installeur |
| Pure Data | installeur | apt | brew/installeur |
| Max/MSP | installeur (payant) | — | installeur (payant) |

---

## Phase 6 — Synchronisation inter-scenes et inter-langages

Cf. [SCENES.md](../design/SCENES.md) pour le modele complet de hierarchie,
scoping et communication inter-scenes.

**Dependance :** Phase 5 (bridge) pour les runtimes externes, Phase 2 pour le web

**Resultat :** plusieurs scenes BPscript et/ou programmes autonomes (SC, Tidal, etc.)
interagissent en temps reel via triggers, flags et donnees partagees

### 6.1 — Mecanismes existants

BPscript a deja les primitives necessaires :
- **Triggers** `<!sync1` — attend un signal avant de continuer
- **Flags** `[phase==2]` — etat partage, conditionne les regles

Ces mecanismes fonctionnent entre scenes BPscript (memoire partagee dans le dispatcher).
La Phase 6 les **expose** aux programmes externes.

### 6.2 — Bus OSC standardise

Le bridge expose un serveur OSC avec des adresses standardisees.

**BPscript recoit :**

| Adresse | Effet | Exemple |
|---------|-------|---------|
| `/bps/trigger/<name>` | Declenche `<!name` | SC envoie `/bps/trigger/sync1` |
| `/bps/flag/<name>` value | Modifie un flag | Tidal envoie `/bps/flag/phase 2` |
| `/bps/tempo` bpm | Change le tempo master | ORCA envoie `/bps/tempo 140` |
| `/bps/control/<key>` value | Modifie controlState | Python envoie `/bps/control/vel 100` |

**BPscript emet :**

| Adresse | Quand | Exemple |
|---------|-------|---------|
| `/bps/trigger/<name>` | Quand un trigger fire | SC ecoute `/bps/trigger/drop` |
| `/bps/flag/<name>` value | Quand un flag change | Tidal ecoute `/bps/flag/phase` |
| `/bps/beat` count | A chaque beat | Hydra sync les visuels |
| `/bps/token` name time dur | A chaque terminal | SC reagit aux notes jouees |
| `/bps/bar` count | A chaque mesure | Sync structurelle |

### 6.3 — Trois niveaux de sync

**Interne (web, meme dispatcher) :**
```
Scene A : [phase+1]                    // incremente le flag
Scene B : [phase==2] S -> explosion    // reagit
```
Pas de latence — memoire partagee dans le dispatcher.

**Web (meme navigateur, JS direct) :**
```javascript
// Hydra reagit aux beats BPscript
osc(() => bps.beatPhase, 10).color(1,0,0).out()

// p5.js reagit aux tokens
bps.on('token', (name, time) => { drawNote(name) })
```
Pas de latence — callbacks JS directs.

**Externe (bridge, OSC/WebSocket) :**
```supercollider
// SC envoie un trigger a BPscript
n = NetAddr("localhost", 9877);
n.sendMsg("/bps/trigger", "drop");

// SC ecoute les changements de flag
OSCdef(\phase, { |msg|
  if(msg[1] == 2) { ~reverb.set(\room, 0.8) }
}, "/bps/flag/phase");
```

```python
# Python ecoute les tokens et envoie des donnees
from pythonosc import dispatcher, osc_server
def on_token(addr, name, time, dur):
    # algorithme -> modifie un flag
    client.send_message("/bps/flag/density", compute_density())
```

Latence reseau locale (~1ms) — negligeable pour le live.

### 6.4 — Ableton Link (sync tempo/phase)

Pour les runtimes avec leur propre clock (Tidal, Sonic Pi, Chuck, ORCA),
Ableton Link synchronise tempo et phase sans maitre/esclave.

Le bridge integre la lib Link (C, MIT). Notre dispatcher est un pair Link.
Les runtimes qui supportent Link (SC, Tidal, Sonic Pi, ORCA, Ableton)
se calent automatiquement sur le meme tempo et la meme phase.

```
BPscript dispatcher  <-- Link -->  Tidal
                     <-- Link -->  Sonic Pi
                     <-- Link -->  Ableton Live
                     <-- Link -->  ORCA
```

Link ne transporte PAS de donnees — juste tempo + phase. Les triggers et flags
passent par OSC (6.2). Les deux protocoles sont complementaires :
- Link = QUAND (tempo, phase, beats)
- OSC = QUOI (triggers, flags, donnees)

### 6.5 — Scenarios types

**Audio + visuel synchronises :**
```
BPscript -> melodie WebAudio + rythme MIDI
         -> /bps/beat -> Hydra (visuel pulse sur les beats)
         -> /bps/token -> p5.js (notation en temps reel)
```

**Deux scenes BPscript + SC autonome :**
```
Scene A (structure) : [phase==2] S -> {mel, rythme}
Scene B (ambiance)  : [phase==2] S -> drone_evolve
SC (autonome)       : ecoute /bps/flag/phase, adapte le reverb
                      envoie /bps/trigger/drop quand pret
```

**BPscript + Tidal + Hydra (trio live coding) :**
```
BPscript : orchestre la structure (grammaires, polymetrie)
Tidal    : patterns rythmiques (sync Link)
Hydra    : visuels reactifs (callbacks JS sur beats + tokens)
```

---

## Ordre et dependances

```
Phase 1 (controles)       ---- immediat (aucune dependance)
Phase 2.1 (multi-lang)    ---- immediat (parallele a Phase 1)
Phase 2.2 (SC-lite)       ---- apres 2.1
Phase 2.3 (Strudel)       ---- apres 2.1
Phase 2.5 (Hydra, etc.)   ---- apres 2.1 (progressif, selon demande)
Phase 3.1 (timeline)      ---- immediat (fondations Canvas)
Phase 3.2 (structure)     ---- apres verbose=2 WASM
Phase 3.3 (solver)        ---- apres 3.2
Phase 3.4 (drag)          ---- apres 3.1 + 3.3
Phase 4   (mapping)       ---- apres 2.4 + 3.3
Phase 5   (bridge)        ---- apres Phases 1-2 stables
Phase 6.1 (sync interne)  ---- apres Phase 1 (flags/triggers dans dispatcher)
Phase 6.2 (bus OSC)       ---- apres Phase 5 (bridge requis)
Phase 6.3 (sync web JS)   ---- apres Phase 2.5 (runtimes web)
Phase 6.4 (Ableton Link)  ---- apres Phase 5 (lib C dans le bridge)
```

---

## References visuelles

- **openDAW** — style visuel : theme sombre, accents colores, Canvas anti-aliase
- **web-synth** — MIDI editor PixiJS, rendu performant de milliers de blocs
- **Strudel** — reference pour l'evaluation Tidal dans le navigateur
- **Jupyter** — reference pour le modele notebook multi-langage

---

## Relations avec les autres documents

- [TEMPORAL_DEFORMATION.md](../design/TEMPORAL_DEFORMATION.md) — Constraint solver, 3 modes
- [ARCHITECTURE.md](../design/ARCHITECTURE.md) — Pipeline compile/runtime, dispatcher
- [CV.md](../design/CV.md) — CV objects comme sources de modulation
- [INTERFACES_BP3.md](../design/INTERFACES_BP3.md) — API WASM (verbose=2 a venir)
- [EDITOR.md](EDITOR.md) — Design editeur CodeMirror 6
- [SOUNDS.md](../design/SOUNDS.md) — Controls par sous-groupes, cascading 3 niveaux
- [SCENES.md](../design/SCENES.md) — Hierarchie de scenes, scoping, @scene/@expose/@map
