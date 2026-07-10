<script lang="ts">
  import { mixer } from '../../stores/mixer.svelte';
  import { actors } from '../../stores/actors.svelte';
  import { isCodeVoiceRuntime } from '../../lib/runtimes/registry';
  import { reachesGainBus } from '../../lib/mixer/mixer-gain';

  // Master gain is projected onto EVERY live gain bus (audio/midi/osc — applyMixerGains
  // calls setMasterGain/setMasterMuted on each), which only NATIVE actors declared on one
  // of those transports (Actor.outputTransport, BPx's `output.runtime`) reach — a code
  // voice (strudel/hydra/…) renders through its own graph, and a native actor routed dmx
  // (API not yet confirmed) never touches any of these buses either (exact same "nothing
  // to act on" as a code voice, different cause). Only disable the master when NO live
  // actor genuinely reaches a gain bus; if even one does, the master stays live.
  const anyReachesGainBus = $derived(
    actors.list.some((a) => !isCodeVoiceRuntime(a.runtime) && reachesGainBus(a.outputTransport))
  );
  const disabled = $derived(actors.list.length > 0 && !anyReachesGainBus);
  const DISABLED_TITLE =
    "aucun acteur actif ne joint une sortie mixable — pas de contrôle de volume depuis Kanopi (en attente d'une API d'entrée côté runtime)";
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
    {disabled}
    title={disabled ? DISABLED_TITLE : 'master volume'}
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
  .vol:disabled {
    opacity: 0.35;
    cursor: not-allowed;
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
