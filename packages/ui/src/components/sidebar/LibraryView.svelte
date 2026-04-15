<script lang="ts">
  import { STARTERS, type Starter } from '../../lib/library/starters';
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
  <p class="intro">
    Starter workspaces bundled with Kanopi. Pick one to replace the current files
    and open its session.
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
</style>
