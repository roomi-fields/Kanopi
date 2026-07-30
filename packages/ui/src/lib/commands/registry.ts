import { clock } from '../../stores/clock.svelte';
import { tapTempo } from './tempo';
import { playback } from '../../stores/playback.svelte';
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
    // Transport commands route through `playback` → Kronos's Transport (never the clock
    // directly): the palette must not short-circuit the single transport authority.
    { id: 'clock.play', title: 'Play', category: 'Clock', run: () => playback.play() },
    { id: 'clock.stop', title: 'Stop', category: 'Clock', run: () => playback.stop() },
    {
      id: 'clock.toggle',
      title: 'Toggle play/stop',
      category: 'Clock',
      // 'playing' → stop; 'stopped' OR 'paused' → play() (play resumes a paused
      // transport in place, so 'paused' no longer falls through to stop).
      run: () => (playback.mode === 'playing' ? playback.stop() : playback.play())
    },
    // MÊME point d'entrée que le bouton TAP de la barre (`commands/tempo`) : le geste complet,
    // warp des runtimes ET report dans la directive de la scène. Appeler `clock.tap()` nu ici
    // donnait une palette qui warpait sans réécrire le texte — un tap au clavier et un tap à la
    // souris ne faisaient pas la même chose ([927]).
    { id: 'clock.tap', title: 'Tap tempo', category: 'Clock', run: () => tapTempo() },
    {
      id: 'console.clear',
      title: 'Clear console',
      category: 'View',
      run: () => consoleLog.clear()
    },
    {
      id: 'midi.enable',
      title: 'Enable MIDI input',
      category: 'Hardware',
      run: () => {
        // Le geste peut désormais REJETER (autorisation refusée, Web MIDI absent, port
        // introuvable) : le cœur l'a déjà journalisé en `level:'error'`, donc le signal est
        // dans la console. On absorbe ici la promesse rejetée pour ne pas laisser un rejet
        // non traité — absorber le REJET n'est pas absorber le SIGNAL, il est déjà crié.
        void core.enableMidiInput().catch(() => {});
      }
    },
    {
      id: 'debug.dump',
      title: 'Debug: dump workspace state to console',
      category: 'Debug',
      run: () => {
        console.log('[kanopi] workspace', {
          files: workspace.files.map((f) => ({
            id: f.id,
            path: f.path,
            name: f.name,
            runtime: f.runtime
          })),
          openTabIds: workspace.openTabIds,
          activeTabId: workspace.activeTabId,
          actors: actors.list,
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
