/**
 * AST for the Kanopi session language.
 *
 * Every node carries a `range` so editor tooling (squiggles, hovers, jump-to-def)
 * can light up the exact text that produced it.
 */

export interface Pos {
  line: number; // 1-based
  col: number; // 1-based
  offset: number; // 0-based byte offset in source
}

export interface Range {
  start: Pos;
  end: Pos;
}

export interface Token {
  text: string;
  range: Range;
}

export type Node =
  | ActorDecl
  | SceneDecl
  | MapDecl
  | TimeSignatureDecl
  | LibraryDecl
  | UnknownDirective
  | MalformedLine;

export interface ActorDecl {
  type: 'actor';
  name: Token;
  file: Token;
  runtime: Token;
  range: Range;
}

export interface SceneDecl {
  type: 'scene';
  name: Token;
  actors: Token[];
  range: Range;
}

export interface MapDecl {
  type: 'map';
  source: MapSourceNode;
  target: MapTargetNode;
  range: Range;
}

export interface MapSourceNode {
  kind: Token; // 'cv' | 'trig' | 'gate'
  index: Token; // numeric token
  channel?: Token; // numeric token (after /chN)
  range: Range;
}

export type MapTargetNode =
  | { type: 'tempo'; range: Range }
  | { type: 'scene'; ref: Token; range: Range }
  | { type: 'actor.toggle'; actor: Token; range: Range }
  | { type: 'actor.param'; actor: Token; param: Token; range: Range };

/**
 * `@time N/D` — time signature.
 * v1 only tracks the numerator (beats per bar). Denominator is parsed and
 * stored for display / future use (e.g. a `@time 6/8` feels different from
 * `@time 3/4` but both have N=6 and N=3 respectively).
 */
export interface TimeSignatureDecl {
  type: 'time';
  num: Token;
  den?: Token;
  range: Range;
}

/**
 * `@library <id>` — load an audio bank from the Kanopi catalog.
 * `id` must match an entry in `lib/library/audio-banks/catalog.json`.
 */
export interface LibraryDecl {
  type: 'library';
  id: Token;
  range: Range;
}

export interface UnknownDirective {
  type: 'unknown';
  keyword: Token;
  range: Range;
}

export interface MalformedLine {
  type: 'malformed';
  text: string;
  reason: string;
  range: Range;
}

export interface SessionAST {
  nodes: Node[];
  diagnostics: Diagnostic[];
}

export interface Diagnostic {
  severity: 'error' | 'warning';
  message: string;
  range: Range;
}
