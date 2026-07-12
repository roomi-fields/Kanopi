<script lang="ts">
  import { ui } from '../../stores/ui.svelte';
  import AccountView from './AccountView.svelte';
  import FilesView from './FilesView.svelte';
  import HardwareView from './HardwareView.svelte';
  import LibraryView from './LibraryView.svelte';
  import ResourcesView from './ResourcesView.svelte';

  const labels = {
    files: 'Files',
    library: 'Library',
    resources: 'Resources',
    search: 'Search',
    hardware: 'Hardware',
    docs: 'Docs',
    account: 'Account'
  };
</script>

<aside class="sidebar-left">
  <header class="sb-header">
    <span class="label">{labels[ui.activeActivityView]}</span>
  </header>
  <div class="sb-body">
    {#if ui.activeActivityView === 'files'}
      <FilesView />
    {:else if ui.activeActivityView === 'hardware'}
      <HardwareView />
    {:else if ui.activeActivityView === 'library'}
      <LibraryView />
    {:else if ui.activeActivityView === 'resources'}
      <ResourcesView />
    {:else if ui.activeActivityView === 'account'}
      <AccountView />
    {:else}
      <p class="placeholder">— {labels[ui.activeActivityView].toLowerCase()} view —</p>
    {/if}
  </div>
</aside>

<style>
  .sidebar-left {
    background: var(--surface);
    border-right: 1px solid var(--border);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .sb-header {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-dim);
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .sb-body {
    flex: 1;
    overflow-y: auto;
  }
  .placeholder {
    color: var(--text-faint);
    font-size: 11px;
    letter-spacing: 0.05em;
    padding: 16px 12px;
  }
</style>
