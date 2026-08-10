import { describe, it, expect } from 'vitest';
import { guestLibraries } from 'runtime-codevoices';
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

  it("ne préfetche PAS une banque DISTANTE — elle se charge paresseusement à l'éval", () => {
    // Filtre selfHosted [788] : préfetcher une banque distante déclenche un console.error interne
    // de strudel si son fetch échoue à l'ouverture (régression du gate). Seules les banques
    // hébergées sont préfetchées.
    //
    // ⚠️ LA BANQUE SE DÉRIVE DU CATALOGUE, ELLE NE S'ÉCRIT PLUS EN DUR. Ce banc visait
    // `dirt-samples`, et il a rougi le 2026-08-10 quand runtime-codevoices l'a RAPATRIÉE sur nos
    // serveurs (leur e658835, `selfHosted` passé à vrai). Rien n'avait dérivé : la propriété sur
    // laquelle le banc s'appuyait avait changé de valeur, légitimement. Un nom écrit en dur fige
    // un état, pas une propriété.
    //
    // ⚠️ ET IL CRIE SI SON SUJET DISPARAÎT : le jour où toutes les banques seront hébergées, ce
    // banc n'aura plus rien à mesurer — et le sauver en le pointant sur une banque hébergée le
    // viderait de son sujet tout en le laissant vert. Il échoue alors en le disant.
    const distante = guestLibraries.find(
      (l) => l.engine === 'strudel' && !l.selfHosted && l.declarable
    );
    expect(
      distante,
      "plus aucune banque strudel distante au catalogue : ce banc n'a plus de sujet, le retirer ou le redéfinir"
    ).toBeDefined();

    const code = `@core\n@tempo:120\n\n@actor v  eval.strudel(bank:"${distante!.id}")\n\nS -> v\n\nv -> \`s("bd hh sd")\`:4`;
    const assets = assetsForScene(code);
    expect(assets.strudel?.banks ?? []).not.toContain(distante!.id);
    expect(assets).toEqual({}); // pas de banque hébergée ni d'instrument GM → rien à préfetcher
  });

  it('returns {} on unparseable / empty text (best-effort, never throws)', () => {
    expect(assetsForScene('')).toEqual({});
    expect(assetsForScene('%%% not a scene %%%')).toEqual({});
  });
});
