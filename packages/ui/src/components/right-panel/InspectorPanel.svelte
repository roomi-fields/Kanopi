<script lang="ts">
  import { clock } from '../../stores/clock.svelte';
  import { actors } from '../../stores/actors.svelte';
  import { scenes } from '../../stores/scenes.svelte';
  import { inspector } from '../../stores/inspector.svelte';

  function fmt2(n: number) { return n.toString().padStart(2, '0'); }
  function fmt3(n: number) { return n.toString().padStart(3, '0'); }
  const beatStr = $derived(`${fmt3(clock.state.bar)}·${fmt2(clock.state.beat + 1)}.${fmt2(Math.floor(clock.state.phase * 100))}`);

  function srcLabel(s: typeof inspector.mappings[number]['source']) {
    const ch = s.ch ? '/ch' + s.ch : '';
    switch (s.kind) {
      case 'cv': return `cv:${s.index}${ch}`;
      case 'gate': return `gate:${s.index}${ch}`;
      case 'trig': return `trig:${s.index}${ch}`;
    }
  }
  function tgtLabel(t: typeof inspector.mappings[number]['target']) {
    switch (t.kind) {
      case 'tempo': return 'tempo';
      case 'scene': return `scene:${t.ref}`;
      case 'actor.toggle': return `${t.ref}.toggle`;
      case 'actor.param': return `${t.ref}.${t.param}`;
    }
  }
</script>

<div class="inspector">
  <section>
    <h4>Clock</h4>
    <dl>
      <dt>state</dt><dd>{clock.state.playing ? 'playing' : 'stopped'}</dd>
      <dt>bpm</dt><dd>{clock.state.bpm.toFixed(1)}</dd>
      <dt>position</dt><dd>{beatStr}</dd>
      <dt>scene</dt><dd class="accent">{scenes.active?.name ?? '—'}</dd>
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

  <section>
    <h4>Mappings ({inspector.mappings.length})</h4>
    <ul class="maps">
      {#each inspector.mappings as m (m.id)}
        <li>
          <span class="src">{srcLabel(m.source)}</span>
          <span class="arrow">→</span>
          <span class="tgt">{tgtLabel(m.target)}</span>
          {#if m.lastValue !== undefined}
            <span class="val">{m.lastValue}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .inspector { padding: 8px 12px; display: flex; flex-direction: column; gap: 14px; }
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
  dt { color: var(--text-dim); }
  dd { color: var(--text); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  dd.accent { color: var(--amber); }

  .bullets { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
  .bullets li { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); }
  .dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--text-faint);
  }
  .dot.on { background: var(--green); box-shadow: 0 0 4px var(--green-glow); }

  .maps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 10px; }
  .maps li { display: flex; align-items: center; gap: 6px; font-family: var(--font-code); }
  .src { color: var(--cyan); }
  .arrow { color: var(--text-faint); }
  .tgt { color: var(--text-muted); flex: 1; }
  .val {
    color: var(--amber);
    font-variant-numeric: tabular-nums;
    min-width: 24px;
    text-align: right;
  }
</style>
