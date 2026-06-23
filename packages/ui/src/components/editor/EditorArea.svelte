<script lang="ts">
  import { workspace } from '../../stores/workspace.svelte';
  import TabBar from './TabBar.svelte';
  import CMEditor from './CMEditor.svelte';
  import { core } from '../../lib/core';

  const file = $derived(
    workspace.activeTabId ? workspace.fileById(workspace.activeTabId) : undefined
  );
</script>

<section class="editor">
  <TabBar />
  <div class="editor-body">
    {#if file}
      <!-- Props use `file?.` (not `file.`): when the active tab is
           closed, `file` becomes undefined and Svelte tears down CMEditor; one
           of its teardown effects re-reads these prop getters, so a bare
           `file.runtime` throws "Cannot read properties of undefined". The {#if}
           guards the render, not the getter evaluated during teardown. -->
      <CMEditor
        docId={file?.id}
        fileName={file?.name}
        doc={file?.contents}
        runtime={file?.runtime}
        readOnly={file?.readOnly ?? false}
        onChange={(text) => file && workspace.updateContents(file.id, text)}
        onEval={(code, docOffset, actorId) =>
          file && core.evaluateBlock(file.runtime, code, file.name, docOffset, actorId)}
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
