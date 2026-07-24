<script lang="ts">
  // KAN-UX3 / KAN-UX3-B — merged Actors + Mixer section (single "Actors" panel,
  // Romain constat: the two used to list the same actors twice). Master strip on
  // top, then ONE row per live actor fusing the arm LED + name/meta (former
  // ActorsPanel) with the volume slider + persistent mixer mute (former
  // MixerStrips, now folded in here — MixerStrips.svelte deleted). UN SEUL mute
  // subsiste : celui du MIXER (`mixer.toggleActorMuted`, couche persistante,
  // localStorage, contrat hote-runtimes-sortie.md:51). L'ancien mute d'ARMEMENT
  // faisait double emploi avec le désarmement — même primitive
  // (`setOrchestratedActorMuted`) et même branche au rejeu — il a été supprimé
  // (Romain 2026-07-24) ; le voyant est le seul geste d'armement.
  import { actors } from '../../stores/actors.svelte';
  import { workspace } from '../../stores/workspace.svelte';
  import { openBlocks } from '../../stores/blocks.svelte';
  import type { OpenBlock } from '../../stores/blocks.svelte';
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

  function openFile(fileName?: string) {
    if (!fileName) return;
    const f = workspace.files.find((x) => x.name === fileName);
    if (f) workspace.openFile(f.id);
  }

  // A block is "covered" by a declared @actor if the latter's `file` field
  // matches the block's source file. We hide covered blocks from the detected
  // list to avoid duplicating the same name twice in the panel.
  const declaredFiles = $derived(
    new Set(actors.list.map((a) => a.file).filter(Boolean) as string[])
  );
  // This panel describes the ACTIVE scene only (one-active-tab model, commit
  // 840a350) — `openBlocks.list` stays the store's full-workspace truth across
  // every open tab; only the VIEW here narrows it to the active tab's blocks.
  const detected = $derived<OpenBlock[]>(
    openBlocks.list.filter(
      (b) => !declaredFiles.has(b.fileName) && b.fileId === workspace.activeTabId
    )
  );

  function toggleBlock(b: OpenBlock) {
    void openBlocks.toggle(b.qualifiedName);
  }
</script>

<MixerMaster />

