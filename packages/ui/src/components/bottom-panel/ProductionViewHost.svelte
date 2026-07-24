<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { ViewModule, ProductionInput, ProductionStructure, PoigneeTrace } from 'runtime-ui';
  import { productionFeed } from '../../stores/production-feed.svelte';
  import { kronosCursor } from '../../stores/kronos-cursor.svelte';
  import { recordViewInput } from '../../lib/pilot/view-input-observer';

  let { view }: { view: ViewModule } = $props();
  let container: HTMLElement;

  onMount(() => view.mount({ container }));
  onDestroy(() => view.unmount());

  // The Kairos projection (structure) only changes when the living tree does — i.e. on
  // `generation` (eval / re-random swap). A transport gesture (play/pause/stop) bumps
  // `kronosCursor.state` but NOT `generation`, so re-reading the whole Kairos tree on every
  // gesture is wasted work (F21: visible hitch on large scenes). Cache the last projection
  // and re-read it ONLY when `generation` advances; transport changes re-render with the
  // cached tree + the fresh cursor/mode. Kairos stays the authority — this only stops the
  // host from re-pulling an UNCHANGED projection on each transport tick.
  let lastGen = -1;
  let cachedStructure: ProductionStructure | null = null;
  // [745] La poignée de trace, comme `structure`, ne change qu'au (re)chargement de
  // Kairos (generation) — jamais au gré du transport. PORTÉE verbatim (identité de
  // référence), jamais résolue ni abonnée ici.
  let cachedTrace: PoigneeTrace | null = null;
  // [97] Chaîne d'items en graphie moteur — même règle que structure/trace : ne change qu'au
  // (re)chargement (generation), jamais au gré du transport. PORTÉE verbatim.
  let cachedChaine: string | null = null;

  $effect(() => {
    // Reactive deps: generation (eval/swap → re-read), transport state + handle (cursor only).
    const gen = productionFeed.generation;
    if (gen !== lastGen) {
      cachedStructure = productionFeed.structure();
      cachedTrace = productionFeed.trace();
      cachedChaine = productionFeed.chaine();
      lastGen = gen;
    }
    const input: ProductionInput = {
      structure: cachedStructure,
      trace: cachedTrace,
      chaineItems: cachedChaine,
      transport: {
        mode: kronosCursor.state,
        cursor: kronosCursor.active,
        // Q2 seek (archi [724], Kronos cee7339/transport.ts:397) : PASSE-PLAT de `playFrom(sec)`.
        // La vue signale le geste « lire depuis ce point » (clic règle) ; Kronos COMPOSE pose+lance
        // en interne — l'hôte ne fait que PORTER l'unique méthode (PORTER ≠ RÉSOUDRE), zéro
        // composition, zéro conversion (`sec` = domaine de `cursor.position()`). Aucun handle
        // actif → no-op propre (canal ouvert mais geste ignoré, cf contrat TransportView).
        playFrom: (sec: number) => kronosCursor.active?.transport?.playFrom(sec)
      }
    };
    view.update(input);
    // DEV probe (window.kanopi.inspect.lastViewInput) — record what the render layer receives,
    // to prove/disprove a host-side wiring gap (e.g. cursor frozen on replay). No render effect.
    recordViewInput(view.id, input);
  });
</script>

<div class="pv-host" bind:this={container}></div>

<style>
  .pv-host {
    width: 100%;
    height: 100%;
    overflow: auto;
  }
</style>
