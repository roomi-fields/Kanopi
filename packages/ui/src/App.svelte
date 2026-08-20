<script lang="ts">
  import { onMount } from 'svelte';
  import Topbar from './components/topbar/Topbar.svelte';
  import Statusbar from './components/statusbar/Statusbar.svelte';
  import ActivityBar from './components/activity-bar/ActivityBar.svelte';
  import Sidebar from './components/sidebar/Sidebar.svelte';
  import EditorArea from './components/editor/EditorArea.svelte';
  import RightPanel from './components/right-panel/RightPanel.svelte';
  import BottomPanel from './components/bottom-panel/BottomPanel.svelte';
  import LibrarySpace from './components/library/LibrarySpace.svelte';
  import CommandPalette from './components/palette/CommandPalette.svelte';
  import HydraCanvas from './components/runtime/HydraCanvas.svelte';
  import P5Canvas from './components/runtime/P5Canvas.svelte';
  import EventsOverlay from './components/devtools/EventsOverlay.svelte';
  import Resizer from './components/layout/Resizer.svelte';
  import { ui } from './stores/ui.svelte';
  import { installGlobalKeybindings } from './lib/keybindings/bindings';
  import { installAutosave } from './lib/persistence/snapshot.svelte';
  import { workspace } from './stores/workspace.svelte';
  import { library } from './stores/library.svelte';
  import { sceneDemandeeParUrl } from './lib/scene-url';
  import { openBlocks } from './stores/blocks.svelte';
  import { markLastEvalError } from './components/editor/eval-tracker';

  const showEventsOverlay =
    typeof location !== 'undefined' && new URLSearchParams(location.search).has('events');

  // Import files dropped from the desktop (self-test 3.2 — a dropped .strudel
  // opened in a new Chrome tab instead of loading into Kanopi). Scoped to
  // external file drags (`Files` in dataTransfer) so it never interferes with
  // the in-app tab-reorder drag (which carries `text/x-tab-id`, no files).
  let dropActive = $state(false);

  function onFileDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropActive = true;
  }
  function onFileDragLeave(e: DragEvent) {
    if (!e.relatedTarget) dropActive = false; // only when leaving the window
  }
  async function onFileDrop(e: DragEvent) {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return; // tab reorder, not an external file
    e.preventDefault();
    dropActive = false;
    let firstId: string | undefined;
    for (const f of Array.from(files)) {
      const id = workspace.addFile(f.name, await f.text());
      firstId ??= id;
    }
    if (firstId) {
      workspace.openFile(firstId);
      workspace.setActive(firstId);
    }
  }

  // OUVRIR UNE SCÈNE DEMANDÉE PAR L'URL (`?scene=<catégorie>/<fichier>.bps`) — demande Romain
  // 2026-08-09 : depuis un exemple de la doc, un clic amène l'utilisateur sur la scène OUVERTE et
  // prête à produire, « ainsi ce qui sera testé, ça sera toujours les vraies scènes d'exemples ».
  // ⚠️ LE MÊME GESTE QUE LE CLIC DU RAIL, volontairement dupliqué en DEUX LIGNES plutôt qu'en
  // important une fonction depuis un composant : `LibrarySpace.load()` fait exactement
  // `openBundle` + retour sur NOW, et la sémantique d'onglets de Romain veut que l'ouverture soit
  // EDIT-ONLY — elle n'a jamais le droit de produire ni de jouer. Si ce geste change là-bas, il
  // doit changer ici : c'est pour ça que les deux sites se citent l'un l'autre.
  function ouvrirSceneDemandee() {
    const id = sceneDemandeeParUrl();
    if (!id) return;
    const item = library.items.find((i) => i.id === id);
    // Identifiant inconnu : on ne fait RIEN et on ne crie pas. Un lien de doc périmé doit laisser
    // l'application démarrer normalement, pas l'accueillir par une erreur.
    if (!item) return;
    workspace.openBundle(item.files, item.sessionFile);
    ui.activeActivityView = 'now';
  }

  onMount(() => {
    installAutosave();
    // APRÈS l'autosave : l'ouverture crée un onglet, il doit être persisté comme les autres.
    ouvrirSceneDemandee();

    // Strudel logs async pattern errors via its own logger (repl's catch,
    // scheduler-tick errorLogger) without rejecting the evaluate() promise.
    // Hook the official callbacks to re-flash the last-evaluated range red.
    void import('runtime-codevoices').then(({ onStrudelError }) => {
      onStrudelError(() => markLastEvalError());
    });

    const unsub = $effect.root(() => {
      // PRODUCE the preloaded scene on startup (Romain's produce/play split): a
      // scene that's already open when the app boots must show its structure and
      // be ready to Play, just like one opened from the library. One-shot — the
      // first time an active bp3/bpscript PROGRAM is present, derive it
      // (produceOnly: structure + tempo, no audio, no transport). Library opens
      // already produce via `produceLoadedProgram`; this covers the boot case.
      let didInitialProduce = false;
      $effect(() => {
        if (didInitialProduce) return;
        const active = workspace.activeTabId
          ? workspace.fileById(workspace.activeTabId)
          : undefined;
        if (!active) return;
        if (active.runtime !== 'bpscript' && active.runtime !== 'bp3') return;
        didInitialProduce = true;
        void openBlocks.produceLoadedProgram(active.id);
      });
    });

    const offKeys = installGlobalKeybindings();
    return () => {
      offKeys();
      unsub();
    };
  });
