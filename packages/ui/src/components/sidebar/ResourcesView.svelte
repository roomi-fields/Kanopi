<script lang="ts">
  import { RESOURCE_GROUPS } from '../../lib/library/resources';
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
            <li class="row">
              <span class="id">{entry.id}</span>
              {#if entry.label}<span class="label" title={entry.label}>{entry.label}</span>{/if}
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
    padding: 3px 6px;
    border-radius: 2px;
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
