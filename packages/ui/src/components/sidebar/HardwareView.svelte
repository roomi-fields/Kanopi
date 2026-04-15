<script lang="ts">
  import { core } from '../../lib/core';
  import { listPorts } from '../../lib/midi/midi-input';

  let ports = $state<string[]>(listPorts());
  let enabled = $state(false);
  let busy = $state(false);
  $effect(() => { enabled = ports.length > 0 || enabled; });

  async function enable() {
    busy = true;
    await core.enableMidiInput();
    ports = listPorts();
    enabled = true;
    busy = false;
  }
</script>

<div class="hw">
  <section>
    <h4>WebMIDI</h4>
    {#if !enabled}
      <button class="enable" type="button" disabled={busy} onclick={enable}>
        {busy ? '…' : 'Enable MIDI input'}
      </button>
      <p class="hint">Browser will prompt for permission.</p>
    {:else if ports.length === 0}
      <p class="hint">No MIDI input detected. Plug a controller and click refresh.</p>
      <button class="enable" type="button" onclick={enable}>Refresh</button>
    {:else}
      <ul class="ports">
        {#each ports as p (p)}
          <li><span class="dot"></span>{p}</li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .hw { padding: 12px; }
  h4 {
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 8px;
    font-weight: 500;
  }
  .enable {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--amber);
    background: rgba(232, 156, 62, 0.06);
    font-size: 11px;
    letter-spacing: 0.08em;
    transition: all 0.15s;
  }
  .enable:hover { border-color: var(--amber-dim); background: rgba(232, 156, 62, 0.12); }
  .enable:disabled { opacity: 0.5; cursor: wait; }
  .hint { color: var(--text-faint); font-size: 10px; margin-top: 8px; }
  .ports { list-style: none; margin: 0; padding: 0; }
  .ports li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 4px;
    font-size: 11px;
    color: var(--text);
    font-family: var(--font-mono);
    border-bottom: 1px solid var(--border-dim);
  }
  .dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 5px var(--green-glow);
  }
</style>
