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
  import { installPersonalPitchLib } from './stores/personal-pitch-lib.svelte';
  import { core } from './lib/core';
  import { workspace } from './stores/workspace.svelte';
  import { openBlocks } from './stores/blocks.svelte';
  import { markLastEvalError } from './components/editor/eval-tracker';
  import { sceneTableFromFile } from './stores/bpsScenes.svelte';

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

  onMount(() => {
    installAutosave();
    // Composeur des librairies HAUTEUR personnelles (`libraries/<domaine>/…`) → catalogue
    // `pitchLibMine` de bpx-adapter. Doit démarrer AVANT toute dérivation pour alimenter le
    // setter à temps (même patron que `installAutosave`).
    installPersonalPitchLib();

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

      // `.bps` file-scenes (`@scene calm "calm.bps"`): when the active file is a
      // `.bps` declaring a scene table, feed the right-panel Scenes cards from it.
      // Activating a card loads + plays the referenced child `.bps` (resolved
      // against the workspace). An empty table clears only a previously-loaded
      // file-scene set (core.loadBpsFileScenes only owns file-scene cards).
      let lastSceneTableKey = '';
      $effect(() => {
        const active = workspace.activeTabId
          ? workspace.fileById(workspace.activeTabId)
          : undefined;
        const table = sceneTableFromFile(active?.name, active?.contents);
        const key = `${active?.name ?? ''}:${JSON.stringify(table)}`;
        if (key === lastSceneTableKey) return;
        lastSceneTableKey = key;
        core.loadBpsFileScenes(table, (fileName) => {
          const f = workspace.files.find((x) => x.name === fileName || x.path === fileName);
          return f?.contents;
        });
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
  <div
    class="body"
    class:sidebar-collapsed={ui.sidebarCollapsed}
    style:grid-template-columns={ui.activeActivityView === 'factory'
      ? '44px 1fr'
      : ui.sidebarCollapsed
        ? `44px 1fr 4px ${ui.rightPanelWidth}px`
        : `44px ${ui.sidebarWidth}px 4px 1fr 4px ${ui.rightPanelWidth}px`}
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
      <!-- Center column: editor stacked above the bottom output panel. The
           bottom panel is contained here so the right column stays full-height. -->
      <div class="center-stack">
        <EditorArea />
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
      <Resizer side="left" width={ui.rightPanelWidth} onResize={(w) => ui.setRightPanelWidth(w)} />
      <RightPanel />
    {/if}
  </div>
  <Statusbar />
</div>

<P5Canvas />
<HydraCanvas />
<CommandPalette />
{#if showEventsOverlay}
  <EventsOverlay />
{/if}

<style>
  .app {
    display: grid;
    grid-template-rows: 56px 1fr 30px;
    height: 100%;
    width: 100%;
    min-height: 0;
  }
  .body {
    display: grid;
    background: var(--bg);
    overflow: hidden;
    min-height: 0;
  }
  .center-stack {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  /* EditorArea (its root is `.editor`) takes the space above the bottom panel. */
  .center-stack > :global(.editor) {
    flex: 1;
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
