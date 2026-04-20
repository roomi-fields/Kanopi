<script lang="ts">
  import { onMount } from 'svelte';
  import { core } from '../../lib/core';
  import { getStrudelAnalyser } from '../../lib/runtimes/strudel';

  let canvas: HTMLCanvasElement;
  let analyser: AnalyserNode | undefined = $state();
  let buf: Float32Array<ArrayBuffer> | undefined;

  function setAnalyser(a: AnalyserNode) {
    analyser = a;
    buf = new Float32Array(new ArrayBuffer(a.fftSize * 4));
  }

  onMount(() => {
    // Pull-on-mount: recover from a sticky audio-attach that already fired.
    const existing = getStrudelAnalyser();
    if (existing) setAnalyser(existing);

    const onAttach = core.events.on('audio-attach', (e) => setAnalyser(e.analyser));
    const onDetach = core.events.on('audio-detach', () => {
      analyser = undefined;
      buf = undefined;
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

    // Baseline
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cssH / 2);
    ctx.lineTo(cssW, cssH / 2);
    ctx.stroke();

    if (!analyser || !buf) return;
    analyser.getFloatTimeDomainData(buf);

    ctx.strokeStyle = '#e89c3e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const mid = cssH / 2;
    for (let i = 0; i < buf.length; i++) {
      const x = (i / (buf.length - 1)) * cssW;
      const y = mid - buf[i] * mid * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
</script>

<div class="viz-root">
  <div class="hdr">
    <span>SCOPE</span>
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
