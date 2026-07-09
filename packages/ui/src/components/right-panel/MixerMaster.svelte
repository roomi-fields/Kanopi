<script lang="ts">
  import { mixer } from '../../stores/mixer.svelte';
</script>

<div class="strip master" class:muted={mixer.master.muted}>
  <span class="label">master</span>
  <!-- Volume rides runtime-audio's gain API (KAN-UX3, contract [651]): raw
       0..1 intent, the anti-click ramp is the runtime's. -->
  <input
    class="vol"
    type="range"
    min="0"
    max="1"
    step="0.01"
    value={mixer.master.volume}
    oninput={(e) => mixer.setMasterVolume(e.currentTarget.valueAsNumber)}
    title="master volume"
  />
  <button
    class="mute"
    type="button"
    class:on={mixer.master.muted}
    title={mixer.master.muted ? 'unmute all actors' : 'mute all actors'}
    onclick={() => mixer.toggleMasterMuted()}
  >
    M
  </button>
</div>

<style>
  .strip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
  }
  .master {
    border-bottom: 1px solid var(--border-dim);
  }
  .label {
    flex: 0 0 auto;
    min-width: 64px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .muted .label {
    opacity: 0.5;
  }
  .vol {
    flex: 1;
    min-width: 0;
    accent-color: var(--amber);
  }
  .mute {
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    transition: all 0.12s;
  }
  .mute:hover {
    color: var(--text-muted);
    border-color: var(--border);
  }
  .mute.on {
    color: var(--amber);
    border-color: var(--amber-dim);
  }
</style>
