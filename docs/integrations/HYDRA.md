# Kanopi × Hydra — Phase 0 audit

Audit du gap entre l'UX Hydra native (`hydra.ojack.xyz`) et l'intégration
actuelle Kanopi, suivant la procédure `feedback_language_integration_procedure`
et la structure en 6 zones d'`ADAPTER_SPEC.md §2`.

Date : 2026-04-23. Adapter actuel : `packages/ui/src/lib/runtimes/hydra.ts`
(81 lignes).

---

## Écosystème upstream Hydra

Contrairement à Strudel (pack clean `@strudel/web` + `@strudel/codemirror`),
Hydra n'a **pas de module éditeur npm réutilisable**.

| Package                                             | Contenu                                              | Consommable ?          |
| --------------------------------------------------- | ---------------------------------------------------- | ---------------------- |
| `hydra-synth` (npm, ojack/hydra-synth)              | Moteur WebGL (regl + shaders générés)                | ✅ déjà utilisé          |
| `hydra` (github ojack/hydra)                        | App éditeur web (framework Choo, pas CM6)            | ❌ pas un module         |
| `hydra-functions` (github hydra-synth/hydra-functions) | Site de référence + `libs/hydra/glsl-functions.js` + `examples.js` | 🟡 extract possible   |
| Pas de `hydra-codemirror`                            | —                                                    | —                      |

Conséquence : pour la zone B (native editor UX), on doit **construire la
glue** à partir des données brutes upstream (`glsl-functions.js`,
`examples.js`) — il n'y a rien de prêt-à-consommer. C'est légitime au
sens du principe 7 (on n'écrit pas de logique, on consomme les données
source), mais le poids de glue est plus élevé que pour Strudel.

---

## Audit par zone

### A. Runtime engine — ✅ couvert

| Feature                     | Hydra natif                           | Kanopi actuel                 |
| --------------------------- | ------------------------------------- | ----------------------------- |
| Moteur                       | `new Hydra({ canvas, detectAudio })`  | ✅ idem (hydra.ts:35)          |
| Eval du code                | `eval(code)` globalisé                | ✅ `new Function(code)()` + `makeGlobal: true` |
| Clear / stop                | `solid().out()` ou clear du canvas    | ✅ `solid(0,0,0,0).out()` + hide canvas |
| BPM                         | pas de convention stable               | 🟡 exposé en `window.bpm` (convention Kanopi) |
| audioDetection              | `detectAudio: true` + `a.show()`       | ❌ désactivé (`detectAudio: false`) |
| Multi-sources (`s0`-`s3`)   | API `s0.initCam()`, `s0.initImage()`   | ❌ pas branché                 |

**Gap A** :

- **audioDetection** : utile pour faire pulser Hydra au son. Pourrait être
  branché sur le transport Kanopi (beat/bar) + optionnellement sur un
  analyser Web Audio partagé avec Strudel.
- **Sources `s0..s3`** : pour que l'user puisse faire `s0.initCam()` ou
  charger des images de la Library. Nécessite exposer l'API sources au
  user code et possiblement une intégration Library (§D).

### B. Native editor UX — 🔴 gros gap

| Feature                     | Hydra natif                           | Kanopi actuel                 |
| --------------------------- | ------------------------------------- | ----------------------------- |
| Syntax highlight            | Cham.js (éditeur Atom/Web) via CM      | 🟡 via `javascript()` parser générique |
| Autocomplete fonctions       | Menu custom dans l'éditeur web        | ❌ rien                        |
| Tooltips signatures         | Tab «infos » dans le panel de droite   | ❌ rien                        |
| Exemples inline             | Panel exemples par fonction            | ❌ rien                        |
| Shortcut hide/show code     | Ctrl+Shift+F (toggle)                 | ❌ rien                        |
| Shortcut hush               | Ctrl+.                                | ✅ via Kanopi global           |
| Shortcut eval line/block    | Ctrl+Enter (bloc), Ctrl+Shift+Enter (tout) | ✅ Ctrl+Enter bloc (Kanopi) |
| Highlight chain operators   | `.modulate()`, `.rotate()` surlignés   | ✅ via `propertyName` = `--sc` bleu |

