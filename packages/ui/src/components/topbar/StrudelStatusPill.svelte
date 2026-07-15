<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    onStrudelStatus,
    strudelHasLiveVoices,
    onStrudelLive,
    type StrudelStatus
  } from 'runtime-codevoices';
  import { interpsForScene } from '../../lib/runtimes/bpx-adapter';
  import { workspace } from '../../stores/workspace.svelte';

  let status = $state<StrudelStatus>('idle');
  let unsubStatus: (() => void) | undefined;
  let strudelLive = $state(strudelHasLiveVoices());
  let unsubLive: (() => void) | undefined;

  onMount(() => {
    // onStrudelStatus() calls back synchronously with the CURRENT status on
    // subscription (runtime-codevoices strudel.ts:151), so this also covers
    // mounting after Strudel already loaded earlier in the session.
    unsubStatus = onStrudelStatus((s) => (status = s));
    // onStrudelLive() also calls back synchronously with the current value.
    unsubLive = onStrudelLive((live) => (strudelLive = live));
  });
  onDestroy(() => {
    unsubStatus?.();
    unsubLive?.();
  });

  const labels: Record<StrudelStatus, string> = {
    idle: 'idle',
    loading: 'loading…',
    ready: 'ready',
    error: 'error'
  };

  // Visibility rule — OPTION 3 (arbitrage archi, honore les 2 exigences Romain [785/789]) :
  // le bandeau est visible SSI (la scène ACTIVE utilise strudel) OU (strudel joue une voix
  // vivante, même en fond). D'abord un gate "scène active" pur ([785] : une scène p5 sans
  // strudel affichait quand même le bandeau — mensonge sur la voix chargée) ; corrigé plus tard
  // (Romain 2026-07-14 : "s'affiche parfois, incohérent") en gate "statut moteur" pur — mais ça
  // faisait DISPARAÎTRE le bandeau dès qu'on quittait l'onglet strudel alors que la voix jouait
  // toujours en fond. Option 3 combine les deux signaux au lieu de choisir : `activeSceneUsesStrudel`
  // (analyse texte→interps de l'onglet actif, projection pure, aucun état inventé) OU
  // `strudelHasLiveVoices()` (signal amont runtime-codevoices, par-vie-de-voix, ≠ statut moteur).
  // `status !== 'idle'` reste la garde de base : rien à montrer tant que strudel n'a jamais chargé.
  const activeSceneUsesStrudel = $derived(
    workspace.activeTabId
      ? interpsForScene(workspace.fileById(workspace.activeTabId)?.contents ?? '').includes(
          'strudel'
        )
      : false
  );

  const visible = $derived(status !== 'idle' && (activeSceneUsesStrudel || strudelLive));
</script>

{#if visible}
  <div class="pill" data-status={status} title="Strudel runtime status">
    <span class="dot"></span>
    <span class="label">strudel</span>
    <span class="state">{labels[status]}</span>
  </div>
{/if}

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    color: var(--text-dim);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-faint);
    transition: all 0.2s;
  }
  .label {
    color: var(--text-muted);
  }
  .state {
    color: var(--text-dim);
  }

  .pill[data-status='loading'] .dot {
    background: var(--amber);
    box-shadow: 0 0 5px var(--amber-glow);
    animation: blink 0.7s ease-in-out infinite;
  }
  .pill[data-status='ready'] .dot {
    background: var(--green);
    box-shadow: 0 0 5px var(--green-glow);
  }
  .pill[data-status='ready'] .state {
    color: var(--green);
  }
  .pill[data-status='error'] .dot {
    background: var(--red);
    box-shadow: 0 0 5px var(--red-glow);
  }
  .pill[data-status='error'] .state {
    color: var(--red);
  }

  @keyframes blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
</style>
