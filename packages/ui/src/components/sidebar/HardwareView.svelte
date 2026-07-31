<script lang="ts">
  import { core } from '../../lib/core';
  import type { PortInfo } from 'runtime-in';
  import { midiOutput } from '../../lib/midi/midi-output.svelte';
  import { workspace } from '../../stores/workspace.svelte';
  import { declaredInputsForScene } from '../../lib/runtimes/bpx-adapter';
  import { inputBindings } from '../../stores/input-bindings.svelte';
  import { playFocus } from '../../stores/play-focus.svelte';

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

  // ─── LES ENTRÉES QUE LA SCÈNE DÉCLARE ────────────────────────────────────────────────────
  // La scène nomme un RÔLE, l'utilisateur associe l'appareil, et cette association vit HORS de la
  // scène (décision `2026-07-27-forme-des-entrees-in-mapping-adresse-nue.md`) — pour qu'une pièce
  // écrite ici s'ouvre sur une autre machine. Les rôles sont LUS sur l'AST amont, jamais devinés.
  const roles = $derived.by(() => {
    const texte = workspace.activeTabId
      ? (workspace.fileById(workspace.activeTabId)?.contents ?? '')
      : '';
    return declaredInputsForScene(texte);
  });

  /** L'échec d'une association se MONTRE, par rôle — pas de dégradé muet (contrat, garde 5). */
  let echecParRole = $state<Record<string, string>>({});

  async function associerPort(role: string, portId: string) {
    echecParRole = { ...echecParRole, [role]: '' };
    if (!portId) {
      inputBindings.clear(role);
      return;
    }
    const port = ports.find((p) => p.id === portId);
    inputBindings.set(role, { portId, portName: port?.name });
    try {
      // Associer, c'est OUVRIR : le geste sert à quelque chose tout de suite, il ne remplit pas
      // seulement une fiche. Les ports vus sont rafraîchis au passage.
      ports = await core.enableMidiInput(portId);
    } catch (err) {
      echecParRole = { ...echecParRole, [role]: String(err) };
    }
  }

  async function ecouterOsc(role: string, address: string) {
    echecParRole = { ...echecParRole, [role]: '' };
    if (!address) {
      inputBindings.clear(role);
      return;
    }
    inputBindings.set(role, { address });
    try {
      await core.openOscInput(address);
    } catch (err) {
      echecParRole = { ...echecParRole, [role]: String(err) };
    }
  }
</script>

<div class="hw">
  <!-- LE PANNEAU DES ENTRÉES (KAN-33) — ce que la scène ATTEND, pas seulement ce qui est branché.
       Un musicien ne devrait pas connaître une adresse de développeur pour voir sa pédale répondre.
       Ce que ce panneau fait : il PRÉSENTE les rôles déclarés, laisse ASSOCIER un appareil réel et
       MÉMORISE le choix. Ce qu'il ne fait pas : router. Associer un événement reçu au rôle qui
       l'attend se fait par l'adresse collée au point d'attente (`<!role.adresse`), résolue par
       BPx en aval (entrees/routeur.ts) — pas par une directive de correspondance, et pas par
       l'hôte. -->
  <section>
    <h4>Entrées de la scène</h4>
    {#if roles.length === 0}
      <p class="hint">
        Cette scène ne déclare aucune entrée. Une scène nomme un <em>rôle</em> :
        <code>@in pedale transport.midi</code>.
      </p>
    {:else}
      <ul class="roles">
        {#each roles as r (r.name)}
          <li class="role">
            <div class="role-head">
              <span class="role-name">{r.name}</span>
              <span class="role-canal">{r.transport}</span>
              {#if r.mapping}<span class="role-table">mapping.{r.mapping}</span>{/if}
            </div>

            {#if r.transport === 'midi'}
              {#if !enabled}
                <button class="enable" type="button" disabled={busy} onclick={enable}>
                  {busy ? '…' : 'Autoriser le MIDI pour voir les appareils'}
                </button>
              {:else}
                <select
                  class="port-select"
                  value={inputBindings.for(r.name)?.portId ?? ''}
                  onchange={(e) => associerPort(r.name, (e.target as HTMLSelectElement).value)}
                >
                  <option value="">— aucun appareil associé —</option>
                  {#each ports as p (p.id)}
                    <option value={p.id}>{p.name}</option>
                  {/each}
                </select>
                <!-- L'appareil associé la dernière fois peut être DÉBRANCHÉ aujourd'hui : on le dit
                     au lieu de retomber silencieusement sur « aucun ». -->
                {#if inputBindings.for(r.name)?.portId && !ports.some((p) => p.id === inputBindings.for(r.name)?.portId)}
                  <p class="hint error">
                    Associé à « {inputBindings.for(r.name)?.portName ?? '?'} » — absent aujourd'hui.
                  </p>
                {/if}
              {/if}
            {:else if r.transport === 'keyboard'}
              <p class="hint">
                Rien à associer : le clavier est déjà là. C'est le <em>focus de jeu</em> (barre
                d'état, en bas) qui lui donne les touches.
                {#if playFocus.held}<strong>Pris.</strong>{/if}
              </p>
            {:else if r.transport === 'osc'}
              <input
                class="port-select"
                type="text"
                placeholder="ws://machine:port (relais OSC)"
                value={inputBindings.for(r.name)?.address ?? ''}
                onchange={(e) => ecouterOsc(r.name, (e.target as HTMLInputElement).value.trim())}
              />
            {/if}

            {#if echecParRole[r.name]}
              <p class="hint error">{echecParRole[r.name]}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

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
  .roles {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .role {
    padding: 8px 0;
    border-bottom: 1px solid var(--border-dim);
  }
  .role-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 6px;
  }
  .role-name {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text);
  }
  .role-canal,
  .role-table {
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .hint code {
    font-family: var(--font-mono);
    color: var(--text-muted);
  }
</style>
