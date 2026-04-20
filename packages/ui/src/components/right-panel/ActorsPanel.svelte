<script lang="ts">
  import { actors } from '../../stores/actors.svelte';
  import { workspace } from '../../stores/workspace.svelte';
  import { openBlocks } from '../../stores/blocks.svelte';
  import type { OpenBlock } from '../../stores/blocks.svelte';

  function openFile(fileName?: string) {
    if (!fileName) return;
    const f = workspace.files.find((x) => x.name === fileName);
    if (f) workspace.openFile(f.id);
  }

  // A block is "covered" by a declared @actor if the latter's `file` field
  // matches the block's source file. We hide covered blocks from the detected
  // list to avoid duplicating the same name twice in the panel.
  const declaredFiles = $derived(new Set(actors.list.map((a) => a.file).filter(Boolean) as string[]));
  const detected = $derived<OpenBlock[]>(
    openBlocks.list.filter((b) => !declaredFiles.has(b.fileName))
  );

  function toggleBlock(b: OpenBlock) {
    void openBlocks.toggle(b.qualifiedName);
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
  <ul class="actors">
    {#each detected as b (b.fileId + ':' + b.block.name)}
      <li
        class="actor"
        class:active={openBlocks.isArmed(b.qualifiedName)}
        class:positional={b.block.kind === 'positional'}
        class:errored={openBlocks.isErrored(b.qualifiedName)}
      >
        <button class="toggle" type="button" title={openBlocks.isErrored(b.qualifiedName) ? `error: ${b.qualifiedName}` : `arm ${b.qualifiedName}`} onclick={() => toggleBlock(b)}>
          <span class="led" class:on={openBlocks.isArmed(b.qualifiedName)} class:err={openBlocks.isErrored(b.qualifiedName)}></span>
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
  .actor.positional .name { color: var(--text-faint); font-style: italic; }
  .kind {
    font-size: 9px;
    color: var(--text-faint);
    letter-spacing: 0.08em;
  }
  .led.err {
    background: var(--red, #c84040);
    box-shadow: 0 0 6px rgba(200, 64, 64, 0.6);
  }
  .actor.errored .name { color: var(--red, #c84040); }
  .err-tag {
    font-size: 9px;
    color: var(--red, #c84040);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 500;
  }
</style>
