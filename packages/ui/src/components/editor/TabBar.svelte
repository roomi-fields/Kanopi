<script lang="ts">
  import { tick } from 'svelte';
  import { workspace } from '../../stores/workspace.svelte';
  import { cloudDocs } from '../../stores/cloud-docs.svelte';
  import { session } from '../../stores/session.svelte';
  import { ui } from '../../stores/ui.svelte';
  import { programCompileStatus } from '../../lib/library/referenced';
  import { deriveStatus } from '../../stores/derive-status.svelte';
  import Tab from './Tab.svelte';

  function onDropEnd(e: DragEvent) {
    e.preventDefault();
    const dragged = e.dataTransfer?.getData('text/x-tab-id');
    if (dragged) workspace.reorder(dragged, null);
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
  }

  // Compile status of the ACTIVE program — shown as a chip on the right of the
  // tab bar (the editor's own header), contextual to the file being edited.
  const activeFile = $derived(
    workspace.activeTabId ? workspace.fileById(workspace.activeTabId) : undefined
  );
  // Fold the eval pipeline's DERIVATION outcome (msg [598]) into the chip so a
  // scene that parses but throws at derive reads red, not a misleading "compiles".
  const derive = $derived(deriveStatus.for(workspace.activeTabId, activeFile?.contents));
  const compile = $derived(programCompileStatus(activeFile?.name, activeFile?.contents, derive));

  // ————— Enregistrement (ESPACE_PERSO_SPEC §4.3/§5, lot A1) —————
  // « Enregistrer chez moi » promeut une copie de bibliothèque / un brouillon local en doc
  // cloud (commande `create` au service, cf `cloudDocs.saveToCloud`) ; un doc DÉJÀ cloud est
  // en auto-save (état projeté via `cloudDocs.saveStatus`). Aucune fabrication locale ici —
  // uniquement des commandes + la lecture de l'état projeté.
  const isCloud = $derived(activeFile ? cloudDocs.isCloudDoc(activeFile.id) : false);
  const saveStatus = $derived(activeFile ? cloudDocs.saveStatus(activeFile.id) : undefined);

  let saveAsOpen = $state(false);
  let saveAsName = $state('');
  let saveAsError = $state<string | null>(null);
  let saveAsInputEl: HTMLInputElement | undefined = $state();

  function openSaveAs() {
    if (!activeFile) return;
    saveAsName = activeFile.path;
    saveAsError = null;
    saveAsOpen = true;
    tick().then(() => saveAsInputEl?.focus());
  }

  function cancelSaveAs() {
    saveAsOpen = false;
    saveAsName = '';
    saveAsError = null;
  }

  async function confirmSaveAs() {
    if (!activeFile) return;
    const path = saveAsName.trim();
    if (!path) {
      saveAsError = 'name is empty';
      return;
    }
    // Collision = un AUTRE doc cloud porte déjà ce chemin (se re-sauver soi-même sous son
    // propre chemin n'est pas une collision — juste un no-op, on laisse passer).
    if (cloudDocs.docs.some((d) => d.path === path && d.id !== activeFile.id)) {
      saveAsError = `${path} already exists`;
      return;
    }
    const target = activeFile;
    cancelSaveAs();
    await cloudDocs.saveToCloud(target.id, path);
  }

  function onSaveAsKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void confirmSaveAs();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelSaveAs();
    }
  }

  /** « Enregistrer chez moi » : promotion directe, SAUF si le chemin est déjà pris côté
   *  cloud (une autre copie du même starter par ex.) — dans ce cas on bascule sur le
   *  dialogue « Enregistrer sous » plutôt que d'échouer silencieusement ou d'écraser. */
  async function handleSaveToCloud() {
    if (!activeFile) return;
    if (cloudDocs.pathExistsInCloud(activeFile.path)) {
      openSaveAs();
      return;
    }
    await cloudDocs.saveToCloud(activeFile.id);
  }
</script>

