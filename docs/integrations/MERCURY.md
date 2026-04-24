# Kanopi × Mercury — Phase 0 audit

Audit du gap entre l'UX Mercury native (mercury-playground + engine
bundle) et l'intégration Kanopi (nulle), suivant la procédure
`feedback_language_integration_procedure` et la structure en 6 zones
d'`ADAPTER_SPEC.md §2`.

Date : 2026-04-23 (soir). Adapter actuel : **aucun**.

---

## Contexte : qu'est-ce que Mercury exprime

Langage live-coding déclaratif créé par **Timo Hoogland** (Creative
Coding Utrecht, paper ICLC 2019). Syntaxe anglais quasi-naturel, design
anti-symbole-dense (l'opposé de Tidal mini-notation). Éditeur natif
contraint à **30 lignes max** pour forcer la concision.

Forme canonique :

```
set tempo 89
set scale minor a
list melody random(16 0 24)
new synth saw note(melody) time(1/16) shape(4 100) play(euclid(32 13))
```

Capacités expressives :

- Audio (samples + synths + chaîne FX)
- MIDI out (notes, CC, PC, device par nom)
- OSC in/out (mais code upstream **commenté/non-fonctionnel**, cf §A)
- Visuels Hydra via le hook cross-runtime `visual(…)` → **désactivé en
  Kanopi** (cf §C et `KANOPI_PRINCIPLES §3 corollaire`)

Mercury est **le premier langage ajouté à Kanopi qui a une primitive
cross-runtime native**. Le trade-off assumé par la philosophie
« cross-runtime upstream désactivé » est concrétisé ici pour la
première fois.

---

## Écosystème upstream Mercury

| Package                         | Contenu                                                          | Consommable ?                   |
| ------------------------------- | ---------------------------------------------------------------- | ------------------------------- |
| `mercury-engine` 1.7.0          | Runtime Tone.js wrapper + séquenceur + WebMIDI + hooks           | ✅ via npm                       |
| `mercury-lang` 1.11.4           | Parser/AST seul (Nearley + Moo lexer)                            | ✅ via npm, UMD `MercuryParser`  |
| `mercury-playground` (github)   | App web Mercury avec CM5, non-packagée                           | ❌ pas réutilisable              |
| **Pas de CM6 upstream**         | Grammar Nearley (`grammar/mercury.ne`), pas de Lezer             | —                               |
| `mercury-docs` (github)         | Documentation du langage (pages statiques)                       | ❌ pas un module                 |

Sources :

- https://github.com/tmhglnd/mercury-engine
- https://www.npmjs.com/package/mercury-engine
- https://www.npmjs.com/package/mercury-lang
- https://github.com/tmhglnd/mercury-playground
- https://github.com/tmhglnd/mercury/tree/main/grammar

⚠️ Le README de mercury-engine affiche en entête : **« WORK IN PROGRESS,
EXPERIMENTAL USE ONLY »**. Le mercury-playground lui-même utilise
toujours l'ancienne codebase bundled, pas le npm engine. Divergence
possible « Mercury dans Kanopi » vs « Mercury dans playground ».

---

## Audit par zone

### A. Runtime engine — 🟢 bien câblable

| Feature                     | Mercury natif                        | Kanopi projeté                  |
| --------------------------- | ------------------------------------ | ------------------------------- |
| Construction                | `new Mercury({ onload, onmidi, … })` | ✅ instance mode, scope isolé   |
| Eval du code                | `mercury.code(str)`                  | ✅ wrapper dans `evaluate`       |
| Stop                        | `mercury.silence()`                  | ✅ dans `stop`                   |
| Resume (sans re-parse)      | `mercury.resume()`                   | 🟡 optionnel                    |
| BPM                         | `mercury.setBPM(bpm, ramp)`          | ✅ dans `setBpm` hook            |
| Audio meter                 | `mercury.addMeter(smooth)` + `getMeter()` | 🟡 pour visualiseurs futurs |
| Sample loading              | `mercury.addBuffers(files, cb)`      | 🟡 intégration Library à v2    |
| MIDI out                    | WebMIDI en interne, port via code `midi "X"` | ⚠️ hors-contrôle Kanopi v1 |
| OSC in/out                  | Code upstream commenté               | ❌ non fonctionnel upstream     |
| AudioContext                | Tone.js bundlé, **pas partageable**  | ❌ instance audio séparée       |

**Décisions A** :

- **makeGlobal = n/a** : Mercury est instance mode par défaut. Rien à
  polluer sur `globalThis`. Aligné avec `ADAPTER_SPEC §5bis`.
- **Scope isolation** : Mercury n'expose pas de primitives à évaluer du
  code user JS (contrairement à Hydra/p5). L'user écrit du Mercury, le
  engine parse avec mercury-lang et séquence. Pas de `new Function` à
  faire côté Kanopi. Plus simple que Hydra/p5.
- **AudioContext séparé** : Mercury tourne sur sa Tone.js bundled. Pas
  de fusion possible avec la context Strudel sans patch upstream. Même
  problème que Hydra #3 → parké dans le même backlog (`PROGRESS §5`).
- **MIDI** : en v1, laisser Mercury gérer son propre WebMIDI. Si un jour
  Kanopi veut un MIDI picker UI centralisé, hook upstream à demander.

### B. Native editor UX — 🔴 cas (b) d'ADAPTER_SPEC §B

| Feature                     | mercury-playground (CM5)           | Kanopi projeté                  |
| --------------------------- | ---------------------------------- | ------------------------------- |
| Syntax highlight            | CM5 simple-mode custom + keyword list | 🟡 highlight JS générique v1 (cas b) |
| Autocomplete                | Popup custom des keywords          | ❌ backlog §5.4                 |
| Tooltips signatures         | ❌                                  | ❌ backlog §5.4                 |
| 30-line editor cap          | Oui (design stance)                | ❌ non-appliqué Kanopi (conflit avec multi-actor) |
| Ctrl+Enter / Ctrl+.         | ✅                                  | ✅ universel Kanopi             |

**Gap B** : pas de module CM6 upstream. Grammar Nearley existe mais
n'est pas portable vers Lezer sans effort significatif. Règle
`feedback_zone_b_scope_rule` : **cas (b) → backlog §5.4**.

**Options pour v1 Kanopi** :

1. Highlight JS générique (alignement Flok/Hydra/p5) — zéro effort, sous-optimal UX.
2. Port du CM5 simple-mode vers `@codemirror/legacy-modes` + keyword list — 2-3h, dégradation partielle.
3. Écrire un Lezer grammar from scratch depuis mercury.ne — 1j+, overkill v1.

**Décision** : **Option 1 v1**, items 2 et 3 au backlog §5.4 comme
« bonus quota résiduel » (même statut que les items Hydra du backlog).

### C. Event surface — ⚠️ cross-runtime upstream désactivé

| Event type        | Mercury natif                          | Kanopi projeté                  |
| ----------------- | -------------------------------------- | ------------------------------- |
| `trigger` eval    | `mercury.code(str)` retourne tree.errors | ✅ émis depuis adapter           |
| `trigger` stop    | `mercury.silence()`                    | ✅ émis                          |
| `token` onset     | Engine dispatch `CustomEvent('/actorName')` sur `window` | 🟡 à router vers KanopiEvent |
| `beat` sync       | `mercury.setBPM()`                     | ✅ via `setBpm` hook             |
| **`visual()` hook** | Engine appelle `hydra.eval(code)` sur wrapper injecté | ❌ **désactivé en Kanopi** |

**Décision `visual()` (philosophie 2 appliquée)** :

- Constructeur Mercury appelé **sans** `hydra:` wrapper
- → Mercury ne sait pas où router, `_canvas` reste undefined, le
  `if (this._canvas)` dans `Sequencer.js` court-circuite l'appel
- L'user qui écrit `visual(['osc(10).out()'])` dans son Mercury ne
  voit rien côté Hydra
- **Kanopi log un info-level** côté Console panel au premier appel pour
  que l'user comprenne :
  ```
  [mercury] visual() hook ignoré — cross-runtime via .kanopi directives (cf KANOPI_PRINCIPLES §3)
  ```
- Pas d'alternative Kanopi-native en v1 (pas de `@trigger` directive).
  Report au jour où BPscript / BPx arrive avec directive de
  cross-runtime déclaratif.

**Token onsets** : Mercury émet `CustomEvent` sur `window`. En
philosophie 2 stricte, on ne devrait pas lire ces CustomEvents au
niveau adapter (pollue `window`). À évaluer en Phase 2 : soit on
demande un hook upstream, soit on accepte un écouteur ciblé en
attendant.

### D. Library integration — 🟡 à définir

Mercury a deux catégories de ressources upstream :

- **Sample banks** : Mercury ship ses propres samples (kicks, hats,
  drums) via des JSON bank files. Méthode `addBufferFromJson(url)`.
  Alignement naturel avec `audio-banks` Library de Kanopi → un bank
  Mercury = un `LibraryItem` avec `runtimes: ["mercury"]`.
- **Snippets example** : repo `mercury-examples` sur npm — 1.0.0.
  Peut être loadé comme source de `visuals` / snippets.

**Décision D** : **v1 minimal** — pas de catégorie Library dédiée
Mercury. Ajouter 2-3 snippets Mercury dans la catégorie `visuals`
actuelle (renommer en `snippets` ou `patches` à la prochaine
évolution de LIBRARY_SPEC si besoin). Sample banks Mercury → v2.

### E. Error handling — 🟡 standard

Mercury gère ses erreurs en retournant un arbre :
```js
const tree = mercury.code(str);
if (tree.errors?.length) { /* afficher */ }
```

**Décision E** : dans `evaluate`, catch `tree.errors` → throw avec
message utile. L'user voit flash rouge sur le bloc + ligne d'erreur
dans la Console panel. Pas de flood à craindre (pas de rAF
d'erreurs), donc pas de `installWarnShadow` nécessaire.

### F. Lifecycle — 🟢 simple

| Feature            | Mercury natif                       | Kanopi projeté              |
| ------------------ | ----------------------------------- | --------------------------- |
| Init               | `new Mercury(opts)`                 | ✅ dans `ensure` lazy        |
| Re-eval            | `mercury.code(str)` (remplace tree) | ✅ dans `evaluate`           |
| Stop               | `mercury.silence()`                 | ✅ dans `stop`               |
| Dispose            | n/a explicite                       | ✅ instance = undefined      |
| Audio context      | Tone bundle interne                 | ⚠️ v1 séparé                |

Pattern simple similaire à Hydra. Une instance module-level, re-init
au dispose, re-use sur re-eval.

---

## Résumé gaps (priorisé)

| # | Gap                                             | Zone | Effort     | Impact UX                         |
| - | ----------------------------------------------- | ---- | ---------- | --------------------------------- |
| 1 | Adapter `.mercury` minimal (ensure + evaluate + stop) | A    | 0.5j       | Base                              |
| 2 | setBpm hook via `mercury.setBPM()`              | C    | 30min      | Sync transport                    |
| 3 | Log info-level au premier appel `visual()` détecté | C    | 1h         | Pédagogique pour l'user           |
| 4 | Error handling tree.errors → throw              | E    | 30min      | Cohérence UX                      |
| 5 | Starter workspace « mercury intro »             | —    | 1h         | Discoverability Library           |
| 6 | 2-3 snippets `visuals` Library avec Mercury     | D    | 1h         | Onboarding                        |
| 7 | AudioContext partagé Mercury↔Strudel           | A    | **parké** (même racine que Hydra #3) | v2+ |
| 8 | CM6 Lezer grammar Mercury                      | B    | 1j+ backlog §5.4 | Bonus autocomplete         |
| 9 | Autocomplete keywords Mercury                  | B    | 1j backlog §5.4 | Bonus                       |

**Total phase 2.6 Mercury scope** : items #1-6, ~1j. Items #7-9 parqués.

---

## Décision de scope (2026-04-23 soir)

Mercury est **cas (b)** d'`ADAPTER_SPEC §B` (pas de CM6 upstream). La
règle `feedback_zone_b_scope_rule` s'applique : cas b → backlog custom
CM6, pas en phase d'intégration.

**Philosophie 2** (cross-runtime upstream désactivé) strictement
appliquée : le constructeur Mercury n'a PAS de hook `hydra:`. `visual()`
est no-op côté engine. User informé par log info-level.

**Cas de démonstration** : Mercury est le premier langage qui matérialise
le principe 3 corollaire. Intégrer Mercury, c'est **prouver** que la
philosophie fonctionne en pratique.

En phase 2.6 : livrer items #1-6. Tout le reste au backlog.

---

## Livrables Phase 2 (plan 2.6 Mercury)

À rédiger ensuite. Inclut :

- Adapter `mercury.ts` (instance mode, scope pas applicable, `mercury.code()` direct)
- Extension `.mercury` (déjà routé par la nouvelle dérivation registry
  une fois que Mercury déclare `extensions: ['.mercury']`)
- Log info-level `visual()` hook
- Starter workspace « mercury intro »
- 2-3 snippets Library catégorie `visuals` (ou refacto vers `patches`)
- Procédure de test manuelle pour Phase 3

## Livrables Phase 3 (implementation)

Par ordre :

1. Adapter + registry wiring → commit
2. Extension recognition + block extraction (whole-file si besoin)
3. Starter + snippets Library
4. Test procedure live-coding-verify

---

## Historique de révision

- **2026-04-23 (soir)** : Phase 0 audit initial. Premier langage à
  matérialiser `KANOPI_PRINCIPLES §3 corollaire` (cross-runtime
  upstream désactivé). Mercury tombe en cas (b) zone B (pas de CM6
  upstream), hérite du pattern Hydra/p5 pour le backlog §5.4. Scope
  2.6 : ~1j pour items #1-6, items #7-9 parqués.

---

## Block extraction (ADAPTER_SPEC §5.3)

- **Méthode** : **whole-file**.
- **Motif / nœuds** : aucun — un patch Mercury `set` + `new synth` +
  `new sample` forme un graphe d'instruments qui tourne comme un tout.
- **Limites** : impossible d'évaluer incrémental un seul `new synth`
  sans re-sending le reste. Mercury redéfinit implicitement les nommés,
  donc la re-eval complète fait le travail.
- **Critère de migration AST** : Mercury est **case (b)** zone B — pas
  de CM6 upstream. Si un jour une grammaire Lezer Mercury apparaît
  (elle existe en Nearley en interne `tmhglnd/mercury-lang`, à
  vendoriser serait une ré-implémentation → refusé principe 7), on
  pourrait basculer vers extraction par `new …` bloc.
