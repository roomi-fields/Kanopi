# Kanopi Library System

## Principe

La library est un facteur clé de succès (Ableton Packs, VSCode marketplace, Arturia V Collection). Un outil nu = abandonné. Un outil avec contenu riche à portée de clic = adopté.

**3 sources, modèle npm-like :**

| Source | Badge | Storage | v1 | v2 |
|--------|-------|---------|----|----|
| **● BUNDLED** | ambre | JSON livré dans le repo | ~42 items | curated growth |
| **● MINE** | cyan | IndexedDB local | utilisateur | + sync cloud |
| **● COMMUNITY** | vert | Manifest Git public | lecture seule | + ratings/comments |

## Catégories

| Catégorie | Exemples | Format |
|-----------|----------|--------|
| **STARTERS** | "Minimal Tidal + Hydra", "Drone ambient", "Performance template" | workspace complet (.zip ou dossier) |
| **SCENES** | "4-to-floor kick", "Polymetric 3:5", "Ambient pad drone" | fragment `.kanopi` + fichiers code |
| **SNIPPETS** | Mini-patterns Tidal, shaders Hydra, synths SC, rythmes BPscript | fichier code (`.tidal`, `.scd`…) |
| **DEVICES** | Profils hardware (Minilab 3, Sub37, Electra One…) | JSON osc-bridge + preset Kanopi |
| **SCALES** | Western, Sargam, Pelog, Bohlen-Pierce, microtonal | JSON (hérité de `BPscript/lib/alphabets.json`) |

## Format d'un item library

```json
{
  "id": "kanopi.starter.minimal-tidal-hydra",
  "name": "minimal tidal + hydra",
  "version": "1.0.0",
  "category": "starter",
  "source": "bundled",
  "author": { "name": "Kanopi", "handle": "kanopi" },
  "tags": ["tidal", "hydra", "beginner"],
  "description": "Minimal starter with a Tidal drum pattern and Hydra visualizer.",
  "files": [
    { "path": "session.kanopi", "content": "..." },
    { "path": "drums.tidal", "content": "..." },
    { "path": "visuals.hydra", "content": "..." }
  ],
  "runtimes": ["tidal", "hydra"],
  "preview": "preview.png"
}
```

Pour les items COMMUNITY, ajouter :
```json
{
  "stats": {
    "downloads": 847,
    "stars": 4,
    "ratings": 23,
    "comments": 12
  },
  "published": "2026-03-15T10:00:00Z",
  "license": "CC-BY-4.0"
}
```

## Storage

### BUNDLED
- Dans le repo : `packages/library/bundled/<category>/<id>.json`
- Chargé au démarrage via manifest
- Versionné avec Kanopi releases

### MINE
- IndexedDB key-value store
- Opération "Save to Library" depuis n'importe quelle scène/workspace
- Format identique à BUNDLED, source = "mine"
- Backup/export JSON possible (v1)
- Sync cloud optionnel (v2)

### COMMUNITY

**V1 (light)** :
- Repo Git public `github.com/roomi-fields/kanopi-library`
- Manifest `index.json` listant tous les items avec métadonnées
- Kanopi fetch le manifest au démarrage (cache 1h)
- Items téléchargés à la demande via raw.githubusercontent.com
- Soumission = PR sur le repo
- Pas de ratings/comments dans l'app en v1

**V2 (full)** :
- API REST backend (`api.kanopi.cc`)
- Ratings ★ via auth (OAuth GitHub ?)
- Comments threaded
- Usage stats (downloads incrémentés)
- Publication depuis l'app ("Publish to Hub")
- Modération : flagging communautaire + modos

## Flow utilisateur

### Découvrir
1. User ouvre la vue Library (activity bar)
2. Filtre par source (BUNDLED / MINE / COMMUNITY) et/ou catégorie
3. Search texte plein
4. Clique un item → preview + description dans panel détail

### Installer
- Clique `+` → item ajouté au workspace courant
  - STARTER : crée nouveau workspace ou merge dans courant (prompt)
  - SCENE : ajoute les fichiers + intègre dans session.kanopi
  - SNIPPET : insère dans fichier courant au curseur
  - DEVICE : ajoute `@actor` dans session + config osc-bridge
  - SCALE : ajoute référence dans session

### Créer & partager
- User crée une scène dans son workspace
- Menu : "Save to Library as…" → catégorie, nom, tags, description
- Stocké dans MINE
- Optionnel : "Publish to Community" → soumission (v1: PR GitHub, v2: publish API)

## Contenu v1 bundled (cible 42 items)

| Catégorie | Items |
|-----------|-------|
| STARTERS | 5 workspaces démo (tidal-hydra, drone, performance, indian-polyrhythm, polymetric-set) |
| SCENES | 12 scènes réutilisables |
| SNIPPETS | 15 mini-patterns (3/runtime × 4 runtimes + 3 BPscript) |
| DEVICES | 5 profils (Minilab 3, Sub37, Launch XL, Electra One, Sub37) |
| SCALES | 5 gammes (western, sargam, pelog, BP, microtonal) |

Source alphabets/scales : `BPscript/lib/alphabets.json` existant, à migrer.
Source démos : `BPscript/web/demos/` (38 fichiers .bps), à trier/intégrer.

## Contenu communautaire attendu

- Scenes TidalCycles (large base existante à porter)
- Shaders Hydra (ojack & community)
- Sardine patterns (Bubobubo)
- Hardware profiles (au fil des acquisitions)
- Ragas, gamelan, ethnomusicologie (niche mais passionnante)

## UI

Voir [mockup](../mockups/kanopi-v1-mockup.html), section Library sidebar.

Éléments clés :
- Catégories en onglets horizontaux
- Source pills : `BUNDLED 42` / `MINE 17` / `COMMUNITY 2.4k`
- Items avec bandeau coloré par runtime, badge source, métadonnées, bouton `+`
- Items COMMUNITY : avatar auteur, étoiles ★★★★☆, downloads, comments
- Footer "BROWSE HUB" → ouvre kanopi-library sur GitHub (v1) ou hub.kanopi.cc (v2)

## Licence du contenu

- BUNDLED : Apache-2.0 ou équivalent permissif
- MINE : utilisateur propriétaire
- COMMUNITY : chaque item déclare sa licence (CC-BY, MIT, etc.), validé à la publication

## Roadmap library

| Phase | Milestone |
|-------|-----------|
| Phase 1 (alpha) | BUNDLED prêt avec 20-25 items, MINE fonctionnel |
| Phase 2 (beta) | BUNDLED 42+ items, COMMUNITY light (repo GitHub) |
| Phase 3 (public v1) | COMMUNITY lisible depuis l'app, soumission via PR |
| Phase 4 (v2) | Publication depuis l'app, ratings, comments |
| Phase 5 (v3) | Hub web dédié avec search avancée, collections, playlists |
