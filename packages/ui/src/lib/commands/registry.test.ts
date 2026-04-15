import { describe, it, expect } from 'vitest';
import { filterCommands, type Command } from './registry';

const cmds: Command[] = [
  { id: 'a', title: 'Play', category: 'Clock', run: () => {} },
  { id: 'b', title: 'Stop', category: 'Clock', run: () => {} },
  { id: 'c', title: 'Switch to scene: drop', category: 'Scenes', run: () => {} },
  { id: 'd', title: 'Toggle actor: drums', category: 'Actors', hint: 'tidal', run: () => {} },
  { id: 'e', title: 'Open file: drums.tidal', category: 'Files', run: () => {} }
];

describe('filterCommands', () => {
  it('returns all commands on empty query', () => {
    expect(filterCommands(cmds, '')).toHaveLength(cmds.length);
  });

  it('matches by title', () => {
    const r = filterCommands(cmds, 'play');
    expect(r.map((c) => c.id)).toContain('a');
    expect(r.map((c) => c.id)).not.toContain('b');
  });

  it('matches by category', () => {
    const r = filterCommands(cmds, 'scenes');
    expect(r.every((c) => c.category === 'Scenes')).toBe(true);
  });

  it('matches multi-token AND', () => {
    const r = filterCommands(cmds, 'open drums');
    expect(r.map((c) => c.id)).toEqual(['e']);
  });

  it('returns empty on unknown', () => {
    expect(filterCommands(cmds, 'zzznope')).toEqual([]);
  });
});
