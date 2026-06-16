<script lang="ts">
  import { production } from '../../stores/production.svelte';

  // The FULL derived production, shown all-at-once on eval (like BP3): the whole
  // sequence of symbols with their timing, set ONCE by the bp3/bpscript adapter —
  // NOT streamed token-by-token over playback time. A backtick-only voice
  // (Strudel/Hydra) derives no symbols, so the store is empty and the panel shows
  // its graceful "no symbolic production" state.
  const set = $derived(production.current);

  function fmt(sec: number) {
    return `${sec.toFixed(2)}s`;
  }
</script>

<div class="textstream">
  <header class="hdr">
    <span class="count">
      {#if set}
        {set.tokens.length} symbols · {set.source} · {fmt(set.durationSec)}
      {:else}
        production
      {/if}
    </span>
  </header>

  {#if !set || set.tokens.length === 0}
    <div class="empty">
      No symbolic production. Evaluate a BP3/BPScript grammar (notes, bols, words, numbers) to see
      its full derived sequence here.
    </div>
  {:else}
    <div class="scroll">
      {#each set.tokens as s, i (i)}
        <div class="row" class:mute={!s.sounding}>
          <span class="onset">{fmt(s.startSec)}</span>
          <span class="sym">{s.token}</span>
          <span class="dur">{fmt(s.durSec)}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .textstream {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border-dim);
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .empty {
    padding: 18px 16px;
    color: var(--text-faint);
    font-size: 11.5px;
    line-height: 1.6;
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
    font-family: var(--font-code);
    font-size: 12px;
    line-height: 1.6;
  }
  .row {
    display: grid;
    grid-template-columns: 56px 1fr 56px;
    gap: 8px;
    padding: 1px 12px;
    align-items: baseline;
  }
  .row:hover {
    background: rgba(255, 255, 255, 0.02);
  }
  .onset {
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
    font-size: 10px;
  }
  .sym {
    color: var(--amber);
    font-weight: 500;
  }
  /* A non-sounding symbol (text-only terminal) reads dimmer than a sounding one. */
  .row.mute .sym {
    color: var(--text-dim);
    font-weight: 400;
  }
  .dur {
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
    font-size: 10px;
    text-align: right;
  }
</style>
