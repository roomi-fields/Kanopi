import { describe, it, expect } from 'vitest';
import { referencedLibraries } from './referenced';

describe('referencedLibraries — bpscript directives', () => {
  it('reads alphabet (subkey) and tuning (runtime)', () => {
    const code = `@core
@alphabet.arabic:browser
@tuning:maqam_rast

S -> a
a -> do re mi`;
    const libs = referencedLibraries('arabic.bps', code);
    expect(libs).toContainEqual({ type: 'alphabet', typeLabel: 'alphabet', name: 'arabic' });
    expect(libs).toContainEqual({ type: 'tuning', typeLabel: 'tuning', name: 'maqam_rast' });
  });

  it('reads scale, octaves, sound and the audio-bank library table', () => {
    const code = `@core
@library.strudel "dirt-samples"
@scale:bilaval
@octaves.western
@sound.tabla_perc

S -> a
a -> \`strudel: s("bd sd")\``;
    const libs = referencedLibraries('mix.bps', code);
    expect(libs).toContainEqual({ type: 'scale', typeLabel: 'scale', name: 'bilaval' });
    expect(libs).toContainEqual({ type: 'octaves', typeLabel: 'octaves', name: 'western' });
    expect(libs).toContainEqual({ type: 'sound', typeLabel: 'sound', name: 'tabla_perc' });
    expect(libs).toContainEqual({
      type: 'audio-bank',
      typeLabel: 'audio bank',
      name: 'dirt-samples'
    });
  });

  it('reads @devices and transport.<device>', () => {
    const devicesLib = referencedLibraries('d.bps', `@core\n@devices\n\nS -> a\na -> c d`);
    expect(devicesLib.some((l) => l.type === 'device')).toBe(true);

    const transportLib = referencedLibraries('t.bps', `@core\n@transport.midi\n\nS -> a\na -> c d`);
    expect(transportLib).toContainEqual({ type: 'device', typeLabel: 'device', name: 'midi' });
  });

  it('returns empty for a non-program file', () => {
    expect(referencedLibraries('notes.txt', 'hello')).toEqual([]);
    expect(referencedLibraries(undefined, undefined)).toEqual([]);
  });
});

describe('referencedLibraries — .kanopi session', () => {
  it('reads @library audio banks from a session', () => {
    const libs = referencedLibraries('set.kanopi', `@library dirt-samples\n@time 4`);
    expect(libs).toContainEqual({
      type: 'audio-bank',
      typeLabel: 'audio bank',
      name: 'dirt-samples'
    });
  });
});
