<script lang="ts">
  import { STARTERS, type Starter } from '../../lib/library/starters';
  import { catalog } from '../../lib/library/audio-banks';
  import { visualsCatalog, type VisualItem } from '../../lib/library/visuals';
  import { workspace } from '../../stores/workspace.svelte';
  import { ui } from '../../stores/ui.svelte';
  import { openBlocks } from '../../stores/blocks.svelte';
  import { core } from '../../lib/core';
  import { tick } from 'svelte';

  async function load(s: Starter) {
    // Swap scenes without stopping the clock (see LibrarySpace.load for the full
    // rationale): silence + disarm the outgoing scene, load, then arm + play the
    // incoming one on the live clock — no stop/restart race, no stuck "Playing".
    await core.silenceRuntimes();
    openBlocks.disarmAll();
    const focusId = workspace.loadFiles(s.files, s.sessionFile);
    // The Library is a launcher, not a workspace: land back in Files so the
    // loaded session + its files are in front of you (self-test 3.1).
    ui.activeActivityView = 'files';
    // Load = PRODUCE, not play (Romain's produce/play split): derive the scene
    // (structure shows + tempo adopted) and arm it so Play sounds it — but don't
    // start the transport on load.
    if (focusId) {
      await tick();
      await openBlocks.produceLoadedProgram(focusId);
    }
  }

  function loadVisual(v: VisualItem) {
    // Extension picked from the item's first runtime. `.hydra` for Hydra
    // snippets, `.p5` for p5, etc. — runtimeFromExt maps them back.
    // Non-destructive: the current workspace is preserved.
    const ext = v.runtimes[0] ?? 'hydra';
    const id = workspace.addFile(`${v.id}.${ext}`, v.content);
    workspace.openFile(id);
    ui.activeActivityView = 'files';
  }
</script>

<div class="wrap">
  <h3 class="section-title">Starter workspaces</h3>
  <p class="intro">Pick one to replace the current files and open its session.</p>
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

  <h3 class="section-title">Visuals</h3>
  <p class="intro">
    Hydra snippets loaded as a new <code>.hydra</code> file in the current workspace.
  </p>
  <ul class="list">
    {#each visualsCatalog.items as v (v.id)}
      <li class="card">
        <header>
          <span class="name">{v.name}</span>
          <span class="tag">{v.id}</span>
        </header>
        <p class="desc">{v.description}</p>
        {#if v.tags?.length}
          <div class="tags">
            {#each v.tags as t (t)}<span class="chip">{t}</span>{/each}
          </div>
        {/if}
        <button type="button" class="load" onclick={() => loadVisual(v)}>load</button>
      </li>
    {/each}
  </ul>

  <h3 class="section-title">Audio banks</h3>
  <p class="intro">
    Declared in a <code>.kanopi</code> session with
    <code>@library &lt;id&gt;</code>. Loaded on the fly by the Strudel adapter.
  </p>
  <ul class="list">
    {#each catalog.items as b (b.id)}
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
    padding: 14px 14px 22px;
  }
  .intro {
    color: var(--text-dim);
    font-size: 11.5px;
    line-height: 1.65;
    margin: 0 0 16px;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }
  .card {
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 14px 16px;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .name {
    color: var(--text);
    font-size: 13px;
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
    font-size: 11.5px;
    line-height: 1.6;
    margin: 0;
  }
  .load {
    align-self: flex-start;
    padding: 5px 12px;
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
    margin: 22px 0 8px;
    font-size: 9.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-dim);
    font-weight: 500;
  }
  .section-title:first-child {
    margin-top: 0;
  }
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
