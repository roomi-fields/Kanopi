<script lang="ts">
  import { workspace } from '../../stores/workspace.svelte';

  type Section = { id: string; label: string };
  const sections: Section[] = [
    { id: 'start', label: 'Start here' },
    { id: 'language', label: 'Language' },
    { id: 'mappings', label: '@map syntax' },
    { id: 'runtimes', label: 'Runtimes' },
    { id: 'keys', label: 'Keybindings' },
    { id: 'palette', label: 'Command palette' }
  ];

  let active = $state<string>('start');

  function open(id: string) {
    active = id;
  }

  function newScratch() {
    const path = `scratch-${Date.now()}.js`;
    const id = workspace.addFile(
      path,
      '// scratch — JS / Web Audio\nconst osc = audio.createOscillator();\nosc.frequency.value = 440;\nosc.connect(audio.destination);\nosc.start();\nhelpers.register(() => osc.stop());\n'
    );
    workspace.openFile(id);
  }
</script>

<div class="docs">
  <nav class="toc">
    {#each sections as s (s.id)}
      <button class:active={active === s.id} type="button" onclick={() => open(s.id)}
        >{s.label}</button
      >
    {/each}
  </nav>

  <div class="body">
    {#if active === 'start'}
      <section id="docs-start">
        <h3>What Kanopi is</h3>
        <p>
          Kanopi is a live-coding workbench that runs several engines side by side — Strudel for
          sound, Hydra for visuals, and more — under one shared
          <strong>transport</strong> (play / stop / tempo). A
          <code>.kanopi</code> session file is the score that wires them together.
        </p>

        <h3>The five-minute loop</h3>
        <ol class="steps">
          <li>
            <strong>Open a session.</strong> Library panel → pick a starter → it replaces the workspace
            and drops you back in Files.
          </li>
          <li>
            <strong>Read the code.</strong> Each tab is one <em>actor</em> (a Strudel, Hydra, …
            file). The <code>.kanopi</code> tab is the session itself.
          </li>
          <li>
            <strong>Evaluate a block.</strong> Put the cursor in a block and press
            <kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd>. The line flashes; sound or visuals start.
          </li>
          <li>
            <strong>Play the transport.</strong> <kbd>Space</kbd> (or the ▶ button) starts the
            clock. <kbd>Cmd/Ctrl</kbd>+<kbd>.</kbd> hushes everything.
          </li>
          <li>
            <strong>Arm actors &amp; scenes.</strong> Toggle actors in the Actors panel; switch
            scenes with <kbd>Alt</kbd>+<kbd>1…9</kbd>.
          </li>
        </ol>

        <h3>Three building blocks</h3>
        <table>
          <thead><tr><th>Block</th><th>Is</th></tr></thead>
          <tbody>
            <tr
              ><td><code>@actor</code></td><td
                >One engine + one file (e.g. a Strudel pattern, a Hydra sketch).</td
              ></tr
            >
            <tr
              ><td><code>@scene</code></td><td
                >A named set of actors to bring up together — your song sections.</td
              ></tr
            >
            <tr
              ><td><code>@map</code></td><td
                >A MIDI control routed to a target (tempo, scene, actor toggle).</td
              ></tr
            >
          </tbody>
        </table>
      </section>
    {/if}

    {#if active === 'language'}
      <section id="docs-language">
        <h3>Kanopi session language</h3>
        <p>
          A <code>.kanopi</code> file declares <em>actors</em>, <em>scenes</em>, and <em>maps</em>
          for a live-coding session. Edit and save: the parser reloads on every change.
        </p>
        <pre><code
            >{`# my-session — title is just a comment
@actor drums   drums.tidal    tidal
@actor visuals visuals.hydra  hydra

@scene drop  drums visuals
@scene break visuals

@map cv:1     tempo
@map trig:36  scene:drop`}</code
          ></pre>
        <h3>Line by line</h3>
        <table>
          <thead><tr><th>Directive</th><th>Meaning</th></tr></thead>
          <tbody>
            <tr
              ><td><code>@actor NAME FILE RUNTIME</code></td><td
                >Declares an actor. Missing files are created empty.</td
              ></tr
            >
            <tr
              ><td><code>@scene NAME a b …</code></td><td
                >A scene that brings up the listed actors.</td
              ></tr
            >
            <tr
              ><td><code>@map SOURCE TARGET</code></td><td
                >Routes a MIDI source to a target (see <em>@map syntax</em>).</td
              ></tr
            >
            <tr
              ><td><code># …</code></td><td>Comment. The first one is a handy session title.</td
              ></tr
            >
          </tbody>
        </table>
        <p class="hint">Full spec in <code>docs/spec/KANOPI_LANGUAGE.md</code>.</p>
      </section>
    {/if}

    {#if active === 'mappings'}
      <section id="docs-mappings">
        <h3>@map syntax</h3>
        <p><code>@map &lt;source&gt; &lt;target&gt;</code></p>
        <table>
          <thead><tr><th>Source</th><th>Means</th></tr></thead>
          <tbody>
            <tr
              ><td><code>cv:N[/chC]</code></td><td
                >MIDI CC <em>N</em>, optional channel <em>C</em></td
              ></tr
            >
            <tr
              ><td><code>trig:N[/chC]</code></td><td>Note-on, vel &gt; 0 (one-shot trigger)</td></tr
            >
            <tr
              ><td><code>gate:N[/chC]</code></td><td>Note-on AND note-off (sustained on/off)</td
              ></tr
            >
          </tbody>
        </table>
        <table>
          <thead><tr><th>Target</th><th>Effect</th></tr></thead>
          <tbody>
            <tr><td><code>tempo</code></td><td>Sets BPM (CC 0-127 → 60-180)</td></tr>
            <tr><td><code>scene:NAME</code></td><td>Activate the named scene</td></tr>
            <tr><td><code>ACTOR.toggle</code></td><td>Toggle the actor on/off</td></tr>
            <tr><td><code>ACTOR.PARAM</code></td><td>Set a parameter (not implemented yet)</td></tr>
          </tbody>
        </table>
      </section>
    {/if}

    {#if active === 'runtimes'}
      <section id="docs-runtimes">
        <h3>Runtimes</h3>
        <p>
          Each actor file is handed to the engine matching its extension. Audio engines are gated by
          the transport where they can be; Strudel and Hydra start on evaluation.
        </p>
        <table>
          <thead><tr><th>Runtime</th><th>Files</th><th>Notes</th></tr></thead>
          <tbody>
            <tr
              ><td>Strudel</td><td><code>.strudel .tidal</code></td><td
                >JS port of TidalCycles, with dirt samples.</td
              ></tr
            >
            <tr
              ><td>Hydra</td><td><code>.hydra</code></td><td>WebGL visuals on an overlay canvas.</td
              ></tr
            >
            <tr
              ><td>Mercury</td><td><code>.merc .mercury</code></td><td
                >Minimal live-coding language for sound.</td
              ></tr
            >
            <tr
              ><td>Csound</td><td><code>.csd .orc</code></td><td
                >Full Csound 7 engine, compiled in the browser.</td
              ></tr
            >
            <tr
              ><td>p5</td><td><code>.p5</code></td><td>p5.js sketches on an overlay canvas.</td></tr
            >
            <tr
              ><td>Bol Processor</td><td><code>.gr .bp</code></td><td
                >Bernard Bel's grammars, derived to sound (showcase).</td
              ></tr
            >
            <tr
              ><td>JS / WebAudio</td><td><code>.js</code></td><td
                >Globals: <code>audio</code> (AudioContext),
                <code>helpers.register(stopFn)</code>.</td
              ></tr
            >
            <tr
              ><td>SuperCollider</td><td><code>.scd</code></td><td
                >Planned (level 3) — silent for now.</td
              ></tr
            >
            <tr
              ><td>Python</td><td><code>.py</code></td><td>Planned via bridge — silent for now.</td
              ></tr
            >
          </tbody>
        </table>
        <button class="action" type="button" onclick={newScratch}>New JS scratch buffer</button>
      </section>
    {/if}

    {#if active === 'keys'}
      <section id="docs-keys">
        <h3>Keybindings</h3>
        <ul>
          <li><kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd> — evaluate the current block</li>
          <li><kbd>Cmd/Ctrl</kbd>+<kbd>.</kbd> — hush everything (panic)</li>
          <li><kbd>Space</kbd> — play / stop the transport (outside the editor)</li>
          <li><kbd>Alt</kbd>+<kbd>1</kbd>–<kbd>9</kbd> — activate scene N</li>
          <li><kbd>Cmd/Ctrl</kbd>+<kbd>1</kbd>–<kbd>9</kbd> — mute / unmute the Nth actor</li>
          <li><kbd>Cmd/Ctrl</kbd>+<kbd>0</kbd> — unmute every actor</li>
          <li>
            <kbd>Cmd/Ctrl</kbd>+<kbd>K</kbd> — command palette (<kbd>Cmd/Ctrl</kbd>+<kbd>Shift</kbd
            >+<kbd>P</kbd> also)
          </li>
          <li><kbd>Cmd/Ctrl</kbd>+<kbd>S</kbd> — force-save the workspace</li>
          <li><kbd>Esc</kbd> — close the palette</li>
        </ul>
      </section>
    {/if}

    {#if active === 'palette'}
      <section id="docs-palette">
        <h3>Command palette</h3>
        <p>Open with <kbd>Ctrl/Cmd</kbd>+<kbd>K</kbd>. Notable commands:</p>
        <ul>
          <li>
            <code>Play</code> / <code>Stop</code> / <code>Toggle play/stop</code> /
            <code>Tap tempo</code>
          </li>
          <li><code>Switch to scene: …</code> (one entry per scene)</li>
          <li><code>Toggle actor: …</code> (one entry per actor)</li>
          <li><code>Open file: …</code> (one entry per file)</li>
          <li><code>Enable MIDI input</code></li>
          <li><code>Clear console</code></li>
          <li><code>Reset workspace</code> (clears localStorage + reload)</li>
          <li><code>Debug: dump workspace state to console</code></li>
        </ul>
      </section>
    {/if}
  </div>
</div>

<style>
  .docs {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .toc {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px;
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
  }
  .toc button {
    padding: 4px 8px;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
    border: 1px solid transparent;
    border-radius: 2px;
    transition: all 0.15s;
  }
  .toc button:hover {
    color: var(--text-muted);
    border-color: var(--border-dim);
  }
  .toc button.active {
    color: var(--amber);
    border-color: var(--amber-dim);
    background: rgba(232, 156, 62, 0.06);
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px;
    font-size: 12px;
    line-height: 1.65;
    color: var(--text-muted);
  }
  section {
    margin-bottom: 24px;
  }
  .steps {
    list-style: decimal;
    margin: 6px 0 14px;
    padding-left: 18px;
  }
  .steps li {
    padding: 4px 0;
    padding-left: 4px;
  }
  strong {
    color: var(--text);
    font-weight: 600;
  }
  section:last-child {
    margin-bottom: 0;
  }
  h3 {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--amber);
    font-weight: 500;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border-dim);
  }
  p {
    margin-bottom: 8px;
  }
  code {
    font-family: var(--font-code);
    color: var(--cyan);
    background: var(--elevated);
    padding: 0 4px;
    border-radius: 2px;
    font-size: 10px;
  }
  pre {
    background: var(--bg);
    border: 1px solid var(--border-dim);
    border-radius: 3px;
    padding: 8px 10px;
    margin: 6px 0;
    overflow-x: auto;
  }
  pre code {
    background: transparent;
    padding: 0;
    color: var(--text);
    font-size: 10.5px;
    line-height: 1.5;
    white-space: pre;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 6px 0 12px;
    font-size: 11px;
  }
  th,
  td {
    text-align: left;
    padding: 5px 7px;
    border-bottom: 1px solid var(--border-dim);
    vertical-align: top;
  }
  th {
    color: var(--text-dim);
    font-weight: 500;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  td {
    color: var(--text-muted);
  }
  ul {
    list-style: none;
    margin: 6px 0;
    padding: 0;
  }
  li {
    padding: 3px 0;
  }
  kbd {
    display: inline-block;
    padding: 1px 5px;
    font-family: var(--font-mono);
    font-size: 9px;
    background: var(--elevated);
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--text-muted);
  }
  em {
    color: var(--text);
    font-style: normal;
  }
  .hint {
    color: var(--text-faint);
    font-size: 10px;
  }
  .action {
    margin-top: 8px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--amber);
    background: rgba(232, 156, 62, 0.06);
    font-size: 10px;
    letter-spacing: 0.08em;
  }
  .action:hover {
    border-color: var(--amber-dim);
    background: rgba(232, 156, 62, 0.12);
  }
</style>
