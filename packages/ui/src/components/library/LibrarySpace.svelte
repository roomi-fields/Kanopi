<script lang="ts">
  import { library } from '../../stores/library.svelte';
  import { workspace } from '../../stores/workspace.svelte';
  import { ui } from '../../stores/ui.svelte';
  import { openBlocks } from '../../stores/blocks.svelte';
  import { core } from '../../lib/core';
  import { tick } from 'svelte';
  import type { LibraryItem, LibraryCategory } from '../../lib/library/catalog';
  import { RESOURCE_FILES, type LibraryFile } from '../../lib/library/resources';

  const OUTPUTS = ['audio', 'midi', 'text', 'visual'] as const;
  const LEVELS = ['didactic', 'intermediate', 'advanced'] as const;

  // Secondary split INSIDE the Factory origin (ESPACE_PERSO_SPEC §10.3): Scenes
  // (starters/démos, the by-theme rail below — commit 89e59c7) vs Libraries
  // (resource catalogs — alphabets, tunings, scales…). Libraries now uses the
  // SAME visual pattern as Scenes (rail of domains + card grid + search) —
  // Romain wants one visual identity for Factory, not two (the former
  // ResourcesView list-of-groups render is retired). Not a rail icon: a
  // section toggle inside this one origin.
  type Section = 'scenes' | 'libraries';
  let section = $state<Section>('scenes');

  // --- Libraries section state (1 card = 1 REAL library file/entry, restructure
  // 2026-07-16: rail by LANGUAGE — see resources.ts header). Rail groups by the
  // LANGUAGE each card belongs to (`language` field: bpscript/bp3/strudel/
  // mercury/hydra/p5/csound/kanopi), derived from the file list itself — no
  // fixed category list, no invented taxonomy (same pattern as the Scenes rail
  // deriving categories from real folders). Variable/function names below kept
  // as `DOMAINS`/`resourceDomain`/`domainLabel` (mechanism reused as-is, only
  // the field it reads changed).
  const DOMAINS: string[] = (() => {
    const seen = new Set<string>();
    for (const f of RESOURCE_FILES) seen.add(f.language);
    return [...seen];
  })();

  // Several languages now group multiple cards each (bp3 alone has ~19) — the
  // per-language rail is no longer singleton noise, so it shows automatically
  // (kept auto: reappears/disappears with the real distribution, no manual flag).
  const SHOW_DOMAIN_RAIL = DOMAINS.length < RESOURCE_FILES.length;

  // Display label for a language key ('bpscript' → 'Bpscript'); title-cased
  // only, no renaming — the key IS the language.
  function domainLabel(d: string): string {
    return d.charAt(0).toUpperCase() + d.slice(1);
  }

  let resourceDomain = $state<string>('all');
  let resourceQuery = $state('');

  function matchesResourceQuery(file: LibraryFile, q: string): boolean {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    const hay = [file.id, file.description ?? '', file.language].join(' ').toLowerCase();
    return hay.includes(needle);
  }

  // Counts respect the search query but not the selected group (same pattern
  // as categoryCounts for Scenes: each rail entry shows how many cards would
  // match if it were picked).
  const resourceCounts = $derived.by(() => {
    const counts: Record<string, number> = { all: 0 };
    for (const d of DOMAINS) counts[d] = 0;
    for (const file of RESOURCE_FILES) {
      if (!matchesResourceQuery(file, resourceQuery)) continue;
      counts.all++;
      counts[file.language]++;
    }
    return counts;
  });

  const filteredResourceFiles = $derived(
    RESOURCE_FILES.filter(
      (file) =>
        (resourceDomain === 'all' || file.language === resourceDomain) &&
        matchesResourceQuery(file, resourceQuery)
    )
  );

  function pickResourceDomain(d: string) {
    resourceDomain = d;
  }

  function resetResourceFilters() {
    resourceDomain = 'all';
    resourceQuery = '';
  }

  // Open a library file as a whole, read-only, in the editor — same as a
  // scene file (workspace.openFile). The VirtualFile is created in memory and
  // reused on subsequent clicks (addFile dedupes by path). Reveals the editor
  // (Now) like loading a scene does (Romain 2026-07-13: opening something to
  // look at it shouldn't stay hidden behind Factory's full-screen panel).
  function openLibraryFile(file: LibraryFile) {
    const path = `resources/${file.language}/${file.id}.json`;
    // Most cards carry a parsed object (pretty-printed on open); a few bp3 `-se`
    // files are the legacy BP2.8 plain-text format and carry the raw text
    // verbatim (resources.ts bp3AuxFile) — shown as-is rather than re-encoded
    // as a JSON string literal.
    const contents = typeof file.data === 'string' ? file.data : JSON.stringify(file.data, null, 2);
    const id = workspace.addFile(path, contents, true);
    workspace.openFile(id);
    ui.activeActivityView = 'now';
  }

  async function load(item: LibraryItem) {
    // Swap scenes WITHOUT a full `hushAll`: silence the outgoing scene's runtimes (audio +
    // backtick) AND disarm its blocks, then load + PRODUCE the new scene. A full hush would
    // tear down the live Kronos handle and churn the reactive graph mid-swap; here we only
    // cut sound + bookkeeping, and the new scene's produce builds its own (stopped) handle.
    await core.silenceRuntimes();
    openBlocks.disarmAll();
    const focusId = workspace.loadFiles(item.files, item.sessionFile);
    // The library is a launcher: on load, land on NOW — you open a scene to PLAY it
    // (Romain, 2026-07-13). Mine is for managing your OWN files, not the landing spot
    // after loading a bundled scene.
    ui.activeActivityView = 'now';
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

<div class="factory">
  <!-- Secondary split (ESPACE_PERSO_SPEC §10.3): Scenes vs Libraries, both
       inside the Factory origin. Not a rail icon — a section toggle. -->
  <div class="section-toggle">
    <button
      type="button"
      class="section-btn"
      class:active={section === 'scenes'}
      onclick={() => (section = 'scenes')}>Scenes</button
    >
    <button
      type="button"
      class="section-btn"
      class:active={section === 'libraries'}
      onclick={() => (section = 'libraries')}>Libraries</button
    >
  </div>

  {#if section === 'libraries'}
    <section class="space">
      <!-- Left rail: the DOMAIN each file DECLARES + counts — SAME pattern as the Scenes rail. -->
      <nav class="rail">
        <button
          class="cat"
          class:active={resourceDomain === 'all'}
          type="button"
          onclick={() => pickResourceDomain('all')}
        >
          <span class="cat-label">All</span>
          <span class="cat-count">{resourceCounts.all}</span>
        </button>
        {#if SHOW_DOMAIN_RAIL}
          {#each DOMAINS as d (d)}
            <button
              class="cat"
              class:active={resourceDomain === d}
              type="button"
              onclick={() => pickResourceDomain(d)}
            >
              <span class="cat-label">{domainLabel(d)}</span>
              <span class="cat-count">{resourceCounts[d]}</span>
            </button>
          {/each}
        {/if}
      </nav>

      <!-- Main: filter bar + results grid — no onboarding banner (read-only catalogs). -->
      <div class="main">
        <header class="bar">
          <input
            class="search"
            type="search"
            placeholder="Search libraries…"
            value={resourceQuery}
            oninput={(e) => (resourceQuery = e.currentTarget.value)}
          />
          <span class="result-count">{filteredResourceFiles.length} files</span>
        </header>

        {#if filteredResourceFiles.length === 0}
          <div class="empty">
            No file matches these filters. <button type="button" onclick={resetResourceFilters}
              >clear filters</button
            >
          </div>
        {:else}
          <div class="grid">
            {#each filteredResourceFiles as file (file.language + ':' + file.id)}
              <article class="card">
                <header class="card-head">
                  <span class="name">{file.name}</span>
                </header>
                {#if file.description}<p class="tagline">{file.description}</p>{/if}
                <div class="meta">
                  <span class="chip lang">{domainLabel(file.language)}</span>
                </div>
                <button class="load" type="button" onclick={() => openLibraryFile(file)}
                  >open</button
                >
              </article>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  {:else}
    <section class="space">
      <!-- Left rail: the five fixed categories + counts, then the auxiliary shelves.
           No rail-title h2 here — the section-toggle button above already reads
           "Scenes"; a second "Library" label directly under it was redundant/confusing
           (Romain 2026-07-14). -->
      <nav class="rail">
        <button
          class="cat"
          class:active={library.filters.category === 'all'}
          type="button"
          onclick={() => pickCategory('all')}
        >
          <span class="cat-label">All</span>
          <span class="cat-count">{library.counts.all}</span>
        </button>
        {#each library.categories as c (c.id)}
          <button
            class="cat"
            class:active={library.filters.category === c.id}
            type="button"
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
            Load a <button
              class="inline-star"
              type="button"
              onclick={() => library.toggleShowcase()}>★ showcase</button
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
            onchange={(e) =>
              library.setLevel(e.currentTarget.value as (typeof LEVELS)[number] | 'all')}
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
  {/if}
</div>

<style>
  .factory {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--bg);
  }
  .section-toggle {
    display: flex;
    gap: 6px;
    padding: 10px 14px 0;
    flex-shrink: 0;
  }
  .section-btn {
    padding: 5px 14px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--elevated);
    color: var(--text-dim);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.12s;
  }
  .section-btn:hover {
    color: var(--text-muted);
  }
  .section-btn.active {
    color: var(--amber);
    border-color: var(--amber-dim);
    background: var(--surface);
  }
  .space {
    display: grid;
    grid-template-columns: 180px 1fr;
    flex: 1;
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
