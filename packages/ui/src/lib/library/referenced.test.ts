import { describe, it, expect } from 'vitest';
import { referencedLibraries, programCompileStatus } from './referenced';

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

  it('still lists directives when the program has a control-value error', () => {
    // An invalid control value (triangle123) errors downstream but must NOT hide
    // the top-of-file `@` directives.
    const code = `@core\n@controls\n@alphabet.western:browser\n@mm:120\nS -> Bass\nBass -> C2 C2 (wave:triangle123)`;
    const libs = referencedLibraries('bad.bps', code);
    expect(libs).toContainEqual({ type: 'module', typeLabel: 'module', name: 'core' });
    expect(libs).toContainEqual({ type: 'alphabet', typeLabel: 'alphabet', name: 'western' });
  });

  it('still lists directives when a HARD syntax error leaves no AST', () => {
    // A malformed rule (missing arrow / value) makes the compiler produce NO ast.
    // The text-scan fallback must still surface the `@` directives.
    const code = `@filter\n@core\n@controls\n@alphabet.western:browser\n@mm:180\nS -> {Bass, env1 -}\nBass -> C2 - (wave, vel:100) [weight:30]`;
    const libs = referencedLibraries('cv-adsr.bps', code);
    expect(libs).toContainEqual({ type: 'module', typeLabel: 'module', name: 'filter' });
    expect(libs).toContainEqual({ type: 'module', typeLabel: 'module', name: 'core' });
    expect(libs).toContainEqual({ type: 'module', typeLabel: 'module', name: 'controls' });
    expect(libs).toContainEqual({ type: 'alphabet', typeLabel: 'alphabet', name: 'western' });
  });
});

describe('programCompileStatus', () => {
  it('reports ok for a valid program', () => {
    const code = `@core\n@controls\n@alphabet.western:browser\n@mm:120\nS -> Bass\nBass -> C2 C2 (wave:sawtooth)`;
    const s = programCompileStatus('ok.bps', code);
    expect(s.applicable).toBe(true);
    expect(s.ok).toBe(true);
    expect(s.errors).toEqual([]);
  });

  it('reports the error for an invalid control value', () => {
    const code = `@core\n@controls\n@alphabet.western:browser\n@mm:120\nS -> Bass\nBass -> C2 C2 (wave:triangle123)`;
    const s = programCompileStatus('bad.bps', code);
    expect(s.applicable).toBe(true);
    expect(s.ok).toBe(false);
    expect(s.errors[0].message).toContain('triangle123');
  });

  it('is not applicable to non-program files', () => {
    // `.py` resolves to the `python` runtime, not `bpscript`, so no compile chip.
    expect(programCompileStatus('notes.py', 'hello').applicable).toBe(false);
  });
});
