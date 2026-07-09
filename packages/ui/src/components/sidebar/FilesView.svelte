<script lang="ts">
  import { tick } from 'svelte';
  import { workspace } from '../../stores/workspace.svelte';
  import { KNOWN_EXTENSIONS } from '../../lib/workspace/types';
  import { referencedLibraries, type ReferencedLib } from '../../lib/library/referenced';
  import { RESOURCE_GROUPS } from '../../lib/library/resources';
  import { ui } from '../../stores/ui.svelte';
  import FileTree from './FileTree.svelte';
  import AccountSwitcher from './AccountSwitcher.svelte';

  // Resource libraries the ACTIVE program references via its `@` directives.
  // Recomputed reactively as the active file (or its contents) changes.
  const activeFile = $derived(
    workspace.activeTabId ? workspace.fileById(workspace.activeTabId) : undefined
  );
  const referenced = $derived(referencedLibraries(activeFile?.name, activeFile?.contents));

  // Allowed extensions pulled from the single `EXTENSION_TO_RUNTIME`
  // table in lib/workspace/types. Leaving the extension off defaults to
  // .bps to match the typical "new scratch program" flow.
  const exts = KNOWN_EXTENSIONS;

  let creating = $state(false);
  let newName = $state('');
  let errorMsg = $state<string | null>(null);
  let inputEl: HTMLInputElement | undefined = $state();

  function openDialog() {
    creating = true;
    newName = '';
    errorMsg = null;
    tick().then(() => inputEl?.focus());
  }

  function cancelDialog() {
    creating = false;
    newName = '';
    errorMsg = null;
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
    if (!exts.includes(ext)) {
      errorMsg = `unknown extension ${ext}. use one of: ${exts.join(', ')}`;
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

  // Open a referenced library's CONTENT in the editor display (not just switch
  // the sidebar). A catalog-backed lib (alphabet/tuning/scale/…) opens its JSON
  // read-only, exactly like the Resources view. A bare language module (@core /
  // @controls — no Kanopi catalog, the content lives in the BPScript language)
  // opens a short read-only note so the click still surfaces something.
  function openReferenced(lib: ReferencedLib) {
    const entry = RESOURCE_GROUPS.find((g) => g.type === lib.type)?.entries.find(
      (e) => e.id === lib.name
    );
    if (entry) {
      const path = `resources/${lib.type}/${entry.id}.json`;
      const id = workspace.addFile(path, JSON.stringify(entry.data, null, 2), true);
      workspace.openFile(id);
    } else {
      const path = `resources/${lib.type}/${lib.name}.json`;
      const note = {
        module: lib.name,
        kind: `BPScript ${lib.typeLabel}`,
        note: `@${lib.name} charge une bibliothèque du langage BPScript. Son contenu vit dans le langage (fonctions de grammaire / terminaux de contrôle), pas dans un catalogue de données Kanopi — rien à parcourir ici.`
      };
      const id = workspace.addFile(path, JSON.stringify(note, null, 2), true);
      workspace.openFile(id);
    }
    ui.activeActivityView = 'files';
  }

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
  <!-- KAN-UX5 — the files below are the PERSONAL space of the active account
       (the standard space is the read-only Library panel). -->
  <AccountSwitcher />
  <div class="toolbar">
    <button type="button" class="new-btn" onclick={openDialog} title="New file (name.ext)"
      >+ New file</button
    >
  </div>

  {#if creating}
    <div class="create">
      <input
        bind:this={inputEl}
        bind:value={newName}
        oninput={() => (errorMsg = null)}
        onkeydown={onKey}
        type="text"
        placeholder="name.tidal, scratch.strudel…"
        spellcheck="false"
        autocomplete="off"
      />
      <div class="create-actions">
        <button type="button" class="ok" onclick={submit}>Create</button>
        <button type="button" class="cancel" onclick={cancelDialog}>Cancel</button>
      </div>
      {#if errorMsg}<p class="err">{errorMsg}</p>{/if}
    </div>
  {/if}

  <FileTree nodes={workspace.tree} />

  {#if activeFile}
    <section class="libs">
      <h3 class="libs-title">Libraries used</h3>
      {#if referenced.length === 0}
        <p class="libs-empty">This program references no resource libraries.</p>
      {:else}
        <ul class="libs-list">
          {#each referenced as lib (lib.type + ':' + lib.name)}
            <li>
              <button
                type="button"
                class="lib-row"
                title="Ouvrir dans l'éditeur"
                onclick={() => openReferenced(lib)}
              >
                <span class="lib-type">{lib.typeLabel}</span>
                <span class="lib-name">{lib.name}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<style>
  .files-view {
    padding: 6px 4px;
  }
  .toolbar {
    display: flex;
    padding: 0 6px 6px;
  }
  .new-btn {
    flex: 1;
    padding: 6px 8px;
    background: transparent;
    border: 1px dashed var(--border-dim);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    text-align: left;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .new-btn:hover {
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
  .libs {
    margin: 14px 4px 0;
    padding-top: 10px;
    border-top: 1px solid var(--border-dim);
  }
  .libs-title {
    margin: 0 0 6px 6px;
    font-size: 9px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-dim);
    font-weight: 500;
  }
  .libs-empty {
    margin: 0 0 0 6px;
    font-size: 10.5px;
    color: var(--text-faint);
    font-style: italic;
  }
  .libs-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .lib-row {
    display: flex;
    align-items: baseline;
    gap: 7px;
    width: 100%;
    padding: 3px 6px;
    background: transparent;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    text-align: left;
  }
  .lib-row:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  .lib-type {
    flex-shrink: 0;
    font-size: 9px;
    letter-spacing: 0.06em;
    color: var(--amber);
    font-family: var(--font-mono);
    text-transform: lowercase;
  }
  .lib-name {
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 11.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
