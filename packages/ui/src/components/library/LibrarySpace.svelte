<script lang="ts">
  import { library } from '../../stores/library.svelte';
  import { workspace } from '../../stores/workspace.svelte';
  import { ui } from '../../stores/ui.svelte';
  import { openBlocks } from '../../stores/blocks.svelte';
  import { core } from '../../lib/core';
  import { tick } from 'svelte';
  import { CATEGORIES, type LibraryItem, type LibraryCategory } from '../../lib/library/catalog';

  const OUTPUTS = ['audio', 'midi', 'text', 'visual'] as const;
  const LEVELS = ['didactic', 'intermediate', 'advanced'] as const;

  async function load(item: LibraryItem) {
    // Swap scenes WITHOUT stopping the transport clock. Stopping it (`hushAll`)
    // raced the incoming play: `core.clock.stop()` flips the real clock state
    // synchronously but the `clock` store flag mirrors it via an async
    // subscription, so the very next `if (!clock.state.playing)` check still saw
    // "playing" and skipped the restart — the new scene armed onto a clock that
    // was actually stopped → silence + a stuck "Playing" indicator. Instead:
    //   1. silence the outgoing scene's runtimes (audio + backtick) AND disarm
    //      its blocks, leaving the clock running;
    //   2. load the new files;
    //   3. arm + evaluate the new scene on the live clock.
    // From a rest state nothing is playing, so step 1 is a no-op and
    // `playLoadedProgram` starts the clock as before (scenario 1 unchanged).
    await core.silenceRuntimes();
    openBlocks.disarmAll();
    const focusId = workspace.loadFiles(item.files, item.sessionFile);
    // The library is a launcher: land back in the editor with the session open.
    ui.activeActivityView = 'files';
    // Load = PRODUCE, not play (Romain's produce/play split): derive the scene so
    // its structure shows + the tempo (`@mm`) is adopted, and arm it so Play
    // sounds it — but do NOT start the transport on load. `await tick()` flushes
    // the reactive updates from `loadFiles` first so the blocks are re-extractable.
    if (focusId) {
      await tick();
      await openBlocks.produceLoadedProgram(focusId);
    }
  }

  function pickCategory(c: LibraryCategory | 'all') {
    library.setCategory(c);
  }
</script>

