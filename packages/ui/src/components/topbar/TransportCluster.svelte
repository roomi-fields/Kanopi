<script lang="ts">
  import { clock } from '../../stores/clock.svelte';
  import { workspace } from '../../stores/workspace.svelte';
  import { transport } from '../../stores/transport.svelte';
  import { playback } from '../../stores/playback.svelte';
  import { setTempo, tapTempo } from '../../lib/commands/tempo';
  import { produceActiveScene } from '../../lib/commands/produce';
  import { kronosCursor } from '../../stores/kronos-cursor.svelte';
  import { fmt2, fmt3 } from '../../lib/format/bar-beat';
  import { isNonProgramFile } from '../../lib/workspace/types';

  // STEP lives in the transport cluster (beta issue 4 — transport buttons grouped).
  // Verdict (b) « battement ÉCRIT » ([496/499]) : step(1) avance d'UN temps d'écriture,
  // référent UNIVERSEL (strié + lisse, temps vide = pas valide silencieux) → la
  // disponibilité du bouton ne dépend PLUS du contenu produit (l'ancien compteur hôte
  // `beatCount(duration/beatDur) > 1` est retiré — c'était un calcul de grille hôte).
  // Critère : un fichier symbolique jouable est actif (même critère que Produce) ; le
  // geste délègue à `playback.step` → `handle.step(1)` (Kronos, autorité du pas).
  const activeFile = $derived(
    workspace.activeTabId ? workspace.fileById(workspace.activeTabId) : undefined
  );
  const canStep = $derived(
    !!activeFile &&
      !isNonProgramFile(activeFile.path) &&
      (activeFile.runtime === 'bpscript' || activeFile.runtime === 'bp3')
  );

  // Play/Produce both target the ACTIVE tab, which must be an actual scene — a
  // library/data file (`libraries/…`, `resources/…`) is never playable; the
  // buttons stay visible but grey out so they keep reading as "act on the
  // active scene" rather than vanishing (Romain).
  const canPlay = $derived(!!activeFile && !isNonProgramFile(activeFile.path));

  // PRODUCE: (re)derive the active scene and refresh its structure, leaving the
  // transport at REST (Romain's produce/play split — produce generates, Play
  // plays). Only a bp3/bpscript program actually derives (Strudel/Hydra have no
  // symbolic production).
  const canProduce = $derived(
    canPlay && !!activeFile && (activeFile.runtime === 'bpscript' || activeFile.runtime === 'bp3')
  );
  // PRODUCE est un geste de BASCULE (même règle « une seule scène sonne » que Play), et ce
  // prélude vit dans `lib/commands/produce` — point d'entrée UNIQUE partagé avec
  // `window.kanopi.produce`. Le tenir ici faisait qu'un banc appelant `produceLoadedProgram`
  // sautait la bascule et mesurait un enchaînement que l'utilisateur ne produit pas ([929]).

  // `null` when nothing is live and the user has typed no tempo (no host-invented default):
  // the readout shows « — » rather than a fabricated number.
  const hasBpm = $derived(clock.state.bpm != null);
  const bpmInt = $derived(clock.state.bpm != null ? Math.floor(clock.state.bpm) : 0);
  const bpmDec = $derived(
    clock.state.bpm != null ? ((clock.state.bpm - bpmInt) * 10).toFixed(0) : '0'
  );
  const bpb = $derived(clock.state.beatsPerBar || 4);

  // Position shown by the meter + the 4 LEDs, taken from Kronos's Transport (the single
  // position authority), sampled per-frame into `kronosCursor.beat` (frozen-aware: the
  // live audio beat while playing, the committed beat while paused/stepped). `null` =
  // stopped / no scene → rest readout (bar 1, beat 0, phase 0 → "001·01.00", B16).
  const pos = $derived(kronosCursor.beat ?? { bar: 1, beat: 0, phase: 0 });
  const barStr = $derived(fmt3(pos.bar));
  const beatStr = $derived(fmt2(pos.beat + 1));
  const phaseStr = $derived('.' + fmt2(Math.floor(pos.phase * 100)));
  // One dot per beat in the time signature; the lit one is the machine's active
  // beat (−1 = none when stopped). Driven by `beatsPerBar` (`@time 7/8` → 7 dots).
  const dots = $derived(Array.from({ length: bpb }, (_, i) => i));
  const ledBeat = $derived(playback.mode === 'stopped' ? -1 : pos.beat);

  // Manual BPM entry (self-test 4.3 — TAP worked but you couldn't type a tempo).
  // Click the value → edit in place → Enter applies, Escape cancels.
  let editing = $state(false);
  let draft = $state('');

  function startEdit() {
    // Empty draft when there's no tempo yet (the user is about to type the first one).
    draft = clock.state.bpm != null ? clock.state.bpm.toFixed(1) : '';
    editing = true;
  }
  function applyEdit() {
    // Guard the blur that fires right after Enter/Escape already closed the
    // field — otherwise Escape's cancel gets overridden by an apply-on-blur.
    if (!editing) return;
    editing = false;
    const n = parseFloat(draft.replace(',', '.'));
    if (!Number.isNaN(n)) {
      // Le geste tempo COMPLET (warp des runtimes + report dans la directive de la scène) vit
      // dans `lib/commands/tempo` — point d'entrée UNIQUE partagé avec `window.kanopi.setTempo`.
      // Le composant n'en tient plus la moitié : un banc piloté par l'API mesurait sinon un
      // comportement que ce champ ne produit pas ([927]). `setTempo` est aussi le seul
      // propriétaire de la borne d'entrée ([20,300]) — le composant ne re-borne jamais.
      setTempo(n);
    }
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
    <button
      class="prod-btn"
      type="button"
      disabled={!canProduce}
      title={canProduce
        ? 'PRODUCE — (re)génère la scène (nouveau tirage aléatoire), au repos, prête à jouer'
        : 'PRODUCE — indisponible (l’onglet actif n’est pas une scène bp3/bpscript)'}
      onclick={() => produceActiveScene()}
    >
      PROD
    </button>
    <span class="btn-sep" aria-hidden="true"></span>
    <button class="tbtn" type="button" title="Stop" onclick={() => playback.stop()}>
      <svg viewBox="0 0 12 12" fill="currentColor"
        ><rect x="2" y="2" width="8" height="8" rx="0.5" /></svg
      >
    </button>
    <button
      class="tbtn"
      class:playing={playback.mode === 'playing'}
      type="button"
      disabled={!canPlay}
      title={canPlay
        ? playback.mode === 'playing'
          ? 'Playing'
          : 'Play'
        : 'Play — indisponible (l’onglet actif n’est pas une scène)'}
      onclick={() => playback.play()}
    >
      <svg viewBox="0 0 12 12" fill="currentColor"><path d="M2.5 1.5 L10 6 L2.5 10.5 Z" /></svg>
    </button>
    <button
      class="tbtn"
      class:paused={playback.mode === 'paused'}
      type="button"
      title={playback.mode === 'paused' ? 'Paused' : 'Pause'}
      onclick={() => playback.pause()}
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
    <button
      class="step-btn"
      type="button"
      disabled={!canStep}
      title={canStep
        ? 'STEP — beat suivant'
        : 'STEP — indisponible (l’onglet actif n’est pas une scène bp3/bpscript)'}
      onclick={() => {
        if (!activeFile) return;
        playback.step({
          runtime: activeFile.runtime,
          name: activeFile.name,
          contents: activeFile.contents
        });
      }}
    >
      STEP
    </button>
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
        {#if hasBpm}
          <span class="bpm-value">{bpmInt}<span class="decimal">.{bpmDec}</span></span>
        {:else}
          <span class="bpm-value bpm-empty">—</span>
        {/if}
      </button>
    {/if}
    <span class="bpm-label">BPM</span>
  </div>

  <button class="tap-btn" type="button" onclick={() => tapTempo()}>TAP</button>

  <div class="beat-meter">
    <div class="beat-dots">
      {#each dots as i (i)}
        <span class="beat-dot" class:active={i === ledBeat}></span>
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
  .step-btn:hover:not(:disabled) {
    color: var(--amber);
    border-color: var(--amber-dim);
  }
  .step-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* PRODUCE — the generative gesture; sits FIRST, set apart from the playback
     transport by a divider. Accented (amber border) so it reads as distinct. */
  .prod-btn {
    padding: 6px 10px;
    font-size: 9px;
    letter-spacing: 0.22em;
    font-weight: 600;
    color: var(--amber);
    border: 1px solid var(--amber-dim);
    border-radius: 3px;
    transition: all 0.15s;
  }
  .prod-btn:hover:not(:disabled) {
    background: rgba(232, 156, 62, 0.12);
    border-color: var(--amber);
  }
  .prod-btn:disabled,
  .tbtn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .btn-sep {
    width: 1px;
    align-self: stretch;
    margin: 3px 4px;
    background: var(--border);
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

  .tbtn:hover:not(:disabled) {
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
