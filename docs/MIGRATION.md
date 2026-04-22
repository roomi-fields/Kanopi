# Migration BPscript → Kanopi

**Date init :** 2026-04-13
**Statut :** Phase 1 complète (copie non-destructive). Phase 2 (nettoyage BPscript) en attente.

## Principe

Séparer `BPscript/` (le langage) de `kanopi/` (le produit IDE) pour éviter la dérive de scope et clarifier les responsabilités.

## Phase 1 — Copie non-destructive (FAIT)

Nouveau repo `/home/romi/dev/music/kanopi/` créé avec :

```
kanopi/
├── .git/
├── .gitignore
├── README.md
├── CLAUDE.md
├── package.json (workspaces)
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   └── src/
│   │       ├── dispatcher/    ← copié depuis BPscript/src/dispatcher/
│   │       └── bridge/        ← copié depuis BPscript/src/bridge/
│   ├── ui/                    (vide, à venir)
│   └── library/bundled/       (vide, à venir)
└── docs/
    ├── INDEX.md
    ├── MIGRATION.md (ce fichier)
    ├── design/
    │   ├── ARCHITECTURE.md
    │   ├── LIBRARY.md
    │   └── SCENES.md          ← copié depuis BPscript/docs/design/
    ├── plan/
    │   ├── ROADMAP.md
    │   ├── V1_FEATURES.md
    │   ├── POSITIONING.md
    │   ├── UI_WEB.md          ← copié depuis BPscript/docs/plan/
    │   ├── MARKET_STUDY.md    ← copié depuis BPscript/docs/plan/
    │   └── ICLC_2027.md       ← copié depuis BPscript/docs/plan/
    ├── reference/
    │   └── HARDWARE_COLLECTION.md  ← copié depuis BPscript/docs/reference/
    └── mockups/
        └── kanopi-v1-mockup.html   ← copié depuis BPscript/docs/mockups/
```

**BPscript reste intact**, rien n'a été supprimé.

## Phase 2 — Nettoyage BPscript (À FAIRE)

