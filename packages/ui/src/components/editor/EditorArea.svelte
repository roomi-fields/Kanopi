<script lang="ts">
  import { workspace } from '../../stores/workspace.svelte';
  import { cloudDocs } from '../../stores/cloud-docs.svelte';
  import { isNonProgramFile } from '../../lib/workspace/types';
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
        path={file?.path}
        doc={file?.contents}
        runtime={file?.runtime}
        readOnly={file?.readOnly ?? false}
        onChange={(text) => {
          if (!file) return;
          workspace.updateContents(file.id, text);
          // Doc cloud (projeté depuis session.storage) : re-projette la frappe en
          // commande d'écriture débouncée. Fichier local (déconnecté/brouillon) : inchangé.
          if (cloudDocs.isCloudDoc(file.id)) cloudDocs.setContent(file.id, text);
        }}
        onEval={(code, docOffset, actorId) => {
          // A data file (`libraries/…` or `resources/…` JSON catalog) is never a
          // program — Ctrl+Enter must not attempt to derive/play it (decision
          // 2026-07-13-invocation-librairies-factory-mine.md).
          if (!file || isNonProgramFile(file.path)) return;
          return core.evaluateBlock(file.runtime, code, file.name, docOffset, actorId);
        }}
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
