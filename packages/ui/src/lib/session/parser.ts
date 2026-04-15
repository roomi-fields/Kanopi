import type {
  Diagnostic,
  MapSourceNode,
  MapTargetNode,
  Node,
  Range,
  SessionAST,
  Token
} from './ast';
import { lex, lineRange, spanOf } from './lexer';

export function parseSession(source: string): SessionAST {
  const lines = lex(source);
  const nodes: Node[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const l of lines) {
    if (l.tokens.length === 0) continue;
    const head = l.tokens[0];
    if (!head.text.startsWith('@')) continue; // free-form prose, ignored

    const args = l.tokens.slice(1);
    const range: Range = spanOf(l.tokens, lineRange(l));

    if (head.text === '@actor') {
      if (args.length < 3) {
        nodes.push({ type: 'malformed', text: l.text, reason: '@actor expects: @actor <name> <file> <runtime>', range });
        diagnostics.push({ severity: 'error', message: '@actor expects 3 arguments', range });
        continue;
      }
      nodes.push({ type: 'actor', name: args[0], file: args[1], runtime: args[2], range });
    } else if (head.text === '@scene') {
      if (args.length < 1) {
        nodes.push({ type: 'malformed', text: l.text, reason: '@scene expects: @scene <name> [actors...]', range });
        diagnostics.push({ severity: 'error', message: '@scene expects at least a name', range });
        continue;
      }
      nodes.push({ type: 'scene', name: args[0], actors: args.slice(1), range });
    } else if (head.text === '@map') {
      if (args.length < 2) {
        nodes.push({ type: 'malformed', text: l.text, reason: '@map expects: @map <source> <target>', range });
        diagnostics.push({ severity: 'error', message: '@map expects 2 arguments', range });
        continue;
      }
      const source = parseSource(args[0], diagnostics);
      const target = parseTarget(args[1], diagnostics);
      if (!source || !target) {
        nodes.push({ type: 'malformed', text: l.text, reason: 'invalid @map source or target', range });
        continue;
      }
      nodes.push({ type: 'map', source, target, range });
    } else {
      nodes.push({ type: 'unknown', keyword: head, range });
      diagnostics.push({ severity: 'error', message: `unknown directive "${head.text}"`, range: head.range });
    }
  }

  return { nodes, diagnostics };
}

function parseSource(tok: Token, diagnostics: Diagnostic[]): MapSourceNode | null {
  const m = /^([a-zA-Z]+):(\d+)(?:\/ch(\d+))?$/.exec(tok.text);
  if (!m) {
    diagnostics.push({
      severity: 'error',
      message: `invalid source "${tok.text}" (expect cv:N | trig:N | gate:N, optional /chN)`,
      range: tok.range
    });
    return null;
  }
  const [, kindText, idxText, chText] = m;
  if (!['cv', 'trig', 'gate'].includes(kindText)) {
    diagnostics.push({ severity: 'error', message: `unknown source kind "${kindText}"`, range: tok.range });
    return null;
  }

  // Build sub-tokens with relative offsets within the parent token.
  const baseStart = tok.range.start;
  const subToken = (text: string, offsetInTok: number): Token => ({
    text,
    range: {
      start: { line: baseStart.line, col: baseStart.col + offsetInTok, offset: baseStart.offset + offsetInTok },
      end: {
        line: baseStart.line,
        col: baseStart.col + offsetInTok + text.length,
        offset: baseStart.offset + offsetInTok + text.length
      }
    }
  });

  const kind = subToken(kindText, 0);
  const index = subToken(idxText, kindText.length + 1);
  const channel = chText
    ? subToken(chText, kindText.length + 1 + idxText.length + 3)
    : undefined;

  return { kind, index, channel, range: tok.range };
}

function parseTarget(tok: Token, diagnostics: Diagnostic[]): MapTargetNode | null {
  const text = tok.text;
  const baseStart = tok.range.start;
  const subToken = (s: string, off: number): Token => ({
    text: s,
    range: {
      start: { line: baseStart.line, col: baseStart.col + off, offset: baseStart.offset + off },
      end: { line: baseStart.line, col: baseStart.col + off + s.length, offset: baseStart.offset + off + s.length }
    }
  });

  if (text === 'tempo') {
    return { type: 'tempo', range: tok.range };
  }
  if (text.startsWith('scene:')) {
    const ref = subToken(text.slice(6), 6);
    return { type: 'scene', ref, range: tok.range };
  }
  const dot = text.indexOf('.');
  if (dot > 0) {
    const actor = subToken(text.slice(0, dot), 0);
    const param = subToken(text.slice(dot + 1), dot + 1);
    if (param.text === 'toggle') {
      return { type: 'actor.toggle', actor, range: tok.range };
    }
    return { type: 'actor.param', actor, param, range: tok.range };
  }

  diagnostics.push({
    severity: 'error',
    message: `invalid target "${text}" (expect tempo | scene:NAME | ACTOR.toggle | ACTOR.PARAM)`,
    range: tok.range
  });
  return null;
}
