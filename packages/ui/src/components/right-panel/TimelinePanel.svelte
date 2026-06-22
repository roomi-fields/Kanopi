<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { production } from '../../stores/production.svelte';
  import { clock } from '../../stores/clock.svelte';
  import { playback } from '../../stores/playback.svelte';
  import { kronosCursor } from '../../stores/kronos-cursor.svelte';
  import { audioEngine } from '../../lib/runtimes/kronos-audio';
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
  // Cursor redraw coalescing: the cursor effect re-runs MANY times per animation
  // frame (its reactive deps fire ≈16×/frame during playback). Each redraw repaints
  // the canvas → ≈1500 repaints/s made playback janky. We coalesce to ONE repaint
  // per frame: the effect only records the desired position; a single rAF flushes it.
  //
  // Lag fix (measured ~21 ms / ~1.3 frames behind the heard audio): the flush
  //   (a) RE-READS the live playhead at paint time via `liveMsAtFlush` instead of
  //       drawing the position the effect captured earlier in the SAME frame, and
  //   (b) paints SYNCHRONOUSLY here (`setCursorNow`) instead of letting `setCursor`
  //       defer to its own rAF — that extra hop was a whole frame of lag.
  // The coalescing (one flush per frame) and the legacy/paused/stepped paths are
  // unchanged: they pass a fixed `ms` and no live source, so the recorded value is
  // drawn verbatim.
  let pendingCursorMs: number | null = null; // ms, or null = clear
  let liveMsAtFlush: (() => number | null) | null = null; // re-read at paint time
  let cursorRaf = 0;
  let lastFlushedMs: number | null = null;
  function scheduleCursor(ms: number | null, live: (() => number | null) | null = null) {
    pendingCursorMs = ms;
    liveMsAtFlush = live;
    if (cursorRaf) return;
    cursorRaf = requestAnimationFrame(() => {
      cursorRaf = 0;
      if (!timeline) return;
      // Freshest possible position: if a live source is set (kronos playhead),
      // sample it NOW (paint time), otherwise use the value the effect recorded.
      const target = liveMsAtFlush ? liveMsAtFlush() : pendingCursorMs;
      if (target === lastFlushedMs) return; // nothing moved
      lastFlushedMs = target;
      if (target === null) timeline.clearCursor();
      else timeline.setCursorNow(target); // synchronous paint — no extra rAF hop
    });
  }

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
    if (cursorRaf) cancelAnimationFrame(cursorRaf);
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
    // Head-rule sections (seconds in the store) → the timeline's ms band. Drawn
    // INDEPENDENTLY of polymetry, so a purely sequential grammar (arabic:
    // `S -> Sayr Rujoo Qarar`) still shows its named segments even though it has
    // no `{ , }` struct lane. Empty list → no band (e.g. a single-section file).
    const sections = (set?.sections ?? []).map((s) => ({
      name: s.name,
      startMs: s.startSec * 1000,
      endMs: s.endSec * 1000
    }));
    if (!timeline) return;
    const stream = tree ? bpxTreeToTimelineStream(tree, raw, names) : raw;
    // load() ends with resize()+render() itself — do NOT call resize() again here
    // (a bare resize() would clear the freshly painted canvas to black).
    timeline.load(stream, {});
    // setSections re-runs resize()+render() with the band's row reserved.
    timeline.setSections(sections);
  });

  // Playback cursor, driven by the SINGLE transport state machine:
  //   • PLAYING → LIVE cursor following the heard audio (the clock's beat/phase is
  //     phase-locked to the playing dispatcher).
  //   • PAUSED  → frozen at the start of the paused beat.
  //   • STEPPED → parked just AFTER the played beat (`(lastBeat+1)·beat`), so the
  //     bar sits after the step that played, not before it.
  //   • STOPPED → cleared.
  $effect(() => {
    const mode = playback.mode;
    const lastBeat = playback.lastBeat;
    const beatDurSec = set?.beatDurSec ?? 0;
    const durationSec = set?.durationSec ?? 0;
    if (!timeline) return;
    // Compute the target cursor position (ms), or null when there's nothing to show.
    let ms: number | null = null;
    // Live re-read sampled at PAINT time (kronos playing only) so the drawn cursor
    // is the freshest playhead, not the one captured when this effect ran earlier
    // in the frame. Null for every other state → the recorded `ms` is drawn as-is.
    let live: (() => number | null) | null = null;
    if (mode === 'playing' && beatDurSec > 0 && durationSec > 0) {
      // Read the central clock's state every frame regardless of engine: it
      // free-runs while playing and emits a fresh state each rAF tick, which is
      // what re-runs THIS effect — the per-frame heartbeat the cursor rides on.
      const cs = clock.state;
      const kc = kronosCursor.active;
      if (audioEngine() === 'kronos' && kc) {
        // Kronos drives the sound AND owns the playhead: its cursor reads the SAME
        // clock as the scheduler, so the drawn position is aligned to the heard
        // audio (no ~1-note lag) and monotone from 0 (no backward jump at launch;
        // the only return-to-0 is the legitimate loop crossing). Already loop-folded.
        ms = kc.position() * 1000;
        live = () => kc.position() * 1000;
      } else {
        // Legacy engine: the old dispatcher sounds; the central rAF clock's
        // phase-locked beat/bar/phase is the playhead (unchanged).
        const bpb = cs.beatsPerBar || 4;
        const absBeats = (cs.bar - 1) * bpb + cs.beat + cs.phase;
        ms = ((absBeats * beatDurSec) % durationSec) * 1000;
      }
    } else if ((mode === 'paused' || mode === 'stepped') && lastBeat >= 0 && beatDurSec > 0) {
      // Pause and Step both leave the playhead at the END of the beat that just
      // played/was-heard ((lastBeat+1)·beat) — the discrete grid boundary. Pause
      // used to snap to the START of the in-progress beat, which read as a 1-beat
      // jump when stepping afterwards; same formula now → consistent.
      ms = Math.min((lastBeat + 1) * beatDurSec, durationSec) * 1000;
    }
    // Record the target; the rAF flush repaints at most once per frame, sampling
    // `live` (kronos) at paint time when present.
    scheduleCursor(ms, live);
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
