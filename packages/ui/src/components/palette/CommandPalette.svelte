<script lang="ts">
  import { tick } from 'svelte';
  import { ui } from '../../stores/ui.svelte';
  import { listCommands, filterCommands, type Command } from '../../lib/commands/registry';

  let query = $state('');
  let selected = $state(0);
  let inputEl: HTMLInputElement | undefined = $state();

  const all = $derived<Command[]>(ui.paletteOpen ? listCommands() : []);
  const filtered = $derived<Command[]>(filterCommands(all, query));

  $effect(() => {
    if (ui.paletteOpen) {
      query = '';
      selected = 0;
      tick().then(() => inputEl?.focus());
    }
  });

  function close() {
    ui.paletteOpen = false;
  }
  function run(c: Command) {
    c.run();
    close();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selected = Math.min(selected + 1, filtered.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selected = Math.max(selected - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = filtered[selected];
      if (c) run(c);
    }
  }
</script>

{#if ui.paletteOpen}
  <div
    class="overlay"
    role="presentation"
    onclick={close}
    onkeydown={(e) => e.key === 'Escape' && close()}
  >
    <div
      class="palette"
      role="dialog"
      aria-label="Command palette"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <input
        bind:this={inputEl}
        bind:value={query}
        oninput={() => (selected = 0)}
        onkeydown={onKey}
        type="text"
        placeholder="Type a command…"
        spellcheck="false"
        autocomplete="off"
      />
      <ul class="results">
        {#if filtered.length === 0}
          <li class="empty">No matching command</li>
        {:else}
          {#each filtered.slice(0, 50) as c, i (c.id)}
            <li>
              <button
                class="row"
                class:selected={i === selected}
                type="button"
                onmouseenter={() => (selected = i)}
                onclick={() => run(c)}
              >
                {#if c.category}<span class="cat">{c.category}</span>{/if}
                <span class="title">{c.title}</span>
                {#if c.hint}<span class="hint">{c.hint}</span>{/if}
              </button>
            </li>
          {/each}
        {/if}
      </ul>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 80px;
    z-index: 1000;
  }
  .palette {
    width: min(560px, 90vw);
    background: var(--elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(232, 156, 62, 0.08);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  input {
    background: transparent;
    border: none;
    outline: none;
    padding: 14px 16px;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 13px;
    border-bottom: 1px solid var(--border);
  }
  input::placeholder { color: var(--text-faint); }
  .results {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    max-height: 50vh;
    overflow-y: auto;
  }
  .row {
    width: 100%;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 14px;
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }
  .row.selected {
    background: rgba(232, 156, 62, 0.1);
    color: var(--text);
  }
  .cat {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--text-dim);
    width: 56px;
  }
  .row.selected .cat { color: var(--amber); }
  .title { flex: 1; }
  .hint {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--text-faint);
  }
  .empty {
    padding: 12px 16px;
    color: var(--text-faint);
    font-size: 11px;
    font-style: italic;
  }
</style>