<section class="space">
  <!-- Left rail: the five fixed categories + counts, then the auxiliary shelves. -->
  <nav class="rail">
    <h2 class="rail-title">Library</h2>
    <button
      class="cat"
      class:active={library.filters.category === 'all'}
      type="button"
      onclick={() => pickCategory('all')}
    >
      <span class="cat-label">All</span>
      <span class="cat-count">{library.counts.all}</span>
    </button>
    {#each CATEGORIES as c (c.id)}
      <button
        class="cat"
        class:active={library.filters.category === c.id}
        type="button"
        title={c.hint}
        onclick={() => pickCategory(c.id)}
      >
        <span class="cat-label">{c.label}</span>
        <span class="cat-count">{library.counts[c.id]}</span>
      </button>
    {/each}
  </nav>

  <!-- Main: onboarding banner + filter bar + results grid. -->
  <div class="main">
    <!-- 5-minute on-ramp + feedback channel (brief lot 5/7). -->
    <div class="welcome">
      <span class="wave">New to Kanopi?</span>
      <span class="hint">
        Load a <button class="inline-star" type="button" onclick={() => library.toggleShowcase()}
          >★ showcase</button
        > scene and press Ctrl+Enter to hear it. Ctrl+. silences everything.
      </span>
      <a class="feedback" href="mailto:contact@roomi-fields.com?subject=Kanopi beta feedback"
        >Send feedback</a
      >
    </div>
    <header class="bar">
      <input
        class="search"
        type="search"
        placeholder="Search scenes…"
        value={library.filters.query}
        oninput={(e) => library.setQuery(e.currentTarget.value)}
      />
      <select
        class="filter"
        value={library.filters.language}
        onchange={(e) => library.setLanguage(e.currentTarget.value)}
      >
        <option value="all">any language</option>
        {#each library.languages as l (l)}<option value={l}>{l}</option>{/each}
      </select>
      <select
        class="filter"
        value={library.filters.output}
        onchange={(e) =>
          library.setOutput(e.currentTarget.value as (typeof OUTPUTS)[number] | 'all')}
      >
        <option value="all">any output</option>
        {#each OUTPUTS as o (o)}<option value={o}>{o}</option>{/each}
      </select>
      <select
        class="filter"
        value={library.filters.level}
        onchange={(e) => library.setLevel(e.currentTarget.value as (typeof LEVELS)[number] | 'all')}
      >
        <option value="all">any level</option>
        {#each LEVELS as l (l)}<option value={l}>{l}</option>{/each}
      </select>
      <button
        class="star"
        class:on={library.filters.showcaseOnly}
        type="button"
        title="Showcase only"
        onclick={() => library.toggleShowcase()}>★ showcase</button
      >
      <span class="result-count">{library.filtered.length} scenes</span>
    </header>

    {#if library.filtered.length === 0}
      <div class="empty">
        No scene matches these filters. <button type="button" onclick={() => library.reset()}
          >clear filters</button
        >
      </div>
    {:else}
      <div class="grid">
        {#each library.filtered as item (item.id)}
          <article class="card">
            <header class="card-head">
              <span class="name">{item.name}</span>
              {#if item.showcase}<span class="badge-star" title="Showcase">★</span>{/if}
            </header>
            <p class="tagline">{item.tagline}</p>
            <p class="desc">{item.description}</p>
            <div class="meta">
              <span class="chip lang">{item.language}</span>
              {#each item.outputs as o (o)}<span class="chip out">{o}</span>{/each}
              <span class="chip level">{item.level}</span>
            </div>
            <button class="load" type="button" onclick={() => load(item)}>load</button>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .space {
    display: grid;
    grid-template-columns: 180px 1fr;
    height: 100%;
    min-height: 0;
    background: var(--bg);
    overflow: hidden;
  }
  .rail {
    border-right: 1px solid var(--border);
    padding: 14px 10px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rail-title {
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin: 0 6px 12px;
  }
  .cat {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    border-radius: 4px;
    color: var(--text-muted);
    font-size: 12.5px;
    transition: all 0.12s;
  }
  .cat:hover {
    background: rgba(255, 255, 255, 0.03);
    color: var(--text);
  }
  .cat.active {
    background: var(--elevated);
    color: var(--amber);
  }
  .cat-count {
    font-size: 10px;
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }
  .cat.active .cat-count {
    color: var(--amber-soft);
  }
  .main {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .welcome {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 16px;
    background: var(--elevated);
    border-bottom: 1px solid var(--border-dim);
    font-size: 11.5px;
    color: var(--text-muted);
    flex-wrap: wrap;
  }
  .welcome .wave {
    color: var(--amber);
    font-weight: 500;
  }
  .welcome .hint {
    flex: 1;
    min-width: 200px;
  }
  .inline-star {
    color: var(--amber);
    text-decoration: underline;
  }
  .feedback {
    color: var(--cyan);
    text-decoration: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 11px;
  }
  .feedback:hover {
    border-color: var(--cyan);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-dim);
    flex-wrap: wrap;
  }
  .search {
    flex: 1;
    min-width: 160px;
    padding: 6px 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 12.5px;
  }
  .search:focus {
    outline: none;
    border-color: var(--amber-dim);
  }
  .filter {
    padding: 6px 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-muted);
    font-size: 11.5px;
  }
  .star {
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-dim);
    font-size: 11.5px;
  }
  .star.on {
    color: var(--amber);
    border-color: var(--amber-dim);
  }
  .result-count {
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin-left: auto;
  }
  .empty {
    padding: 40px;
    text-align: center;
    color: var(--text-faint);
    font-size: 13px;
  }
  .empty button {
    color: var(--amber);
    text-decoration: underline;
  }
  .grid {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
    align-content: start;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 14px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: border-color 0.12s;
  }
  .card:hover {
    border-color: var(--border-strong, var(--amber-dim));
  }
  .card-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
  }
  .badge-star {
    color: var(--amber);
    font-size: 12px;
  }
  .tagline {
    font-size: 11px;
    color: var(--amber-soft);
    margin: 0;
  }
  .desc {
    font-size: 11.5px;
    line-height: 1.55;
    color: var(--text-muted);
    margin: 0;
    flex: 1;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .chip {
    font-size: 9.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--elevated);
    color: var(--text-dim);
  }
  .chip.lang {
    color: var(--cyan);
  }
  .chip.out {
    color: var(--text-muted);
  }
  .load {
    align-self: flex-start;
    margin-top: 2px;
    padding: 5px 14px;
    border: 1px solid var(--amber-dim);
    border-radius: 4px;
    color: var(--amber);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    transition: all 0.12s;
  }
  .load:hover {
    background: var(--amber);
    color: var(--bg);
  }
</style>
