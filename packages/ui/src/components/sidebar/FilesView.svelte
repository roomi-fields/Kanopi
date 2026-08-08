<script lang="ts">
  import { tick } from 'svelte';
  import { workspace } from '../../stores/workspace.svelte';
  import { session } from '../../stores/session.svelte';
  import { cloudDocs } from '../../stores/cloud-docs.svelte';
  import { KNOWN_EXTENSIONS } from '../../lib/workspace/types';
  import { buildTree } from '../../lib/workspace/build-tree';
  import FileTree from './FileTree.svelte';
  import CloudFileTree from './CloudFileTree.svelte';
  import { guestLibraries } from 'runtime-codevoices';

  // (d) [764] — bibliothèques standard des moteurs invités (microtonal Strudel, soundfonts GM,
  // samples Mercury, …), surfacées ici au rang des libs BPScript. Registre CONSOMMÉ du paquet
  // runtime-codevoices (aucune liste en dur). L'auteur active les `declarable` via
  // `eval.<engine>(bank:"<id>")`. Groupées par moteur pour la lecture.
  const guestLibsByEngine = Object.entries(
    guestLibraries.reduce<Record<string, (typeof guestLibraries)[number][]>>((acc, lib) => {
      (acc[lib.engine] ??= []).push(lib);
      return acc;
    }, {})
  );

  // Allowed extensions pulled from the single `EXTENSION_TO_RUNTIME`
  // table in lib/workspace/types. Leaving the extension off defaults to
  // .bps to match the typical "new scratch program" flow. `.json` is not a
  // program language (no adapter declares it), but a personal library IS a
  // `.json` catalog file (decision 2026-07-13-invocation-librairies-factory-
  // mine.md) — accepted under the reserved `libraries/` prefix only (see
  // `submit()` below).
  const exts = KNOWN_EXTENSIONS;

  // Secondary split INSIDE the Mine origin (ESPACE_PERSO_SPEC §10.3): a personal
  // LIBRARY is just a doc filed under the reserved `libraries/` folder — no
  // storage-contract change (the path carries everything, no separate kind/ext
  // field). So the split is a pure PROJECTION: partition the doc list by path
  // prefix. Renaming a doc to add/remove `libraries/` moves it between sections
  // automatically (the partition is derived from the live doc list). Full paths
  // are kept (the `libraries/` folder stays visible) so the cloud rename dialog,
  // which pre-fills with the node's path, still shows/edits the real prefix.
  const LIB_PREFIX = 'libraries/';
  const isLibraryPath = (p: string) => p.startsWith(LIB_PREFIX);

  // Cloud docs rendered as a folder tree (the `/` in each path = a directory) —
  // `buildTree` only reads `id`/`path`, already true of `DocMeta`, so no VirtualFile
  // shimming needed. A folder is not a real entity server-side: it exists only as
  // long as at least one doc's path starts with it (see submitFolder below).
  const cloudScenesTree = $derived(buildTree(cloudDocs.docs.filter((d) => !isLibraryPath(d.path))));
  const cloudLibrariesTree = $derived(
    buildTree(cloudDocs.docs.filter((d) => isLibraryPath(d.path)))
  );
  const localScenesTree = $derived(
    buildTree(workspace.files.filter((f) => !isLibraryPath(f.path)))
  );
  const localLibrariesTree = $derived(
    buildTree(workspace.files.filter((f) => isLibraryPath(f.path)))
  );

  let creating = $state(false);
  let newName = $state('');
  let errorMsg = $state<string | null>(null);
  let inputEl: HTMLInputElement | undefined = $state();

  let creatingFolder = $state(false);
  let folderName = $state('');
  let folderInputEl: HTMLInputElement | undefined = $state();
  // Which section a folder-in-progress lands in — decided by which section's
  // "+ New folder" button opened the dialog. Romain 2026-07-13: "new folder"
  // was ambiguous (Scenes or Libraries?); the fix is that there is no longer a
  // single global folder action — each section owns its own, so the dialog
  // itself always knows its destination.
  let folderTarget = $state<'scenes' | 'libraries'>('scenes');

  // A personal library is a `libraries/…` JSON catalog that DECLARES its own
  // domain inside the file (decision 2026-07-13-invocation-librairies-factory-
  // mine.md point 0/1) — no more axis inferred from a fixed list. The five
  // domains a personal library can declare (kairos
  // `src/projection/libs-provenance.ts:32-37`, `CATALOGUE_PAR_DOMAINE`).
  const LIBRARY_DOMAINS = ['alphabet', 'tuning', 'temperament', 'scale', 'octaves'] as const;
  type LibraryDomain = (typeof LIBRARY_DOMAINS)[number];

  let creatingLibrary = $state(false);
  let libraryDomain = $state<LibraryDomain>('alphabet');
  let libraryName = $state('');
  let libraryInputEl: HTMLInputElement | undefined = $state();

  // "+ New" under Scenes: a scene file — never lands under `libraries/` (guarded
  // in submit() below), so there is never a question of which section it goes to.
  function openSceneFileDialog() {
    creating = true;
    creatingFolder = false;
    creatingLibrary = false;
    newName = '';
    errorMsg = null;
    tick().then(() => inputEl?.focus());
  }

  function cancelDialog() {
    creating = false;
    newName = '';
    errorMsg = null;
  }

  // "+ New folder" under EITHER section — `target` fixes which section the
  // resulting file/library lands in, so the dialog itself is unambiguous.
  function openFolderDialog(target: 'scenes' | 'libraries') {
    creatingFolder = true;
    creating = false;
    creatingLibrary = false;
    folderTarget = target;
    folderName = '';
    errorMsg = null;
    tick().then(() => folderInputEl?.focus());
  }

  function cancelFolderDialog() {
    creatingFolder = false;
    folderName = '';
    errorMsg = null;
  }

  /** "New library" opens a dedicated small form (domain + name), NOT the
   * generic "+ New file" dialog: a personal library is a typed `.json`
   * catalog, not a scratch program, and its content must scaffold the exact
   * schema kairos reads (`{"domain": "<domain>", "<name>": {}}` — the entry
   * is a top-level key next to `domain`, never a wrapping `entries` field). */
  function openLibraryDialog() {
    creatingLibrary = true;
    creating = false;
    creatingFolder = false;
    libraryDomain = 'alphabet';
    libraryName = '';
    errorMsg = null;
    tick().then(() => libraryInputEl?.focus());
  }

  function cancelLibraryDialog() {
    creatingLibrary = false;
    libraryName = '';
    errorMsg = null;
  }

  /** A library name/path may nest in folders (`ragas/mine`), but no segment
   * may contain a dot: `@mine.<path>.<entry>` uses `.` as its sole separator
   * (decision 2026-07-13-invocation-librairies-factory-mine.md point 1), so a
   * dot inside a segment would be read as an extra path/entry boundary. */
  function libraryNameError(raw: string): string | null {
    if (!raw) return 'name is empty';
    const segments = raw.split('/');
    for (const seg of segments) {
      if (!seg) return 'empty path segment';
      if (seg.includes('.'))
        return 'name cannot contain a dot — "." separates @mine.<path>.<entry> segments';
    }
    return null;
  }

  function submitLibrary() {
    const raw = libraryName.trim().replace(/^\/+|\/+$/g, '');
    const nameErr = libraryNameError(raw);
    if (nameErr) {
      errorMsg = nameErr;
      return;
    }
    const path = `${LIB_PREFIX}${raw}.json`;
    const entryName = raw.split('/').pop()!;
    // Scaffold = the EXACT schema kairos parses: `domain` + one entry keyed by
    // the file's own name, empty for the user to fill in. No `entries` wrapper.
    const scaffold = JSON.stringify({ domain: libraryDomain, [entryName]: {} }, null, 2);
    if (session.session) {
      if (cloudDocs.docs.some((d) => d.path === path)) {
        errorMsg = `${path} already exists`;
        return;
      }
      cancelLibraryDialog();
      void cloudDocs.createDoc(path, scaffold);
      return;
    }
    if (workspace.files.some((f) => f.path === path)) {
      errorMsg = `${path} already exists`;
      return;
    }
    const id = workspace.addFile(path, scaffold);
    workspace.openFile(id);
    cancelLibraryDialog();
  }

  function onLibraryKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitLibrary();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelLibraryDialog();
    }
  }

  /** "New folder" doesn't create a folder entity (none exists server-side) — it
   * pre-fills the NEXT dialog with `<name>/`, so the first file/library created
   * inside it is what makes the folder appear in the tree. Which dialog depends
   * on `folderTarget`: a Scenes folder pre-fills "+ New file" (any program
   * extension), a Libraries folder pre-fills "+ New library" (a typed `.json`
   * catalog under `libraries/`) — each section's own creation flow, never the
   * other's. */
  function submitFolder() {
    const raw = folderName.trim().replace(/^\/+|\/+$/g, '');
    if (!raw) {
      errorMsg = 'folder name is empty';
      return;
    }
    cancelFolderDialog();
    if (folderTarget === 'libraries') {
      openLibraryDialog();
      libraryName = raw + '/';
    } else {
      openSceneFileDialog();
      newName = raw + '/';
    }
  }

  function onFolderKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitFolder();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelFolderDialog();
    }
  }

  function submit() {
    const raw = newName.trim();
    if (!raw) {
      errorMsg = 'name is empty';
      return;
    }
    // Append .bps if the user gave no extension, so fileless typing just
    // works. Anything else must match one of the known extensions.
    const hasExt = /\.[a-z0-9]+$/i.test(raw);
    const path = hasExt ? raw : raw + '.bps';
    const ext = '.' + path.split('.').pop()!.toLowerCase();
    // This dialog is Scenes' own "+ New" — a path under `libraries/` belongs to
    // the Libraries section's "+ New library" instead (that's the only place a
    // `libraries/*.json` file is created, keeping the two sections unambiguous).
    if (isLibraryPath(path)) {
      errorMsg = `${LIB_PREFIX}… is created from the Libraries section, not here`;
      return;
    }
    if (!exts.includes(ext)) {
      errorMsg = `unknown extension ${ext}. use one of: ${exts.join(', ')}`;
      return;
    }
    // Connecté : le fichier est un document CLOUD — création via commande au service,
    // re-projetée (cloudDocs.docs), jamais un fichier local inventé côté hôte.
    if (session.session) {
      if (cloudDocs.docs.some((d) => d.path === path)) {
        errorMsg = `${path} already exists`;
        return;
      }
      cancelDialog();
      void cloudDocs.createDoc(path);
      return;
    }
    if (workspace.files.some((f) => f.path === path || f.name === path)) {
      errorMsg = `${path} already exists`;
      return;
    }
    const id = workspace.addFile(path, '');
    workspace.openFile(id);
    cancelDialog();
  }

  // Docs cloud (connecté) — actions par item + arbre : voir CloudFileTree.svelte
  // (rename/duplicate/delete y sont câblées directement sur `cloudDocs`, plus
  // besoin de wrapper ici).

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelDialog();
    }
  }
