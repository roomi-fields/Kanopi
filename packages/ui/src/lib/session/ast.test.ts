import { describe, it, expect } from 'vitest';
import { parseToAST } from './index';

describe('AST positions', () => {
  it('captures token ranges in @actor', () => {
    const src = '@actor drums drums.tidal tidal\n';
    const ast = parseToAST(src);
    expect(ast.nodes).toHaveLength(1);
    const n = ast.nodes[0];
    if (n.type !== 'actor') throw new Error('expected actor');
    expect(n.name.text).toBe('drums');
    expect(n.name.range.start.line).toBe(1);
    expect(n.name.range.start.col).toBe(8); // after "@actor "
    expect(n.runtime.text).toBe('tidal');
    expect(n.runtime.range.start.col).toBe(26);
  });

  it('captures source sub-tokens in @map', () => {
    const src = '@map cv:21/ch3 drums.toggle\n';
    const ast = parseToAST(src);
    const n = ast.nodes[0];
    if (n.type !== 'map') throw new Error('expected map');
    expect(n.source.kind.text).toBe('cv');
    expect(n.source.index.text).toBe('21');
    expect(n.source.channel?.text).toBe('3');
    expect(n.source.kind.range.start.col).toBe(6); // after "@map "
  });

  it('emits diagnostics with ranges for unknown directives', () => {
    const src = '@nope something\n';
    const ast = parseToAST(src);
    expect(ast.diagnostics.length).toBeGreaterThan(0);
    expect(ast.diagnostics[0].range.start.line).toBe(1);
    expect(ast.diagnostics[0].range.start.col).toBe(1);
  });

  it('multi-line offsets are correct', () => {
    const src = '@actor a a.tidal tidal\n\n@scene s a\n';
    const ast = parseToAST(src);
    const scene = ast.nodes.find((n) => n.type === 'scene');
    if (!scene || scene.type !== 'scene') throw new Error('expected scene');
    expect(scene.name.range.start.line).toBe(3);
  });
});
