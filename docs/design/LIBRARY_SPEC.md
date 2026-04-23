# Kanopi — Library format spec

Contrat technique du système library : format des fichiers `catalog.json`,
structure d'un item, règles de consommation par les adapters. Complète
`LIBRARY.md` (product doc : vision, catégories, UX, roadmap).

Aujourd'hui seule la catégorie **audio-banks** est implémentée
(`packages/ui/src/lib/library/audio-banks/`). Le reste des catégories
(starters, scenes, snippets, devices, scales) est cadré ici pour que leur
ajout ultérieur reste cohérent.

---

## 1 · Modèle général

Un **catalog** est un JSON statique livré avec Kanopi (ou fetché depuis un
endpoint community). Il contient :

```ts
interface Catalog<Item> {
  schemaVersion: number;  // actuel : 1
  banks: Item[];           // nom historique hérité de audio-banks ; voir §5
}
```

Chaque `Item` est auto-suffisant (id, nom, description, source,
métadonnées) et consommé à la demande par l'adapter approprié.

Le catalog lui-même n'inclut pas le contenu des samples / fichiers / presets.
Il référence ces ressources par URL ou identifiant externe. Ça garde le
catalog léger (~KB) et délègue le fetching réel à la consommation.

---

## 2 · Catégorie implémentée : `audio-banks`

Source : `packages/ui/src/lib/library/audio-banks/catalog.json`.

### Format

```ts
interface AudioBank {
  id: string;            // unique ; kebab-case ; format `<source>-<bank>`
  name: string;          // libellé UI
  description: string;   // 1-2 phrases
  source: string;        // cf formats acceptés ci-dessous
  tags?: string[];       // catégories libres pour filtrage
}
```

### Formats `source` acceptés

Passés tels quels à `samples(source)` de `@strudel/webaudio` :

| Format                            | Exemple                                  | Résolution                            |
| --------------------------------- | ---------------------------------------- | ------------------------------------- |
| `github:<user>/<repo>`            | `github:tidalcycles/dirt-samples`        | fetch `strudel.json` à la racine      |
| `github:<user>/<repo>/<branch>`   | `github:roomi-fields/kanopi-samples/dev` | idem sur branche donnée               |
| `https://.../strudel.json`        | `https://cdn.foo/banks/sp12.json`        | URL explicite du manifest upstream    |

Le manifest upstream (`strudel.json`) suit la convention TidalCycles et
n'est pas re-spécifié ici — cf `@strudel/webaudio` docs.

### Exemple

```json
{
  "schemaVersion": 1,
  "banks": [
    {
      "id": "dirt-samples",
      "name": "Dirt Samples",
      "description": "Canonical TidalCycles / SuperDirt sample bank.",
      "source": "github:tidalcycles/dirt-samples",
      "tags": ["drums", "classic", "tidal"]
    }
  ]
}
```

### Consommation

Le parser `.kanopi` reconnaît la directive `@library <id>`. Le resolver
(`packages/ui/src/lib/session/resolver.ts`) valide l'id contre le catalog
via `findBank(id)`. L'adapter Strudel appelle `samples(bank.source)` au
prebake (cf `strudel.ts:loadSampleBank`).

Erreurs :

- `@library` avec un id absent du catalog → squiggle erreur inline +
  entrée dans le Console panel.
- Double déclaration → warning.
- Bank retirée pendant une session → warning différé.

---

## 3 · Catégories futures (framework)

Pour ajouter une nouvelle catégorie (`starters`, `scenes`, `snippets`,
`devices`, `scales`), reproduire le pattern `audio-banks` :

```
packages/ui/src/lib/library/<category>/
├── catalog.json       → liste des items + métadonnées
├── index.ts           → types + helpers findX / xIds
└── items/             → payload par item (optionnel, cf §3.1)
```

### 3.1 · Payload inline vs externe

Trois stratégies selon le poids et le ciblage par catégorie :

| Catégorie  | Payload    | Format                                                 |
| ---------- | ---------- | ------------------------------------------------------ |
| audio-banks | externe   | URL de manifest upstream (cf §2)                       |
| snippets    | inline    | `content: string` dans le catalog                      |
| scenes     | inline    | `files: [{ path, content }]` dans le catalog           |
| starters   | inline ou externe | si workspace volumineux, fichier zip dans `items/` |
| devices    | inline    | `profile: {…}` objet complet                           |
| scales     | inline    | `notes: [{ degree, cents, name }]`                     |

Les items COMMUNITY (cf `LIBRARY.md`) suivent le même format mais
ajoutent `published`, `license`, `author`, `stats` (downloads, ratings).

### 3.2 · Champs communs à toutes les catégories

Recommandation pour éviter la divergence :

