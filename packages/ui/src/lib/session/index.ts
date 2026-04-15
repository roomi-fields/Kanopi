export * from './ast';
export { parseSession as parseToAST } from './parser';
export { resolve } from './resolver';

import { parseSession as parseToASTImpl } from './parser';
import { resolve as resolveImpl } from './resolver';
import type { Actor, Mapping, Scene } from '../core-mock';
import type { Diagnostic } from './ast';

/** Backwards-compat shape for real-core. */
export interface SessionParseResult {
  actors: Actor[];
  scenes: Scene[];
  mappings: Mapping[];
  errors: { line: number; msg: string }[];
}

export function parseSession(source: string): SessionParseResult {
  const ast = parseToASTImpl(source);
  const r = resolveImpl(ast);
  return {
    actors: r.actors,
    scenes: r.scenes,
    mappings: r.mappings,
    errors: r.diagnostics.map((d: Diagnostic) => ({
      line: d.range.start.line,
      msg: d.message
    }))
  };
}
