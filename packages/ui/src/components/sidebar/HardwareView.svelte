<script lang="ts">
  import { core } from '../../lib/core';
  import type { PortInfo } from 'runtime-in';
  import { midiOutput } from '../../lib/midi/midi-output.svelte';

  // Les ports viennent du GESTE, jamais d'une lecture à l'initialisation. Avant l'autorisation,
  // Web MIDI n'énumère RIEN : partir d'une liste vide dit la vérité du protocole, alors que
  // l'ancien `listPorts()` synchrone au montage donnait l'illusion d'une lecture (il rendait
  // toujours `[]`, et le pilote qui le portait est parti chez `runtime-in`).
  let ports = $state<readonly PortInfo[]>([]);
  let enabled = $state(false);
  let busy = $state(false);
  let echec = $state<string | null>(null);

  async function enable() {
    busy = true;
    echec = null;
    try {
      // Le geste rend les ports vus APRÈS l'autorisation — c'est le cœur qui les tient, la vue ne
      // touche pas au périphérique (elle n'en connaît même pas l'existence).
      ports = await core.enableMidiInput();
      enabled = true;
    } catch (err) {
      // ÉCHEC BRUYANT, ET VISIBLE : autorisation refusée / Web MIDI absent / port introuvable. Le
      // cœur l'a journalisé en erreur ; ici on le MONTRE, on ne retombe pas dans un état « activé »
      // qui laisserait croire que l'entrée écoute.
      echec = String(err);
      enabled = false;
    } finally {
      busy = false;
    }
  }

  let outEnabled = $derived(midiOutput.accessGranted === true);
  async function enableMidiOutput() {
    await midiOutput.requestAccess();
  }
</script>

<div class="hw">
  <section>
    <h4>MIDI Input</h4>
    {#if !enabled}
      <button class="enable" type="button" disabled={busy} onclick={enable}>
        {busy ? '…' : 'Enable MIDI input'}
      </button>
      {#if echec}
        <p class="hint error">{echec}</p>
      {:else}
        <p class="hint">Browser will prompt for permission.</p>
      {/if}
    {:else if ports.length === 0}
      <p class="hint">No MIDI input detected. Plug a controller and click refresh.</p>
      <button class="enable" type="button" onclick={enable}>Refresh</button>
    {:else}
      <!-- `p.name` pour l'affichage et `p.id` pour la clé : un port est désormais un OBJET
           ({ id, name, manufacturer? }), pas une chaîne. Rendre `p` tel quel afficherait
           « [object Object] », et deux ports peuvent porter le MÊME nom — l'identifiant, lui,
           est distinct (c'est aussi pour ça que l'amont rend des objets). -->
      <ul class="ports">
        {#each ports as p (p.id)}
          <li><span class="dot"></span>{p.name}</li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h4>MIDI Output</h4>
    {#if !outEnabled}
      <button class="enable" type="button" disabled={midiOutput.busy} onclick={enableMidiOutput}>
        {midiOutput.busy ? '…' : 'Enable MIDI output'}
      </button>
      <p class="hint">
        Browser will prompt for permission. Select a device to route MIDI scenes to.
      </p>
    {:else if midiOutput.outputs.length === 0}
      <p class="hint">No MIDI output detected. Plug a device and click refresh.</p>
      <button class="enable" type="button" onclick={enableMidiOutput}>Refresh</button>
    {:else}
      <select
        class="port-select"
        value={midiOutput.selectedId ?? ''}
        onchange={(e) => midiOutput.select((e.target as HTMLSelectElement).value || null)}
      >
        <option value="">— choose a device —</option>
        {#each midiOutput.outputs as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    {/if}
  </section>
</div>

<style>
  .hw {
    padding: 12px;
  }
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
  .enable:hover {
    border-color: var(--amber-dim);
    background: rgba(232, 156, 62, 0.12);
  }
  .enable:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  .hint {
    color: var(--text-faint);
    font-size: 10px;
    margin-top: 8px;
  }
  /* Un échec d'autorisation se VOIT : la couleur d'erreur, pas la teinte des indications. */
  .hint.error {
    color: var(--red);
  }
  .ports {
    list-style: none;
    margin: 0;
    padding: 0;
  }
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
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 5px var(--green-glow);
  }
  .port-select {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--bg);
    color: var(--text);
    font-size: 11px;
    font-family: var(--font-mono);
  }
  .port-select:focus {
    border-color: var(--amber);
    outline: none;
  }
</style>
