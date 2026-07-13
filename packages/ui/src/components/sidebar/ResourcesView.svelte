<script lang="ts">
  import { RESOURCE_GROUPS, type ResourceEntry } from '../../lib/library/resources';
  import { workspace } from '../../stores/workspace.svelte';

  // Open a resource entry as a read-only JSON file in the editor, the same way
  // a game file is opened (workspace.openFile). The VirtualFile is created in
  // memory and reused on subsequent clicks (addFile dedupes by path), so
  // re-opening doesn't pile up tabs. Stays on whatever activity view the user
  // is on (Factory › Libraries) — opening a resource must not jump to Mine.
  function openResource(type: string, entry: ResourceEntry) {
    const path = `resources/${type}/${entry.id}.json`;
    const contents = JSON.stringify(entry.data, null, 2);
    const id = workspace.addFile(path, contents, true);
    workspace.openFile(id);
  }
</script>

<div class="wrap">
  <p class="intro">
    The resource libraries a program can draw on — alphabets, tunings, scales, audio banks, devices…
    Read-only browse.
  </p>
  {#each RESOURCE_GROUPS as group (group.type)}
    <section class="group">
      <h3 class="section-title">
        {group.title}
        <span class="count">{group.entries.length}</span>
      </h3>
      {#if group.entries.length === 0}
        <p class="empty">— none —</p>
      {:else}
        <ul class="list">
          {#each group.entries as entry (entry.id)}
            <li>
              <button type="button" class="row" onclick={() => openResource(group.type, entry)}>
                <span class="id">{entry.id}</span>
                {#if entry.label}<span class="label" title={entry.label}>{entry.label}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
</div>

<style>
  .wrap {
    padding: 12px 12px 22px;
  }
  .intro {
    color: var(--text-dim);
    font-size: 11.5px;
    line-height: 1.6;
    margin: 0 0 14px;
  }
  .group {
    margin-bottom: 16px;
  }
  .section-title {
    display: flex;
    align-items: baseline;
    gap: 7px;
    margin: 0 0 6px;
    font-size: 9.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-dim);
    font-weight: 500;
  }
  .count {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--text-faint);
    letter-spacing: 0.05em;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    padding: 3px 6px;
    border: none;
    border-radius: 2px;
    background: none;
    text-align: left;
    cursor: pointer;
    font: inherit;
    color: inherit;
  }
  .row:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  .id {
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 11.5px;
    flex-shrink: 0;
  }
  .label {
    color: var(--text-faint);
    font-size: 10.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    color: var(--text-faint);
    font-size: 10.5px;
    font-style: italic;
    margin: 0 0 0 6px;
  }
</style>
