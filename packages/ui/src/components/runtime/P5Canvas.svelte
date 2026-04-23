<script lang="ts">
  import { onMount } from 'svelte';
  import { attachP5Container } from '../../lib/runtimes/p5';

  let container: HTMLDivElement;

  onMount(() => {
    attachP5Container(container);
  });
</script>

<div bind:this={container} class="p5"></div>

<style>
  .p5 {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    /* Below Hydra (9999) but above the editor. */
    z-index: 9000;
    pointer-events: none;
    opacity: 0.9;
  }
  /* p5 wraps the canvas in this container. Make sure the canvas itself
     doesn't grab pointer events either (p5 defaults would intercept). */
  .p5 :global(canvas) {
    pointer-events: none;
  }
</style>
