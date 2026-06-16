<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { production } from '../../stores/production.svelte';
  import { Timeline } from '../../lib/timeline/timeline.js';
  import { bpxTreeToTimelineStream } from '../../lib/timeline/bpx-tree-stream';

  // Polymetric piano-roll of the FULL derived production, rendered by the
  // vendored Canvas 2D `timeline.js` (integrated upstream as-is). VIEWER-only:
  // no duration editing (onResize/onResizeGroup left unwired).
  //
  // When the production carries the BPx derivation `tree`, we replay it as the
  // marker stream timeline.js parses (`bpxTreeToTimelineStream`), so the `{ , }`
  // struct band shows groups + voices + nesting. Without a tree (Strudel/Hydra,
  // older paths) we fall back to the flat `rawTokens`, which still renders voice
  // tracks by temporal overlap but no struct band.
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
    timeline.render();
    // `resize()` reassigns canvas.width/height — that CLEARS the canvas but does
    // NOT repaint. Always follow a resize with render(), or the panel goes black.
    resizeObs = new ResizeObserver(() => {
      timeline?.resize();
      timeline?.render();
    });
    resizeObs.observe(host);
  });

  onDestroy(() => {
    resizeObs?.disconnect();
    timeline?.destroy();
    timeline = undefined;
  });

  // Re-load the visualizer whenever the production changes. Prefer the BPx tree
  // (replayed as a marker stream so the struct band populates); fall back to the
  // flat raw tokens when no tree is present.
  $effect(() => {
    const tree = set?.tree;
    const raw = set?.rawTokens ?? [];
    const names = set?.symbolNames;
    if (!timeline) return;
    const stream = tree ? bpxTreeToTimelineStream(tree, raw, names) : raw;
    // load() ends with resize()+render() itself — do NOT call resize() again here
    // (a bare resize() would clear the freshly painted canvas to black).
    timeline.load(stream, {});
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
