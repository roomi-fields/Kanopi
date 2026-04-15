<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { scenes } from '../../stores/scenes.svelte';
  import { actors } from '../../stores/actors.svelte';

  function runtimeOf(name: string) {
    return actors.list.find((a) => a.name === name)?.runtime ?? 'kanopi';
  }

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(e.target.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const n = parseInt(e.key, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 9) {
      const s = scenes.list[n - 1];
      if (s) scenes.activate(s.name);
    }
  }
  onMount(() => window.addEventListener('keydown', onKey));
  onDestroy(() => window.removeEventListener('keydown', onKey));
</script>

<ul class="scenes">
  {#each scenes.list as s, i (s.name)}
    <li>
      <button class="card" class:active={s.active} type="button" onclick={() => scenes.activate(s.name)}>
        <header>
          <kbd>{i + 1}</kbd>
          <span class="name">{s.name}</span>
        </header>
        <div class="dots">
          {#each Object.entries(s.actors) as [actorName, on] (actorName)}
            <span class="dot rt-{runtimeOf(actorName)}" class:on title={actorName}></span>
          {/each}
        </div>
      </button>
    </li>
  {/each}
</ul>

<style>
  .scenes { list-style: none; margin: 0; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
  .card {
    width: 100%;
    text-align: left;
    padding: 10px;
    border: 1px solid var(--border-dim);
    border-radius: 4px;
    background: var(--panel);
    transition: all 0.15s;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .card:hover { border-color: var(--border); background: var(--elevated); }
  .card.active {
    border-color: var(--amber-dim);
    background: rgba(232, 156, 62, 0.06);
    box-shadow: inset 0 0 0 1px rgba(232, 156, 62, 0.15);
  }
  header { display: flex; align-items: center; gap: 8px; }
  kbd {
    width: 18px; height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--elevated);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 9px;
    color: var(--text-muted);
  }
  .card.active kbd { color: var(--amber); border-color: var(--amber-dim); }
  .name {
    font-size: 12px;
    color: var(--text);
    font-family: var(--font-mono);
    letter-spacing: 0.04em;
  }
  .dots { display: flex; gap: 4px; }
  .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--border);
    opacity: 0.4;
  }
  .dot.on { opacity: 1; }
  .dot.rt-tidal.on { background: var(--tidal); box-shadow: 0 0 4px rgba(178, 146, 201, 0.5); }
  .dot.rt-sc.on { background: var(--sc); box-shadow: 0 0 4px rgba(106, 164, 212, 0.5); }
  .dot.rt-hydra.on { background: var(--hydra); box-shadow: 0 0 4px rgba(212, 165, 102, 0.5); }
  .dot.rt-python.on { background: var(--python); }
  .dot.rt-kanopi.on { background: var(--kanopi); }
  .dot.rt-js.on { background: var(--cyan); }
</style>
