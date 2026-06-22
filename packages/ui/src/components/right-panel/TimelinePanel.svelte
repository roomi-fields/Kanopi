<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { production } from '../../stores/production.svelte';
  import { clock } from '../../stores/clock.svelte';
  import { playback } from '../../stores/playback.svelte';
  import { kronosCursor } from '../../stores/kronos-cursor.svelte';
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
  // Cursor paint. One repaint at most per change; the canvas is only touched when
  // the position actually moved (`lastFlushedMs` dedup). Two distinct drivers feed
  // this, depending on engine:
  //
  //  • KRONOS PLAYING → a SELF-OWNED rAF loop (`kronosCursorLoop`) samples the
  //    latency-compensated playhead every animation frame (smooth, vsync 60 fps).
  //    The earlier code rode the legacy clock's heartbeat (a 25 ms setInterval),
  //    which gated paints to ~30 fps and read as saccadé — Kronos drives the sound
  //    here, the legacy clock is not its time source, so the cursor owns its frames.
  //  • EVERY OTHER STATE (legacy playing, paused, stepped, stopped) → the one-shot
  //    `scheduleCursor`: the effect records a fixed position and a single rAF flush
  //    paints it. Unchanged.
  let lastFlushedMs: number | null = null;
  function paintCursor(target: number | null) {
    if (!timeline) return;
    if (target === lastFlushedMs) return; // nothing moved
    lastFlushedMs = target;
    if (target === null) timeline.clearCursor();
    else timeline.setCursorNow(target); // synchronous paint — no extra rAF hop
  }

  // One-shot coalescing flush for the NON-kronos states (legacy/paused/stepped/
  // stopped). Records the desired position; a single rAF paints it at most once.
  let pendingCursorMs: number | null = null; // ms, or null = clear
  let cursorRaf = 0;
  function scheduleCursor(ms: number | null) {
    pendingCursorMs = ms;
    if (cursorRaf) return;
    cursorRaf = requestAnimationFrame(() => {
      cursorRaf = 0;
      paintCursor(pendingCursorMs);
    });
  }

  // Self-owned continuous rAF loop for kronos playing: samples the heard-audio
  // position every frame so the cursor advances at the display's refresh rate
  // (≈16 ms), not the 25 ms clock timer. `sample()` returns scene ms aligned to the
  // heard audio (latency-compensated) or null to clear.
  let kronosCursorRaf = 0;
  function startKronosCursorLoop(sample: () => number | null) {
    if (kronosCursorRaf) return;
    const tick = () => {
      kronosCursorRaf = requestAnimationFrame(tick);
      paintCursor(sample());
    };
    kronosCursorRaf = requestAnimationFrame(tick);
  }
  function stopKronosCursorLoop() {
    if (kronosCursorRaf) {
      cancelAnimationFrame(kronosCursorRaf);
      kronosCursorRaf = 0;
    }
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
    stopKronosCursorLoop();
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
    const kc = kronosCursor.active;
    if (!timeline) return;

    // KRONOS PLAYING — own the frames. Kronos drives the sound and the playhead;
    // the legacy clock's 25 ms timer is NOT its time source, so the cursor runs its
    // own rAF loop (smooth 60 fps) and samples the HEARD-audio position each frame
    // (latency-compensated: `displayPosition` reads the scene at
    // `currentTime − outputLatency − baseLatency`, so the cursor sits on the note
    // being heard, not the one ~one buffer ahead being scheduled). Already
    // loop-folded; monotone from start (the only return-to-0 is the loop crossing).
    if (mode === 'playing' && kc && durationSec > 0) {
      startKronosCursorLoop(() => kc.displayPosition() * 1000);
      return () => stopKronosCursorLoop();
    }

    // EVERY OTHER STATE — one-shot flush. Stop any running kronos loop first, then
    // compute a fixed target and let the single rAF paint it.
    stopKronosCursorLoop();
    let ms: number | null = null;
    if (mode === 'playing' && beatDurSec > 0 && durationSec > 0) {
      // Legacy engine: the old dispatcher sounds; the central clock's phase-locked
      // beat/bar/phase is the playhead. Its `clock.state` heartbeat re-runs this
      // effect each tick, which is the per-tick repaint cadence (unchanged).
      const cs = clock.state;
      const bpb = cs.beatsPerBar || 4;
      const absBeats = (cs.bar - 1) * bpb + cs.beat + cs.phase;
      ms = ((absBeats * beatDurSec) % durationSec) * 1000;
    } else if ((mode === 'paused' || mode === 'stepped') && lastBeat >= 0 && beatDurSec > 0) {
      // Pause and Step both leave the playhead at the END of the beat that just
      // played/was-heard ((lastBeat+1)·beat) — the discrete grid boundary. Pause
      // used to snap to the START of the in-progress beat, which read as a 1-beat
      // jump when stepping afterwards; same formula now → consistent.
      ms = Math.min((lastBeat + 1) * beatDurSec, durationSec) * 1000;
    }
    scheduleCursor(ms);
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
