<script lang="ts">
  import { clock } from '../../stores/clock.svelte';
  import { kronosCursor } from '../../stores/kronos-cursor.svelte';
  import { actors } from '../../stores/actors.svelte';
  import { fmt2, fmt3 } from '../../lib/format/bar-beat';

  // Position from Kronos's Transport, sampled per-frame into `kronosCursor.beat` (the
  // single position authority, frozen-aware). `null` = stopped / no scene → rest readout
  // (001·01.00). The clock holds only tempo + transport flags, never the position.
  const beatStr = $derived.by(() => {
    const bp = kronosCursor.beat ?? { bar: 1, beat: 0, phase: 0 };
    return `${fmt3(bp.bar)}·${fmt2(bp.beat + 1)}.${fmt2(Math.floor(bp.phase * 100))}`;
  });
</script>

<div class="inspector">
  <section>
    <h4>Clock</h4>
    <dl>
      <dt>state</dt>
      <dd>{clock.state.playing ? 'playing' : clock.state.paused ? 'paused' : 'stopped'}</dd>
      <dt>bpm</dt>
      <dd>{clock.state.bpm != null ? clock.state.bpm.toFixed(1) : '—'}</dd>
      <dt>position</dt>
      <dd>{beatStr}</dd>
    </dl>
  </section>

  <section>
    <h4>Actors ({actors.list.filter((a) => a.active).length}/{actors.list.length})</h4>
    <ul class="bullets">
      {#each actors.list as a (a.name)}
        <li><span class="dot" class:on={a.active}></span>{a.name}</li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .inspector {
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  h4 {
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 6px;
    font-weight: 500;
  }
  dl {
    display: grid;
    grid-template-columns: 80px 1fr;
    row-gap: 4px;
    font-size: 11px;
  }
  dt {
    color: var(--text-dim);
  }
  dd {
    color: var(--text);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  dd.accent {
    color: var(--amber);
  }

  .bullets {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .bullets li {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-muted);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-faint);
  }
  .dot.on {
    background: var(--green);
    box-shadow: 0 0 4px var(--green-glow);
  }
</style>
