<script lang="ts">
  import { workspace } from '../../stores/workspace.svelte';
  import { referencedLibraries, type ReferencedLib } from '../../lib/library/referenced';
  import { RESOURCE_GROUPS } from '../../lib/library/resources';

  // Now = a LENS on what's loaded (ESPACE_PERSO_SPEC §10.2), not a workspace of
  // its own: it owns no files, it mirrors the ACTIVE tab. Reactive by
  // construction (derived from workspace.activeTabId), never a copy.
  const activeFile = $derived(
    workspace.activeTabId ? workspace.fileById(workspace.activeTabId) : undefined
  );
  const referenced = $derived(referencedLibraries(activeFile?.name, activeFile?.contents));

  // Open a referenced library's CONTENT in the editor (moved as-is from the
  // former Files "Libraries used" block — see FilesView history). Unlike
  // Resources/Factory's "load" actions, Now deliberately stays on itself: it's
  // a lens you browse WHILE looking at the active scene, switching away would
  // hide the very thing you're inspecting. The editor tab opens regardless of
  // which sidebar view is active, so nothing is lost by staying put.
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
  }
</script>

<div class="now-view">
  <section class="scene">
    <h3 class="scene-title">Active scene</h3>
    {#if activeFile}
      <p class="scene-name">{activeFile.name}</p>
    {:else}
      <p class="scene-empty">No scene open.</p>
    {/if}
  </section>

  <section class="libs">
    <h3 class="libs-title">Libraries used</h3>
    {#if !activeFile}
      <p class="libs-empty">Open a scene to see its referenced libraries.</p>
    {:else if referenced.length === 0}
      <p class="libs-empty">This program references no resource libraries.</p>
    {:else}
      <ul class="libs-list">
        {#each referenced as lib (lib.type + ':' + lib.name)}
          <li>
            <button
              type="button"
              class="lib-row"
              title="Open in the editor"
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
</div>

<style>
  .now-view {
    padding: 10px 4px 6px;
  }
  .scene {
    margin: 0 4px 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-dim);
  }
  .scene-title {
    margin: 0 0 6px 6px;
    font-size: 9px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-dim);
    font-weight: 500;
  }
  .scene-name {
    margin: 0 0 0 6px;
    color: var(--amber);
    font-family: var(--font-mono);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .scene-empty,
  .libs-empty {
    margin: 0 0 0 6px;
    font-size: 10.5px;
    color: var(--text-faint);
    font-style: italic;
  }
  .libs {
    margin: 0 4px;
  }
  .libs-title {
    margin: 0 0 6px 6px;
    font-size: 9px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-dim);
    font-weight: 500;
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