<div class="tabbar" role="tablist" tabindex="-1" ondragover={onDragOver} ondrop={onDropEnd}>
  {#if workspace.openTabIds.length === 0}
    <span class="empty">no file open</span>
  {:else}
    {#each workspace.openTabIds as id (id)}
      <Tab {id} />
    {/each}
  {/if}

  <div class="save-zone">
    {#if saveAsOpen}
      <div class="save-as">
        <input
          bind:this={saveAsInputEl}
          bind:value={saveAsName}
          oninput={() => (saveAsError = null)}
          onkeydown={onSaveAsKey}
          type="text"
          spellcheck="false"
          autocomplete="off"
          title="Save as…"
        />
        <button type="button" class="save-as-ok" onclick={confirmSaveAs}>Save</button>
        <button type="button" class="save-as-cancel" onclick={cancelSaveAs}>Cancel</button>
        {#if saveAsError}<span class="save-as-err">{saveAsError}</span>{/if}
      </div>
    {:else if activeFile && !activeFile.readOnly && !session.session}
      <button type="button" class="connect-btn" onclick={() => (ui.activeActivityView = 'account')}>
        ☁ Sign in to save
      </button>
    {:else if activeFile && isCloud}
      <span
        class="save-status"
        class:saving={saveStatus === 'saving'}
        class:error={saveStatus === 'error'}
        title={saveStatus === 'error' ? 'Write failed — retrying, your edit is kept' : undefined}
      >
        {#if saveStatus === 'saving'}
          saving…
        {:else if saveStatus === 'error'}
          ⚠ offline — retrying
        {:else}
          ✓ saved
        {/if}
      </span>
      <button type="button" class="save-as-btn" onclick={openSaveAs}>Save as…</button>
    {:else if activeFile && !activeFile.readOnly}
      <button type="button" class="save-btn" onclick={handleSaveToCloud}>
        ☁ Save to my space
      </button>
      <button type="button" class="save-as-btn" onclick={openSaveAs}>Save as…</button>
    {/if}
  </div>

  {#if compile.applicable}
    <div
      class="compile-chip"
      class:ok={compile.ok}
      class:fail={!compile.ok}
      title={compile.ok
        ? 'Program compiles'
        : compile.errors.map((e) => (e.line ? `L${e.line}: ${e.message}` : e.message)).join('\n')}
    >
      <span class="compile-dot"></span>
      {#if compile.ok}
        <span class="compile-label">compiles</span>
      {:else if compile.phase === 'derive'}
        <span class="compile-label">derive error</span>
      {:else}
        <span class="compile-label"
          >{compile.errors.length} error{compile.errors.length > 1 ? 's' : ''}</span
        >
      {/if}
    </div>
  {/if}
</div>

<style>
  .tabbar {
    display: flex;
    align-items: stretch;
    height: 32px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    overflow: hidden;
    min-width: 0;
  }
  .empty {
    align-self: center;
    padding: 0 12px;
    font-size: 10px;
    color: var(--text-faint);
    letter-spacing: 0.08em;
  }
  .compile-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    align-self: center;
    flex-shrink: 0;
    padding: 2px 10px;
    margin-right: 8px;
    border-radius: 10px;
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: default;
  }
  .compile-chip.ok {
    background: rgba(80, 200, 120, 0.08);
    color: var(--green, #50c878);
  }
  .compile-chip.fail {
    background: rgba(200, 64, 64, 0.12);
    color: var(--red, #c84040);
  }
  .compile-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    background: currentColor;
  }

  /* ————— Enregistrement (espace perso cloud, lot A1) ————— */
  .save-zone {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    align-self: center;
    flex-shrink: 0;
    padding-left: 8px;
  }
  .connect-btn,
  .save-btn {
    padding: 3px 9px;
    font-family: var(--font-mono);
    font-size: 9.5px;
    letter-spacing: 0.04em;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }
  .connect-btn:hover,
  .save-btn:hover {
    color: var(--amber);
    border-color: var(--amber);
  }
  .save-status {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.06em;
    color: var(--green, #7ec873);
    white-space: nowrap;
  }
  .save-status.saving {
    color: var(--text-muted);
  }
  .save-status.error {
    color: var(--red, #c86b6b);
  }
  .save-as-btn {
    padding: 2px 6px;
    font-family: var(--font-mono);
    font-size: 9px;
    background: transparent;
    border: none;
    color: var(--text-faint);
    cursor: pointer;
    white-space: nowrap;
  }
  .save-as-btn:hover {
    color: var(--text);
  }
  .save-as {
    display: flex;
    align-items: center;
    gap: 4px;
    position: relative;
  }
  .save-as input {
    width: 160px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--amber);
    border-radius: 2px;
    padding: 3px 6px;
    font-family: var(--font-mono);
    font-size: 10.5px;
    outline: none;
    box-sizing: border-box;
  }
  .save-as-ok,
  .save-as-cancel {
    padding: 3px 7px;
    font-size: 9px;
    letter-spacing: 0.04em;
    border: 1px solid var(--border-dim, var(--border));
    background: transparent;
    color: var(--text-muted);
    border-radius: 2px;
    cursor: pointer;
    font-family: var(--font-mono);
  }
  .save-as-ok:hover {
    color: var(--amber);
    border-color: var(--amber);
  }
  .save-as-cancel:hover {
    color: var(--text);
    border-color: var(--border);
  }
  .save-as-err {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 3px;
    padding: 2px 6px;
    font-size: 9.5px;
    color: var(--red, #c86b6b);
    background: var(--panel);
    border: 1px solid var(--red, #c86b6b);
    border-radius: 2px;
    white-space: nowrap;
    z-index: 5;
  }
</style>