```ts
interface LibraryItemCommon {
  id: string;            // unique global ; format `<org>.<category>.<name>`
  name: string;
  description: string;
  version: string;       // semver
  tags?: string[];
  author?: { name: string; handle?: string; url?: string };
  runtimes?: Runtime[];  // runtimes consommateurs (ex: ["strudel", "tidal"])
  preview?: string;      // URL d'une preview (image, audio, snippet)
}
```

À spécialiser selon la catégorie. Les types TS correspondants vivront
dans `lib/library/<category>/index.ts`.

---

## 4 · Versioning

- **`schemaVersion`** au niveau catalog. Incrément à chaque breaking change
  du format (nouveau champ obligatoire, renommage, suppression). Le loader
  rejette ou adapte selon la politique de compatibilité définie au bump.
- **`version`** par item (SemVer). Un item peut exister en plusieurs
  versions dans le catalog ; par convention, seule la dernière est exposée
  sauf si un consommateur épingle explicitement.

Aujourd'hui `schemaVersion: 1` pour audio-banks. Les autres catégories
démarreront à `1` à leur introduction.

---

## 5 · Dette technique à résoudre

Le catalog audio-banks utilise le champ `banks[]` — historiquement motivé
par le fait qu'il n'y avait qu'une catégorie. Quand une seconde catégorie
arrive, deux options :

- **A.** Un `catalog.json` global avec `items[]` typé par `category`.
- **B.** Un `catalog.json` par catégorie avec `items[]` (renommer `banks[]`
  en `items[]` au passage, bump `schemaVersion: 2`).

Option B est préférable (séparation des concerns, fetch parallèle
possible), mais casse les imports existants — à gérer lors du premier
ajout de catégorie. Loggué dans `PROGRESS.md §5`.

---

## 6 · Sources BUNDLED vs MINE vs COMMUNITY

La provenance d'un item est déterminée par **où le catalog vit**, pas par
un champ dans l'item :

- **BUNDLED** : `packages/ui/src/lib/library/<category>/catalog.json` —
  chargé au build-time, immutable à la vie de l'app.
- **MINE** : IndexedDB, clé `kanopi.library.mine.<category>` — mutable
  par l'utilisateur.
- **COMMUNITY** : fetch HTTP depuis `https://github.com/roomi-fields/kanopi-library`
  au démarrage (cache 1h en IndexedDB).

L'UI surface la provenance via un badge coloré (cf `LIBRARY.md`).
L'adapter consommateur n'a pas à connaître la provenance — il consomme
un `LibraryItem` peu importe d'où il vient.

---

## 7 · Validation

Au chargement d'un catalog :

1. Valider `schemaVersion` (rejeter si version > max connue).
2. Pour chaque item : vérifier unicité de `id`, types des champs requis.
3. Collecter les erreurs en batch, logger un warning par erreur, conserver
   les items valides.

Pas de lib de validation pesante pour l'instant (ajv, zod, …) — un
`typeof` + `Array.isArray` suffit tant que le catalog reste sous 1000
items. Seuil à réévaluer quand COMMUNITY décolle.

---

## 8 · Primitives exportées

| Primitive              | Kind        | Source                                   | Rôle                                                |
| ---------------------- | ----------- | ---------------------------------------- | --------------------------------------------------- |
| `AudioBank`            | interface   | `lib/library/audio-banks.ts:3`           | Entrée audio-bank du catalog                        |
| `AudioBankCatalog`     | interface   | `lib/library/audio-banks.ts:17`          | Type du fichier `catalog.json`                      |
| `catalog`              | const       | `lib/library/audio-banks.ts:23`          | Catalog parsé, source de vérité build-time          |
| `findBank(id)`         | fn          | `lib/library/audio-banks.ts:26`          | Résolution `id → AudioBank`                          |
| `bankIds()`            | fn          | `lib/library/audio-banks.ts:31`          | Liste des ids disponibles (diag / autocomplete)     |
| `loadSampleBank(src)`  | fn          | `lib/runtimes/strudel.ts:643`            | Charge une bank dans Strudel `samples(...)`          |
| `setDeclaredBanks(srcs)` | fn        | `lib/runtimes/strudel.ts:661`            | Sync des banks déclarées vs chargées                 |

Les primitives pour les catégories futures seront ajoutées ici au fur
et à mesure de leur implémentation.

---

## Historique de révision

- **2026-04-23** : rédaction initiale (phase 2.3 task 4). Formalise le
  contract existant d'audio-banks et cadre le framework pour les
  catégories futures sans les sur-spécifier. La dette `banks[] → items[]`
  est loggée explicitement en §5 pour que l'introduction de la 2e
  catégorie la résolve au passage.
