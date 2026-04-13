# Kanopi v1 — Feature Checklist

**Priorités :** P0 = must-have pour lancement public · P1 = should-have si temps permet · P2 = post-v1.

Référence visuelle : [mockup v1](../mockups/kanopi-v1-mockup.html).

## 1. Workspace & fichiers

- **P0** File tree (ouverture d'un dossier = workspace)
- **P0** Onglets multi-fichiers avec close/reorder
- **P0** New / Open / Save workspace (persistance IndexedDB)
- **P0** Types reconnus : `.kanopi`, `.tidal`, `.scd`, `.strudel`, `.hydra`, `.py`, `.js`
- **P0** Activity bar (Files, Library, Search, Hardware, Git, Docs, Account)
- **P1** Drag-and-drop fichiers
- **P2** Import workspace depuis URL, export JSON, share link

## 2. Éditeur (CodeMirror 6)

- **P0** Coloration : session Kanopi, Strudel, Hydra
- **P0** Évaluation par ligne/bloc (Ctrl+Enter)
- **P0** Undo/redo, search/replace, multi-cursor
- **P0** Keybindings VSCode-like
- **P1** Coloration Tidal, SC, Python
- **P1** Autocomplétion basique (actors, scènes)
- **P2** Vim mode, thèmes custom, Git gutter

## 3. Parseur session (`.kanopi`)

- **P0** `@actor` (file + transport)
- **P0** `@scene` (snapshot on/off actors)
- **P0** `@map` (cc / pad / note → tempo / scene / actor.param)
- **P0** Validation sémantique (actor inconnu, cible invalide)
- **P0** Hot reload au save
- **P0** Erreurs soulignées dans l'éditeur
- **P1** `@expose` pour scènes imbriquées
- **P1** `@tempo`, `@quantize` directives globales
- **P2** Autocomplétion contextuelle

## 4. Runtimes

**Niveau 1-2 (browser only) pour v1 :**

- **P0** Strudel (Tidal JS port)
- **P0** Hydra
- **P0** BPscript via BP3 WASM
- **P0** JavaScript / WebAudio (fallback universel)
- **P1** SC-lite / scsynth WASM (si stable)
- **P1** Csound WASM
- **P1** Faust (faust2wasm → AudioWorklet)
- **P2** p5.js, Gibber, ORCA JS, Mercury, Punctual

**Niveau 3 (bridge local) — reporté v2 :**
- SC natif, Tidal GHCi, Sardine, Chuck, Sonic Pi, Pd, Max

## 5. Clock partagé

- **P0** Clock interne (BPM, beat, bar, phase) partagé entre runtimes
- **P0** Play / Stop / Pause
- **P0** Tap tempo, BPM fader
- **P0** Beat indicator visuel (dots pulsants)
- **P1** Phase indicator visuel détaillé
- **P2** Ableton Link (niveau 3 via bridge)
- **P2** MIDI clock out

## 6. Actors

- **P0** Déclaration dans session, instanciation au load
- **P0** Activation / désactivation (toggle)
- **P0** Liaison actor ↔ fichier (onglet highlight quand actor actif)
- **P0** Panel Actors sidebar : état visuel, bandeau couleur runtime
- **P1** VU meter / activity indicator par actor
- **P1** Solo / mute
- **P2** Volume per actor, panoramique

## 7. Scènes

- **P0** Déclaration dans session
- **P0** Scène = snapshot on/off actors
- **P0** Switcher UI (cards avec dots actors colorés)
- **P0** Raccourcis clavier (1-9)
- **P1** Transition instantanée vs quantifiée au beat/bar
- **P2** Scènes imbriquées, crossfade, morphing

## 8. Mapping `@map`

- **P0** WebMIDI input (détection ports)
- **P0** CC → tempo, scene:name, actor on/off
- **P0** Note/pad → scene, trigger
- **P0** Feedback visuel (CC reçu = animation brève)
- **P1** OSC input (WebSocket bridge vers osc-bridge local)
- **P1** Learn mode (bouger un CC → proposition `@map` auto)
- **P1** Ranges / scaling dans `@map` (syntax `range:[min,max]`)
- **P2** Expressions dans `@map` (math simple)

## 9. Hardware (niveau 3, v2)

- **P2** Intégration `osc-bridge` via sidecar WebSocket
- **P2** Bidi : LEDs / displays reflètent état Kanopi
- **P2** Page switching auto sur change de scène
- **P2** Device detection / hot plug

## 10. State inspector

- **P0** Panel Inspector : liste actors + état on/off
- **P0** Position clock live (beat.phase)
- **P0** Liste mappings actifs + dernière valeur reçue
- **P1** Historique CC (mini-graphe par CC)
- **P2** Tree view flags/triggers BPscript

## 11. Library

- **P0** Activity bar → vue Library
- **P0** Catégories : STARTERS / SCENES / SNIPPETS / DEVICES / SCALES
- **P0** Sources : BUNDLED + MINE (COMMUNITY en P1)
- **P0** 3 starter workspaces bundled
- **P0** Bouton "Add to workspace" (copie dans workspace courant)
- **P1** Source COMMUNITY (lecture seule, depuis manifest Git)
- **P2** Publication depuis l'app vers community hub
- **P2** Ratings, comments, usage stats (nécessite backend)

## 12. Command palette

- **P0** Ctrl+Shift+P ouvre palette
- **P0** Commandes : Evaluate, Switch scene, Reload actor, Open file
- **P1** Fuzzy search
- **P2** Commandes customisables

## 13. Status bar

- **P0** BPM, beat, scène active, runtimes connectés
- **P0** Beat indicator pulsant
- **P0** Indicateur erreur
- **P1** État bridge local (v2)
- **P2** CPU / audio indicators

## 14. Panel logs / console

- **P0** Console unifiée avec logs colorés par runtime
- **P0** Erreurs d'évaluation visibles
- **P1** Clear, pause, level filter
- **P2** Log export, filtering par runtime

## 15. Onboarding / docs

- **P0** 3 starter workspaces livrés
- **P0** README + quickstart en home
- **P0** Page docs hébergée
- **P1** Tutoriel interactif (walkthrough in-app)
- **P2** Galerie de patches communautaires

## 16. Packaging / deploy

- **P0** Site `kanopi.cc` (ou équivalent) avec app hébergée
- **P0** PWA (installable, offline capable)
- **P1** Tauri desktop wrapper (v2)
- **P2** Auto-update, installers multi-OS

## 17. Qualité & fiabilité

- **P0** Crash-isolation runtime (Strudel plante ≠ UI plante)
- **P0** Auto-save workspace
- **P1** Telemetry opt-in
- **P2** Tests e2e automatisés

---

## Synthèse MVP (P0 stricts)

**13 zones critiques, ~3-4 mois dev solo plein temps :**

1. Workspace VSCode-like (onglets, activity bar, file tree, command palette)
2. Éditeur CodeMirror 6 multi-langage
3. Parser session (@actor/@scene/@map)
4. 4 runtimes (Strudel, Hydra, BPscript, JS)
5. Clock partagé
6. Actors + scenes UI
7. @map CC basique
8. State inspector minimal
9. Library BUNDLED + MINE
10. Status bar + beat indicator
11. Console logs
12. Onboarding (3 starters + docs)
13. PWA deploy

Les P1 ajoutent 1-2 mois, les P2 c'est post-v1.
