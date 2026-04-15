<script lang="ts">
  import { tick } from 'svelte';
  import { consoleLog } from '../../stores/console.svelte';

  let scroller: HTMLDivElement;
  let justCopiedId = $state<string | null>(null);

  async function copyEntry(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      justCopiedId = id;
      setTimeout(() => {
        if (justCopiedId === id) justCopiedId = null;
      }, 1000);
    } catch {
      /* ignore */
    }
  }

  async function copyAll() {
    const text = consoleLog.entries
      .map((e) => `${new Date(e.ts).toISOString()} [${e.runtime}] ${e.level} ${e.msg}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      justCopiedId = '__all__';
      setTimeout(() => {
        if (justCopiedId === '__all__') justCopiedId = null;
      }, 1000);
    } catch {
      /* ignore */
    }
  }

  $effect(() => {
    void consoleLog.entries.length;
    tick().then(() => {
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
  });

  function fmtTime(ts: number) {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  }
</script>

<div class="console">
  <header class="hdr">
    <span class="count">{consoleLog.entries.length} entries</span>
    <div class="actions">
      <button class="action" type="button" title="Copy all entries" onclick={copyAll}>
        {justCopiedId === '__all__' ? 'copied' : 'copy all'}
      </button>
      <button class="action" type="button" onclick={() => consoleLog.clear()}>clear</button>
    </div>
  </header>
  <div class="scroll" bind:this={scroller}>
    {#each consoleLog.entries as e, i (e.ts + ':' + i)}
      {@const id = e.ts + ':' + i}
      <div class="row level-{e.level}">
        <span class="time">{fmtTime(e.ts)}</span>
        <span class="rt rt-{e.runtime}">{e.runtime}</span>
        <span class="msg">{e.msg}</span>
        <button
          class="copy"
          type="button"
          title="Copy message"
          onclick={() => copyEntry(id, e.msg)}
        >
          {#if justCopiedId === id}
            ✓
          {:else}
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
              <rect x="3" y="3" width="7" height="8" rx="1" />
              <path d="M2 8 L2 2 Q2 1 3 1 L8 1" />
            </svg>
          {/if}
        </button>
      </div>
    {/each}
  </div>
</div>

<style>
  .console { display: flex; flex-direction: column; height: 100%; }
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
  .actions { display: flex; gap: 10px; }
  .action { color: var(--text-dim); font-size: 9px; letter-spacing: 0.16em; }
  .action:hover { color: var(--amber); }
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
    font-family: var(--font-code);
    font-size: 10.5px;
    line-height: 1.5;
  }
  .row {
    display: grid;
    grid-template-columns: 56px 60px 1fr auto;
    gap: 8px;
    padding: 1px 12px;
    align-items: center;
  }
  .row:hover { background: rgba(255, 255, 255, 0.02); }
  .copy {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    color: var(--text-faint);
    opacity: 0;
    transition: all 0.15s;
    font-size: 10px;
  }
  .row:hover .copy { opacity: 1; }
  .copy:hover { color: var(--amber); background: var(--elevated); }
  .time { color: var(--text-faint); font-variant-numeric: tabular-nums; }
  .rt { text-transform: uppercase; letter-spacing: 0.1em; font-size: 9px; align-self: center; }
  .rt-tidal { color: var(--tidal); }
  .rt-sc { color: var(--sc); }
  .rt-hydra { color: var(--hydra); }
  .rt-strudel { color: var(--tidal); }
  .rt-python { color: var(--python); }
  .rt-kanopi { color: var(--kanopi); }
  .rt-js { color: var(--cyan); }
  .rt-system { color: var(--text-dim); }
  .msg { color: var(--text-muted); }
  .level-warn .msg { color: var(--amber-soft); }
  .level-error .msg { color: var(--red); }
</style>
