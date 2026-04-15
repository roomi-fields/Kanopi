# @kanopi/ui

UI Svelte 5 + CodeMirror 6 + Vite pour Kanopi.

## Scripts

```bash
npm run dev      # vite dev server (http://localhost:5173)
npm run build    # production build → dist/
npm run preview  # preview du build
npm run check    # svelte-check (TS + Svelte)
npm run lint     # eslint + prettier --check
npm run format   # prettier --write
npm run test     # vitest
```

## Structure

```
src/
├── App.svelte            # grid 56px / 1fr / 30px
├── main.ts               # restore IndexedDB → mount
├── styles/               # tokens, reset, global (extraits du mockup)
├── lib/
│   ├── core-mock/        # CoreApi mock (clock, actors, scenes, maps, console)
│   ├── workspace/        # types, fixtures starter, buildTree
│   ├── persistence/      # workspace-db (idb), snapshot autosave
│   ├── commands/         # registre + filterCommands
│   ├── keybindings/      # global keydown
│   └── icons/            # SVG components
├── stores/               # *.svelte.ts (runes Svelte 5)
└── components/
    ├── topbar/           # Topbar, TransportCluster
    ├── activity-bar/
    ├── sidebar/          # Sidebar, FilesView, FileTree
    ├── editor/           # EditorArea, TabBar, Tab, CMEditor, cm-theme
    ├── right-panel/      # ActorsPanel, ScenesPanel, InspectorPanel, ConsolePanel
    ├── statusbar/
    └── palette/          # CommandPalette
```

## CoreApi

L'UI consomme `src/lib/core-mock/types.ts` (`CoreApi`). Façade unique :
`src/lib/core/index.ts` exporte le singleton `core` (real-core branché
sur les adapters runtime). Le mock reste disponible pour les tests via
`createMockCore()`.

## Runtimes

3 adapters branchés (`src/lib/runtimes/`):

| Runtime | Package | Fichiers |
|---|---|---|
| Strudel | `@strudel/web` (lazy) | `.strudel`, `.tidal` |
| Hydra | `hydra-synth` (lazy) | `.hydra` |
| JS/WebAudio | natif | `.js` |

`bass.scd` (SuperCollider) reste niveau 3 v2 — silencieux.

**Déclencheurs :**
- **Toggle actor** dans le panel Actors → évalue le fichier complet dans le runtime
- **Ctrl/Cmd+Enter** dans l'éditeur → évalue le bloc courant (paragraphe autour
  du curseur, ou sélection si active)

Le canvas Hydra est plein écran z-index 9999, opacity 0.5, mix-blend screen,
pointer-events disabled. Le `solid(0,0,0,1).out()` au stop le réinitialise.

## Raccourcis

- `Cmd/Ctrl+K` ou `Cmd/Ctrl+Shift+P` — ouvre la command palette
- `Space` (hors zone éditable) — toggle play/stop
- `1`–`9` — active la scène N (hors zone éditable)
- `Esc` — ferme la palette

## Persistance

État sérialisé (`workspace:current` dans IndexedDB `kanopi`/`kv`) :
fichiers, onglets, onglet actif, BPM, scène active, actors actifs.
Autosave debounced 500ms.

Pour reset : DevTools → Application → IndexedDB → `kanopi` → delete database, ou en console :
```js
indexedDB.deleteDatabase('kanopi')
```
