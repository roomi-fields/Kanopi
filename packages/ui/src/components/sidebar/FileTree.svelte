<script lang="ts">
  import type { TreeNode } from '../../lib/workspace/types';
  import { workspace } from '../../stores/workspace.svelte';
  import Self from './FileTree.svelte';

  type Props = { nodes: TreeNode[]; depth?: number };
  const { nodes, depth = 0 }: Props = $props();
</script>

<ul class="tree">
  {#each nodes as node (node.path)}
    <li>
      {#if node.type === 'file'}
        <button
          class="row file"
          class:active={workspace.activeTabId === node.fileId}
          style="padding-left: {8 + depth * 12}px"
          type="button"
          onclick={() => node.fileId && workspace.openFile(node.fileId)}
        >
          <span class="ext ext-{node.name.split('.').pop()}"></span>
          <span class="name">{node.name}</span>
        </button>
      {:else}
        <div class="row dir" style="padding-left: {8 + depth * 12}px">
          <span class="caret">▾</span>
          <span class="name">{node.name}</span>
        </div>
        {#if node.children}
          <Self nodes={node.children} depth={depth + 1} />
        {/if}
      {/if}
    </li>
  {/each}
</ul>

<style>
  .tree { list-style: none; margin: 0; padding: 0; }
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
  .row:hover { background: rgba(255, 255, 255, 0.025); color: var(--text); }
  .row.file.active { background: rgba(232, 156, 62, 0.08); color: var(--amber); }
  .dir { color: var(--text-dim); cursor: default; }
  .caret { font-size: 8px; color: var(--text-faint); width: 8px; }
  .ext {
    width: 8px;
    height: 8px;
    border-radius: 1px;
    display: inline-block;
    background: var(--text-faint);
  }
  .ext-tidal { background: var(--tidal); }
  .ext-scd { background: var(--sc); }
  .ext-hydra { background: var(--hydra); }
  .ext-strudel { background: var(--tidal); }
  .ext-py { background: var(--python); }
  .ext-kanopi, .ext-bps { background: var(--kanopi); }
  .ext-js { background: var(--cyan); }
  .name { font-family: var(--font-mono); }
</style>
