<script lang="ts">
  import { onMount } from 'svelte';
  import { core } from '../../lib/core';
  import { getStrudelAnalyser } from '../../lib/runtimes/strudel';

  let canvas: HTMLCanvasElement;
  let analyser: AnalyserNode | undefined = $state();
  let bins: Uint8Array<ArrayBuffer> | undefined;

  function setAnalyser(a: AnalyserNode) {
    analyser = a;
    bins = new Uint8Array(new ArrayBuffer(a.frequencyBinCount));
  }

  onMount(() => {
    const existing = getStrudelAnalyser();
    if (existing) setAnalyser(existing);

    const onAttach = core.events.on('audio-attach', (e) => setAnalyser(e.analyser));
    const onDetach = core.events.on('audio-detach', () => {
      analyser = undefined;
      bins = undefined;
    });

    let rafId = 0;
    function loop() {
      rafId = requestAnimationFrame(loop);
      draw();
    }
    rafId = requestAnimationFrame(loop);

    return () => {
      onAttach();
      onDetach();
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

    if (!analyser || !bins) return;
    analyser.getByteFrequencyData(bins);

    // Log-scale the frequency axis — musically more useful than linear.
    const barCount = 64;
    const bw = cssW / barCount;
    const gap = 1;
    const sr = analyser.context.sampleRate;
    const nyquist = sr / 2;
    const minF = 20;
    const maxF = 20000;
    const logMin = Math.log(minF);
    const logMax = Math.log(maxF);
    for (let b = 0; b < barCount; b++) {
      const f0 = Math.exp(logMin + ((b) / barCount) * (logMax - logMin));
      const f1 = Math.exp(logMin + ((b + 1) / barCount) * (logMax - logMin));
      const i0 = Math.min(bins.length - 1, Math.max(0, Math.floor((f0 / nyquist) * bins.length)));
      const i1 = Math.min(bins.length - 1, Math.max(i0 + 1, Math.floor((f1 / nyquist) * bins.length)));
      let peak = 0;
      for (let i = i0; i < i1; i++) if (bins[i] > peak) peak = bins[i];
      const h = (peak / 255) * cssH;
      ctx.fillStyle = `hsl(${30 + (peak / 255) * 20}, 70%, ${40 + (peak / 255) * 25}%)`;
      ctx.fillRect(b * bw, cssH - h, bw - gap, h);
    }
  }
</script>

<div class="viz-root">
  <div class="hdr">
    <span>SPECTRUM</span>
    {#if !analyser}<span class="idle">no audio attached</span>{/if}
  </div>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .viz-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .hdr {
    display: flex; gap: 10px; align-items: center;
    padding: 6px 10px; font-size: 10px; letter-spacing: 0.12em;
    color: var(--text-faint);
    border-bottom: 1px solid var(--border-dim);
    background: var(--panel);
  }
  .hdr > span:first-child { color: var(--amber); letter-spacing: 0.16em; font-weight: 600; margin-right: auto; }
  .idle { color: var(--text-faint); font-style: italic; letter-spacing: 0; text-transform: none; }
  canvas { flex: 1; min-height: 0; width: 100%; background: var(--bg); display: block; }
</style>
