<script lang="ts">
  import { onMount } from 'svelte';
  import { attachHydraCanvas } from '../../lib/runtimes/hydra';

  let canvas: HTMLCanvasElement;

  onMount(() => {
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    }
    resize();
    window.addEventListener('resize', resize);
    attachHydraCanvas(canvas);
    return () => window.removeEventListener('resize', resize);
  });
</script>

<canvas bind:this={canvas} class="hydra"></canvas>

<style>
  .hydra {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9999;
    pointer-events: none;
    opacity: 0.85;
  }
</style>
