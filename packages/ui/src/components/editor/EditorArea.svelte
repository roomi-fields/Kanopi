<script lang="ts">
  import { workspace } from '../../stores/workspace.svelte';
  import TabBar from './TabBar.svelte';
  import CMEditor from './CMEditor.svelte';
  import { core } from '../../lib/core';

  const file = $derived(workspace.activeTabId ? workspace.fileById(workspace.activeTabId) : undefined);
</script>

<section class="editor">
  <TabBar />
  <div class="editor-body">
    {#if file}
      <CMEditor
        docId={file.id}
        doc={file.contents}
        onChange={(text) => workspace.updateContents(file.id, text)}
        onEval={(code) => core.evaluateBlock(file.runtime, code, file.id)}
      />
    {:else}
      <p class="hint">Open a file from the sidebar.</p>
    {/if}
  </div>
</section>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    background: var(--bg);
    overflow: hidden;
    min-height: 0;
  }
  .editor-body {
    flex: 1;
    overflow: hidden;
    display: flex;
  }
  .hint {
    color: var(--text-faint);
    font-size: 11px;
    margin: 20px;
  }
</style>
