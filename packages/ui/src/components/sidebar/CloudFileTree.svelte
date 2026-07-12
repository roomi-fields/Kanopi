<script lang="ts">
  // Cloud counterpart of FileTree.svelte: renders the personal-space document
  // tree (folders from `/` in the path, exactly like the local tree) but with
  // per-file actions VISIBLE (not opacity:0 on hover) and clean inline dialogs
  // for rename/delete — no prompt()/confirm(). Every mutation is a COMMAND to
  // `cloudDocs` (create/rename/duplicate/remove), which is itself a projection
  // of the storage service — this component invents no file state of its own.
  import type { TreeNode } from '../../lib/workspace/types';
  import { workspace } from '../../stores/workspace.svelte';
  import { cloudDocs } from '../../stores/cloud-docs.svelte';
  import Self from './CloudFileTree.svelte';

  type Props = { nodes: TreeNode[]; depth?: number };
  const { nodes, depth = 0 }: Props = $props();

  // Folder collapse state, keyed by path. #each below is keyed by node.path so
  // this component instance (and its local $state) survives doc list refreshes
  // — expand/collapse doesn't reset just because `cloudDocs.docs` re-projected.
  let collapsed = $state<Record<string, boolean>>({});

  // Only one row can be mid-rename or mid-delete-confirm at a time, so a single
  // id is enough to track it (siblings share this component instance).
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let renameOriginalPath = $state('');
  let confirmingDeleteId = $state<string | null>(null);

  function extOf(name: string): string {
    return name.split('.').pop() ?? '';
  }

  function toggle(path: string) {
    collapsed = { ...collapsed, [path]: !collapsed[path] };
  }

  function startRename(node: TreeNode) {
    if (!node.fileId) return;
    renamingId = node.fileId;
    renameValue = node.path;
    renameOriginalPath = node.path;
    confirmingDeleteId = null;
  }

  function cancelRename() {
    renamingId = null;
    renameValue = '';
    renameOriginalPath = '';
  }

  function submitRename() {
    const id = renamingId;
    const next = renameValue.trim();
    const original = renameOriginalPath;
    cancelRename();
    if (!id || !next || next === original) return;
    void cloudDocs.renameDoc(id, next);
  }

  function onRenameKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
    }
  }

  function startDelete(node: TreeNode) {
    if (!node.fileId) return;
    confirmingDeleteId = node.fileId;
    renamingId = null;
  }

  function cancelDelete() {
    confirmingDeleteId = null;
  }

  function confirmDelete(node: TreeNode) {
    confirmingDeleteId = null;
    if (node.fileId) void cloudDocs.removeDoc(node.fileId);
  }

  function autofocus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<ul class="tree">
  {#each nodes as node (node.path)}
    <li>
      {#if node.type === 'dir'}
        <button
          type="button"
          class="row dir"
          style="padding-left: {8 + depth * 12}px"
          onclick={() => toggle(node.path)}
        >
          <span class="caret">{collapsed[node.path] ? '▸' : '▾'}</span>
          <span class="name">{node.name}</span>
        </button>
        {#if node.children && !collapsed[node.path]}
          <Self nodes={node.children} depth={depth + 1} />
        {/if}
      {:else}
        <div
          class="row file"
          class:active={workspace.activeTabId === node.fileId}
          style="padding-left: {8 + depth * 12}px"
        >
          {#if renamingId === node.fileId}
            <input
              class="rename-input"
              value={renameValue}
              oninput={(e) => (renameValue = (e.currentTarget as HTMLInputElement).value)}
              onkeydown={onRenameKey}
              onblur={cancelRename}
              use:autofocus
              spellcheck="false"
              autocomplete="off"
            />
          {:else if confirmingDeleteId === node.fileId}
            <span class="confirm-delete">
              <span class="confirm-label">Delete {node.name}?</span>
              <button type="button" class="confirm-yes" onclick={() => confirmDelete(node)}
                >Delete</button
              >
              <button type="button" class="confirm-no" onclick={cancelDelete}>Cancel</button>
            </span>
          {:else}
            <button
              type="button"
              class="open"
              onclick={() => node.fileId && cloudDocs.openInEditor(node.fileId)}
            >
              <span class="ext ext-{extOf(node.name)}"></span>
              <span class="name">{node.name}</span>
            </button>
            <span class="actions">
              <button type="button" title="Rename" onclick={() => startRename(node)}>✎</button>
              <button
                type="button"
                title="Duplicate"
                onclick={() => node.fileId && cloudDocs.duplicateDoc(node.fileId)}>⧉</button
              >
              <button type="button" title="Delete" onclick={() => startDelete(node)}>✕</button>
            </span>
          {/if}
        </div>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .tree {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 3px 8px;
    font-size: 11px;
    color: var(--text-muted);
    text-align: left;
    border-radius: 2px;
    transition: background 0.1s;
  }
  .row.dir {
    cursor: pointer;
  }
  .row.dir:hover {
    background: rgba(255, 255, 255, 0.025);
    color: var(--text);
  }
  .row.file:hover,
  .row.file:focus-within {
    background: rgba(255, 255, 255, 0.025);
  }
  .row.file.active {
    background: rgba(232, 156, 62, 0.08);
    color: var(--amber);
  }
  .caret {
    font-size: 8px;
    color: var(--text-faint);
    width: 8px;
    flex-shrink: 0;
  }
  .ext {
    width: 8px;
    height: 8px;
    border-radius: 1px;
    display: inline-block;
    flex-shrink: 0;
    background: var(--text-faint);
  }
  .ext-tidal {
    background: var(--tidal);
  }
  .ext-scd {
    background: var(--sc);
  }
  .ext-hydra {
    background: var(--hydra);
  }
  .ext-strudel {
    background: var(--tidal);
  }
  .ext-py {
    background: var(--python);
  }
  .ext-kanopi,
  .ext-bps {
    background: var(--kanopi);
  }
  .ext-js {
    background: var(--cyan);
  }
  .name {
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .open {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding: 0;
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .actions {
    display: flex;
    gap: 1px;
    flex-shrink: 0;
    /* Visible at rest (per spec — no more opacity:0 hidden-until-hover). */
    opacity: 0.55;
    transition: opacity 0.1s;
  }
  .row.file:hover .actions,
  .row.file:focus-within .actions {
    opacity: 1;
  }
  .actions button {
    padding: 2px 5px;
    background: transparent;
    border: none;
    color: var(--text-faint);
    font-size: 10px;
    cursor: pointer;
    border-radius: 2px;
  }
  .actions button:hover {
    color: var(--amber);
    background: rgba(255, 255, 255, 0.04);
  }
  .rename-input {
    flex: 1;
    min-width: 0;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--amber);
    border-radius: 2px;
    padding: 2px 6px;
    font-family: var(--font-mono);
    font-size: 11px;
    outline: none;
    box-sizing: border-box;
  }
  .confirm-delete {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }
  .confirm-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10.5px;
    color: var(--text-muted);
  }
  .confirm-yes,
  .confirm-no {
    flex-shrink: 0;
    padding: 2px 7px;
    font-size: 10px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border: 1px solid var(--border-dim);
    background: transparent;
    border-radius: 2px;
    cursor: pointer;
    font-family: var(--font-mono);
  }
  .confirm-yes {
    color: var(--red, #c84040);
    border-color: var(--red, #c84040);
  }
  .confirm-yes:hover {
    background: rgba(200, 64, 64, 0.12);
  }
  .confirm-no {
    color: var(--text-muted);
  }
  .confirm-no:hover {
    color: var(--text);
    border-color: var(--border);
  }
</style>
