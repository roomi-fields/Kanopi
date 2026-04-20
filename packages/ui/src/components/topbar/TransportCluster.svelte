<script lang="ts">
  import { clock } from '../../stores/clock.svelte';

  function fmt2(n: number) {
    return n.toString().padStart(2, '0');
  }
  function fmt3(n: number) {
    return n.toString().padStart(3, '0');
  }

  const bpmInt = $derived(Math.floor(clock.state.bpm));
  const bpmDec = $derived(((clock.state.bpm - bpmInt) * 10).toFixed(0));
  const barStr = $derived(fmt3(clock.state.bar));
  const beatStr = $derived(fmt2(clock.state.beat + 1));
  const phaseStr = $derived('.' + fmt2(Math.floor(clock.state.phase * 100)));
  // One dot per beat in the current time signature. Driven by `beatsPerBar`
  // so `@time 3/4` shows 3 dots, `@time 7/8` shows 7, etc.
  const dots = $derived(Array.from({ length: clock.state.beatsPerBar || 4 }, (_, i) => i));
</script>

<div class="transport-cluster">
  <button class="tbtn" type="button" title="Stop" onclick={() => clock.stop()}>
    <svg viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="8" height="8" rx="0.5" /></svg>
  </button>
  <button
    class="tbtn"
    class:playing={clock.state.playing}
    type="button"
    title={clock.state.playing ? 'Playing' : 'Play'}
    onclick={() => clock.play()}
  >
    <svg viewBox="0 0 12 12" fill="currentColor"><path d="M2.5 1.5 L10 6 L2.5 10.5 Z" /></svg>
  </button>

  <div class="bpm-module">
    <span class="bpm-value">{bpmInt}<span class="decimal">.{bpmDec}</span></span>
    <span class="bpm-label">BPM</span>
  </div>

  <button class="tap-btn" type="button" onclick={() => clock.tap()}>TAP</button>

  <div class="beat-meter">
    <div class="beat-dots">
      {#each dots as i (i)}
        <span class="beat-dot" class:active={i === clock.state.beat && clock.state.playing}></span>
      {/each}
    </div>
    <span class="beat-counter">{barStr}<span class="sep">·</span>{beatStr}<span class="dim">{phaseStr}</span></span>
  </div>
</div>

<style>
  .transport-cluster {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 6px 16px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.2);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  }

  .tbtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 3px;
    color: var(--text-muted);
    transition: all 0.15s;
    position: relative;
  }

  .tbtn:hover { color: var(--text); background: var(--elevated); }

  .tbtn.playing {
    color: var(--amber);
    background: rgba(232, 156, 62, 0.12);
    box-shadow: 0 0 0 1px rgba(232, 156, 62, 0.2), inset 0 0 8px rgba(232, 156, 62, 0.08);
  }

  .tbtn svg { width: 11px; height: 11px; }

  .bpm-module {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding-left: 10px;
    border-left: 1px solid var(--border);
  }

  .bpm-value {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 22px;
    color: var(--amber);
    letter-spacing: -0.02em;
    text-shadow: 0 0 10px var(--amber-glow);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .bpm-value :global(.decimal) { font-size: 15px; opacity: 0.75; }

  .bpm-label {
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 500;
    color: var(--text-dim);
    letter-spacing: 0.2em;
  }

  .tap-btn {
    padding: 5px 9px;
    font-size: 9px;
    letter-spacing: 0.22em;
    font-weight: 500;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 2px;
    transition: all 0.15s;
  }

  .tap-btn:hover { color: var(--amber); border-color: var(--amber-dim); }

  .beat-meter {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-left: 10px;
    border-left: 1px solid var(--border);
  }

  .beat-dots { display: flex; gap: 4px; }

  .beat-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--border);
    transition: all 0.1s;
  }

  .beat-dot.active {
    background: var(--amber);
    box-shadow: 0 0 6px var(--amber-glow);
    animation: beat-pulse 0.3s ease-out;
  }

  .beat-counter {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.05em;
  }

  .beat-counter :global(.sep) { color: var(--text-faint); margin: 0 3px; }
  .beat-counter :global(.dim) { color: var(--text-dim); }
</style>