</script>

<svelte:window ondragover={onFileDragOver} ondragleave={onFileDragLeave} ondrop={onFileDrop} />

<div class="app" class:drop-active={dropActive}>
  <Topbar />
  <!-- Les deux panneaux latéraux sont bornés à une part de la LARGEUR RÉELLE de la
       fenêtre (`min(largeur, 30vw)`) : une largeur mémorisée sur un grand écran ne doit
       pas manger tout l'espace — voire pousser l'autre panneau hors écran — sur un écran
       plus petit (Romain 2026-07-24). -->
  <div
    class="body"
    class:sidebar-collapsed={ui.sidebarCollapsed}
    style:grid-template-columns={ui.activeActivityView === 'factory'
      ? '44px minmax(0, 1fr)'
      : ui.sidebarCollapsed
        ? `44px minmax(0, 1fr) 4px min(${ui.rightPanelWidth}px, 30vw)`
        : `44px min(${ui.sidebarWidth}px, 30vw) 4px minmax(0, 1fr) 4px min(${ui.rightPanelWidth}px, 30vw)`}
  >
    <ActivityBar />
    {#if ui.activeActivityView === 'factory'}
      <!-- Dedicated full-width library space (replaces editor + panels). The
           activity bar stays visible so another icon returns to the editor. -->
      <LibrarySpace />
    {:else}
      {#if !ui.sidebarCollapsed}
        <Sidebar />
        <Resizer side="right" width={ui.sidebarWidth} onResize={(w) => ui.setSidebarWidth(w)} />
      {/if}
      <div class="center-stack">
        <EditorArea />
      </div>
      <Resizer side="left" width={ui.rightPanelWidth} onResize={(w) => ui.setRightPanelWidth(w)} />
      <RightPanel />
    {/if}
  </div>
  {#if ui.activeActivityView !== 'factory'}
    <!-- Full-width row: spans under the sidebar AND the right panel (not
         boxed inside .center-stack), factory view (LibrarySpace) excluded. -->
    <div class="bottom-row">
      {#if !ui.bottomPanelCollapsed}
        <Resizer
          side="top"
          width={ui.bottomPanelHeight}
          onResize={(h) => ui.setBottomPanelHeight(h)}
        />
      {/if}
      <div
        class="bottom-slot"
        style:height={ui.bottomPanelCollapsed ? 'auto' : `${ui.bottomPanelHeight}px`}
      >
        <BottomPanel />
      </div>
    </div>
  {/if}
  <Statusbar />
</div>

<P5Canvas />
<HydraCanvas />
<CommandPalette />
{#if showEventsOverlay}
  <EventsOverlay />
{/if}

<style>
  /* `min-width: 0` + `overflow-x: hidden` = ceinture : AUCUNE rangée (barre du haut,
     corps, barre d'état) ne peut plus élargir l'application au-delà de la fenêtre et
     pousser le panneau droit hors écran. */
  .app {
    display: grid;
    grid-template-rows: 56px 1fr auto 30px;
    height: 100%;
    width: 100%;
    min-width: 0;
    min-height: 0;
    overflow-x: hidden;
  }
  .body {
    display: grid;
    background: var(--bg);
    overflow: hidden;
    min-width: 0;
    min-height: 0;
  }
  .center-stack {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .center-stack > :global(.editor) {
    flex: 1;
    min-height: 0;
  }
  /* Full-width row (a direct child of `.app`, NOT `.body`): the bottom panel
     spans under the sidebar and the right panel instead of being boxed
     between them. */
  .bottom-row {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .bottom-slot {
    flex-shrink: 0;
    min-height: 0;
    overflow: hidden;
  }
  .app.drop-active::after {
    content: 'Déposer pour importer dans Kanopi';
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.55);
    border: 2px dashed var(--amber-dim);
    color: var(--amber);
    font-family: var(--font-mono);
    font-size: 14px;
    letter-spacing: 0.04em;
    pointer-events: none;
    z-index: 1000;
  }
</style>
