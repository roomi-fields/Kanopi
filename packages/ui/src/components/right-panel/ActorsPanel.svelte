<script lang="ts">
  import { actors } from '../../stores/actors.svelte';
  import { workspace } from '../../stores/workspace.svelte';
  import { openBlocks } from '../../stores/blocks.svelte';
  import { core } from '../../lib/core';
  import type { OpenBlock } from '../../stores/blocks.svelte';

  function openFile(fileName?: string) {
    if (!fileName) return;
    const f = workspace.files.find((x) => x.name === fileName);
    if (f) workspace.openFile(f.id);
  }

  // A block is "covered" by a declared @actor if the latter's `file` field
  // matches the block's source file. We hide covered blocks from the detected
  // list to avoid duplicating the same name twice in the panel — declared
  // @actors keep their existing row (with toggle + mute), detected blocks
  // surface as a *supplementary* list below.
  const declaredFiles = $derived(new Set(actors.list.map((a) => a.file).filter(Boolean) as string[]));
  const detected = $derived<OpenBlock[]>(
    openBlocks.list.filter((b) => !declaredFiles.has(b.fileName))
  );

  function evalBlock(b: OpenBlock) {
    const file = workspace.fileById(b.fileId);
    if (!file) return;
    const code = file.contents.slice(b.block.from, b.block.to);
    void core.evaluateBlock(b.runtime, code, b.fileName, b.block.from);
    // Also jump the user to the file so they can see the flash.
    workspace.openFile(b.fileId);
  }
</script>

<ul class="actors">
  {#each actors.list as a, i (a.name)}
    <li class="actor" class:active={a.active} class:muted={a.muted}>
      <button class="toggle" type="button" title="toggle {a.name}" onclick={() => actors.toggle(a.name)}>
        <span class="led" class:on={a.active} class:muted={a.muted}></span>
      </button>
      <button class="info" type="button" onclick={() => openFile(a.file)}>
        <span class="name">{a.name}</span>
        <span class="meta">
          <span class="rt rt-{a.runtime}">{a.runtime}</span>
          {#if a.file}<span class="file">{a.file}</span>{/if}
        </span>
      </button>
      {#if i < 9}
        <button
          class="mute"
          type="button"
          title="mute {a.name} (Ctrl+{i + 1})"
          onclick={() => actors.toggleMute(a.name)}
        >
          {a.muted ? 'M' : '·'}
        </button>
      {/if}
    </li>
  {/each}
</ul>

{#if detected.length > 0}
  <div class="blocks-header">
    <span>open blocks</span>
    <span class="blocks-count">{detected.length}</span>
  </div>
  <ul class="blocks">
    {#each detected as b (b.fileId + ':' + b.block.name)}
      <li class="block" class:positional={b.block.kind === 'positional'}>
        <button class="play" type="button" title="eval {b.qualifiedName}" onclick={() => evalBlock(b)}>
          <svg viewBox="0 0 12 12" fill="currentColor"><path d="M3 2 L10 6 L3 10 Z" /></svg>
        </button>
        <button class="info" type="button" onclick={() => openFile(b.fileName)}>
          <span class="name">{b.qualifiedName}</span>
          <span class="meta">
            <span class="rt rt-{b.runtime}">{b.runtime}</span>
            <span class="kind">{b.block.kind}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .actors { list-style: none; margin: 0; padding: 4px 0; }
  .actor {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border-dim);
  }
  .toggle {
    width: 22px; height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
  }
  .led {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--text-faint);
    transition: all 0.15s;
  }
  .led.on {
    background: var(--green);
    box-shadow: 0 0 6px var(--green-glow);
  }
  .led.on.muted {
    background: var(--text-muted);
    box-shadow: none;
    opacity: 0.5;
  }
  .actor.muted .name { opacity: 0.5; }
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
  .mute:hover { color: var(--text-muted); border-color: var(--border); }
  .actor.muted .mute { color: var(--amber); border-color: var(--amber-dim); }
  .info {
    flex: 1;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .info:hover { color: var(--text); }
  .name { font-size: 12px; color: var(--text); font-family: var(--font-mono); }
  .actor:not(.active) .name { color: var(--text-muted); }
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
  .rt-tidal { color: var(--tidal); }
  .rt-sc { color: var(--sc); }
  .rt-hydra { color: var(--hydra); }
  .rt-strudel { color: var(--tidal); }
  .rt-python { color: var(--python); }
  .rt-kanopi { color: var(--kanopi); }
  .rt-js { color: var(--cyan); }
  .file { color: var(--text-faint); font-family: var(--font-code); }

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
  .blocks { list-style: none; margin: 0; padding: 0 0 4px; }
  .block {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
  }
  .block .play {
    width: 22px; height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    border-radius: 3px;
    transition: all 0.12s;
  }
  .block .play:hover { color: var(--amber); background: rgba(232, 156, 62, 0.08); }
  .block .play svg { width: 9px; height: 9px; }
  .block .info {
    flex: 1;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .block .name {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }
  .block.positional .name { color: var(--text-faint); font-style: italic; }
  .block .kind {
    font-size: 9px;
    color: var(--text-faint);
    letter-spacing: 0.08em;
  }
</style>
