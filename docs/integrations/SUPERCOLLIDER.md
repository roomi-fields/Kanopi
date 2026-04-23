# Kanopi × SuperCollider — Phase 0 audit

Audit du gap entre l'UX SC native (scide + `vscode-supercollider`) et
l'intégration actuelle Kanopi (nulle), suivant la procédure
`feedback_language_integration_procedure` et la structure en 6 zones
d'`ADAPTER_SPEC.md §2`.

Date : 2026-04-23. Adapter actuel : **aucun** (le runtime `'sclang'`
existe nominalement dans `core-mock` mais n'a pas d'adapter réel).

---

## Écosystème upstream SuperCollider — état des lieux

SC n'a historiquement **pas** de pack web équivalent à
`@strudel/web` ou `hydra-synth`. L'écosystème se répartit entre :

| Option                            | Scope                                     | npm ?        | Live-code SC ? |
| --------------------------------- | ----------------------------------------- | ------------ | -------------- |
| `supersonic-scsynth` (S. Aaron)   | scsynth WASM + AudioWorklet + 206 samples | ✅ 0.66.0     | ❌ synthdefs seulement |
| `sc.wasm` (D. Scheiba)            | scsynth + **sclang** en Web Worker         | ❌ app perso  | 🟡 « fragile » |
| Upstream PR #6569                 | Build target WASM officiel                 | ❌ pas merged | —              |
| `scsynth-wasm-builds` (rd--)      | Prebuilt WASM artifacts, 2023              | ❌            | ❌              |
| `supercolliderjs` (crucialfelix)  | **Node only** : spawn local sclang        | ✅ v1.0.1     | ✅ (process local) |
| Pas de `@supercollider/codemirror` | —                                         | —            | —              |

**Conséquence majeure** : il n'existe **aucun module npm browser-ready
qui permette de `eval(sourceSC)` live** à ce jour (2026-04-23). Contrairement
à Strudel (eval live sur `@strudel/web`) ou Hydra (`new Function(code)()`
sur `hydra-synth`), SC en browser est bloqué.

Sources :

- https://github.com/samaaron/supersonic — scsynth WASM, GPL-3
- https://sc.dennis-scheiba.com/ — démo sc.wasm (sclang browser)
- https://github.com/supercollider/supercollider/pull/6569 — PR officiel
- https://github.com/scztt/vscode-supercollider — UX référence
- https://github.com/munshkr/flok — comment Flok gère SC

---

## Audit par zone

### A. Runtime engine — 🔴 bloqué

| Feature                     | SC natif                              | Browser possible ?           |
| --------------------------- | ------------------------------------- | ----------------------------- |
| sclang (eval live SC)       | process local                         | ❌ ou sc.wasm fragile         |
| scsynth (synthé UGens)      | process local                         | ✅ via SuperSonic (synthdefs précompilés) |
| Sample playback             | `Buffer.read`                         | 🟡 SuperSonic samples         |
| SynthDefs on-the-fly        | `SynthDef(...).add`                   | 🟡 précompile build-time      |

**Gap A** : pas de chemin browser pour exécuter du SC arbitraire.

Options d'architecture :

- **A1. Defer SC à v2 Tauri** : bridge osc-bridge → sclang local, même
  pattern que Flok mode `sclang`. Phase 1+2+3 repoussées jusqu'à Tauri
  scope. **Recommandé** — cohérent avec l'architecture Kanopi existante
  (osc-bridge déjà prévu pour hardware, extension naturelle).
- **A2. SuperSonic (browser-only, limité)** : user ne code pas SC,
  sélectionne des synthdefs pré-packagés + ajuste paramètres. Pas du
  live coding. **Trahit l'esprit SC**.
- **A3. sc.wasm (browser, fragile)** : adopter sc.wasm, assumer la
  maintenance si l'auteur upstream abandonne. Hors principe 7 (on
  consomme upstream, pas on porte).
- **A4. Mode hybride (browser=mock, desktop=sclang réel)** : shipper un
  adapter qui en browser logge « SC needs desktop Kanopi » et en Tauri
  route vers osc-bridge. Honest, mais 2 chemins à maintenir.

### B. Native editor UX — 🔴 gros gap (idem Hydra cas b)

| Feature                 | scide / vscode-supercollider          | Kanopi                  |
| ----------------------- | ------------------------------------- | ----------------------- |
| Syntax highlight        | TextMate grammar                      | ❌ highlight JS générique |
| Autocomplete classes    | LanguageServer.quark (LSP)             | ❌                       |
| Class ref tooltips      | LSP hover                             | ❌                       |
| Post window             | panel dédié stdout sclang              | 🟡 Console panel partagé |
| Status meter (CPU/UGens)| statusbar scide                       | ❌                       |
| Ctrl+Enter / Ctrl+.     | ✅                                     | ✅ universel Kanopi       |

