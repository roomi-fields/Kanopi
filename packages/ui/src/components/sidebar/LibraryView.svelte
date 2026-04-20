<script lang="ts">
  import { STARTERS, type Starter } from '../../lib/library/starters';
  import { catalog } from '../../lib/library/audio-banks';
  import { workspace } from '../../stores/workspace.svelte';

  function load(s: Starter) {
    const ok = confirm(
      `Load "${s.name}"?\n\nThis replaces every file in the current workspace.`
    );
    if (!ok) return;
    workspace.loadFiles(s.files, s.sessionFile);
  }
</script>

<div class="wrap">
  <h3 class="section-title">Starter workspaces</h3>
  <p class="intro">
    Pick one to replace the current files and open its session.
  </p>
  <ul class="list">
    {#each STARTERS as s (s.id)}
      <li class="card">
        <header>
          <span class="name">{s.name}</span>
          <span class="tag">{s.tagline}</span>
        </header>
        <p class="desc">{s.description}</p>
        <button type="button" class="load" onclick={() => load(s)}>load</button>
      </li>
    {/each}
  </ul>

  <h3 class="section-title">Audio banks</h3>
  <p class="intro">
    Declared in a <code>.kanopi</code> session with
    <code>@library &lt;id&gt;</code>. Loaded on the fly by the Strudel adapter.
  </p>
  <ul class="list">
    {#each catalog.banks as b (b.id)}
      <li class="card">
        <header>
          <span class="name">{b.name}</span>
          <span class="tag">{b.id}</span>
        </header>
        <p class="desc">{b.description}</p>
        <span class="source" title={b.source}>{b.source}</span>
        {#if b.tags?.length}
          <div class="tags">
            {#each b.tags as t (t)}<span class="chip">{t}</span>{/each}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</div>

<style>
  .wrap {
    padding: 10px 12px 16px;
  }
  .intro {
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.55;
    margin: 0 0 12px;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .card {
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 10px 12px;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .name {
    color: var(--text);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.04em;
  }
  .tag {
    color: var(--amber);
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: lowercase;
  }
  .desc {
    color: var(--text-muted);
    font-size: 10.5px;
    line-height: 1.5;
    margin: 0;
  }
  .load {
    align-self: flex-start;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 2px;
    background: var(--elevated);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    cursor: pointer;
    transition: all 0.15s;
  }
  .load:hover {
    color: var(--amber);
    border-color: var(--amber);
  }
  .section-title {
    margin: 12px 0 4px;
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-dim);
    font-weight: 500;
  }
  .section-title:first-child { margin-top: 0; }
  .source {
    font-family: var(--font-mono);
    font-size: 9.5px;
    color: var(--text-faint);
    padding: 2px 4px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 2px;
    align-self: flex-start;
    word-break: break-all;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }
  .chip {
    font-size: 9px;
    padding: 1px 6px;
    border-radius: 2px;
    background: rgba(232, 156, 62, 0.08);
    color: var(--amber);
    letter-spacing: 0.06em;
  }
  code {
    font-family: var(--font-mono);
    font-size: 10.5px;
    background: rgba(255, 255, 255, 0.04);
    padding: 1px 3px;
    border-radius: 2px;
  }
</style>
