<script lang="ts">
  import { tick } from 'svelte';
  import { textStream } from '../../stores/textstream.svelte';

  let scroller = $state<HTMLDivElement>();

  // Follow the tail as new symbols stream in.
  $effect(() => {
    void textStream.symbols.length;
    tick().then(() => {
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
  });

  function fmtOnset(sec: number) {
    return `${sec.toFixed(2)}s`;
  }
</script>

<div class="textstream">
  <header class="hdr">
    <span class="count">
      {textStream.symbols.length} symbols{#if textStream.source}
        · {textStream.source}{/if}
    </span>
    <button class="action" type="button" onclick={() => textStream.clear()}>clear</button>
  </header>

  {#if textStream.symbols.length === 0}
    <div class="empty">
      No symbols yet. Evaluate a text grammar (bols, words, numbers) to stream its terminals here.
    </div>
  {:else}
    <div class="scroll" bind:this={scroller}>
      {#each textStream.symbols as s (s.seq)}
        <div class="row">
          <span class="onset">{fmtOnset(s.startSec)}</span>
          <span class="sym">{s.token}</span>
          <span class="dur">{fmtOnset(s.durSec)}</span>
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
  .action {
    color: var(--text-dim);
    font-size: 9px;
    letter-spacing: 0.16em;
  }
  .action:hover {
    color: var(--amber);
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
  .dur {
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
    font-size: 10px;
    text-align: right;
  }
</style>
