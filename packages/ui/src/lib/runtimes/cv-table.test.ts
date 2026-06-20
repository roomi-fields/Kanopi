import { describe, it, expect } from 'vitest';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { modulatorsFromAst } from './bpx-adapter';

// The modulator registry is built from the scene's `cv … : mod.obj(…)`
// declarations: each modulator's params (library defaults < positional/by-order <
// named) + the library's curve, keyed by NAME. The branchement `(cutoff: env1)` on
// a note (surfaced via leaf.controls) selects which modulator drives which input —
// not here.

const SCENE = (decl: string) =>
  `@core\n@controls\n@alphabet.western:browser\n@mm:138\n${decl}\nS -> Bass\nBass -> C2 C2 (cutoff: env1)\n`;

describe('modulatorsFromAst', () => {
  it('builds a registry entry from a cv declaration (named args + library curve)', () => {
    const ast = compileToBPxAST(SCENE('cv env1 : mod.adsr(attack:8, sustain:0.5)')).ast;
    const reg = modulatorsFromAst(ast);
    expect(Object.keys(reg)).toEqual(['env1']);
    const m = reg.env1;
    expect(m.objectType).toBe('adsr');
    expect(m.params).toMatchObject({ attack: 8, sustain: 0.5 });
    // unspecified params fall back to library defaults
    expect(m.params).toMatchObject({ decay: 100, release: 200 });
    // the curve comes from the library (segments), not hardcoded
    expect((m.curve as { kind?: string })?.kind).toBe('segments');
  });

  it('resolves positional args by the library parameter order', () => {
    const ast = compileToBPxAST(SCENE('cv env1 : mod.adsr(5, 150, 0.2, 400)')).ast;
    const m = modulatorsFromAst(ast).env1;
    expect(m.params).toMatchObject({ attack: 5, decay: 150, sustain: 0.2, release: 400 });
    expect(m.params.stretch).toBe(false); // library default merged in
  });

  it('no cv declarations → empty registry', () => {
    const ast = compileToBPxAST('@core\n@alphabet.western:browser\nS -> C2 C2\n').ast;
    expect(modulatorsFromAst(ast)).toEqual({});
  });
});
