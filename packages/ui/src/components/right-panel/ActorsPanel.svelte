<script lang="ts">
  import { actors } from '../../stores/actors.svelte';
  import { workspace } from '../../stores/workspace.svelte';

  function openFile(fileName?: string) {
    if (!fileName) return;
    const f = workspace.files.find((x) => x.name === fileName);
    if (f) workspace.openFile(f.id);
  }
</script>

<ul class="actors">
  {#each actors.list as a (a.name)}
    <li class="actor" class:active={a.active}>
      <button class="toggle" type="button" title="toggle {a.name}" onclick={() => actors.toggle(a.name)}>
        <span class="led" class:on={a.active}></span>
      </button>
      <button class="info" type="button" onclick={() => openFile(a.file)}>
        <span class="name">{a.name}</span>
        <span class="meta">
          <span class="rt rt-{a.runtime}">{a.runtime}</span>
          {#if a.file}<span class="file">{a.file}</span>{/if}
        </span>
      </button>
    </li>
  {/each}
</ul>

<style>
  .actors { list-style: none; margin: 0; padding: 4px 0; }
  .actor {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border-dim);
  }
  .toggle {
    width: 22px; height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
  }
  .led {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--text-faint);
    transition: all 0.15s;
  }
  .led.on {
    background: var(--green);
    box-shadow: 0 0 6px var(--green-glow);
  }
  .info {
    flex: 1;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .info:hover { color: var(--text); }
  .name { font-size: 12px; color: var(--text); font-family: var(--font-mono); }
  .actor:not(.active) .name { color: var(--text-muted); }
  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    color: var(--text-dim);
    letter-spacing: 0.04em;
  }
  .rt {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 500;
    font-size: 9px;
  }
  .rt-tidal { color: var(--tidal); }
  .rt-sc { color: var(--sc); }
  .rt-hydra { color: var(--hydra); }
  .rt-strudel { color: var(--tidal); }
  .rt-python { color: var(--python); }
  .rt-kanopi { color: var(--kanopi); }
  .rt-js { color: var(--cyan); }
  .file { color: var(--text-faint); font-family: var(--font-code); }
</style>
