import { describe, it, expect } from 'vitest';
import { assetsForScene } from './bpx-adapter';

// [788] — prove the on-OPEN preload also transports the ASSETS a scene declares (strudel banks +
// GM instrument names it uses), read off the SAME compiled AST as `interpsForScene` (no host text
// re-derivation, no resolution — the host only transports names to `preload(interps, assets)`).

describe('assetsForScene — declared strudel banks + used gm_* instruments (for on-open preload)', () => {
  it('detects the declared bank + the 3 gm_* instruments of the GM piano scene', () => {
    const code = [
      '@core',
      '@tempo:120',
      '',
      '@actor v  eval.strudel(bank:"gm")',
      '',
      'S -> v_r',
      '',
      'v_r -> v.`stack(',
      '  note("c3 e3 g3 c4").sound("gm_piano"),',
      '  note("<c4 e4 g4>").sound("gm_marimba").slow(2),',
      '  note("g4 ~ e4 ~").sound("gm_flute").gain(0.7)',
      ')`:4'
    ].join('\n');
    const assets = assetsForScene(code);
    expect(assets.strudel?.banks).toEqual(['gm']);
    expect(new Set(assets.strudel?.gmInstruments)).toEqual(
      new Set(['gm_piano', 'gm_marimba', 'gm_flute'])
    );
  });

  it('returns {} for a scene with no code voice at all', () => {
    const code =
      '@core\n@controls\n@alphabet.western:audio\n@tempo:120\nS -> Bass\nBass -> C2 C2 (wave:sawtooth)';
    expect(assetsForScene(code)).toEqual({});
  });

  it('returns {} for a strudel scene that declares no bank and uses no gm_* instrument', () => {
    const code =
      '@core\n@tempo:120\n\n@actor v  eval.strudel\n\nS -> v_r\n\nv_r -> v.`sound("bd hh sd oh")`';
    expect(assetsForScene(code)).toEqual({});
  });

  it('does NOT prefetch a REMOTE bank (selfHosted:false, e.g. dirt-samples) — it lazy-loads at eval', () => {
    // Filtre selfHosted [788] : préfetcher une banque distante déclenche un console.error interne de
    // strudel si son fetch échoue à l'ouverture (régression du gate). Seules les banques VPS sont
    // préfetchées ; la banque distante reste chargée paresseusement à l'éval (inchangé).
    const code =
      '@core\n@tempo:120\n\n@actor v  eval.strudel(bank:"dirt-samples")\n\nS -> v\n\nv -> `s("bd hh sd")`:4';
    const assets = assetsForScene(code);
    expect(assets.strudel?.banks ?? []).not.toContain('dirt-samples');
    expect(assets).toEqual({}); // pas de banque VPS ni d'instrument GM → rien à préfetcher
  });

  it('returns {} on unparseable / empty text (best-effort, never throws)', () => {
    expect(assetsForScene('')).toEqual({});
    expect(assetsForScene('%%% not a scene %%%')).toEqual({});
  });
});
