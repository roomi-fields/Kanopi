<script lang="ts">
  import { ui, type ActivityView } from '../../stores/ui.svelte';
  import ActivityItem from './ActivityItem.svelte';

  type Item = { id: ActivityView; title: string; badge?: number; disabled?: boolean };
  // Groups per the DAW-style origin model (ESPACE_PERSO_SPEC §10.1): Content
  // (Now/Factory/Mine, primary axis = origin) — Lenses (Hardware/Resources,
  // read-only references) — Utilities (Docs/Search/Account) pinned to the bottom.
  const content: Item[] = [
    { id: 'now', title: 'Now' },
    { id: 'factory', title: 'Factory' },
    { id: 'mine', title: 'Mine' }
  ];
  const lenses: Item[] = [
    { id: 'hardware', title: 'Hardware', badge: 2 },
    { id: 'resources', title: 'Resources' }
  ];
  const bottom: Item[] = [
    { id: 'docs', title: 'Docs' },
    { id: 'search', title: 'Search — coming soon', disabled: true },
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
  {#each content as item (item.id)}
    <ActivityItem
      id={item.id}
      title={item.title}
      badge={item.badge}
      active={ui.activeActivityView === item.id && !ui.sidebarCollapsed}
      onclick={() => ui.setActivity(item.id)}
    />
  {/each}
  <div class="ab-divider"></div>
  {#each lenses as item (item.id)}
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
      disabled={item.disabled}
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
  .ab-divider {
    width: 22px;
    height: 1px;
    background: var(--border-dim);
    margin: 4px 0;
  }
  .ab-spacer {
    flex: 1;
  }
</style>
