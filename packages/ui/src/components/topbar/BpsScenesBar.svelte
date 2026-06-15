<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { bpsScenes, modelFromFile } from '../../stores/bpsScenes.svelte';
  import { workspace } from '../../stores/workspace.svelte';

  // A5 — selectable named scenes + STEP for the active `.bps`. The model is
  // compiled reactively from the active file here (component reactive context);
  // the bar hides itself when the file has neither named scenes nor a
  // multi-section head rule.
  const activeFile = $derived(
    workspace.activeTabId ? workspace.fileById(workspace.activeTabId) : undefined
  );
  const model = $derived(modelFromFile(activeFile?.name, activeFile?.contents));
  const scenes = $derived(model.scenes);
  // The scene shown lit: the user's explicit pick, or — until they pick one —
  // the default scene the adapter derives (lowest int). Keeps the bar honest
  // about what is actually playing on the initial eval.
  const litScene = $derived(bpsScenes.activeScene ?? model.defaultScene);

  // Alt+1 / Alt+2 … select the first/second/… named scene. Alt-prefixed so it
  // can't collide with the `.kanopi` Scenes panel (bare 1-9) or text typing.
  function onKey(e: KeyboardEvent) {
    if (
      e.target instanceof HTMLElement &&
      (e.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(e.target.tagName))
    )
      return;
    if (!e.altKey || e.metaKey || e.ctrlKey) return;
    const n = parseInt(e.key, 10);
    if (Number.isFinite(n) && n >= 1 && n <= scenes.length) {
      e.preventDefault();
      void bpsScenes.select(model, scenes[n - 1]);
    }
  }
  onMount(() => window.addEventListener('keydown', onKey));
  onDestroy(() => window.removeEventListener('keydown', onKey));
</script>

{#if scenes.length > 0}
  <div class="bps-scenes" data-testid="bps-scenes-bar">
    {#each scenes as s, i (s.name)}
      <button
        class="scene-btn"
        class:active={litScene === s.name}
        type="button"
        title={`Scène ${s.name} (Alt+${i + 1})`}
        onclick={() => bpsScenes.select(model, s)}
      >
        <kbd>{i + 1}</kbd>
        <span class="name">{s.name}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .bps-scenes {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.2);
  }
  .scene-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 9px;
    border: 1px solid var(--border-dim);
    border-radius: 3px;
    background: var(--panel);
    color: var(--text-muted);
    transition: all 0.15s;
  }
  .scene-btn:hover {
    color: var(--text);
    border-color: var(--border);
    background: var(--elevated);
  }
  .scene-btn.active {
    color: var(--amber);
    border-color: var(--amber-dim);
    background: rgba(232, 156, 62, 0.08);
    box-shadow: inset 0 0 0 1px rgba(232, 156, 62, 0.15);
  }
  .scene-btn kbd {
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--elevated);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 9px;
    color: var(--text-muted);
  }
  .scene-btn.active kbd {
    color: var(--amber);
    border-color: var(--amber-dim);
  }
  .scene-btn .name {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.04em;
  }
</style>
