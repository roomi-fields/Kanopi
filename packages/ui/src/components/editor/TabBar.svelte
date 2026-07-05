<script lang="ts">
  import { workspace } from '../../stores/workspace.svelte';
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
</script>

<div class="tabbar" role="tablist" tabindex="-1" ondragover={onDragOver} ondrop={onDropEnd}>
  {#if workspace.openTabIds.length === 0}
    <span class="empty">no file open</span>
  {:else}
    {#each workspace.openTabIds as id (id)}
      <Tab {id} />
    {/each}
  {/if}

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
    margin-left: auto;
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
</style>
