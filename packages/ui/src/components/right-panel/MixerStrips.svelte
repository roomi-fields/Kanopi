<script lang="ts">
  // KAN-UX3 — DAW-like mixer: master strip on top, one strip per live actor.
  // The mute is the PERSISTENT performer layer (mixer intent, localStorage) —
  // distinct from the arming M of the actor list above. Volume sliders are
  // disabled until runtime-audio exposes a gain API (reported upstream).
  import { actors } from '../../stores/actors.svelte';
  import { mixer } from '../../stores/mixer.svelte';
  import MixerMaster from './MixerMaster.svelte';
</script>

<div class="mixer">
  <div class="mixer-header">mixer</div>
  <MixerMaster />
  {#if actors.list.length === 0}
    <div class="empty">no live actors</div>
  {:else}
    <ul class="strips">
      {#each actors.list as a (a.name)}
        <li class="strip" class:muted={mixer.isActorMuted(a.name) || mixer.master.muted}>
          <span class="label" title={a.name}>{a.name}</span>
          <input
            class="vol"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={mixer.actorEntry(a.name).volume}
            disabled
            title="volume {a.name} — soon (waiting for the audio runtime's gain API)"
          />
          <button
            class="mute"
            type="button"
            class:on={mixer.isActorMuted(a.name)}
            title={mixer.isActorMuted(a.name) ? `unmute ${a.name}` : `mute ${a.name} (mixer)`}
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
  .empty {
    padding: 6px 12px 8px;
    font-size: 11px;
    color: var(--text-faint);
    font-style: italic;
  }
</style>
