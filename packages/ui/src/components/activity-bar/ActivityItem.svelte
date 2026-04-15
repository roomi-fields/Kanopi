<script lang="ts">
  import type { ActivityView } from '../../stores/ui.svelte';
  import IconFiles from '../../lib/icons/IconFiles.svelte';
  import IconLibrary from '../../lib/icons/IconLibrary.svelte';
  import IconSearch from '../../lib/icons/IconSearch.svelte';
  import IconHardware from '../../lib/icons/IconHardware.svelte';
  import IconGit from '../../lib/icons/IconGit.svelte';
  import IconDocs from '../../lib/icons/IconDocs.svelte';
  import IconAccount from '../../lib/icons/IconAccount.svelte';

  type Props = {
    id: ActivityView;
    title: string;
    active: boolean;
    badge?: number;
    onclick: () => void;
  };
  const { id, title, active, badge, onclick }: Props = $props();
</script>

<button class="ab-btn" class:active {title} type="button" {onclick}>
  {#if id === 'files'}<IconFiles />
  {:else if id === 'library'}<IconLibrary />
  {:else if id === 'search'}<IconSearch />
  {:else if id === 'hardware'}<IconHardware />
  {:else if id === 'git'}<IconGit />
  {:else if id === 'docs'}<IconDocs />
  {:else if id === 'account'}<IconAccount />
  {/if}
  {#if badge !== undefined}
    <span class="ab-badge">{badge}</span>
  {/if}
</button>

<style>
  .ab-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-dim);
    border-radius: 3px;
    position: relative;
    transition: all 0.15s;
  }
  .ab-btn:hover {
    color: var(--text-muted);
    background: rgba(255, 255, 255, 0.02);
  }
  .ab-btn.active {
    color: var(--amber);
    background: rgba(232, 156, 62, 0.08);
  }
  .ab-btn.active::before {
    content: '';
    position: absolute;
    left: -1px;
    top: 8px;
    bottom: 8px;
    width: 2px;
    background: var(--amber);
    box-shadow: 0 0 6px var(--amber-glow);
    border-radius: 0 2px 2px 0;
  }
  .ab-btn :global(svg) {
    width: 18px;
    height: 18px;
  }
  .ab-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    min-width: 13px;
    height: 13px;
    padding: 0 3px;
    background: var(--amber);
    color: var(--bg);
    font-size: 8px;
    font-weight: 600;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 4px var(--amber-glow);
  }
</style>
