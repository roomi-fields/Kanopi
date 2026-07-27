<script lang="ts">
  import type { TreeNode } from '../../lib/workspace/types';
  import { workspace } from '../../stores/workspace.svelte';
  import { cloudDocs } from '../../stores/cloud-docs.svelte';
  import Self from './FileTree.svelte';

  type Props = { nodes: TreeNode[]; depth?: number };
  const { nodes, depth = 0 }: Props = $props();

  // SUPPRESSION (KAN-14) — une seule ligne peut être en confirmation à la fois, donc un seul
  // identifiant suffit (les frères partagent cette instance de composant). MÊME MOTIF que
  // l'arbre du nuage (`CloudFileTree.svelte`) : dialogue EN LIGNE, jamais un `confirm()` du
  // navigateur, et rien ne part sans un second geste — une suppression est irréversible.
  let confirmingDeleteId = $state<string | null>(null);

  function startDelete(node: TreeNode) {
    if (!node.fileId) return;
    confirmingDeleteId = node.fileId;
  }

  function confirmDelete(node: TreeNode) {
    confirmingDeleteId = null;
    if (node.fileId) workspace.removeFile(node.fileId);
  }

  /** La confirmation DIT ce qui va se passer, et ce n'est pas la même chose des deux côtés : un
   *  fichier local disparaît pour de bon (aucune corbeille), tandis qu'un document du nuage ouvert
   *  ici n'est qu'une PROJECTION — la retirer le laisse intact dans l'espace perso, d'où il se
   *  rouvre. Annoncer « irréversible » dans ce second cas serait faux. */
  const estProjectionDuNuage = (id: string | undefined) => !!id && cloudDocs.isCloudDoc(id);
</script>

<ul class="tree">
  {#each nodes as node (node.path)}
    <li>
      {#if node.type === 'file'}
        <div
          class="row file"
          class:active={workspace.activeTabId === node.fileId}
          style="padding-left: {8 + depth * 12}px"
        >
          {#if confirmingDeleteId === node.fileId}
            <span class="confirm-delete">
              <span class="confirm-label">
                {estProjectionDuNuage(node.fileId)
                  ? `Retirer ${node.name} de l’espace de travail ? (le document du nuage reste)`
                  : `Supprimer ${node.name} ? (définitif)`}
              </span>
              <button type="button" class="confirm-yes" onclick={() => confirmDelete(node)}>
                {estProjectionDuNuage(node.fileId) ? 'Retirer' : 'Supprimer'}
              </button>
              <button type="button" class="confirm-no" onclick={() => (confirmingDeleteId = null)}>
                Annuler
              </button>
            </span>
          {:else}
            <button
              class="open"
              type="button"
              onclick={() => node.fileId && workspace.openFile(node.fileId)}
            >
              <span class="ext ext-{node.name.split('.').pop()}"></span>
              <span class="name">{node.name}</span>
            </button>
            <span class="actions">
              <button type="button" title="Supprimer" onclick={() => startDelete(node)}>🗑</button>
            </span>
          {/if}
        </div>
      {:else}
        <div class="row dir" style="padding-left: {8 + depth * 12}px">
          <span class="caret">▾</span>
          <span class="name">{node.name}</span>
        </div>
        {#if node.children}
          <Self nodes={node.children} depth={depth + 1} />
        {/if}
      {/if}
    </li>
  {/each}
</ul>

<style>
  .tree {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 3px 8px;
    font-size: 11px;
    color: var(--text-muted);
    text-align: left;
    border-radius: 2px;
    transition: background 0.1s;
  }
  .row:hover {
    background: rgba(255, 255, 255, 0.025);
    color: var(--text);
  }
  /* La ligne porte désormais deux enfants (ouvrir + actions) : le bouton d'ouverture prend la
     place, les actions restent à droite et n'apparaissent qu'au survol — l'arbre local ne se
     transforme pas en barre d'outils. Les styles de confirmation sont ceux de l'arbre du nuage,
     repris à l'identique pour que le même geste ait la même apparence des deux côtés. */
  .row.file {
    padding: 0;
  }
  .open {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding: 3px 8px;
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .actions {
    display: flex;
    flex-shrink: 0;
    padding-right: 4px;
    opacity: 0;
    transition: opacity 0.1s;
  }
  .row.file:hover .actions,
  .row.file:focus-within .actions {
    opacity: 1;
  }
  .actions button {
    padding: 2px 5px;
    background: transparent;
    border: none;
    color: var(--text-faint);
    font-size: 10px;
    cursor: pointer;
    border-radius: 2px;
  }
  .actions button:hover {
    color: var(--red, #c84040);
    background: rgba(255, 255, 255, 0.04);
  }
  .confirm-delete {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding: 3px 8px;
  }
  .confirm-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10.5px;
    color: var(--text-muted);
  }
  .confirm-yes,
  .confirm-no {
    flex-shrink: 0;
    padding: 2px 7px;
    font-size: 10px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border: 1px solid var(--border-dim);
    background: transparent;
    border-radius: 2px;
    cursor: pointer;
    font-family: var(--font-mono);
  }
  .confirm-yes {
    color: var(--red, #c84040);
    border-color: var(--red, #c84040);
  }
  .confirm-yes:hover {
    background: rgba(200, 64, 64, 0.12);
  }
  .confirm-no {
    color: var(--text-muted);
  }
  .confirm-no:hover {
    color: var(--text);
    border-color: var(--border);
  }
  .row.file.active {
    background: rgba(232, 156, 62, 0.08);
    color: var(--amber);
  }
  .dir {
    color: var(--text-dim);
    cursor: default;
  }
  .caret {
    font-size: 8px;
    color: var(--text-faint);
    width: 8px;
  }
  .ext {
    width: 8px;
    height: 8px;
    border-radius: 1px;
    display: inline-block;
    background: var(--text-faint);
  }
  .ext-scd {
    background: var(--sc);
  }
  .ext-hydra {
    background: var(--hydra);
  }
  .ext-strudel {
    background: var(--strudel);
  }
  .ext-py {
    background: var(--python);
  }
  .ext-kanopi,
  .ext-bps,
  .ext-gr {
    background: var(--kanopi);
  }
  .ext-js {
    background: var(--cyan);
  }
  .name {
    font-family: var(--font-mono);
  }
</style>
