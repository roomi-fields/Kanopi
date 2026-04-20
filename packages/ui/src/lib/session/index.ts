export * from './ast';
export { parseSession as parseToAST } from './parser';
export { resolve } from './resolver';
export type { TimeSignature } from './resolver';

import { parseSession as parseToASTImpl } from './parser';
import { resolve as resolveImpl } from './resolver';
import type { Actor, Mapping, Scene } from '../core-mock';
import type { Diagnostic } from './ast';
import type { TimeSignature } from './resolver';

/** Backwards-compat shape for real-core. */
export interface SessionParseResult {
  actors: Actor[];
  scenes: Scene[];
  mappings: Mapping[];
  timeSignature?: TimeSignature;
  errors: { line: number; msg: string }[];
}

export function parseSession(source: string): SessionParseResult {
  const ast = parseToASTImpl(source);
  const r = resolveImpl(ast);
  return {
    actors: r.actors,
    scenes: r.scenes,
    mappings: r.mappings,
    timeSignature: r.timeSignature,
    errors: r.diagnostics.map((d: Diagnostic) => ({
      line: d.range.start.line,
      msg: d.message
    }))
  };
}
