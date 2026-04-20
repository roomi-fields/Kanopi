<script lang="ts">
  import Pianoroll from './Pianoroll.svelte';
  import Scope from './Scope.svelte';
  import Spectrum from './Spectrum.svelte';

  type VizTab = 'pianoroll' | 'scope' | 'spectrum';
  let active = $state<VizTab>('pianoroll');
</script>

<div class="viz-panel">
  <header>
    <button class:on={active === 'pianoroll'} onclick={() => (active = 'pianoroll')}>Pianoroll</button>
    <button class:on={active === 'scope'} onclick={() => (active = 'scope')}>Scope</button>
    <button class:on={active === 'spectrum'} onclick={() => (active = 'spectrum')}>Spectrum</button>
  </header>
  <div class="viz-body">
    {#if active === 'pianoroll'}<Pianoroll />
    {:else if active === 'scope'}<Scope />
    {:else if active === 'spectrum'}<Spectrum />
    {/if}
  </div>
</div>

<style>
  .viz-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header {
    display: flex;
    gap: 4px;
    padding: 6px;
    border-bottom: 1px solid var(--border-dim);
  }
  button {
    flex: 1;
    padding: 6px;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: transparent;
    color: var(--text-dim);
    border: 1px solid var(--border-dim);
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.15s;
  }
  button:hover { color: var(--text); border-color: var(--border); }
  button.on { color: var(--amber); border-color: var(--amber); background: rgba(232, 156, 62, 0.08); }
  .viz-body { flex: 1; min-height: 0; overflow: hidden; }
</style>
