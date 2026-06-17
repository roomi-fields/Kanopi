<script lang="ts">
  import { clock } from '../../stores/clock.svelte';
  import { bpsScenes } from '../../stores/bpsScenes.svelte';
  import { production, beatCount } from '../../stores/production.svelte';
  import { workspace } from '../../stores/workspace.svelte';
  import { transport } from '../../stores/transport.svelte';

  // STEP lives in the transport cluster (beta issue 4 — transport buttons
  // grouped). It's driven off the PRODUCED timeline, not the `.bps` head rule, so
  // it enables for ANY runtime whose last eval produced a timeline — BP3 `.gr`,
  // backtick `.bps`, plain `.bps` alike. The STEP unit is one clock beat
  // (`beatDurSec = 60/bpm`); the button shows when the production spans more than
  // one beat. STEP re-evaluates the ACTIVE file beat by beat.
  const activeFile = $derived(
    workspace.activeTabId ? workspace.fileById(workspace.activeTabId) : undefined
  );
  const beats = $derived.by(() => {
    const cur = production.current;
    if (!cur) return 0;
    return beatCount(cur.durationSec, cur.beatDurSec);
  });
  const canStep = $derived(beats > 1);

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

  // Manual BPM entry (self-test 4.3 — TAP worked but you couldn't type a tempo).
  // Click the value → edit in place → Enter applies, Escape cancels.
  let editing = $state(false);
  let draft = $state('');

  function startEdit() {
    draft = clock.state.bpm.toFixed(1);
    editing = true;
  }
  function applyEdit() {
    // Guard the blur that fires right after Enter/Escape already closed the
    // field — otherwise Escape's cancel gets overridden by an apply-on-blur.
    if (!editing) return;
    editing = false;
    const n = parseFloat(draft.replace(',', '.'));
    if (!Number.isNaN(n)) clock.setBpm(Math.min(400, Math.max(20, n)));
  }
  function cancelEdit() {
    editing = false; // the ensuing blur calls applyEdit, but the !editing guard skips it
  }
  function focusSelect(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<div class="transport-cluster">
  <div class="transport-buttons">
    <button class="tbtn" type="button" title="Stop" onclick={() => clock.stop()}>
      <svg viewBox="0 0 12 12" fill="currentColor"
        ><rect x="2" y="2" width="8" height="8" rx="0.5" /></svg
      >
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
    <button
      class="tbtn"
      class:paused={clock.state.paused}
      type="button"
      title={clock.state.paused ? 'Paused' : 'Pause'}
      onclick={() => clock.pause()}
    >
      <svg viewBox="0 0 12 12" fill="currentColor"
        ><rect x="2.5" y="2" width="2.5" height="8" rx="0.5" /><rect
          x="7"
          y="2"
          width="2.5"
          height="8"
          rx="0.5"
        /></svg
      >
    </button>
    {#if canStep && activeFile}
      <button
        class="step-btn"
        type="button"
        title="STEP — beat suivant"
        onclick={() =>
          bpsScenes.stepActive({
            runtime: activeFile.runtime,
            name: activeFile.name,
            contents: activeFile.contents
          })}
      >
        STEP
      </button>
    {/if}
    <button
      class="toggle-btn"
      class:on={transport.loop}
      type="button"
      title={transport.loop
        ? 'Boucle ON — la scène se répète à chaque tour'
        : 'Boucle OFF — la scène joue une fois puis s’arrête'}
      aria-pressed={transport.loop}
      onclick={() => transport.toggleLoop()}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
        <path d="M4 6.5 A4 4 0 1 1 4 9.5" stroke-linecap="round" />
        <path d="M4 4 L4 7 L7 7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <button
      class="toggle-btn rnd"
      class:on={transport.reRandom}
      type="button"
      disabled={!transport.loop}
      title={transport.reRandom
        ? 'Re-random ON — re-tire les règles aléatoires à chaque tour'
        : 'Re-random OFF — rejoue la même dérivation à chaque tour'}
      aria-pressed={transport.reRandom}
      onclick={() => transport.toggleReRandom()}
    >
      🎲
    </button>
  </div>

  <div class="bpm-module">
    {#if editing}
      <input
        class="bpm-input"
        type="text"
        inputmode="decimal"
        aria-label="BPM"
        bind:value={draft}
        use:focusSelect
        onkeydown={(e) => {
          if (e.key === 'Enter') applyEdit();
          else if (e.key === 'Escape') cancelEdit();
        }}
        onblur={applyEdit}
      />
    {:else}
      <button
        class="bpm-value-btn"
        type="button"
        title="Cliquer pour saisir le BPM"
        onclick={startEdit}
      >
        <span class="bpm-value">{bpmInt}<span class="decimal">.{bpmDec}</span></span>
      </button>
    {/if}
    <span class="bpm-label">BPM</span>
  </div>

  <button class="tap-btn" type="button" onclick={() => clock.tap()}>TAP</button>

  <div class="beat-meter">
    <div class="beat-dots">
      {#each dots as i (i)}
        <span class="beat-dot" class:active={i === clock.state.beat && clock.state.playing}></span>
      {/each}
    </div>
    <span class="beat-counter"
      >{barStr}<span class="sep">·</span>{beatStr}<span class="dim">{phaseStr}</span></span
    >
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

  .transport-buttons {
    display: flex;
    align-items: center;
    gap: 4px;
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

  .step-btn {
    padding: 6px 10px;
    font-size: 9px;
    letter-spacing: 0.22em;
    font-weight: 500;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 3px;
    transition: all 0.15s;
  }
  .step-btn:hover {
    color: var(--amber);
    border-color: var(--amber-dim);
  }

  /* LOOP + RE-RANDOM toggles: same footprint as the transport icon buttons,
     lit amber when ON (matching the `.playing` glow), dim when OFF. */
  .toggle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 3px;
    color: var(--text-muted);
    border: 1px solid var(--border);
    transition: all 0.15s;
  }
  .toggle-btn svg {
    width: 14px;
    height: 14px;
  }
  .toggle-btn.rnd {
    font-size: 13px;
    line-height: 1;
    filter: grayscale(1) opacity(0.6);
  }
  .toggle-btn:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--amber-dim);
  }
  .toggle-btn.on {
    color: var(--amber);
    border-color: var(--amber-dim);
    background: rgba(232, 156, 62, 0.12);
    box-shadow:
      0 0 0 1px rgba(232, 156, 62, 0.2),
      inset 0 0 8px rgba(232, 156, 62, 0.08);
  }
  .toggle-btn.rnd.on {
    filter: none;
  }
  .toggle-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .tbtn:hover {
    color: var(--text);
    background: var(--elevated);
  }

  .tbtn.playing {
    color: var(--amber);
    background: rgba(232, 156, 62, 0.12);
    box-shadow:
      0 0 0 1px rgba(232, 156, 62, 0.2),
      inset 0 0 8px rgba(232, 156, 62, 0.08);
  }

  /* Paused: transport halted at position (≠ stop, which zeroes it). A dimmer,
     blinking amber so it's visually distinct from the steady "playing" glow. */
  .tbtn.paused {
    color: var(--amber);
    background: rgba(232, 156, 62, 0.08);
    box-shadow: 0 0 0 1px rgba(232, 156, 62, 0.18);
    animation: pause-blink 1.1s ease-in-out infinite;
  }

  @keyframes pause-blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.45;
    }
  }

  .tbtn svg {
    width: 11px;
    height: 11px;
  }

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

  .bpm-value :global(.decimal) {
    font-size: 15px;
    opacity: 0.75;
  }

  .bpm-value-btn {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    line-height: 1;
  }
  .bpm-value-btn:hover .bpm-value {
    text-shadow: 0 0 14px var(--amber-glow);
  }

  .bpm-input {
    width: 54px;
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 22px;
    color: var(--amber);
    background: var(--bg);
    border: 1px solid var(--amber-dim);
    border-radius: 2px;
    padding: 0 2px;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

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

  .tap-btn:hover {
    color: var(--amber);
    border-color: var(--amber-dim);
  }

  .beat-meter {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-left: 10px;
    border-left: 1px solid var(--border);
  }

  .beat-dots {
    display: flex;
    gap: 4px;
  }

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

  .beat-counter :global(.sep) {
    color: var(--text-faint);
    margin: 0 3px;
  }
  .beat-counter :global(.dim) {
    color: var(--text-dim);
  }
</style>
