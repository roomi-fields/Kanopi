<script lang="ts">
  import { clock } from '../../stores/clock.svelte';
  import { kronosCursor } from '../../stores/kronos-cursor.svelte';
  import { actors } from '../../stores/actors.svelte';
  import { consoleLog } from '../../stores/console.svelte';
  import { playFocus } from '../../stores/play-focus.svelte';
  import { workspace } from '../../stores/workspace.svelte';
  import { declaredInputsForScene } from '../../lib/runtimes/bpx-adapter';
  import { fmt2, fmt3 } from '../../lib/format/bar-beat';

  // Ableton-style Bar.Beat — both 1-indexed, beats per bar from time signature.
  // `state.beat` is 0..(N-1) internally; display adds 1 so Ableton convention
  // holds (first beat is 1, not 0). Absolute beat count stays available in the
  // event overlay (`?events=1`) for debugging.
  // « — » when nothing is live and the user has typed no tempo (no host-invented default).
  const bpmStr = $derived(clock.state.bpm != null ? clock.state.bpm.toFixed(1) : '—');
  // Position from Kronos's Transport, sampled per-frame into `kronosCursor.beat` (the
  // single position authority, frozen-aware). `null` = stopped / no scene → rest readout
  // (bar 1, beat 0). The clock holds only tempo + transport flags, never the position.
  const posStr = $derived.by(() => {
    const bp = kronosCursor.beat;
    return bp ? fmt3(bp.bar) + '.' + fmt2(bp.beat + 1) : '001.01';
  });
  const activeRuntimes = $derived(
    new Set(actors.list.filter((a) => a.active).map((a) => a.runtime)).size
  );
  const errors = $derived(consoleLog.entries.filter((e) => e.level === 'error').length);

  // LA DÉCLARATION ARME, L'UTILISATEUR PREND (décision
  // `2026-07-27-focus-de-jeu-la-declaration-arme-l-utilisateur-prend.md`). Le rôle clavier est LU
  // sur l'AST de la scène active, jamais re-analysé du texte ni fabriqué ici : sans `@in <rôle>
  // transport.keyboard`, la scène n'attend rien du clavier et le geste reste grisé — pour que ça
  // se SACHE, plutôt que de laisser cliquer sur un mode qui ne servirait à rien.
  const roleClavier = $derived.by(() => {
    const texte = workspace.activeTabId
      ? (workspace.fileById(workspace.activeTabId)?.contents ?? '')
      : '';
    return declaredInputsForScene(texte).find((e) => e.transport === 'keyboard')?.name ?? null;
  });
</script>