**Gap B** (le vrai travail) :

- **Autocomplete** : extraire `glsl-functions.js` upstream (~200 fonctions
  catégorisées source/geometry/color/blend/modulate) + `examples.js` →
  produire un JSON Kanopi + une extension CM6 qui l'utilise. Types des
  inputs (float, vec4, texture) connus upstream → signatures précises.
- **Tooltip sur hover** : afficher signature + description + 1er exemple
  quand l'user survole une fonction. Backing data = même extraction.
- **Exemples** : soit inline via tooltip, soit panel latéral (comme
  hydra-functions site). Décision UX à trancher.
- **Hide/show code** : pour live performance. Raccourci à ajouter côté
  CMEditor keymap, ça cache `.cm-content` derrière le canvas.

Une extraction « once » (script de build qui lit `hydra-functions` et
produit `packages/ui/src/lib/runtimes/hydra/functions.json`) évite la
dépendance runtime au repo hydra-functions. Refresh manuel quand
upstream bump.

### C. Event surface — ⚠️ partiel

| Event type      | Hydra natif                          | Kanopi actuel                 |
| --------------- | ------------------------------------ | ----------------------------- |
| `trigger` eval  | log console                          | ✅ émis (hydra.ts:60)          |
| `trigger` stop  | pas explicite                         | ✅ émis (hydra.ts:73)          |
| `token` (onset) | pas applicable (Hydra = visuel pur) | N/A                          |
| `beat` sync     | via `time` global (rAF)              | 🟡 `time` exposé, pas de sync beat Kanopi |

**Gap C** :

- **Beat sync** : Hydra utilise `time` (secondes depuis start) dans les
  patterns (`.rotate(time/10)`). Pour synchroniser au transport Kanopi,
  on pourrait exposer `beat` et `bar` en globals pour que l'user fasse
  `.rotate(beat)`. Décision : ajouter sur demande, pas bloquant.

### D. Library integration — 🟡 à définir

| Ressource                 | Hydra natif                           | Kanopi actuel                 |
| ------------------------- | ------------------------------------- | ----------------------------- |
| Images (`s0.initImage`)   | URL arbitraire, souvent Unsplash      | ❌ pas de catalog images Kanopi |
| Videos (`s0.initVideo`)   | URL arbitraire                        | ❌ idem                        |
| Webcam (`s0.initCam`)     | navigator.mediaDevices                | ❌ pas câblé                   |
| Screen (`s0.initScreen`)  | getDisplayMedia                       | ❌ pas câblé                   |

**Gap D** :

- Nouvelle catégorie Library `visuals` (images, videos, shaders
  exemples). Loggé dans `LIBRARY_SPEC §3`.
- Wiring `s0.initCam()` / `s0.initScreen()` : juste exposer ces API via
  les globals Hydra (déjà fait via `makeGlobal: true`). À vérifier que
  ça marche hors-UI éditeur.

### E. Error handling — 🟡 rudimentaire

| Scénario                  | Hydra natif                           | Kanopi actuel                 |
| ------------------------- | ------------------------------------- | ----------------------------- |
| Erreur JS de parse        | Console browser                       | ✅ throw depuis evaluate       |
| Erreur GLSL compile       | Console browser + « black screen »    | 🟡 catch mais pas distingué de JS |
| Erreur runtime            | Console                               | 🟡 idem                        |
| Warning deprecated        | Aucun                                  | Aucun                          |

**Gap E** :

- Distinguer les erreurs GLSL (buffer compile fail) des erreurs JS —
  Hydra les logge différemment. Vérifier si `hydra-synth` les remonte
  via une API (handler event) ou seulement console. Si console seul,
  pas grave.
