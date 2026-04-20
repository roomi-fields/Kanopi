<script lang="ts">
  import { onMount } from 'svelte';
  import { core } from '../../lib/core';
  import type { TokenEvent } from '../../lib/events/types';

  // Visible window in ms: tokens older than this slide off-screen.
  const WINDOW_MS = 8000;
  const PITCH_MIN = 24; // C1
  const PITCH_MAX = 96; // C7

  let canvas: HTMLCanvasElement;

  // Ring buffer of recent tokens. We do not keep unbounded history; anything
  // older than WINDOW_MS * 1.5 is dropped on each frame.
  const tokens: Array<TokenEvent & { row: number }> = [];

  function runtimeColor(rt: string): string {
    switch (rt) {
      case 'strudel': return '#e89c3e';
      case 'hydra': return '#e865b7';
      case 'js': return '#4dd2e5';
      default: return '#a0a0a0';
    }
  }

  // Stable vertical position for named samples without a numeric pitch.
  // Maps each sample-name to a pseudo-row in the mid-range.
  function hashName(name: string): number {
    let h = 2166136261;
    for (let i = 0; i < name.length; i++) {
      h ^= name.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const span = PITCH_MAX - PITCH_MIN;
    return PITCH_MIN + Math.abs(h) % span;
  }

  onMount(() => {
    const off = core.events.on('token', (e: TokenEvent) => {
      const row = typeof e.pitch === 'number'
        ? Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.round(e.pitch)))
        : hashName(e.name);
      tokens.push({ ...e, row });
    });

    let rafId = 0;
    function loop() {
      rafId = requestAnimationFrame(loop);
      draw();
    }
    rafId = requestAnimationFrame(loop);

    return () => {
      off();
      cancelAnimationFrame(rafId);
    };
  });

  function draw() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW <= 0 || cssH <= 0) return;
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Faint grid every octave
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    const pitchSpan = PITCH_MAX - PITCH_MIN;
    for (let p = PITCH_MIN; p <= PITCH_MAX; p += 12) {
      const y = cssH - ((p - PITCH_MIN) / pitchSpan) * cssH;
      ctx.fillRect(0, y - 0.5, cssW, 1);
    }

    const now = performance.now();
    // Drop old tokens so the array can't grow unbounded.
    const cutoff = now - WINDOW_MS * 1.5;
    while (tokens.length && tokens[0].t + tokens[0].duration < cutoff) {
      tokens.shift();
    }

    // Playhead is the right edge; time flows right→left as now advances.
    for (const tok of tokens) {
      const age = now - tok.t;
      if (age > WINDOW_MS) continue;
      const xEnd = cssW - (age / WINDOW_MS) * cssW;
      const xStart = cssW - ((age + tok.duration) / WINDOW_MS) * cssW;
      if (xEnd < 0) continue;
      const y = cssH - ((tok.row - PITCH_MIN) / pitchSpan) * cssH - 3;
      const w = Math.max(2, xEnd - xStart);
      ctx.fillStyle = runtimeColor(tok.runtime);
      ctx.fillRect(xStart, y - 3, w, 6);
    }

    // Playhead
    ctx.fillStyle = 'rgba(232, 156, 62, 0.6)';
    ctx.fillRect(cssW - 1, 0, 1, cssH);
  }
</script>

<div class="viz-root">
  <div class="hdr">
    <span>PIANOROLL</span>
    <span class="legend"><i style="background: #e89c3e"></i>strudel</span>
    <span class="legend"><i style="background: #e865b7"></i>hydra</span>
    <span class="legend"><i style="background: #4dd2e5"></i>js</span>
  </div>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .viz-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .hdr {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 6px 10px;
    font-size: 10px;
    letter-spacing: 0.12em;
    color: var(--text-faint);
    border-bottom: 1px solid var(--border-dim);
    background: var(--panel);
  }
  .hdr > span:first-child { color: var(--amber); letter-spacing: 0.16em; font-weight: 600; margin-right: auto; }
  .legend { display: inline-flex; align-items: center; gap: 4px; text-transform: lowercase; }
  .legend i { width: 8px; height: 8px; display: inline-block; border-radius: 2px; }
  canvas {
    flex: 1;
    min-height: 0;
    width: 100%;
    background: var(--bg);
    display: block;
  }
</style>