{#if actors.list.length === 0}
  <div class="empty">no live actors</div>
{:else}
  <ul class="actors">
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
        class="actor stack"
        class:active={a.active}
        class:errored={!!a.error}
        class:mixer-muted={mixer.isActorMuted(a.name) || mixer.master.muted}
        class:midi-unselected={midiUnselected}
      >
        <!-- Ligne 1 — identité : armement, nom, langage. Le nom de FICHIER n'y est
             plus (Romain 2026-07-24) : un seul fichier est actif à la fois, il est
             déjà nommé par l'onglet actif et par « active scene ». -->
        <div class="line">
          <button
            class="toggle"
            type="button"
            title="toggle {a.name}"
            onclick={() => actors.toggle(a.name)}
          >
            <span class="led" class:on={a.active} class:err={!!a.error}></span>
          </button>
          <span class="name">{a.name}</span>
          <span class="rt rt-{a.runtime}">{a.runtime}</span>
          {#if a.error}<span class="err-badge" title={a.error}>⚠ output</span>{/if}
        </div>
        <!-- Ligne 2 — mixer : volume + mute persistant. Le volume emprunte l'API de
             gain ratifiée (contrat hote-runtimes-sortie.md:51) : effectif = acteur ×
             master, sur QUEL QUE SOIT le runtime vivant qui possède l'acteur. -->
        <div class="line">
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
            class="mix-mute"
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
        </div>
      </li>
    {/each}
  </ul>
{/if}

{#if detected.length > 0}
  <div class="blocks-header">
    <span>open blocks</span>
    <span class="blocks-count">{detected.length}</span>
  </div>
  <ul class="actors">
    {#each detected as b (b.fileId + ':' + b.block.name)}
      <li
        class="actor"
        class:active={openBlocks.isArmed(b.qualifiedName)}
        class:positional={b.block.kind === 'positional'}
        class:errored={openBlocks.isErrored(b.qualifiedName)}
      >
        <button
          class="toggle"
          type="button"
          title={openBlocks.isErrored(b.qualifiedName)
            ? `error: ${b.qualifiedName}`
            : `arm ${b.qualifiedName}`}
          onclick={() => toggleBlock(b)}
        >
          <span
            class="led"
            class:on={openBlocks.isArmed(b.qualifiedName)}
            class:err={openBlocks.isErrored(b.qualifiedName)}
          ></span>
        </button>
        <button class="info" type="button" onclick={() => openFile(b.fileName)}>
          <span class="name">{b.qualifiedName}</span>
          <span class="meta">
            <span class="rt rt-{b.runtime}">{b.runtime}</span>
            <span class="kind">{b.block.kind}</span>
            {#if openBlocks.isErrored(b.qualifiedName)}<span class="err-tag">error</span>{/if}
          </span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .empty {
    padding: 6px 12px 8px;
    font-size: 11px;
    color: var(--text-faint);
    font-style: italic;
  }
  .actors {
    list-style: none;
    margin: 0;
    padding: 4px 0;
  }
  .actor {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border-dim);
  }
  /* Acteur vivant = DEUX lignes : identité (armement/nom/langage) puis mixer
     (volume/mute). La liste « open blocks » plus bas garde UNE ligne. */
  .actor.stack {
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  /* La 2e ligne s'aligne sous le nom, pas sous la LED. */
  .line + .line {
    padding-left: 30px;
  }
  .stack .name {
    flex: 0 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toggle {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
  }
  .led {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-faint);
    transition: all 0.15s;
  }
  .led.on {
    background: var(--green);
    box-shadow: 0 0 6px var(--green-glow);
  }
  .actor.mixer-muted .name {
    opacity: 0.5;
  }
  .actor.midi-unselected .name,
  .actor.midi-unselected .mix-mute {
    opacity: 0.35;
  }
  .info {
    flex: 1;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .info:hover {
    color: var(--text);
  }
  .name {
    font-size: 12px;
    color: var(--text);
    font-family: var(--font-mono);
  }
  .actor:not(.active) .name {
    color: var(--text-muted);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    color: var(--text-dim);
    letter-spacing: 0.04em;
  }
  .rt {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 500;
    font-size: 9px;
  }
  .rt-sc {
    color: var(--sc);
  }
  .rt-hydra {
    color: var(--hydra);
  }
  .rt-strudel {
    color: var(--strudel);
  }
  .rt-python {
    color: var(--python);
  }
  .rt-kanopi {
    color: var(--kanopi);
  }
  .rt-js {
    color: var(--cyan);
  }
  /* ————— Volume + persistent mixer mute (former MixerStrips.svelte) ————— */
  .vol {
    flex: 1 1 56px;
    min-width: 40px;
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
  .mix-mute {
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
  .mix-mute:hover {
    color: var(--text-muted);
  }
  .mix-mute.on {
    color: var(--amber);
  }
  .mix-mute:disabled {
    cursor: not-allowed;
  }
  .mix-mute:disabled:hover {
    color: var(--text-faint);
  }

  .blocks-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px 4px;
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-dim);
    border-top: 1px solid var(--border-dim);
    margin-top: 4px;
  }
  .blocks-count {
    font-size: 9px;
    color: var(--text-faint);
    letter-spacing: 0;
    text-transform: none;
    font-variant-numeric: tabular-nums;
  }
  .actor.positional .name {
    color: var(--text-faint);
    font-style: italic;
  }
  .kind {
    font-size: 9px;
    color: var(--text-faint);
    letter-spacing: 0.08em;
  }
  .led.err {
    background: var(--red, #c84040);
    box-shadow: 0 0 6px rgba(200, 64, 64, 0.6);
  }
  .actor.errored .name {
    color: var(--red, #c84040);
  }
  .err-tag {
    font-size: 9px;
    color: var(--red, #c84040);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 500;
  }
  .err-badge {
    font-size: 9px;
    color: var(--red, #c84040);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 600;
    cursor: help;
  }
</style>