</script>

<div class="files-view">
  <!-- Two sections, always visible (empty ones show a hint so the user learns
       where content goes). Ordered Scenes then Libraries. Connected → cloud docs
       via CloudFileTree; disconnected → local draft via FileTree.

       Romain 2026-07-13: creation is no longer one ambiguous global toolbar
       ("+ New folder" — of a scene, or under libraries/?"). Each section owns
       its OWN creation actions, in its OWN header — a scene action can only
       ever create a scene, a library action can only ever create a library. -->
  {#if session.session}
    <section class="tree-section">
      <div class="section-header">
        <h3 class="section-title">Scenes</h3>
        <div class="section-actions">
          <button
            type="button"
            class="new-btn-sm"
            onclick={openSceneFileDialog}
            title="New scene file (name.ext)">+ file</button
          >
          <button
            type="button"
            class="new-btn-sm"
            onclick={() => openFolderDialog('scenes')}
            title="New folder for scenes (created once it holds a file)">+ folder</button
          >
        </div>
      </div>
      {#if creating}
        <div class="create">
          <input
            bind:this={inputEl}
            bind:value={newName}
            oninput={() => (errorMsg = null)}
            onkeydown={onKey}
            type="text"
            placeholder="drums/kick.bps, scratch.strudel…"
            spellcheck="false"
            autocomplete="off"
          />
          <p class="hint">Use / to place it in a folder, e.g. drums/kick.bps</p>
          <div class="create-actions">
            <button type="button" class="ok" onclick={submit}>Create</button>
            <button type="button" class="cancel" onclick={cancelDialog}>Cancel</button>
          </div>
          {#if errorMsg}<p class="err">{errorMsg}</p>{/if}
        </div>
      {/if}
      {#if creatingFolder && folderTarget === 'scenes'}
        <div class="create">
          <input
            bind:this={folderInputEl}
            bind:value={folderName}
            oninput={() => (errorMsg = null)}
            onkeydown={onFolderKey}
            type="text"
            placeholder="folder name, e.g. drums"
            spellcheck="false"
            autocomplete="off"
          />
          <p class="hint">A folder becomes visible once you create a file inside it.</p>
          <div class="create-actions">
            <button type="button" class="ok" onclick={submitFolder}>Next: add a file</button>
            <button type="button" class="cancel" onclick={cancelFolderDialog}>Cancel</button>
          </div>
          {#if errorMsg}<p class="err">{errorMsg}</p>{/if}
        </div>
      {/if}
      {#if cloudScenesTree.length === 0}
        <p class="section-empty">No scenes yet.</p>
      {:else}
        <CloudFileTree nodes={cloudScenesTree} />
      {/if}
    </section>
    <section class="tree-section">
      <div class="section-header">
        <h3 class="section-title">Libraries</h3>
        <div class="section-actions">
          <button
            type="button"
            class="new-btn-sm"
            onclick={openLibraryDialog}
            title="New personal library (a typed JSON catalog under libraries/)">+ library</button
          >
          <button
            type="button"
            class="new-btn-sm"
            onclick={() => openFolderDialog('libraries')}
            title="New folder under libraries/ (created once it holds a library)">+ folder</button
          >
        </div>
      </div>
      {#if creatingLibrary}
        <div class="create">
          <label class="field-label" for="library-domain">Domain</label>
          <select id="library-domain" class="domain-select" bind:value={libraryDomain}>
            {#each LIBRARY_DOMAINS as d (d)}
              <option value={d}>{d}</option>
            {/each}
          </select>
          <label class="field-label" for="library-name">Name</label>
          <input
            id="library-name"
            bind:this={libraryInputEl}
            bind:value={libraryName}
            oninput={() => (errorMsg = null)}
            onkeydown={onLibraryKey}
            type="text"
            placeholder="mes-svaras"
            spellcheck="false"
            autocomplete="off"
          />
          <p class="hint">
            Creates libraries/{libraryName || '…'}.json — no dots (the address syntax reads "." as a
            separator).
          </p>
          <div class="create-actions">
            <button type="button" class="ok" onclick={submitLibrary}>Create</button>
            <button type="button" class="cancel" onclick={cancelLibraryDialog}>Cancel</button>
          </div>
          {#if errorMsg}<p class="err">{errorMsg}</p>{/if}
        </div>
      {/if}
      {#if creatingFolder && folderTarget === 'libraries'}
        <div class="create">
          <input
            bind:this={folderInputEl}
            bind:value={folderName}
            oninput={() => (errorMsg = null)}
            onkeydown={onFolderKey}
            type="text"
            placeholder="folder name, e.g. ragas"
            spellcheck="false"
            autocomplete="off"
          />
          <p class="hint">
            A folder becomes visible once you create a library inside it (under libraries/).
          </p>
          <div class="create-actions">
            <button type="button" class="ok" onclick={submitFolder}>Next: add a library</button>
            <button type="button" class="cancel" onclick={cancelFolderDialog}>Cancel</button>
          </div>
          {#if errorMsg}<p class="err">{errorMsg}</p>{/if}
        </div>
      {/if}
      {#if cloudLibrariesTree.length === 0}
        <p class="section-empty">No libraries yet. Use “+ library”.</p>
      {:else}
        <CloudFileTree nodes={cloudLibrariesTree} />
      {/if}
    </section>
  {:else}
    <section class="tree-section">
      <div class="section-header">
        <h3 class="section-title">Scenes</h3>
        <div class="section-actions">
          <button
            type="button"
            class="new-btn-sm"
            onclick={openSceneFileDialog}
            title="New scene file (name.ext)">+ file</button
          >
          <button
            type="button"
            class="new-btn-sm"
            onclick={() => openFolderDialog('scenes')}
            title="New folder for scenes (created once it holds a file)">+ folder</button
          >
        </div>
      </div>
      {#if creating}
        <div class="create">
          <input
            bind:this={inputEl}
            bind:value={newName}
            oninput={() => (errorMsg = null)}
            onkeydown={onKey}
            type="text"
            placeholder="drums/kick.bps, scratch.strudel…"
            spellcheck="false"
            autocomplete="off"
          />
          <p class="hint">Use / to place it in a folder, e.g. drums/kick.bps</p>
          <div class="create-actions">
            <button type="button" class="ok" onclick={submit}>Create</button>
            <button type="button" class="cancel" onclick={cancelDialog}>Cancel</button>
          </div>
          {#if errorMsg}<p class="err">{errorMsg}</p>{/if}
        </div>
      {/if}
      {#if creatingFolder && folderTarget === 'scenes'}
        <div class="create">
          <input
            bind:this={folderInputEl}
            bind:value={folderName}
            oninput={() => (errorMsg = null)}
            onkeydown={onFolderKey}
            type="text"
            placeholder="folder name, e.g. drums"
            spellcheck="false"
            autocomplete="off"
          />
          <p class="hint">A folder becomes visible once you create a file inside it.</p>
          <div class="create-actions">
            <button type="button" class="ok" onclick={submitFolder}>Next: add a file</button>
            <button type="button" class="cancel" onclick={cancelFolderDialog}>Cancel</button>
          </div>
          {#if errorMsg}<p class="err">{errorMsg}</p>{/if}
        </div>
      {/if}
      {#if localScenesTree.length === 0}
        <p class="section-empty">No scenes yet.</p>
      {:else}
        <FileTree nodes={localScenesTree} />
      {/if}
    </section>
    <section class="tree-section">
      <div class="section-header">
        <h3 class="section-title">Libraries</h3>
        <div class="section-actions">
          <button
            type="button"
            class="new-btn-sm"
            onclick={openLibraryDialog}
            title="New personal library (a typed JSON catalog under libraries/)">+ library</button
          >
          <button
            type="button"
            class="new-btn-sm"
            onclick={() => openFolderDialog('libraries')}
            title="New folder under libraries/ (created once it holds a library)">+ folder</button
          >
        </div>
      </div>
      {#if creatingLibrary}
        <div class="create">
          <label class="field-label" for="library-domain">Domain</label>
          <select id="library-domain" class="domain-select" bind:value={libraryDomain}>
            {#each LIBRARY_DOMAINS as d (d)}
              <option value={d}>{d}</option>
            {/each}
          </select>
          <label class="field-label" for="library-name">Name</label>
          <input
            id="library-name"
            bind:this={libraryInputEl}
            bind:value={libraryName}
            oninput={() => (errorMsg = null)}
            onkeydown={onLibraryKey}
            type="text"
            placeholder="mes-svaras"
            spellcheck="false"
            autocomplete="off"
          />
          <p class="hint">
            Creates libraries/{libraryName || '…'}.json — no dots (the address syntax reads "." as a
            separator).
          </p>
          <div class="create-actions">
            <button type="button" class="ok" onclick={submitLibrary}>Create</button>
            <button type="button" class="cancel" onclick={cancelLibraryDialog}>Cancel</button>
          </div>
          {#if errorMsg}<p class="err">{errorMsg}</p>{/if}
        </div>
      {/if}
      {#if creatingFolder && folderTarget === 'libraries'}
        <div class="create">
          <input
            bind:this={folderInputEl}
            bind:value={folderName}
            oninput={() => (errorMsg = null)}
            onkeydown={onFolderKey}
            type="text"
            placeholder="folder name, e.g. ragas"
            spellcheck="false"
            autocomplete="off"
          />
          <p class="hint">
            A folder becomes visible once you create a library inside it (under libraries/).
          </p>
          <div class="create-actions">
            <button type="button" class="ok" onclick={submitFolder}>Next: add a library</button>
            <button type="button" class="cancel" onclick={cancelFolderDialog}>Cancel</button>
          </div>
          {#if errorMsg}<p class="err">{errorMsg}</p>{/if}
        </div>
      {/if}
      {#if localLibrariesTree.length === 0}
        <p class="section-empty">No libraries yet. Use “+ library”.</p>
      {:else}
        <FileTree nodes={localLibrariesTree} />
      {/if}

      {#if guestLibsByEngine.length > 0}
        <div class="guest-libs">
          <p class="guest-libs-title">Bundled — guest engines</p>
          {#each guestLibsByEngine as [engine, libs] (engine)}
            <p class="guest-engine">{engine}</p>
            <ul class="guest-list">
              {#each libs as lib (lib.id)}
                <li class="guest-lib" title={lib.description}>
                  <span class="guest-lib-label">{lib.label}</span>
                  <span class="guest-lib-kind">{lib.kind}</span>
                  {#if lib.declarable}
                    <code class="guest-lib-decl">eval.{engine}(bank:"{lib.id}")</code>
                  {:else}
                    <span class="guest-lib-managed" title="chargée par le moteur lui-même"
                      >engine</span
                    >
                  {/if}
                </li>
              {/each}
            </ul>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .files-view {
    padding: 6px 4px;
  }
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin: 0 2px 4px 6px;
  }
  .section-header .section-title {
    margin: 0;
  }
  .section-actions {
    display: flex;
    gap: 4px;
  }
  .new-btn-sm {
    padding: 3px 7px;
    background: transparent;
    border: 1px dashed var(--border-dim);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 10px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .new-btn-sm:hover {
    color: var(--amber);
    border-color: var(--amber);
    border-style: solid;
  }
  .create {
    padding: 6px;
    border: 1px solid var(--amber);
    border-radius: 3px;
    margin: 0 4px 6px;
    background: rgba(232, 156, 62, 0.05);
  }
  .create input {
    width: 100%;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border-dim);
    border-radius: 2px;
    padding: 5px 7px;
    font-family: var(--font-mono);
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }
  .create input:focus {
    border-color: var(--amber);
  }
  .field-label {
    display: block;
    margin: 6px 0 3px;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .field-label:first-child {
    margin-top: 0;
  }
  .domain-select {
    width: 100%;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border-dim);
    border-radius: 2px;
    padding: 5px 7px;
    font-family: var(--font-mono);
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }
  .domain-select:focus {
    border-color: var(--amber);
  }
  .hint {
    margin: 5px 0 0;
    font-size: 10px;
    color: var(--text-faint);
    font-style: italic;
  }
  .create-actions {
    display: flex;
    gap: 4px;
    margin-top: 5px;
  }
  .create-actions button {
    flex: 1;
    padding: 4px 8px;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: 1px solid var(--border-dim);
    background: transparent;
    color: var(--text-muted);
    border-radius: 2px;
    cursor: pointer;
    font-family: var(--font-mono);
  }
  .ok:hover {
    color: var(--amber);
    border-color: var(--amber);
  }
  .cancel:hover {
    color: var(--text);
    border-color: var(--border);
  }
  .err {
    margin: 5px 0 0;
    font-size: 10px;
    color: var(--red, #c84040);
    font-family: var(--font-mono);
  }
  .tree-section {
    margin-bottom: 10px;
  }
  .section-title {
    margin: 0 0 4px 6px;
    font-size: 9px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-dim);
    font-weight: 500;
  }
  .section-empty {
    margin: 0 0 0 8px;
    font-size: 10.5px;
    color: var(--text-faint);
    font-style: italic;
  }

  /* (d) [764] — bibliothèques des moteurs invités (registre runtime-codevoices). */
  .guest-libs {
    margin: 8px 0 0;
    padding: 6px 0 0;
    border-top: 1px solid var(--border-dim);
  }
  .guest-libs-title {
    margin: 0 0 4px 8px;
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .guest-engine {
    margin: 6px 0 2px 8px;
    font-size: 9.5px;
    font-family: var(--font-mono);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .guest-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .guest-lib {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 2px 8px 2px 16px;
    font-size: 11px;
  }
  .guest-lib-label {
    color: var(--text);
  }
  .guest-lib-kind {
    font-size: 9px;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .guest-lib-decl {
    margin-left: auto;
    font-family: var(--font-code);
    font-size: 10px;
    color: var(--sc);
    white-space: nowrap;
  }
  .guest-lib-managed {
    margin-left: auto;
    font-size: 9px;
    color: var(--text-faint);
    font-style: italic;
  }
</style>
