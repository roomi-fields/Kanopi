# Kanopi Roadmap

**Date:** 2026-04-13 · **Version:** 0.1.0-alpha · **Horizon:** ICLC 2027 (juin-juillet 2027)

## Vision

Kanopi = le VSCode du live coding. IDE local-first, multi-runtime, avec clock partagé, scènes, et hardware bidirectionnel. Trois niveaux d'expérience (web pur → web enrichi → bridge local) via progressive enhancement.

Voir [POSITIONING.md](POSITIONING.md) pour le pitch complet et [V1_FEATURES.md](V1_FEATURES.md) pour la checklist.

## Phases

### Phase 0 — Design & migration (en cours → mai 2026)

**Objectif :** aligner la vision, migrer les repos, figer le scope v1.

- ✅ Maquette UI v1 validée (`docs/mockups/kanopi-v1-mockup.html`)
- ✅ Market study complète (Flok, Estuary, Dublang…)
- ✅ Spec library 3 sources (bundled / mine / community)
- ✅ Migration initiale : `kanopi/` créé, `BPscript/` à nettoyer
- ⏳ Nettoyage `BPscript/` (cf [MIGRATION.md](../MIGRATION.md))
- ⏳ Repos GitHub `kanopi`, `bpscript` renommé, structure fixée
- ⏳ Choix de stack validé : **Svelte 5 + TypeScript + CodeMirror 6 + Vite**

### Phase 1 — Alpha privée (mai → juillet 2026)

**Objectif :** MVP jouable sur niveaux 1-2 (web pur + web enrichi), testé par 5-10 live coders de confiance.

**Scope P0 strict** :
- Workspace + file tree + onglets + command palette
- Éditeur CodeMirror 6 avec coloration session + Strudel + Hydra
- Parseur session (`@actor` / `@scene` / `@map`)
- Runtimes : Strudel, Hydra, BPscript/BP3 WASM, JS/WebAudio
- Clock partagé (play/stop/BPM/tap)
- Scènes = snapshots on/off actors
- `@map` CC via WebMIDI
- State inspector minimal
- Library : BUNDLED + MINE (pas COMMUNITY)
- 3 starter workspaces livrés

**Livraison** : build packagé local (pas hébergé), distribué aux testeurs.

### Phase 2 — Beta fermée (juillet → septembre 2026)

**Objectif :** stabilisation + P1 + retour utilisateur large.

- P1 features : Tidal/SC coloration, OSC input, autocomplétion actors/scenes, transitions scènes quantifiées, learn mode MIDI
- Runtimes additionnels : SC-lite si stable, Csound, Faust
- Library COMMUNITY version light (repo GitHub public, pull via manifest)
- Onboarding : tutoriel interactif
- Site kanopi.cc hébergé (version PWA niveau 1-2)
- ~50 beta testeurs

**Jalon critique** : **15 août 2026 — soumission paper ICLC 2027**. Le paper décrit Kanopi v1, pas nécessairement livré publiquement mais démontrable.

### Phase 3 — Public v1 (septembre → octobre 2026)

**Objectif :** lancement public, communication live coding.

- Site kanopi.cc ouvert à tous
- PWA installable
- Docs publiques complètes
- 3 démos vidéo (90s chacune) : multi-runtime synchro / hardware scenes / @map one-liner
- Annonce : TOPLAP, Mastodon, communautés Strudel/Tidal/SC
- Library COMMUNITY browsable en lecture

**Niveau 1-2 uniquement.** Pas encore de bridge local (niveau 3).

### Phase 4 — v2 : le bridge local (octobre 2026 → février 2027)

**Objectif :** débloquer le vrai Tidal, SC, Python.

- Package local (Tauri desktop) avec `osc-bridge` intégré
- Niveau 3 : SC natif, Tidal via GHCi, Sardine, Sonic Pi, Chuck, Pure Data
- Hardware complet (Minilab 3, Sub37, Electra One, Launch XL, MatrixBrute si acquis)
- BPscript visible dans l'UI (onglets `.bps`, coloration complète, editor hints)
- Scènes imbriquées + `@expose` + flag scoping
- Library COMMUNITY : rating + comments + sync bidi
- Auto-update

**Jalon** : acceptation paper ICLC (généralement déc 2026-jan 2027). Si accepté, préparation performance.

### Phase 5 — v3 : BPx engine (février → juin 2027)

**Objectif :** livrer la vision complète avant ICLC.

- BPx engine JS livré : dérivation incrémentale, streaming, live coding de grammaires
- DerivationTree visualisé dans l'UI (arbre live)
- Remplacement progressif de BP3 WASM par BPx (BP3 reste fallback)
- Multi-instance BPx (plusieurs scènes simultanées)
- Features avancées : homomorphismes, déformation temporelle

### ICLC 2027 (juin-juillet 2027)

- Performance live utilisant Kanopi v3
- Demo workshop
- Paper présenté
- Lancement communautaire consolidé

## Priorités transverses

| Axe | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|-----|---------|---------|---------|---------|---------|
| UI/UX | MVP | Tutoriel | Polish | Tauri | DerivTree |
| Runtimes | 4 | +3 WASM | — | +5 natifs | BPx |
| Library | bundled+mine | +community light | — | +ratings | — |
| Hardware | WebMIDI | OSC WebSocket | — | osc-bridge full | — |
| Docs | Internal | Public site | Tutoriels | Tauri docs | Performance guide |

## Risques & dépendances

- **osc-bridge midi_out gap** bloque Hardware v1 → en cours (cf `matrixbrute/osc-bridge/docs/`)
- **BPx engine** non démarré → Phase 5 démarre tôt, possiblement en parallèle Phase 4
- **Soumission ICLC** = deadline dure, force à avoir une démo cohérente en août 2026
- **Single dev (Romi)** = risque calendaire. Phase timings à +30% de marge réaliste.

## Métriques de succès

- **Alpha (phase 1)** : 5 testeurs installent et créent au moins une scène
- **Beta (phase 2)** : 50 testeurs, 10 patches COMMUNITY soumis, 1 critique publique positive
- **Public v1 (phase 3)** : 500 installs première semaine, mentions TOPLAP/Mastodon
- **v2 (phase 4)** : 2000 installs, 100 patches COMMUNITY, 3 artistes utilisent en performance publique
- **ICLC 2027** : paper accepté, performance live, 5000+ installs, communauté active
