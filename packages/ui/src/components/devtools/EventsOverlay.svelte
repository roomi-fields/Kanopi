<script lang="ts">
  import { onMount } from 'svelte';
  import { core } from '../../lib/core';
  import type { KanopiEvent, EventType } from '../../lib/events/types';

  const MAX = 50;
  type Row = { id: number; e: KanopiEvent };
  let entries = $state<Row[]>([]);
  let paused = $state(false);
  let filterType = $state<EventType | 'all'>('all');
  let filterRuntime = $state<string>('all');
  let nextId = 0;

  onMount(() => {
    const off = core.events.onAny((e) => {
      if (paused) return;
      const id = nextId++;
      entries = [{ id, e }, ...entries].slice(0, MAX);
    });
    return off;
  });

  const filtered = $derived(
    entries.filter(
      (r) =>
        (filterType === 'all' || r.e.type === filterType) &&
        (filterRuntime === 'all' || r.e.runtime === filterRuntime)
    )
  );

  function summarize(e: KanopiEvent): string {
    switch (e.type) {
      case 'beat':
        return `#${e.count} bpm=${e.bpm.toFixed(0)} phase=${e.phase.toFixed(2)}`;
      case 'bar':
        return `#${e.count}`;
      case 'transport':
        return `${e.playing ? 'PLAY' : 'STOP'} @ ${e.bpm.toFixed(0)}bpm`;
      case 'trigger':
        return e.name;
      case 'token':
        return `${e.name}${e.pitch !== undefined ? ` p${e.pitch}` : ''} d${e.duration.toFixed(0)}ms${e.locations ? ` [${e.locations.length} loc]` : ''}`;
      case 'flag':
        return `${e.name}=${String(e.value)}`;
      case 'audio-attach':
        return `fft=${e.analyser.fftSize}`;
      case 'audio-detach':
        return '—';
    }
  }

  function clear() {
    entries = [];
  }
</script>

<div class="overlay">
  <header>
    <span class="title">events</span>
    <select bind:value={filterType}>
      <option value="all">all types</option>
      <option value="beat">beat</option>
      <option value="bar">bar</option>
      <option value="transport">transport</option>
      <option value="trigger">trigger</option>
      <option value="token">token</option>
      <option value="flag">flag</option>
      <option value="audio-attach">audio-attach</option>
      <option value="audio-detach">audio-detach</option>
    </select>
    <select bind:value={filterRuntime}>
      <option value="all">all rt</option>
      <option value="clock">clock</option>
      <option value="strudel">strudel</option>
      <option value="hydra">hydra</option>
      <option value="js">js</option>
      <option value="tidal">tidal</option>
    </select>
    <button onclick={() => (paused = !paused)} class:paused>
      {paused ? 'resume' : 'pause'}
    </button>
    <button onclick={clear}>clear</button>
    <span class="count">{filtered.length}/{entries.length}</span>
  </header>
  <ul>
    {#each filtered as row (row.id)}
      <li>
        <span class="t">{row.e.t.toFixed(0)}</span>
        <span class="rt rt-{row.e.runtime}">{row.e.runtime}</span>
        <span class="type type-{row.e.type}">{row.e.type}</span>
        <span class="sum">{summarize(row.e)}</span>
      </li>
    {/each}
  </ul>
</div>

<style>
  .overlay {
    position: fixed;
    right: 8px;
    bottom: 40px;
    width: 360px;
    max-height: 50vh;
    background: var(--elevated);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-family: var(--font-mono, monospace);
    font-size: 10.5px;
    color: var(--text);
    display: flex;
    flex-direction: column;
    z-index: 9999;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.45);
  }
  header {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border-dim);
    background: var(--panel);
    font-size: 10px;
  }
  .title {
    color: var(--amber);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-right: auto;
  }
  select, button {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border-dim);
    font-size: 10px;
    padding: 2px 4px;
    border-radius: 2px;
    font-family: inherit;
    cursor: pointer;
  }
  button.paused {
    color: var(--amber);
    border-color: var(--amber);
  }
  .count {
    color: var(--text-faint);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;
  }
  li {
    display: grid;
    grid-template-columns: 44px 56px 80px 1fr;
    gap: 4px;
    padding: 2px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    white-space: nowrap;
    overflow: hidden;
  }
  .t { color: var(--text-faint); text-align: right; }
  .rt { color: var(--text-muted); }
  .rt-clock { color: var(--cyan); }
  .rt-strudel { color: var(--amber); }
  .rt-hydra { color: var(--hydra, #e865b7); }
  .type { color: var(--text); font-weight: 500; }
  .type-beat, .type-bar { color: var(--cyan); }
  .type-transport { color: var(--amber-soft, #f0c27b); }
  .type-token { color: var(--green); }
  .type-trigger { color: var(--amber); }
  .sum { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; }
</style>