- Flash rouge sur le bloc qui fait un `solid().out()` qui ne compile
  pas — déjà OK via throw → Kanopi flash rouge.

### F. Lifecycle — ✅ couvert

| Feature                   | Hydra natif                           | Kanopi actuel                 |
| ------------------------- | ------------------------------------- | ----------------------------- |
| Canvas mount              | `new Hydra({ canvas })`               | ✅ `attachHydraCanvas(el)`     |
| Re-eval                   | supporté (replace chain)              | ✅ via new Function            |
| Hush global               | —                                      | ✅ via `stop` adapter          |
| Dispose                   | pas d'API explicite                   | ✅ instance = undefined        |

Pas de gap majeur. On peut cependant améliorer la **détection audio**
partagée : aujourd'hui Strudel a son AudioContext, Hydra a le sien
(si détection audio activée). Le jour où on veut Hydra qui pulse au son
Strudel, il faut passer le même AudioContext aux deux.

---

## Résumé gaps (priorisé)

| # | Gap                                    | Zone | Effort   | Impact UX                           |
| - | -------------------------------------- | ---- | -------- | ----------------------------------- |
| 1 | Autocomplete fonctions + tooltips      | B    | 1-1.5j   | Gros (DX majeur)                    |
| 2 | Hide/show code shortcut                | B    | 1-2h     | Gros (live perf)                    |
| 3 | Audio detection branché sur transport  | A+C  | 0.5j     | Moyen (visuals audio-réactifs)       |
| 4 | Library `visuals` (images catalog)     | D    | 0.5j     | Moyen                               |
| 5 | Sync `beat`/`bar` exposés en globals   | C    | 2h       | Faible (polish)                     |
| 6 | Flash rouge distingué JS vs GLSL        | E    | 1h       | Faible                              |

## Décision de scope (2026-04-23)

Hydra tombe dans le **cas (b)** d'`ADAPTER_SPEC §B` : pas de module CM6
upstream. La règle est donc « phase 2.4 minimal viable, extensions CM6
custom → backlog ». Concrètement :

- **Dans la phase 2.4 Hydra** : gaps #3 (audio detection), #4 (library
  visuals), #5 (beat globals), #6 (flash JS/GLSL). Zones A/C/D/E/F.
- **Parkés dans `PROGRESS.md §5.4` (backlog CM6 custom)** : gaps #1
  (autocomplete + tooltips + exemples), #2 (hide/show code shortcut),
  #3 bis (squiggles GLSL compile errors côté CM6). Zone B.

État de l'art : Flok se contente aussi du highlight JS générique pour
Hydra, donc l'alignement concurrence est OK sans toucher à B. Les items
backlog B sont du bonus Kanopi (principe 2) à livrer sur quota résiduel.

## Livrables Phase 2 (plan 2.4 Hydra) : zones A/C/D/E/F seulement

À rédiger ensuite. Inclut :

- Audio detection partagée avec le transport Kanopi (A+C)
- Nouvelle catégorie Library `visuals` (D)
- Exposer `beat` / `bar` en globals Hydra (C polish)
- Flash rouge JS/GLSL distingué (E polish)
- Procédure de test manuelle pour Phase 3

## Livrables Phase 3 (implementation) : après Phase 2 validée

Par ordre :

1. Audio detection + visuals library → commit
2. Beat globals + flash JS/GLSL → commit
3. Test procedure live-coding-verify

---

## Historique de révision

- **2026-04-23** : Phase 0 audit initial. Point critique identifié : pas
  de module éditeur Hydra packagé upstream. Décision scope le même jour :
  rester sur highlight JS générique (alignement Flok), parker les
  extensions CM6 custom (autocomplete/tooltips/hide-code) dans
  `PROGRESS.md §5.4`. Reste cohérent avec principe 7 car on ne réécrit
  rien ; simplement, la phase 2.4 priorise la cible « 4 langages
  tournent » avant le bonus éditeur langue-spécifique.
