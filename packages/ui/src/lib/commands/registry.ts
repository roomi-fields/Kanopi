import { clock } from '../../stores/clock.svelte';
import { scenes } from '../../stores/scenes.svelte';
import { actors } from '../../stores/actors.svelte';
import { workspace } from '../../stores/workspace.svelte';
import { consoleLog } from '../../stores/console.svelte';
import { clearWorkspace } from '../persistence/workspace-db';
import { core } from '../core';
import { suppressPersistOnce } from '../persistence/snapshot.svelte';

export interface Command {
  id: string;
  title: string;
  category?: string;
  hint?: string;
  run: () => void;
}

function staticCommands(): Command[] {
  return [
    { id: 'clock.play', title: 'Play', category: 'Clock', run: () => clock.play() },
    { id: 'clock.stop', title: 'Stop', category: 'Clock', run: () => clock.stop() },
    { id: 'clock.toggle', title: 'Toggle play/stop', category: 'Clock', run: () => clock.toggle() },
    { id: 'clock.tap', title: 'Tap tempo', category: 'Clock', run: () => clock.tap() },
    { id: 'console.clear', title: 'Clear console', category: 'View', run: () => consoleLog.clear() },
    { id: 'midi.enable', title: 'Enable MIDI input', category: 'Hardware', run: () => { void core.enableMidiInput(); } },
    {
      id: 'debug.dump',
      title: 'Debug: dump workspace state to console',
      category: 'Debug',
      run: () => {
        // eslint-disable-next-line no-console
        console.log('[kanopi] workspace', {
          files: workspace.files.map((f) => ({ id: f.id, path: f.path, name: f.name, runtime: f.runtime })),
          openTabIds: workspace.openTabIds,
          activeTabId: workspace.activeTabId,
          actors: actors.list,
          scenes: scenes.list,
          bpm: clock.state.bpm,
          playing: clock.state.playing
        });
      }
    },
    {
      id: 'workspace.reset',
      title: 'Reset workspace (clear IndexedDB + reload)',
      category: 'Workspace',
      run: () => {
        suppressPersistOnce();
        clearWorkspace();
        location.reload();
      }
    }
  ];
}

export function listCommands(): Command[] {
  const cmds = staticCommands();
  for (const s of scenes.list) {
    cmds.push({
      id: `scene.${s.name}`,
      title: `Switch to scene: ${s.name}`,
      category: 'Scenes',
      run: () => scenes.activate(s.name)
    });
  }
  for (const a of actors.list) {
    cmds.push({
      id: `actor.toggle.${a.name}`,
      title: `Toggle actor: ${a.name}`,
      category: 'Actors',
      hint: a.runtime,
      run: () => actors.toggle(a.name)
    });
  }
  for (const f of workspace.files) {
    cmds.push({
      id: `file.open.${f.id}`,
      title: `Open file: ${f.path}`,
      category: 'Files',
      hint: f.runtime,
      run: () => workspace.openFile(f.id)
    });
  }
  return cmds;
}

export function filterCommands(cmds: Command[], q: string): Command[] {
  const query = q.trim().toLowerCase();
  if (!query) return cmds;
  const tokens = query.split(/\s+/);
  return cmds
    .map((c) => {
      const hay = `${c.title} ${c.category ?? ''} ${c.hint ?? ''}`.toLowerCase();
      const matched = tokens.every((t) => hay.includes(t));
      return matched ? { c, score: hay.indexOf(tokens[0]) } : null;
    })
    .filter((x): x is { c: Command; score: number } => x !== null)
    .sort((a, b) => a.score - b.score)
    .map((x) => x.c);
}
