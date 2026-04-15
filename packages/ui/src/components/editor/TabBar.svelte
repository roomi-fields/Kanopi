<script lang="ts">
  import { workspace } from '../../stores/workspace.svelte';
  import Tab from './Tab.svelte';

  function onDropEnd(e: DragEvent) {
    e.preventDefault();
    const dragged = e.dataTransfer?.getData('text/x-tab-id');
    if (dragged) workspace.reorder(dragged, null);
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
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
</div>

<style>
  .tabbar {
    display: flex;
    align-items: stretch;
    height: 32px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    overflow-x: auto;
  }
  .empty {
    align-self: center;
    padding: 0 12px;
    font-size: 10px;
    color: var(--text-faint);
    letter-spacing: 0.08em;
  }
</style>
