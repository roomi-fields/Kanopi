<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { ViewModule, ProductionInput } from 'runtime-ui';
  import { productionFeed } from '../../stores/production-feed.svelte';
  import { kronosCursor } from '../../stores/kronos-cursor.svelte';

  let { view }: { view: ViewModule } = $props();
  let container: HTMLElement;

  onMount(() => view.mount({ container }));
  onDestroy(() => view.unmount());

  $effect(() => {
    // Reactive deps: generation (eval/swap), transport state, active handle.
    void productionFeed.generation;
    const input: ProductionInput = {
      structure: productionFeed.structure(),
      plat: productionFeed.plat(),
      transport: { mode: kronosCursor.state, cursor: kronosCursor.active }
    };
    view.update(input);
  });
</script>

<div class="pv-host" bind:this={container}></div>

<style>
  .pv-host {
    width: 100%;
    height: 100%;
    overflow: auto;
  }
</style>