<footer class="statusbar">
  <div class="sb-group">
    <div class="sb-item">
      <span class="sb-dot" class:paused={!clock.state.playing}></span>
      <span class="num">{bpmStr}</span>
      <span class="dim">BPM</span>
    </div>
    <span class="sb-sep">│</span>
    <div class="sb-item" title="bar.beat (Ableton-style, 1-indexed)">
      <span class="dim">bar.beat</span> <span class="num">{posStr}</span>
    </div>
    <span class="sb-sep">│</span>
    <div class="sb-item">
      <span class="dim">runtimes</span> <span class="num">{activeRuntimes}</span>
    </div>
  </div>

  <div class="sb-group">
    <!-- FOCUS DE JEU — UN MIROIR, PLUS UN BOUTON (décision Romain 2026-07-28, « on fait comme
         Bitwig »). Le VERROU DES MAJUSCULES arme le clavier de jeu ; l'écran ne fait que REFLÉTER
         son voyant, parce qu'aucune page ne peut allumer ni éteindre celui d'un clavier. Le badge
         cliquable et la sortie par Échap ont disparu dans le même mouvement : deux façons d'armer
         un même mode, c'est la voie parallèle qui finit par diverger.
         TROIS ÉTATS, et le troisième est le plus important : PRIS (verrou enclenché, les touches
         nues vont à la performance) · RENDU · INCONNU tant qu'aucun geste n'a été observé — l'état
         du verrou ne se lit que sur un événement, jamais au chargement. On affiche INCONNU plutôt
         qu'« éteint », parce qu'un éteint faux est pire qu'un inconnu assumé ; il tombe de toute
         façon au premier clic dans la fenêtre. -->
    {#if playFocus.etat === 'pris'}
      <div
        class="sb-item play-focus pris"
        title="VERROU MAJ ENCLENCHÉ — les touches nues vont à la performance ; les raccourcis Cmd/Ctrl restent à l'interface. Relâche le verrou des majuscules pour rendre la main."
      >
        <span class="sb-dot"></span>
        <span class="dim">focus</span> <span class="accent">jeu</span>
      </div>
      <span class="sb-sep">│</span>
    {:else if playFocus.etat === 'rendu'}
      <div
        class="sb-item play-focus rendu"
        title={roleClavier === null
          ? 'Verrou des majuscules relâché. Cette scène ne déclare aucun clavier de jeu — une scène l’arme en déclarant « @in <rôle> transport.keyboard ».'
          : `Verrou des majuscules relâché : les touches vont à l’interface. Enclenche-le pour jouer « ${roleClavier} » au clavier.`}
      >
        <span class="dim">focus</span> <span class="dim">maj</span>
      </div>
      <span class="sb-sep">│</span>
    {:else}
      <div
        class="sb-item play-focus inconnu"
        title="État du verrou des majuscules encore INCONNU — il ne se lit que sur un geste (touche ou clic), jamais au chargement. Le premier clic dans la fenêtre le révèle."
      >
        <span class="dim">focus</span> <span class="accent">maj ?</span>
      </div>
      <span class="sb-sep">│</span>
    {/if}
    <div class="sb-item">
      <span class="dim">devices</span> <span class="num">0</span>
    </div>
    <span class="sb-sep">│</span>
    <div class="sb-item">
      <span class="dim">errors</span>
      <span class="num" style="color: {errors ? 'var(--red)' : 'var(--text-faint)'}">{errors}</span>
    </div>
    <span class="sb-sep">│</span>
    <div class="sb-item">
      <span class="dim">kanopi</span>
      <span class="num">v0.1.0</span><span class="dim">-alpha</span>
    </div>
  </div>
</footer>

<style>
  .statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 0 16px;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-muted);
    letter-spacing: 0.06em;
  }

  .sb-group {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .sb-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* La barre d'état est une LIGNE : sans ça, l'étiquette se coupait en deux et chevauchait le
     compteur voisin (vu à l'écran, largeur d'un portable). Plus de `cursor: pointer` ni de
     soulignement au survol : ce n'est plus quelque chose qu'on clique, et le laisser ressembler à
     un bouton ferait chercher un geste qui n'existe plus. */
  .play-focus {
    white-space: nowrap;
  }
  /* INCONNU : accentué, parce que c'est l'état qui demande un geste (n'importe lequel) pour se
     lever — pas éteint, pas discret. */
  .play-focus.inconnu .accent {
    color: var(--amber);
  }
  /* RENDU : entièrement en sourdine, comme les compteurs voisins — rien à faire, rien à voir. */
  .play-focus.rendu {
    opacity: 0.55;
  }

  .sb-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--amber);
    box-shadow: 0 0 5px var(--amber-glow);
    animation: sb-pulse 0.47s ease-out infinite;
  }
  .sb-dot.paused {
    background: var(--text-faint);
    box-shadow: none;
    animation: none;
  }

  @keyframes sb-pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.4;
      transform: scale(0.85);
    }
  }

  .sb-item .accent {
    color: var(--amber);
  }
  .sb-item .dim {
    color: var(--text-dim);
  }
  .sb-item .num {
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .sb-sep {
    color: var(--text-faint);
  }
</style>
