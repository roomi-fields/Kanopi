<script lang="ts">
  import { ui, type ActivityView } from '../../stores/ui.svelte';
  import ActivityItem from './ActivityItem.svelte';

  type Item = { id: ActivityView; title: string; badge?: number };
  const top: Item[] = [
    { id: 'files', title: 'Files' },
    { id: 'library', title: 'Library' },
    { id: 'resources', title: 'Resources' },
    { id: 'search', title: 'Search' },
    { id: 'hardware', title: 'Hardware', badge: 2 }
  ];
  const bottom: Item[] = [
    { id: 'docs', title: 'Docs' },
    { id: 'account', title: 'Account' }
  ];

  // « Docs » ouvre la doc utilisateur EMBARQUÉE (MkDocs, servie à la MÊME ORIGINE) dans un
  // onglet dédié — SOURCE UNIQUE (décision Romain 2026-07-02). Pages .html PLATES : en dev
  // `/docs/index.html`, en prod `/kanopi/docs/index.html` (via BASE_URL). Remplace l'ancien
  // aide-mémoire codé en dur (DocsView, retiré). Ce n'est donc PLUS une vue de la sidebar.
  function openDocs() {
    window.open(import.meta.env.BASE_URL + 'docs/index.html', '_blank', 'noopener');
  }
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
      active={item.id !== 'docs' && ui.activeActivityView === item.id && !ui.sidebarCollapsed}
      onclick={() => (item.id === 'docs' ? openDocs() : ui.setActivity(item.id))}
    />
  {/each}
</nav>

<style>
  .activity-bar {
    background: linear-gradient(to bottom, var(--bar-gradient-a), var(--bar-gradient-b));
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
