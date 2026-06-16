<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { production } from '../../stores/production.svelte';
  import { Timeline } from '../../lib/timeline/timeline.js';

  // Polymetric piano-roll of the FULL derived production, rendered by the
  // vendored Canvas 2D `timeline.js` (integrated upstream as-is). Voices are
  // assigned by temporal overlap from the raw BPx tokens (ms), so overlapping
  // notes stack into separate voice tracks. VIEWER-only: no duration editing
  // (onResize/onResizeGroup left unwired). The `{ , }` struct band stays empty —
  // BPx flat tokens carry no group delimiters (expected, out of scope here).
  // Reads `production.current` reactively; empty when no production yet.

  let host: HTMLDivElement;
  let canvasEl: HTMLCanvasElement;
  // Imperative, long-lived, NOT reactive — plain `let`, never `$state`.
  let timeline: Timeline | undefined;
  let resizeObs: ResizeObserver | undefined;

  const set = $derived(production.current);
  const hasProduction = $derived((set?.rawTokens?.length ?? 0) > 0);

  onMount(() => {
    timeline = new Timeline(canvasEl, {
      // Viewer callbacks: log selection / surface seeks. No editing wired.
      onSelect: () => {},
      onSeek: () => {}
    });
    timeline.resize();
    resizeObs = new ResizeObserver(() => timeline?.resize());
    resizeObs.observe(host);
  });

  onDestroy(() => {
    resizeObs?.disconnect();
    timeline?.destroy();
    timeline = undefined;
  });

  // Re-load the visualizer whenever the production's raw tokens change. `source`
  // is omitted: it only feeds the struct band, which is out of scope here.
  $effect(() => {
    const raw = set?.rawTokens ?? [];
    if (!timeline) return;
    timeline.load(raw, {});
    timeline.resize();
  });

  // Playback cursor wired to STEP: stepIndex >= 0 → draw a cursor at the start
  // of that beat window (`stepIndex * beatDurSec`, in ms); otherwise clear it.
  $effect(() => {
    const idx = production.stepIndex;
    const beatDurSec = set?.beatDurSec ?? 0;
    if (!timeline) return;
    if (idx >= 0 && beatDurSec > 0) {
      timeline.setCursor(idx * beatDurSec * 1000);
    } else {
      timeline.clearCursor();
    }
  });
</script>

<div class="timeline-panel" bind:this={host}>
  <canvas bind:this={canvasEl}></canvas>
  {#if !hasProduction}
    <div class="empty">No production yet — evaluate a BP3/BPScript voice.</div>
  {/if}
</div>

<style>
  .timeline-panel {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    letter-spacing: 0.08em;
    color: var(--text-dim);
    pointer-events: none;
  }
</style>