### Pré-requis
1. Commit ou stash les changements en cours dans BPscript
2. Vérifier que kanopi fonctionne standalone (tests d'import runtime)
3. Vérifier que le mockup s'ouvre correctement depuis son nouvel emplacement

### Éléments à supprimer de BPscript

**Code runtime (migré vers kanopi/packages/core/):**
- [ ] `BPscript/src/dispatcher/` (tout le dossier)
- [ ] `BPscript/src/bridge/` (tout le dossier)

**Docs produit/IDE (migrés vers kanopi/docs/):**
- [ ] `BPscript/docs/design/SCENES.md` → resté dans kanopi
- [ ] `BPscript/docs/plan/UI_WEB.md`
- [ ] `BPscript/docs/plan/MARKET_STUDY.md`
- [ ] `BPscript/docs/plan/ICLC_2027.md`
- [ ] `BPscript/docs/plan/BP4_IMPLEMENTATION.md` (Kanopi-level) — à **évaluer**
- [ ] `BPscript/docs/plan/EDITOR.md` — à **évaluer**
- [ ] `BPscript/docs/mockups/` (tout)
- [ ] `BPscript/docs/reference/HARDWARE_COLLECTION.md`

**Web UI (à archiver, pas à supprimer):**
- [ ] `BPscript/web/` → déplacer vers `BPscript/archive/web-v0/` pour référence

### Éléments à GARDER dans BPscript

**Langage (core mission):**
- `BPscript/src/transpiler/` — parser, encoder, tokenizer
- `BPscript/src/bpx/` — stub BPx engine (à développer)
- `BPscript/docs/spec/` — LANGUAGE, AST, EBNF
- `BPscript/docs/design/BPX_ENGINE_SPEC.md` — spec du moteur (langage)
- `BPscript/docs/design/PITCH.md`, `SOUNDS.md`, `CV.md`, `EFFECTS.md`, `HOMOMORPHISMS.md`, `TEMPORAL_DEFORMATION.md` — aspects langage/moteur
- `BPscript/docs/design/REPL.md` — adapters REPL (utilisé par Kanopi mais spécifié ici)
- `BPscript/docs/design/INTERFACES_BP3.md` — interface WASM
- `BPscript/docs/issues/` — bugs moteur/langage
- `BPscript/docs/reference/` (sauf HARDWARE_COLLECTION) — howtos build, formats

**Tests:**
- `BPscript/test/grammars/` — tests conformité langage
- `BPscript/test/test_all.cjs`, autres scripts

**Libs:**
- `BPscript/lib/` — alphabets, tunings, temperaments (à **évaluer** : langue ou Kanopi ?)

**Moteur:**
- `BPscript/bp3-engine/` — submodule (reste)
- `BPscript/dist/` — build WASM

### Décisions en suspens

1. **`BPscript/lib/`** (alphabets.json, tunings.json, temperaments.json, routing.json, etc.)
   - Ces fichiers sont consommés par le parseur (pitch resolution) et par Kanopi (scales dans la library)
   - **Option A** : restent dans BPscript, Kanopi les consomme via dépendance
   - **Option B** : bougent dans kanopi/packages/library, BPscript les consomme via dev-dependency
   - **Reco** : Option A pour v1 (moins de refactor), évaluable plus tard

2. **`BPscript/web/demos/`** (38 scènes `.bps`)
   - Source excellente pour bundled library
   - À copier dans `kanopi/packages/library/bundled/scenes/` après sélection/adaptation
   - L'original peut rester dans BPscript comme test fixtures

3. **`BPscript/docs/plan/EDITOR.md`** et **`BPX_ENGINE_SPEC.md`**
   - EDITOR.md = design éditeur CodeMirror → **déplacer vers kanopi**
   - BPX_ENGINE_SPEC.md = spec moteur du langage → **garder dans BPscript**

### Script de cleanup proposé (à exécuter MANUELLEMENT après validation)

```bash
cd /home/romi/dev/bp/BPscript

# 1. Sécurité : commit ou stash changements en cours
git status
# git stash OR git commit

# 2. Archiver l'ancienne web UI
mkdir -p archive
mv web archive/web-v0

# 3. Supprimer code migré
rm -rf src/dispatcher
rm -rf src/bridge

# 4. Supprimer docs migrées
rm docs/design/SCENES.md
rm docs/plan/UI_WEB.md
rm docs/plan/MARKET_STUDY.md
rm docs/plan/ICLC_2027.md
rm -rf docs/mockups
rm docs/reference/HARDWARE_COLLECTION.md

# 5. Éventuel : déplacer EDITOR.md vers kanopi
# mv docs/plan/EDITOR.md /home/romi/dev/music/kanopi/docs/design/
# ou juste laisser pour l'instant

# 6. Mettre à jour BPscript/CLAUDE.md et README.md pour refléter le nouveau scope
# (édition manuelle)

# 7. Nouveau commit
git add -A
git commit -m "scope: extract Kanopi (IDE) to separate repo, keep language core only"
```

## Phase 3 — GitHub publication (À FAIRE)

- [ ] Créer repo `github.com/roomi-fields/kanopi` (public ou privé ?)
- [ ] Push initial
- [ ] Éventuel : renommer `BPscript` repo → `bpscript` (minuscule) sur GitHub
- [ ] Mettre à jour les liens croisés dans les docs

## Phase 4 — Session Claude dédiées

Chaque repo aura sa propre session Claude avec contexte isolé :

- `cd /home/romi/dev/music/kanopi && claude -n kanopi-ui` — focus UI/UX/runtime
- `cd /home/romi/dev/bp/BPscript && claude -n bpscript-lang` — focus langage/moteur
- `cd /home/romi/dev/music/osc-bridge && claude -n osc-bridge` — focus Rust/Lua

Mémoires séparées : `~/.claude/projects/-mnt-d-Claude-kanopi/memory/` vs `-mnt-d-Claude-BPscript/`.

## Checklist finale

- [x] kanopi/ créé avec git init
- [x] Core runtime copié
- [x] Docs Kanopi copiées
- [x] Mockup copié
- [x] README, CLAUDE.md, package.json
- [x] Premier commit dans kanopi
- [ ] Vérif manuelle par Romi que tout est cohérent
- [ ] Commit des changements en cours dans BPscript
- [ ] Exécution du script de cleanup BPscript
- [ ] Mise à jour CLAUDE.md / README.md BPscript
- [ ] Push initial kanopi sur GitHub
- [ ] Renommage éventuel BPscript → bpscript sur GitHub
