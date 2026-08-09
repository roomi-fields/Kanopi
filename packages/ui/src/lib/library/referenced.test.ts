import { describe, it, expect } from 'vitest';
import { referencedLibraries, programCompileStatus } from './referenced';

describe('referencedLibraries — bpscript directives', () => {
  it('reads alphabet and tuning directives (dot-canon names from the subkey)', () => {
    // `@tuning.sargam_22shruti` is a REAL tuning (lib/tunings.json). The former
    // fixture named `maqam_rast`, which is a SCALE (lib/scales.json), not a tuning —
    // a dishonest fixture (architecte [745]). Dot canon: the tuning name is the subkey.
    const code = `@core
@alphabet.arabic:audio
@tuning.sargam_22shruti

S -> a
a -> do re mi`;
    const libs = referencedLibraries('arabic.bps', code);
    expect(libs).toContainEqual({ type: 'alphabet', typeLabel: 'alphabet', name: 'arabic' });
    expect(libs).toContainEqual({ type: 'tuning', typeLabel: 'tuning', name: 'sargam_22shruti' });
  });

  it('reads scale, octaves and the audio-bank library table', () => {
    const code = `@core
@scale.bilaval
@octaves.western

@actor voice  eval.strudel(bank:"dirt-samples")

S -> a
a -> voice.\`s("bd sd")\``;
    const libs = referencedLibraries('mix.bps', code);
    expect(libs).toContainEqual({ type: 'scale', typeLabel: 'scale', name: 'bilaval' });
    expect(libs).toContainEqual({ type: 'octaves', typeLabel: 'octaves', name: 'western' });
    expect(libs).toContainEqual({
      type: 'audio-bank',
      typeLabel: 'audio bank',
      name: 'dirt-samples'
    });
  });

  it('reads @devices', () => {
    const devicesLib = referencedLibraries('d.bps', `@core\n@devices\n\nS -> a\na -> c d`);
    expect(devicesLib.some((l) => l.type === 'device')).toBe(true);
  });

  it('returns empty for a non-program file', () => {
    expect(referencedLibraries('notes.txt', 'hello')).toEqual([]);
    expect(referencedLibraries(undefined, undefined)).toEqual([]);
  });

  it('still lists directives when the program has a control-value error', () => {
    // An invalid control value (triangle123) errors downstream but must NOT hide
    // the top-of-file `@` directives.
    const code = `@core\n@controls\n@alphabet.western:audio\n@tempo:120\nS -> Bass\nBass -> C2 C2 (wave:triangle123)`;
    const libs = referencedLibraries('bad.bps', code);
    expect(libs).toContainEqual({ type: 'module', typeLabel: 'module', name: 'core' });
    expect(libs).toContainEqual({ type: 'alphabet', typeLabel: 'alphabet', name: 'western' });
  });

  it('still lists directives when a HARD syntax error leaves no AST', () => {
    // A malformed rule (missing arrow / value) makes the compiler produce NO ast.
    // The text-scan fallback must still surface the `@` directives.
    const code = `@filter\n@core\n@controls\n@alphabet.western:audio\n@tempo:180\nS -> {Bass, env1 -}\nBass -> C2 - (wave, vel:100) [weight:30]`;
    const libs = referencedLibraries('cv-adsr.bps', code);
    expect(libs).toContainEqual({ type: 'module', typeLabel: 'module', name: 'filter' });
    expect(libs).toContainEqual({ type: 'module', typeLabel: 'module', name: 'core' });
    expect(libs).toContainEqual({ type: 'module', typeLabel: 'module', name: 'controls' });
    expect(libs).toContainEqual({ type: 'alphabet', typeLabel: 'alphabet', name: 'western' });
  });
});

