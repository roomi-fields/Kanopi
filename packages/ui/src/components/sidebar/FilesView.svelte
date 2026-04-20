<script lang="ts">
  import { tick } from 'svelte';
  import { workspace } from '../../stores/workspace.svelte';
  import FileTree from './FileTree.svelte';

  // Allowed extensions — kept in sync with runtimeFromExt so every created
  // file routes to a real adapter. Leaving the extension off defaults to
  // .kanopi (session file) to match the typical "new scratch session" flow.
  const exts = ['.tidal', '.strudel', '.hydra', '.js', '.scd', '.py', '.kanopi'];

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
    // Append .kanopi if the user gave no extension, so fileless typing just
    // works. Anything else must match one of the known extensions.
    const hasExt = /\.[a-z0-9]+$/i.test(raw);
    const path = hasExt ? raw : raw + '.kanopi';
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
  <div class="toolbar">
    <button
      type="button"
      class="new-btn"
      onclick={openDialog}
      title="New file (name.ext)"
    >+ New file</button>
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
</div>

<style>
  .files-view { padding: 6px 4px; }
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
  .create input:focus { border-color: var(--amber); }
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
  .ok:hover { color: var(--amber); border-color: var(--amber); }
  .cancel:hover { color: var(--text); border-color: var(--border); }
  .err {
    margin: 5px 0 0;
    font-size: 10px;
    color: var(--red, #c84040);
    font-family: var(--font-mono);
  }
</style>
