<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { ViewModule, ProductionInput, ProductionStructure } from 'runtime-ui';
  import { productionFeed } from '../../stores/production-feed.svelte';
  import { kronosCursor } from '../../stores/kronos-cursor.svelte';
  import { recordViewInput } from '../../lib/pilot/view-input-observer';

  let { view }: { view: ViewModule } = $props();
  let container: HTMLElement;

  onMount(() => view.mount({ container }));
  onDestroy(() => view.unmount());

  // The Kairos projection (structure) only changes when the living tree does — i.e. on
  // `generation` (eval / re-random swap). A transport gesture (play/pause/stop) bumps
  // `kronosCursor.state` but NOT `generation`, so re-reading the whole Kairos tree on every
  // gesture is wasted work (F21: visible hitch on large scenes). Cache the last projection
  // and re-read it ONLY when `generation` advances; transport changes re-render with the
  // cached tree + the fresh cursor/mode. Kairos stays the authority — this only stops the
  // host from re-pulling an UNCHANGED projection on each transport tick.
  let lastGen = -1;
  let cachedStructure: ProductionStructure | null = null;

  $effect(() => {
    // Reactive deps: generation (eval/swap → re-read), transport state + handle (cursor only).
    const gen = productionFeed.generation;
    if (gen !== lastGen) {
      cachedStructure = productionFeed.structure();
      lastGen = gen;
    }
    const input: ProductionInput = {
      structure: cachedStructure,
      transport: { mode: kronosCursor.state, cursor: kronosCursor.active }
    };
    view.update(input);
    // DEV probe (window.kanopi.inspect.lastViewInput) — record what the render layer receives,
    // to prove/disprove a host-side wiring gap (e.g. cursor frozen on replay). No render effect.
    recordViewInput(view.id, input);
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
