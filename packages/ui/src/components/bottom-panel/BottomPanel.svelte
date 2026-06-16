<script lang="ts">
  import { ui, type BottomPanelTab } from '../../stores/ui.svelte';
  import ConsolePanel from '../right-panel/ConsolePanel.svelte';
  import TextStreamPanel from '../right-panel/TextStreamPanel.svelte';

  // Outputs of a running session live here, below the editor: the symbol
  // stream (Text), the runtime log (Console), and a placeholder for the
  // structure visualizer (Structure — filled by a separate task). The right
  // column stays reserved for control surfaces (Actors/Scenes/Inspector).
  const tabs: { id: BottomPanelTab; label: string }[] = [
    { id: 'structure', label: 'Structure' },
    { id: 'text', label: 'Text' },
    { id: 'console', label: 'Console' }
  ];
</script>

<section class="bottom-panel" class:collapsed={ui.bottomPanelCollapsed}>
  <header class="bp-tabs">
    {#each tabs as t (t.id)}
      <button
        class="bp-tab"
        class:active={!ui.bottomPanelCollapsed && ui.bottomPanelTab === t.id}
        type="button"
        onclick={() => ui.setBottomPanel(t.id)}
      >
        {t.label}
      </button>
    {/each}
    <button
      class="bp-toggle"
      type="button"
      title={ui.bottomPanelCollapsed ? 'Expand bottom panel' : 'Collapse bottom panel'}
      aria-label={ui.bottomPanelCollapsed ? 'Expand bottom panel' : 'Collapse bottom panel'}
      onclick={() => ui.toggleBottomPanel()}
    >
      {ui.bottomPanelCollapsed ? '▲' : '▼'}
    </button>
  </header>
  {#if !ui.bottomPanelCollapsed}
    <div class="bp-body">
      {#if ui.bottomPanelTab === 'structure'}
        <div class="structure-stub">structure visualizer coming</div>
      {:else if ui.bottomPanelTab === 'text'}
        <TextStreamPanel />
      {:else if ui.bottomPanelTab === 'console'}
        <ConsolePanel />
      {/if}
    </div>
  {/if}
</section>

<style>
  .bottom-panel {
    background: var(--surface);
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
    height: 100%;
  }
  .bottom-panel.collapsed {
    height: auto;
  }
  .bp-tabs {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
  }
  .bp-tab {
    padding: 8px 16px;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-dim);
    border-bottom: 1px solid transparent;
    transition: all 0.15s;
  }
  .bp-tab:hover {
    color: var(--text-muted);
  }
  .bp-tab.active {
    color: var(--amber);
    border-bottom-color: var(--amber);
  }
  .bp-toggle {
    margin-left: auto;
    padding: 8px 12px;
    font-size: 10px;
    color: var(--text-dim);
    transition: color 0.15s;
  }
  .bp-toggle:hover {
    color: var(--amber);
  }
  .bp-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  .structure-stub {
    padding: 16px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-dim);
    letter-spacing: 0.04em;
  }
</style>
