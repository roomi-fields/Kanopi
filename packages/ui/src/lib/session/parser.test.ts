import { describe, it, expect } from 'vitest';
import { parseSession } from './index';

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

  it('parses mappings (cv, trig, gate with channel)', () => {
    const r = parseSession(`
@actor drums drums.tidal tidal
@scene drop drums
@map cv:1        tempo
@map trig:36     scene:drop
@map cv:21/ch1   drums.toggle
@map gate:60/ch2 drums.gain
`);
    expect(r.errors).toEqual([]);
    expect(r.mappings).toHaveLength(4);
    expect(r.mappings[0].target).toEqual({ kind: 'tempo' });
    expect(r.mappings[1].target).toEqual({ kind: 'scene', ref: 'drop' });
    expect(r.mappings[2].source).toEqual({ kind: 'cv', index: 21, ch: 1 });
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

  it('parses @time N/D', () => {
    const r = parseSession(`@time 3/4`);
    expect(r.errors).toEqual([]);
    expect(r.timeSignature).toEqual({ num: 3, den: 4 });
  });

  it('parses @time N (implicit denominator)', () => {
    const r = parseSession(`@time 7`);
    expect(r.errors).toEqual([]);
    expect(r.timeSignature).toEqual({ num: 7, den: 4 });
  });

  it('omits timeSignature when @time absent', () => {
    const r = parseSession(`@actor x x.tidal tidal`);
    expect(r.timeSignature).toBeUndefined();
  });

  it('rejects @time with invalid value', () => {
    const r = parseSession(`@time foo`);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.timeSignature).toBeUndefined();
  });

  it('rejects @time with numerator out of range', () => {
    const r = parseSession(`@time 99/4`);
    expect(r.errors.some((e) => /1\.\.32/.test(e.msg))).toBe(true);
  });

  it('last @time wins (redeclaration warning)', () => {
    const r = parseSession(`
@time 4/4
@time 3/4
`);
    expect(r.timeSignature).toEqual({ num: 3, den: 4 });
    expect(r.errors.some((e) => /redeclared/.test(e.msg))).toBe(true);
  });
});
