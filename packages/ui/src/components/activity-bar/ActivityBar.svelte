<script lang="ts">
  import { ui, type ActivityView } from '../../stores/ui.svelte';
  import ActivityItem from './ActivityItem.svelte';

  type Item = { id: ActivityView; title: string; badge?: number };
  const top: Item[] = [
    { id: 'files', title: 'Files' },
    { id: 'library', title: 'Library' },
    { id: 'search', title: 'Search' },
    { id: 'hardware', title: 'Hardware', badge: 2 },
    { id: 'git', title: 'Git' }
  ];
  const bottom: Item[] = [
    { id: 'docs', title: 'Docs' },
    { id: 'account', title: 'Account' }
  ];
</script>

<nav class="activity-bar">
  {#each top as item (item.id)}
    <ActivityItem
      id={item.id}
      title={item.title}
      badge={item.badge}
      active={ui.activeActivityView === item.id && !ui.sidebarCollapsed}
      onclick={() => ui.setActivity(item.id)}
    />
  {/each}
  <div class="ab-spacer"></div>
  {#each bottom as item (item.id)}
    <ActivityItem
      id={item.id}
      title={item.title}
      active={ui.activeActivityView === item.id && !ui.sidebarCollapsed}
      onclick={() => ui.setActivity(item.id)}
    />
  {/each}
</nav>

<style>
  .activity-bar {
    background: linear-gradient(to bottom, #12151a, #0f1215);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 0;
    gap: 4px;
  }
  .ab-spacer {
    flex: 1;
  }
</style>
