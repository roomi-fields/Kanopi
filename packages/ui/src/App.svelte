<script lang="ts">
  import { onMount } from 'svelte';
  import Topbar from './components/topbar/Topbar.svelte';
  import Statusbar from './components/statusbar/Statusbar.svelte';
  import ActivityBar from './components/activity-bar/ActivityBar.svelte';
  import Sidebar from './components/sidebar/Sidebar.svelte';
  import EditorArea from './components/editor/EditorArea.svelte';
  import RightPanel from './components/right-panel/RightPanel.svelte';
  import CommandPalette from './components/palette/CommandPalette.svelte';
  import HydraCanvas from './components/runtime/HydraCanvas.svelte';
  import Resizer from './components/layout/Resizer.svelte';
  import { ui } from './stores/ui.svelte';
  import { installGlobalKeybindings } from './lib/keybindings/bindings';
  import { installAutosave } from './lib/persistence/snapshot.svelte';
  import { core } from './lib/core';
  import { workspace } from './stores/workspace.svelte';
  import { actors as actorsStore } from './stores/actors.svelte';
  import { markLastEvalError } from './components/editor/eval-tracker';

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
    });

    const offKeys = installGlobalKeybindings();
    return () => {
      offKeys();
      unsub();
    };
  });
</script>

<div class="app">
  <Topbar />
  <div
    class="body"
    class:sidebar-collapsed={ui.sidebarCollapsed}
    style:grid-template-columns={ui.sidebarCollapsed
      ? `44px 1fr 4px ${ui.rightPanelWidth}px`
      : `44px ${ui.sidebarWidth}px 4px 1fr 4px ${ui.rightPanelWidth}px`}
  >
    <ActivityBar />
    {#if !ui.sidebarCollapsed}
      <Sidebar />
      <Resizer side="right" width={ui.sidebarWidth} onResize={(w) => ui.setSidebarWidth(w)} />
    {/if}
    <EditorArea />
    <Resizer side="left" width={ui.rightPanelWidth} onResize={(w) => ui.setRightPanelWidth(w)} />
    <RightPanel />
  </div>
  <Statusbar />
</div>

<HydraCanvas />
<CommandPalette />

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
</style>
