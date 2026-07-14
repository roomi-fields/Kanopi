<script lang="ts">
  // KAN-UX3 / KAN-UX3-B — DAW-like mixer: master strip on top, one strip per live actor.
  // The mute is the PERSISTENT performer layer (mixer intent, localStorage) —
  // distinct from the arming M of the actor list above. Volumes ride the ratified gain
  // API (contract hote-runtimes-sortie.md:51): effective = actor × master, on WHICHEVER
  // live runtime (audio/midi/osc) owns the actor — `applyMixerGains` calls all of them.
  import { actors } from '../../stores/actors.svelte';
  import { mixer } from '../../stores/mixer.svelte';
  import { isCodeVoiceRuntime } from '../../lib/runtimes/registry';
  import {
    reachesGainBus,
    codeVoiceReachesGainBus,
    mixerSliderDisabledTitle,
    mixerSliderActiveTitle
  } from '../../lib/mixer/mixer-gain';
  import { midiOutput } from '../../lib/midi/midi-output.svelte';
  import MixerMaster from './MixerMaster.svelte';

  const MIDI_NO_DEVICE_TITLE = 'sortie MIDI — sélectionne un périphérique dans le panneau Hardware';

  // The slider moves whichever live gain bus owns the actor (`applyMixerGains` →
  // audioGainControl()/midiGainControl()/oscGainControl()/codeVoicesGainControl()). Two
  // families of actor can fail to reach a bus:
  //  - a code voice (strudel/hydra/p5/mercury/csound/js — anything backed by
  //    `eval.<interp>`, `isCodeVoiceRuntime`, registry.ts) only reaches a bus for
  //    strudel/csound (`codeVoiceReachesGainBus`) — the package's individual
  //    adapters are the only ones implementing the gain API; hydra/p5/mercury/js
  //    render their own graph with no such hook;
  //  - a NATIVE actor (notes, not a code voice) routed to dmx/a custom @devices name
  //    whose gain API isn't confirmed yet (`Actor.outputTransport`, BPx's
  //    `output.runtime`, decision [624]) — same "slider lies" problem, different cause.
  // Disable rather than let the slider silently do nothing.
</script>

<div class="mixer">
  <div class="mixer-header">mixer</div>
  <MixerMaster />
  {#if actors.list.length === 0}
    <div class="empty">no live actors</div>
  {:else}
    <ul class="strips">
      {#each actors.list as a (a.name)}
        {@const isCodeVoice = isCodeVoiceRuntime(a.runtime)}
        {@const codeVoiceGainOk = isCodeVoice && codeVoiceReachesGainBus(a.runtime)}
        {@const disabledKind =
          isCodeVoice && !codeVoiceGainOk
            ? 'voix de code'
            : !isCodeVoice && !reachesGainBus(a.outputTransport)
              ? (a.outputTransport ?? 'inconnu')
              : null}
        {@const midiUnselected = a.outputTransport === 'midi' && midiOutput.selectedId === null}
        <li
          class="strip"
          class:muted={mixer.isActorMuted(a.name) || mixer.master.muted}
          class:inactive={midiUnselected}
        >
          <span class="label" title={a.name}>{a.name}</span>
          <input
            class="vol"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={mixer.actorEntry(a.name).volume}
            oninput={(e) => mixer.setActorVolume(a.name, e.currentTarget.valueAsNumber)}
            disabled={disabledKind !== null || midiUnselected}
            title={midiUnselected
              ? MIDI_NO_DEVICE_TITLE
              : disabledKind !== null
                ? mixerSliderDisabledTitle(disabledKind)
                : mixerSliderActiveTitle(a.name, a.runtime)}
          />
          <button
            class="mute"
            type="button"
            class:on={mixer.isActorMuted(a.name)}
            disabled={midiUnselected}
            title={midiUnselected
              ? MIDI_NO_DEVICE_TITLE
              : mixer.isActorMuted(a.name)
                ? `unmute ${a.name}`
                : `mute ${a.name} (mixer)`}
            onclick={() => mixer.toggleActorMuted(a.name)}
          >
            M
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .mixer {
    border-top: 1px solid var(--border-dim);
    margin-top: 4px;
    padding-bottom: 4px;
  }
  .mixer-header {
    padding: 10px 12px 4px;
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .strips {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .strip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
  }
  .label {
    flex: 0 0 auto;
    min-width: 64px;
    max-width: 96px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text);
  }
  .strip.muted .label {
    opacity: 0.5;
  }
  .strip.inactive .label,
  .strip.inactive .mute {
    opacity: 0.35;
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
  .mute:disabled {
    cursor: not-allowed;
  }
  .mute:disabled:hover {
    color: var(--text-faint);
  }
  .empty {
    padding: 6px 12px 8px;
    font-size: 11px;
    color: var(--text-faint);
    font-style: italic;
  }
</style>
