---
name: Collection matériel & stratégie contrôleurs Kanopi
description: Inventaire synthés/contrôleurs de Romi + classement pour surfaces Kanopi + stratégie drivers OSC
type: project
originSessionId: 113501ab-5395-4eb5-a25d-c8afebd2cad1
---
## Collection (source: /mnt/d/Claude/matrixbrute/docs/Synthèse complète matériel musical.docx + organisation.xlsx)

**Synthés clés:** Moog Subsequent 37, Osmose (MPE), Subharmonicon, DFAM×3, Spectravox, Labyrinth, Mother32, GR-Mega, Loopscaper, Torso T-1, Polyend Synth.
**Semi-modulaire/modulaire:** Nifty-case avec FH-2 (MIDI↔CV bidi, Lua), Pamela's PRO, Disting EX, Quadrax, Morph 4, Mojave, ATOM, etc.
**Instruments électroniques:** Soma Lyra-8, Cosmos, Ornament-8.
**Contrôleurs/séquenceurs:** Electra One MK2, Launch Control XL V3, Push 3, Tempera (Beetlecrab), Hapax, MPC Live 3, Minilab 3, Audible Deluge.

## Classement surfaces Kanopi

**Tier 1 — contrôleurs purs scriptables**
1. Electra One MK2 — surface principale (Lua, écrans couleur, bidi natif, miroir d'état)
2. Launch Control XL V3 — "flag mixer" secondaire, LEDs RGB SysEx

**Tier 2 — séquenceurs autonomes (imposent workflow)**
- Push 3, Tempera (surface XY pour cv continus), Hapax (source events), MPC Live 3

**Tier 3 — en cours**
- Minilab 3 — reverse firmware en cours (template pour futurs drivers)

**Pont modulaire (stratégique)**
- FH-2 — MIDI↔CV bidi, indispensable dès que Kanopi pilote du CV
- Pamela's PRO, Disting EX — interfaces CV↔MIDI complémentaires

**Projeté**
- MatrixBrute (~650€) — instrument-surface hybride, matrice 16×16 LEDs = timeline physique

## Stratégie drivers OSC

**Projet séparé : [osc-bridge](https://github.com/roomi-fields/osc-bridge)**
Repo dédié, bien ficelé, nouvelle version en cours avec intégration Lua pour actions avancées.

**Supportés:** Minilab 3, Subsequent 37.
**Prévu:** MatrixBrute (quand acquis).
**Candidats suivants:** Osmose, Subharmonicon, DFAM.

**Intégration Kanopi:**
- `@actor xxx transport:osc(/namespace)` consomme/produit de l'OSC nommé
- La logique synthé-spécifique (SysEx, scaling, mirroring bidi) vit dans osc-bridge (Lua), pas dans Kanopi
- Kanopi reste agnostique du hardware

**Why:** Séparation claire langage/framework ↔ driver hardware. osc-bridge est réutilisable hors Kanopi.
**How to apply:** Pour ajouter un synthé à Kanopi, écrire le driver dans osc-bridge d'abord, puis `@actor transport:osc` côté BPscript.
