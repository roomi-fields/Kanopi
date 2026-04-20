<script lang="ts">
  import { clock } from '../../stores/clock.svelte';
  import { scenes } from '../../stores/scenes.svelte';
  import { actors } from '../../stores/actors.svelte';
  import { consoleLog } from '../../stores/console.svelte';

  function fmt2(n: number) {
    return n.toString().padStart(2, '0');
  }
  function fmt3(n: number) {
    return n.toString().padStart(3, '0');
  }

  // Ableton-style Bar.Beat — both 1-indexed, beats per bar from time signature.
  // `state.beat` is 0..(N-1) internally; display adds 1 so Ableton convention
  // holds (first beat is 1, not 0). Absolute beat count stays available in the
  // event overlay (`?events=1`) for debugging.
  const bpmStr = $derived(clock.state.bpm.toFixed(1));
  const posStr = $derived(fmt3(clock.state.bar) + '.' + fmt2(clock.state.beat + 1));
  const sceneName = $derived(scenes.active?.name ?? '—');
  const activeRuntimes = $derived(new Set(actors.list.filter((a) => a.active).map((a) => a.runtime)).size);
  const errors = $derived(consoleLog.entries.filter((e) => e.level === 'error').length);
</script>

<footer class="statusbar">
  <div class="sb-group">
    <div class="sb-item">
      <span class="sb-dot" class:paused={!clock.state.playing}></span>
      <span class="num">{bpmStr}</span>
      <span class="dim">BPM</span>
    </div>
    <span class="sb-sep">│</span>
    <div class="sb-item" title="bar.beat (Ableton-style, 1-indexed)">
      <span class="dim">bar.beat</span> <span class="num">{posStr}</span>
    </div>
    <span class="sb-sep">│</span>
    <div class="sb-item">
      <span class="dim">scene</span> <span class="accent">{sceneName}</span>
    </div>
    <span class="sb-sep">│</span>
    <div class="sb-item">
      <span class="dim">runtimes</span> <span class="num">{activeRuntimes}</span>
    </div>
  </div>

  <div class="sb-group">
    <div class="sb-item">
      <span class="dim">devices</span> <span class="num">0</span>
    </div>
    <span class="sb-sep">│</span>
    <div class="sb-item">
      <span class="dim">errors</span>
      <span class="num" style="color: {errors ? 'var(--red)' : 'var(--text-faint)'}">{errors}</span>
    </div>
    <span class="sb-sep">│</span>
    <div class="sb-item">
      <span class="dim">kanopi</span>
      <span class="num">v0.1.0</span><span class="dim">-alpha</span>
    </div>
  </div>
</footer>

<style>
  .statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 0 16px;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-muted);
    letter-spacing: 0.06em;
  }

  .sb-group { display: flex; align-items: center; gap: 18px; }
  .sb-item { display: flex; align-items: center; gap: 6px; }

  .sb-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--amber);
    box-shadow: 0 0 5px var(--amber-glow);
    animation: sb-pulse 0.47s ease-out infinite;
  }
  .sb-dot.paused {
    background: var(--text-faint);
    box-shadow: none;
    animation: none;
  }

  @keyframes sb-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.85); }
  }

  .sb-item .accent { color: var(--amber); }
  .sb-item .dim { color: var(--text-dim); }
  .sb-item .num { color: var(--text); font-variant-numeric: tabular-nums; }
  .sb-sep { color: var(--text-faint); }
</style>
