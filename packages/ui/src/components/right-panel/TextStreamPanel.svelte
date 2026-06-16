<script lang="ts">
  import { production } from '../../stores/production.svelte';
  import { orderedTokensFromTree } from '../../lib/text-order/bpx-tree-canonical';

  // TEXT-BY-ORDER view: the full derived production shown by ORDER (not by time).
  // The sequence of produced symbols, structure preserved, no metric expansion.
  // The ordered list comes from bpscript's SHARED `tokenizeOrder` applied to the
  // canonical serialization of the BPx derivation tree — symbols/rests/structure
  // only (inline controls + `=`/`:` markers are not in the tree, out of scope).
  //
  // A backtick-only voice (Strudel/Hydra) derives no tree, so this degrades to a
  // graceful "no symbolic production" state rather than erroring.
  const set = $derived(production.current);
  const tokens = $derived(
    set?.tree ? orderedTokensFromTree(set.tree, set.rawTokens ?? [], set.symbolNames) : []
  );
</script>

<div class="textorder">
  <header class="hdr">
    <span class="count">
      {#if set && tokens.length > 0}
        {tokens.length} tokens · {set.source} · by order
      {:else}
        production
      {/if}
    </span>
  </header>

  {#if !set || tokens.length === 0}
    <div class="empty">
      No symbolic production by order. Evaluate a BP3/BPScript grammar (notes, bols, words, numbers)
      to see its full derived sequence here, read left-to-right.
    </div>
  {:else}
    <div class="scroll">
      <div class="tokens">
        {#each tokens as tok, i (i)}
          <span class="tok" class:rest={tok === '-'} class:prolong={tok === '_'}>{tok}</span>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .textorder {
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
    padding: 12px;
    font-family: var(--font-code);
    font-size: 13px;
  }
  .tokens {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    line-height: 1.8;
  }
  .tok {
    color: var(--amber);
    font-weight: 500;
    padding: 0 2px;
  }
  /* A silence reads dimmer than a sounding token. */
  .tok.rest {
    color: var(--text-dim);
    font-weight: 400;
  }
  /* A prolongation marker is structural, dimmer still. */
  .tok.prolong {
    color: var(--text-faint);
    font-weight: 400;
  }
</style>
