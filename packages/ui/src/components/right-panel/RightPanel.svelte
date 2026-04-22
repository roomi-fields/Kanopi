<script lang="ts">
  import { ui, type RightPanelTab } from '../../stores/ui.svelte';
  import ActorsPanel from './ActorsPanel.svelte';
  import ScenesPanel from './ScenesPanel.svelte';
  import InspectorPanel from './InspectorPanel.svelte';
  import ConsolePanel from './ConsolePanel.svelte';

  // No dedicated Viz tab — upstream fullscreen canvas (#test-canvas,
  // task 1.2), inline widgets (task 1.3bis), and mini-notation highlight
  // (task 1.4) render directly in the editor.
  const tabs: { id: RightPanelTab; label: string }[] = [
    { id: 'actors', label: 'Actors' },
    { id: 'scenes', label: 'Scenes' },
    { id: 'inspector', label: 'Inspector' },
    { id: 'console', label: 'Console' }
  ];
</script>

<aside class="sidebar-right">
  <header class="rp-tabs">
    {#each tabs as t (t.id)}
      <button
        class="rp-tab"
        class:active={ui.rightPanelTab === t.id}
        type="button"
        onclick={() => ui.setRightPanel(t.id)}
      >
        {t.label}
      </button>
    {/each}
  </header>
  <div class="rp-body">
    {#if ui.rightPanelTab === 'actors'}<ActorsPanel />
    {:else if ui.rightPanelTab === 'scenes'}<ScenesPanel />
    {:else if ui.rightPanelTab === 'inspector'}<InspectorPanel />
    {:else if ui.rightPanelTab === 'console'}<ConsolePanel />
    {/if}
  </div>
</aside>

<style>
  .sidebar-right {
    background: var(--surface);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
  .rp-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-dim);
  }
  .rp-tab {
    flex: 1;
    padding: 10px 0;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-dim);
    border-bottom: 1px solid transparent;
    transition: all 0.15s;
  }
  .rp-tab:hover { color: var(--text-muted); }
  .rp-tab.active {
    color: var(--amber);
    border-bottom-color: var(--amber);
  }
  .rp-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
</style>
