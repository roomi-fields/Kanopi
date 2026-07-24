<script lang="ts">
  import { mixer } from '../../stores/mixer.svelte';
  import { actors } from '../../stores/actors.svelte';
  import { isCodeVoiceRuntime } from '../../lib/runtimes/registry';
  import { reachesGainBus, codeVoiceReachesGainBus } from '../../lib/mixer/mixer-gain';

  // Master gain is projected onto EVERY live gain bus (audio/midi/osc/codevoices —
  // applyMixerGains calls setMasterGain/setMasterMuted on each). A NATIVE actor reaches
  // one when its declared transport (Actor.outputTransport, BPx's `output.runtime`) is
  // audio/midi/osc; a CODE-VOICE actor (strudel/hydra/…) reaches one only for
  // strudel/csound (`codeVoiceReachesGainBus` — the sole adapters implementing the
  // gain API in the package). A native actor routed dmx (API not yet confirmed) or a
  // hydra/p5/mercury/js voice touch none of these buses. Only disable the master when NO
  // live actor genuinely reaches a gain bus; if even one does, the master stays live.
  const anyReachesGainBus = $derived(
    actors.list.some((a) =>
      isCodeVoiceRuntime(a.runtime)
        ? codeVoiceReachesGainBus(a.runtime)
        : reachesGainBus(a.outputTransport)
    )
  );
  const disabled = $derived(actors.list.length > 0 && !anyReachesGainBus);
  const DISABLED_TITLE =
    "aucun acteur actif ne joint une sortie mixable — pas de contrôle de volume depuis Kanopi (en attente d'une API d'entrée côté runtime)";
</script>

<!-- Deux lignes, MÊME gabarit qu'une ligne d'acteur (Romain 2026-07-24) : libellé
     seul, puis volume + mute indentés — les curseurs master et acteurs ont ainsi la
     même longueur et le même alignement. -->
<div class="strip master" class:muted={mixer.master.muted}>
  <div class="line"><span class="label">master</span></div>
  <!-- Volume rides runtime-audio's gain API (KAN-UX3, contract [651]): raw
       0..1 intent, the anti-click ramp is the runtime's. -->
  <div class="line">
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
</div>

<style>
  .strip {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 6px 12px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  /* Même indentation que la 2e ligne d'un acteur (ActorsPanel `.line + .line`),
     pour que les curseurs s'alignent exactement. */
  .line + .line {
    padding-left: 30px;
  }
  .master {
    border-bottom: 1px solid var(--border-dim);
  }
  .label {
    flex: 0 0 auto;
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
    height: 14px;
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    cursor: pointer;
  }
  .vol::-webkit-slider-runnable-track {
    height: 2px;
    border-radius: 1px;
    background: var(--border);
  }
  .vol::-moz-range-track {
    height: 2px;
    border-radius: 1px;
    background: var(--border);
  }
  .vol::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 9px;
    height: 9px;
    margin-top: -3.5px;
    border-radius: 50%;
    background: var(--text-dim);
    transition: background 0.12s;
    border: none;
  }
  .vol::-moz-range-thumb {
    width: 9px;
    height: 9px;
    border: none;
    border-radius: 50%;
    background: var(--text-dim);
  }
  .vol:hover::-webkit-slider-thumb {
    background: var(--text-muted);
  }
  .vol:hover::-moz-range-thumb {
    background: var(--text-muted);
  }
  .vol:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .mute {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    border-radius: 3px;
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    transition: color 0.12s;
  }
  .mute:hover {
    color: var(--text-muted);
  }
  .mute.on {
    color: var(--amber);
  }
</style>
