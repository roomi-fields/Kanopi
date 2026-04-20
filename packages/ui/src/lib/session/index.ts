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
  libraries: string[];
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
    libraries: r.libraries,
    errors: r.diagnostics.map((d: Diagnostic) => ({
      line: d.range.start.line,
      msg: d.message
    }))
  };
}
