<script lang="ts">
  import { onMount } from 'svelte';
  import Topbar from './components/topbar/Topbar.svelte';
  import Statusbar from './components/statusbar/Statusbar.svelte';
  import ActivityBar from './components/activity-bar/ActivityBar.svelte';
  import Sidebar from './components/sidebar/Sidebar.svelte';
  import EditorArea from './components/editor/EditorArea.svelte';
  import RightPanel from './components/right-panel/RightPanel.svelte';
  import LibrarySpace from './components/library/LibrarySpace.svelte';
  import CommandPalette from './components/palette/CommandPalette.svelte';
  import HydraCanvas from './components/runtime/HydraCanvas.svelte';
  import P5Canvas from './components/runtime/P5Canvas.svelte';
  import EventsOverlay from './components/devtools/EventsOverlay.svelte';
  import Resizer from './components/layout/Resizer.svelte';
  import { ui } from './stores/ui.svelte';
  import { installGlobalKeybindings } from './lib/keybindings/bindings';
  import { installAutosave } from './lib/persistence/snapshot.svelte';
  import { core } from './lib/core';
  import { workspace } from './stores/workspace.svelte';
  import { actors as actorsStore } from './stores/actors.svelte';
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
    core.bindActorFiles((name) => {
      const actor = actorsStore.list.find((a) => a.name === name);
      const fileRef = actor?.file;
      if (!fileRef) return undefined;
      const f = workspace.files.find((x) => x.name === fileRef || x.path === fileRef);
      return f ? { contents: f.contents, runtime: f.runtime, fileName: f.name } : undefined;
    });
    installAutosave();

    // Strudel logs async pattern errors via its own logger (repl's catch,
    // scheduler-tick errorLogger) without rejecting the evaluate() promise.
    // Hook the official callbacks to re-flash the last-evaluated range red.
    void import('./lib/runtimes/strudel').then(({ onStrudelError }) => {
      onStrudelError(() => markLastEvalError());
    });

    let lastSessionId: string | null = null;
    let lastSessionText: string | null = null;
    let lastActorFiles: string[] = []; // file ids opened by the last session

    const unsub = $effect.root(() => {
      // The "current session" = the open .kanopi file (at most one, see workspace.openFile).
      $effect(() => {
        const sessionFile = workspace.files.find(
          (f) => workspace.openTabIds.includes(f.id) && f.runtime === 'kanopi'
        );
        const sid = sessionFile?.id ?? null;
        const text = sessionFile?.contents ?? '';

        if (sid !== lastSessionId || text !== lastSessionText) {
          lastSessionText = text;
          void core.loadSession(text);
        }

        // On session-switch
        if (sid !== lastSessionId) {
          // Closing/switching session: close every actor file tab that the previous session had opened.
          if (lastSessionId && lastActorFiles.length) {
            for (const fid of lastActorFiles) {
              if (workspace.openTabIds.includes(fid)) workspace.closeTab(fid);
            }
            lastActorFiles = [];
          }

          lastSessionId = sid;

          if (sid) {
            queueMicrotask(() => {
              const opened: string[] = [];
              for (const a of actorsStore.list) {
                if (!a.file) continue;
                const f = workspace.files.find((x) => x.name === a.file || x.path === a.file);
                if (f) {
                  if (!workspace.openTabIds.includes(f.id)) {
                    workspace.openFile(f.id);
                  }
                  opened.push(f.id);
                }
              }
              lastActorFiles = opened;
              if (sid) workspace.setActive(sid);
            });
          }
        }
      });

      // Auto-create missing files referenced by declared @actor.
      $effect(() => {
        for (const a of actorsStore.list) {
          if (!a.file) continue;
          const exists = workspace.files.some((x) => x.name === a.file || x.path === a.file);
          if (!exists) {
            // Comment syntax per runtime: Strudel/Tidal/Hydra/JS are JS-based,
            // .scd uses // too, .kanopi/.py use #.
            const hash = a.runtime === 'kanopi' || a.runtime === 'python';
            const prefix = hash ? '#' : '//';
            workspace.addFile(a.file, `${prefix} ${a.name} (${a.runtime}) — empty\n`);
          }
        }
      });

      // `.bps` file-scenes (`@scene calm "calm.bps"`): when the active file is a
      // `.bps` declaring a scene table, feed the right-panel Scenes cards from it.
      // Activating a card loads + plays the referenced child `.bps` (resolved
      // against the workspace). A `.bps` without file-scenes clears the panel.
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
    style:grid-template-columns={ui.activeActivityView === 'library'
      ? '44px 1fr'
      : ui.sidebarCollapsed
        ? `44px 1fr 4px ${ui.rightPanelWidth}px`
        : `44px ${ui.sidebarWidth}px 4px 1fr 4px ${ui.rightPanelWidth}px`}
  >
    <ActivityBar />
    {#if ui.activeActivityView === 'library'}
      <!-- Dedicated full-width library space (replaces editor + panels). The
           activity bar stays visible so another icon returns to the editor. -->
      <LibrarySpace />
    {:else}
      {#if !ui.sidebarCollapsed}
        <Sidebar />
        <Resizer side="right" width={ui.sidebarWidth} onResize={(w) => ui.setSidebarWidth(w)} />
      {/if}
      <EditorArea />
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
