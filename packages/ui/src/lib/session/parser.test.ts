import { describe, it, expect } from 'vitest';
import { parseSession } from './parser';

describe('parseSession', () => {
  it('parses actors', () => {
    const r = parseSession(`
@actor drums   drums.tidal    tidal
@actor visuals visuals.hydra  hydra
`);
    expect(r.errors).toEqual([]);
    expect(r.actors.map((a) => a.name)).toEqual(['drums', 'visuals']);
    expect(r.actors[0].file).toBe('drums.tidal');
    expect(r.actors[0].runtime).toBe('tidal');
  });

  it('parses scenes and fills absent actors with false', () => {
    const r = parseSession(`
@actor a x.tidal tidal
@actor b y.tidal tidal
@scene s1 a
`);
    expect(r.errors).toEqual([]);
    expect(r.scenes[0].actors).toEqual({ a: true, b: false });
  });

  it('parses mappings (cc, pad, note with channel)', () => {
    const r = parseSession(`
@actor drums drums.tidal tidal
@scene drop drums
@map cc:1        tempo
@map pad:36      scene:drop
@map cc:21/ch1   drums.toggle
@map note:60/ch2 drums.gain
`);
    expect(r.errors).toEqual([]);
    expect(r.mappings).toHaveLength(4);
    expect(r.mappings[0].target).toEqual({ kind: 'tempo' });
    expect(r.mappings[1].target).toEqual({ kind: 'scene', ref: 'drop' });
    expect(r.mappings[2].source).toEqual({ kind: 'cc', index: 21, ch: 1 });
    expect(r.mappings[3].target).toEqual({ kind: 'actor.param', ref: 'drums', param: 'gain' });
  });

  it('flags unknown actor in scene', () => {
    const r = parseSession(`@scene s1 phantom`);
    expect(r.errors.some((e) => /phantom/.test(e.msg))).toBe(true);
  });

  it('flags unknown runtime', () => {
    const r = parseSession(`@actor x x.foo zzzzz`);
    expect(r.errors.some((e) => /zzzzz/.test(e.msg))).toBe(true);
  });

  it('flags unknown directive', () => {
    const r = parseSession(`@nope something`);
    expect(r.errors.some((e) => /@nope/.test(e.msg))).toBe(true);
  });

  it('ignores comments and blank lines', () => {
    const r = parseSession(`
# a comment
@actor drums drums.tidal tidal   # inline comment

prose line is ignored
@scene drop drums
`);
    expect(r.errors).toEqual([]);
    expect(r.actors).toHaveLength(1);
    expect(r.scenes).toHaveLength(1);
  });
});
