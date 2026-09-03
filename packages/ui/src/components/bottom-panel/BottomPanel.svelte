<script lang="ts">
  import { ui, type BottomPanelTab } from '../../stores/ui.svelte';
  import ConsolePanel from '../right-panel/ConsolePanel.svelte';
  import { productionViews } from 'runtime-ui';
  import ProductionViewHost from './ProductionViewHost.svelte';

  // The runtime log (Console) lives here, below the editor. The right column
  // stays reserved for control surfaces (Actors/Scenes/Inspector). The production
  // views (Structure=timeline, Texte=text) are rendered by the runtime-ui runtime
  // — Kanopi CABLES them in as tabs and fixes their ORDER here; it does not own
  // their rendering.
  // Tab order (KAN-77, renuméroté depuis KAN-21 le 2026-09-03 : trois numéros portaient chacun
  // DEUX entrées de contenu différent au backlog, une citation ne disait plus laquelle elle visait).
  // Structure (the default tab) · Texte · Console.
  const pvTab = (id: BottomPanelTab): { id: BottomPanelTab; label: string }[] => {
    const v = productionViews.find((v) => v.id === id);
    return v ? [{ id, label: v.title }] : [];
  };
  const tabs: { id: BottomPanelTab; label: string }[] = [
    ...pvTab('structure'),
    ...pvTab('text'),
    ...pvTab('trace'),
    { id: 'console', label: 'Console' }
  ];

  // KAN-751 : les 3 vues restent MONTEES tant que le panneau est ouvert — on ne
  // demonte plus au changement d'onglet (perte de zoom/defilement/couches). Le
  // `view` de chaque host est FIXE (structure/text), plus besoin de {#key}. Seule
  // la fermeture reelle du panneau (repli) demonte via le {#if !collapsed} racine.
  const structureView = productionViews.find((v) => v.id === 'structure') ?? null;
  const textView = productionViews.find((v) => v.id === 'text') ?? null;
  const traceView = productionViews.find((v) => v.id === 'trace') ?? null;
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
      <div class="bp-slot" class:hidden={ui.bottomPanelTab !== 'console'}>
        <ConsolePanel />
      </div>
      {#if structureView}
        <div class="bp-slot" class:hidden={ui.bottomPanelTab !== 'structure'}>
          <ProductionViewHost view={structureView} />
        </div>
      {/if}
      {#if textView}
        <div class="bp-slot" class:hidden={ui.bottomPanelTab !== 'text'}>
          <ProductionViewHost view={textView} />
        </div>
      {/if}
      {#if traceView}
        <div class="bp-slot" class:hidden={ui.bottomPanelTab !== 'trace'}>
          <ProductionViewHost view={traceView} />
        </div>
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
  .bp-slot {
    width: 100%;
    height: 100%;
  }
  .bp-slot.hidden {
    display: none;
  }
</style>
