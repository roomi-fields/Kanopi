<script lang="ts">
  import { workspace } from '../../stores/workspace.svelte';
  import { actors as actorsStore } from '../../stores/actors.svelte';

  type Props = { id: string };
  const { id }: Props = $props();
  const file = $derived(workspace.fileById(id));
  const active = $derived(workspace.activeTabId === id);
  const actorActive = $derived(
    !!file && actorsStore.list.some((a) => a.active && (a.file === file.name || a.file === file.path))
  );

  function onDragStart(e: DragEvent) {
    e.dataTransfer?.setData('text/x-tab-id', id);
    e.dataTransfer!.effectAllowed = 'move';
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    const dragged = e.dataTransfer?.getData('text/x-tab-id');
    if (dragged && dragged !== id) workspace.reorder(dragged, id);
  }
</script>

{#if file}
  <div
    class="tab"
    class:active
    role="tab"
    tabindex="0"
    draggable="true"
    ondragstart={onDragStart}
    ondragover={onDragOver}
    ondrop={onDrop}
    onclick={() => workspace.setActive(id)}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && workspace.setActive(id)}
  >
    <span class="ext ext-{file.name.split('.').pop()}"></span>
    <span class="name">{file.name}</span>
    {#if actorActive}
      <span class="live-dot" title="actor active"></span>
    {/if}
    <button
      class="close"
      type="button"
      title="Close"
      onclick={(e) => {
        e.stopPropagation();
        workspace.closeTab(id);
      }}
    >×</button>
  </div>
{/if}

<style>
  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    height: 32px;
    font-size: 11px;
    color: var(--text-muted);
    border-right: 1px solid var(--border-dim);
    cursor: pointer;
    user-select: none;
  }
  .tab:hover { color: var(--text); background: rgba(255, 255, 255, 0.02); }
  .tab.active {
    color: var(--text);
    background: var(--bg);
    box-shadow: inset 0 1px 0 var(--amber);
  }
  .ext {
    width: 8px; height: 8px; border-radius: 1px;
    background: var(--text-faint);
  }
  .ext-tidal { background: var(--tidal); }
  .ext-scd { background: var(--sc); }
  .ext-hydra { background: var(--hydra); }
  .ext-strudel { background: var(--tidal); }
  .ext-py { background: var(--python); }
  .ext-kanopi, .ext-bps { background: var(--kanopi); }
  .ext-js { background: var(--cyan); }
  .live-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 5px var(--green-glow);
    animation: live-pulse 0.9s ease-in-out infinite;
  }
  @keyframes live-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(0.85); }
  }
  .close {
    width: 14px; height: 14px;
    line-height: 1;
    font-size: 12px;
    color: var(--text-faint);
    border-radius: 2px;
  }
  .close:hover { color: var(--text); background: var(--elevated); }
</style>