describe('programCompileStatus', () => {
  it('reports ok for a valid program', () => {
    const code = `@core\n@controls\n@alphabet.western:audio\n@tempo:120\nS -> Bass\nBass -> C2 C2 (wave:sawtooth)`;
    const s = programCompileStatus('ok.bps', code);
    expect(s.applicable).toBe(true);
    expect(s.ok).toBe(true);
    expect(s.errors).toEqual([]);
  });

  it('reports the error for an invalid control value', () => {
    const code = `@core\n@controls\n@alphabet.western:audio\n@tempo:120\nS -> Bass\nBass -> C2 C2 (wave:triangle123)`;
    const s = programCompileStatus('bad.bps', code);
    expect(s.applicable).toBe(true);
    expect(s.ok).toBe(false);
    expect(s.errors[0].message).toContain('triangle123');
  });

  it('is not applicable to non-program files', () => {
    // `.py` resolves to the `python` runtime, not `bpscript`, so no compile chip.
    expect(programCompileStatus('notes.py', 'hello').applicable).toBe(false);
  });

  // Fail-loud on derivation (msg [598]): a scene that PARSES clean but the eval
  // pipeline recorded a derive throw for → red, phase 'derive', with the message.
  it('reports a derive failure when parse is clean but the eval derive threw', () => {
    const code = `@core\n@controls\n@alphabet.western:audio\n@tempo:120\nS -> Bass\nBass -> C2 C2 (wave:sawtooth)`;
    const s = programCompileStatus('mohanam.bps', code, {
      ok: false,
      error: { message: 'transposeToken: unresolved pitch' }
    });
    expect(s.ok).toBe(false);
    expect(s.phase).toBe('derive');
    expect(s.errors[0].message).toContain('transposeToken');
  });

  it('stays ok when parse is clean and the derive outcome is ok', () => {
    const code = `@core\n@controls\n@alphabet.western:audio\n@tempo:120\nS -> Bass\nBass -> C2 C2 (wave:sawtooth)`;
    const s = programCompileStatus('ok.bps', code, { ok: true });
    expect(s.ok).toBe(true);
    expect(s.errors).toEqual([]);
  });

  it('parse errors win over a derive outcome (parse phase reported first)', () => {
    const code = `@core\n@controls\n@alphabet.western:audio\n@tempo:120\nS -> Bass\nBass -> C2 C2 (wave:triangle123)`;
    const s = programCompileStatus('bad.bps', code, {
      ok: false,
      error: { message: 'derive too' }
    });
    expect(s.ok).toBe(false);
    expect(s.phase).toBe('parse');
    expect(s.errors[0].message).toContain('triangle123');
  });

  it('null derive (never evaluated / stale) leaves the status at parse-only', () => {
    const code = `@core\n@controls\n@alphabet.western:audio\n@tempo:120\nS -> Bass\nBass -> C2 C2 (wave:sawtooth)`;
    expect(programCompileStatus('ok.bps', code, null).ok).toBe(true);
    expect(programCompileStatus('ok.bps', code, undefined).ok).toBe(true);
  });

  // 3-signal health voyant (decision 2026-07-15-voyant-sante-niveau3.md): parse and
  // derive can both be clean while signal 2 (resource) or signal 3 (runtime) fail —
  // the chip must still read red in either case, not a misleading green "compiles".
  const okCode = `@core\n@controls\n@alphabet.western:audio\n@tempo:120\nS -> Bass\nBass -> C2 C2 (wave:sawtooth)`;

  it('(a) a resource-resolution error → not ok, phase "resource"', () => {
    const s = programCompileStatus('ok.bps', okCode, { ok: true }, undefined, {
      ok: false,
      errors: [{ message: 'banque inconnue: zzz-nonexistent' }]
    });
    expect(s.ok).toBe(false);
    expect(s.phase).toBe('resource');
    expect(s.errors[0].message).toContain('zzz-nonexistent');
  });

  it('(b) a runtime error → not ok, phase "runtime"', () => {
    const s = programCompileStatus(
      'ok.bps',
      okCode,
      { ok: true },
      undefined,
      { ok: true, errors: [] },
      [{ message: 'sound not found: bd' }]
    );
    expect(s.ok).toBe(false);
    expect(s.phase).toBe('runtime');
    expect(s.errors[0].message).toContain('sound not found');
  });

  it('(c) parse + derive + resource + runtime all ok → ok', () => {
    const s = programCompileStatus(
      'ok.bps',
      okCode,
      { ok: true },
      undefined,
      { ok: true, errors: [] },
      []
    );
    expect(s.ok).toBe(true);
    expect(s.errors).toEqual([]);
    expect(s.phase).toBeUndefined();
  });

  it('(d) a parse error always wins, even with resource/runtime errors too', () => {
    const badCode = `@core\n@controls\n@alphabet.western:audio\n@tempo:120\nS -> Bass\nBass -> C2 C2 (wave:triangle123)`;
    const s = programCompileStatus(
      'bad.bps',
      badCode,
      { ok: false, error: { message: 'derive too' } },
      undefined,
      { ok: false, errors: [{ message: 'banque inconnue: zzz' }] },
      [{ message: 'sound not found' }]
    );
    expect(s.ok).toBe(false);
    expect(s.phase).toBe('parse');
    expect(s.errors[0].message).toContain('triangle123');
  });

  it('a derive error wins over resource/runtime errors (priority: parse > derive > resource > runtime)', () => {
    const s = programCompileStatus(
      'mohanam.bps',
      okCode,
      { ok: false, error: { message: 'transposeToken: unresolved pitch' } },
      undefined,
      { ok: false, errors: [{ message: 'banque inconnue: zzz' }] },
      [{ message: 'sound not found' }]
    );
    expect(s.ok).toBe(false);
    expect(s.phase).toBe('derive');
  });

  // `.gr` — native BP3 grammar, parsed by the REAL BP3 front-end (`parseBP3`/`parseGr`),
  // NOT the BPScript transpiler. Signals 2/3/4 (derive/resource/runtime) apply the
  // same as `.bps` — only the parse call differs.
  describe('.gr — BP3 grammar', () => {
    it('is applicable and ok for a clean BP3 grammar', () => {
      const code = `ORD\nS --> A\nA --> a`;
      const s = programCompileStatus('trial.gr', code);
      expect(s.applicable).toBe(true);
      expect(s.ok).toBe(true);
      expect(s.errors).toEqual([]);
    });

    it('reports a parse error, phase "parse", for an empty grammar', () => {
      const s = programCompileStatus('empty.gr', '');
      expect(s.applicable).toBe(true);
      expect(s.ok).toBe(false);
      expect(s.phase).toBe('parse');
      expect(s.errors[0].message).toContain('aucune règle trouvée');
    });

    it('still folds in derive/resource/runtime signals like .bps', () => {
      const code = `ORD\nS --> A\nA --> a`;
      const s = programCompileStatus('trial.gr', code, {
        ok: false,
        error: { message: 'transposeToken: unresolved pitch' }
      });
      expect(s.ok).toBe(false);
      expect(s.phase).toBe('derive');
    });
  });
});
