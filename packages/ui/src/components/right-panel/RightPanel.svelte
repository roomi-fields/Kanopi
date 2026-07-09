<script lang="ts">
  import ActorsPanel from './ActorsPanel.svelte';
  import InspectorPanel from './InspectorPanel.svelte';

  // No dedicated Viz tab — upstream fullscreen canvas (#test-canvas,
  // task 1.2), inline widgets (task 1.3bis), and mini-notation highlight
  // (task 1.4) render directly in the editor.
  // Console + Text outputs live in the bottom panel (BottomPanel.svelte);
  // this column is reserved for control surfaces.
  // Actors + Inspector are stacked widgets (no tabs) so both control
  // surfaces stay visible at once (KAN-UX1).
</script>

<aside class="sidebar-right">
  <section class="rp-widget">
    <h3 class="rp-widget-title">Actors</h3>
    <div class="rp-widget-body">
      <ActorsPanel />
    </div>
  </section>
  <section class="rp-widget">
    <h3 class="rp-widget-title">Inspector</h3>
    <div class="rp-widget-body">
      <InspectorPanel />
    </div>
  </section>
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
  .rp-widget {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }
  .rp-widget + .rp-widget {
    border-top: 1px solid var(--border-dim);
  }
  .rp-widget-title {
    padding: 10px 12px;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-dim);
  }
  .rp-widget-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
</style>
