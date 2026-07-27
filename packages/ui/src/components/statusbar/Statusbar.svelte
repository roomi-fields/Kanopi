<script lang="ts">
  import { clock } from '../../stores/clock.svelte';
  import { kronosCursor } from '../../stores/kronos-cursor.svelte';
  import { scenes } from '../../stores/scenes.svelte';
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
  const sceneName = $derived(scenes.active?.name ?? '—');
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
      <span class="dim">scene</span> <span class="accent">{sceneName}</span>
    </div>
    <span class="sb-sep">│</span>
    <div class="sb-item">
      <span class="dim">runtimes</span> <span class="num">{activeRuntimes}</span>
    </div>
  </div>

  <div class="sb-group">
    <!-- FOCUS DE JEU — badge de MODE **et** geste de prise (décisions 2026-07-26 et 2026-07-27).
         Un mode qui capte les touches nues doit se VOIR (sans ça, on appuie sur Espace, rien ne
         démarre, et rien à l'écran ne dit pourquoi) ET doit se PRENDRE : « déclarer un périphérique
         clavier ARME le focus — le prendre reste un geste de l'utilisateur ». Produire une scène
         est le geste le plus fréquent du live coding ; s'il emportait les touches nues, l'auteur
         perdrait son clavier au moment où il en fait le plus usage.
         Trois états, un seul endroit : GRISÉ quand la scène ne déclare aucun clavier · PRENDRE
         quand elle en déclare un · PRIS (clic ou Échap pour rendre). -->
    {#if playFocus.held}
      <button
        class="sb-item play-focus pris"
        title="Focus de jeu pris{playFocus.source
          ? ` (${playFocus.source})`
          : ''} — les touches nues vont à la performance, les raccourcis Cmd/Ctrl restent à l'interface. Clic ou Échap pour rendre."
        onclick={() => playFocus.release()}
      >
        <span class="sb-dot"></span>
        <span class="dim">focus</span> <span class="accent">jeu</span>
      </button>
      <span class="sb-sep">│</span>
    {:else}
      <button
        class="sb-item play-focus armed"
        disabled={roleClavier === null}
        title={roleClavier === null
          ? 'Cette scène ne déclare aucun clavier de jeu — rien à prendre. Une scène l’arme en déclarant « @in <rôle> transport.keyboard ».'
          : `Prendre le focus de jeu pour « ${roleClavier} » — les touches nues iront à la performance, les raccourcis Cmd/Ctrl restent à l’interface. Échap pour rendre.`}
        onclick={() => roleClavier && playFocus.take(roleClavier)}
      >
        <span class="dim">focus</span> <span class="accent">jeu ?</span>
      </button>
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

  button.play-focus {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    letter-spacing: inherit;
    color: inherit;
    cursor: pointer;
    /* La barre d'état est une LIGNE : sans ça, « focus jeu ? » se coupait en deux et chevauchait
       le compteur voisin (vu à l'écran, largeur d'un portable). */
    white-space: nowrap;
  }
  /* GRISÉ quand la scène ne déclare aucun clavier : l'affordance reste VISIBLE pour qu'on sache
     qu'elle existe, et inerte pour qu'on sache que cette scène-là n'attend rien du clavier. */
  button.play-focus:disabled {
    opacity: 0.4;
    cursor: default;
  }
  button.play-focus.armed:not(:disabled) .accent {
    color: var(--amber);
  }
  button.play-focus.armed:not(:disabled):hover .accent {
    text-decoration: underline;
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