**Gap B** : identique au cas Hydra :
- Pas de module CM6 upstream (`@supercollider/codemirror` n'existe pas).
- TextMate grammars disponibles dans `vscode-supercollider` (`.tmLanguage`).
- → Règle phase 2.4 (`feedback_zone_b_scope_rule`) : **cas b, backlog
  custom CM6 dans `docs/plan/PROGRESS.md §5.4`**. Highlight JS générique
  suffit en attendant.

### C. Event surface — 🟡 à définir

| Event               | SC natif                              | Kanopi                  |
| ------------------- | ------------------------------------- | ----------------------- |
| `trigger` eval      | post window logs                      | ✅ pattern adapter      |
| `trigger` stop      | `CmdPeriod`                           | ✅                      |
| `token` onset       | `TempoClock` callbacks                | 🟡 à router              |
| `beat` sync         | `TempoClock`                          | 🟡 transport Kanopi      |

SC a un `TempoClock` natif. En mode osc-bridge, Kanopi envoie ses ticks
transport à sclang qui gère son propre clock ; synchronisation tolérable.

### D. Library integration — 🟡 à définir

SuperSonic ships 206 samples. `vscode-supercollider` ne ship rien côté
library. Catégorie Library Kanopi à considérer :

- **`synthdefs`** : snippets SC pré-baked pour démos rapides.
- **`scdoc classes`** : référence classes SC (future autocomplete).
- Pas de nouveau format imposé — `items[]` standard LIBRARY_SPEC.

### E. Error handling — 🟡

- **Erreurs de parse sclang** : remontées dans post window. Router vers
  Kanopi Console panel.
- **Erreurs runtime scsynth** : OSC messages. À parser.
- **Erreurs build-time synthdefs** : pre-bake dans SuperSonic mode.

### F. Lifecycle — 🟡 dépend du scénario A

- **Mode Tauri** : ensure osc-bridge alive, auto-start sclang si pas
  démarré, gérer reconnexion.
- **Mode SuperSonic browser** : load scsynth-wasm à la demande, init
  AudioWorklet sur user gesture (iOS).

---

## Red flags

| # | Issue                                  | Impact                                |
| - | -------------------------------------- | ------------------------------------- |
| 1 | Pas de sclang browser mature           | Bloque live coding SC en browser      |
| 2 | GPL-3 sur SuperSonic/scsynth WASM      | Incompatible avec licence Kanopi (à vérifier) |
| 3 | Bundle scsynth WASM multi-MB           | Ajoute du poids à la PWA              |
| 4 | Pas de CM6 package                      | Zone B en backlog (cas b)             |
| 5 | Flok utilise process local (pas WASM)  | Précédent : SC browser-only n'est pas résolu par l'état de l'art |

---

## Décision de scope (2026-04-23)

SC tombe dans une catégorie nouvelle par rapport à Strudel/Hydra : **il
n'y a tout simplement pas de runtime browser-ready**. Dans la
terminologie des 3 niveaux d'`ARCHITECTURE.md §progressive enhancement` :

- Strudel, Hydra → **niveau 2 (web enrichi)**, v1 public
- SC (sclang + scsynth réels) → **niveau 3 (package local)**, v2 Tauri

SC est ainsi **reporté au niveau 3**. Phase 2.4 SC s'arrête à la
livraison de cet audit. Phase 1/2/3 d'implémentation redémarrent à la
release Tauri v2 via `osc-bridge` (WebSocket localhost:7777 → process
sclang local). Même pattern que Flok mode `sclang`.

Options non-retenues :

- **SuperSonic en browser** (synthdefs précompilés, pas de live coding)
  → trahit le positionnement live-coding Kanopi.
- **sc.wasm** (fragile, hors principe 7) → pas de maintenance Kanopi
  d'un runtime upstream.

La « validation du concept 4 langages » annoncée reste honnête : **v1
public = 2 langages live browser (Strudel + Hydra)**, **v2 Tauri = +2
niveau 3 (SC + Tidal)**.

---

## Livrables Phase 1 — SC report niveau 3

Pas de livraison code en v1. Juste :

1. Mettre à jour `PROGRESS.md §2.4` : marquer SC comme « reported to
   niveau 3 (v2 Tauri) » avec lien vers cet audit.
2. `ROADMAP.md` (local `docs/plan/`) : phase Tauri v2 ouvre sur
   intégration SC + Tidal via osc-bridge.
3. `ARCHITECTURE.md §progressive enhancement` : déjà listé SC en
   niveau 3, rien à modifier.

---

## Historique de révision

- **2026-04-23** : Phase 0 audit initial. Point critique identifié :
  aucun module npm browser-ready pour eval SC live. Décision :
  **reporter SC au niveau 3** (v2 Tauri, osc-bridge → sclang local,
  même pattern que Flok mode `sclang`). Pas de livraison code en phase
  2.4 pour SC ; phase 1/2/3 d'implémentation redémarreront à la
  release Tauri v2.
