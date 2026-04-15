import type { Actor, Mapping, MapSource, MapTarget, Runtime, Scene } from '../core-mock';

export interface ParseError {
  line: number;
  msg: string;
}

export interface SessionParseResult {
  actors: Actor[];
  scenes: Scene[];
  mappings: Mapping[];
  errors: ParseError[];
}

const RUNTIMES = new Set<Runtime>([
  'kanopi',
  'strudel',
  'hydra',
  'tidal',
  'sc',
  'python',
  'js',
  'system'
]);

function parseSource(token: string, ln: number, errs: ParseError[]): MapSource | null {
  // cc:N[/chN], pad:N, note:N[/chN]
  const [kind, rest] = token.split(':', 2);
  if (!rest) {
    errs.push({ line: ln, msg: `invalid source "${token}" (expect cc:N | pad:N | note:N)` });
    return null;
  }
  const [idxStr, chStr] = rest.split('/');
  const index = parseInt(idxStr, 10);
  if (Number.isNaN(index)) {
    errs.push({ line: ln, msg: `invalid index in "${token}"` });
    return null;
  }
  let ch: number | undefined;
  if (chStr) {
    const m = /^ch(\d+)$/i.exec(chStr);
    if (!m) {
      errs.push({ line: ln, msg: `invalid channel in "${token}" (expect /chN)` });
      return null;
    }
    ch = parseInt(m[1], 10);
  }
  if (kind === 'cc') return { kind: 'cc', index, ch };
  if (kind === 'note') return { kind: 'note', index, ch };
  if (kind === 'pad') return { kind: 'pad', index };
  errs.push({ line: ln, msg: `unknown source kind "${kind}"` });
  return null;
}

function parseTarget(token: string, ln: number, errs: ParseError[]): MapTarget | null {
  if (token === 'tempo') return { kind: 'tempo' };
  if (token.startsWith('scene:')) return { kind: 'scene', ref: token.slice(6) };
  // actor.toggle or actor.param
  const dot = token.indexOf('.');
  if (dot > 0) {
    const ref = token.slice(0, dot);
    const suffix = token.slice(dot + 1);
    if (suffix === 'toggle') return { kind: 'actor.toggle', ref };
    return { kind: 'actor.param', ref, param: suffix };
  }
  errs.push({ line: ln, msg: `invalid target "${token}"` });
  return null;
}

export function parseSession(text: string): SessionParseResult {
  const actors: Actor[] = [];
  const scenes: Scene[] = [];
  const mappings: Mapping[] = [];
  const errors: ParseError[] = [];
  let mappingSeq = 0;

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    const raw = lines[i].replace(/#.*$/, '').trim();
    if (!raw) continue;
    const parts = raw.split(/\s+/);
    const head = parts[0];

    if (head === '@actor') {
      const [, name, file, runtime] = parts;
      if (!name || !runtime) {
        errors.push({ line: ln, msg: '@actor expects: @actor <name> <file> <runtime>' });
        continue;
      }
      if (!RUNTIMES.has(runtime as Runtime)) {
        errors.push({ line: ln, msg: `unknown runtime "${runtime}"` });
      }
      const dup = actors.findIndex((a) => a.name === name);
      if (dup !== -1) {
        errors.push({ line: ln, msg: `actor "${name}" redeclared (previous one ignored)` });
        actors.splice(dup, 1);
      }
      actors.push({ name, file, runtime: runtime as Runtime, active: false });
    } else if (head === '@scene') {
      const [, name, ...actorNames] = parts;
      if (!name) {
        errors.push({ line: ln, msg: '@scene expects: @scene <name> [actor1 actor2 ...]' });
        continue;
      }
      const actorMap: Record<string, boolean> = {};
      for (const a of actorNames) actorMap[a] = true;
      const dup = scenes.findIndex((s) => s.name === name);
      if (dup !== -1) {
        errors.push({ line: ln, msg: `scene "${name}" redeclared (previous one ignored)` });
        scenes.splice(dup, 1);
      }
      scenes.push({ name, actors: actorMap, active: false });
    } else if (head === '@map') {
      const [, src, tgt] = parts;
      if (!src || !tgt) {
        errors.push({ line: ln, msg: '@map expects: @map <source> <target>' });
        continue;
      }
      const source = parseSource(src, ln, errors);
      const target = parseTarget(tgt, ln, errors);
      if (!source || !target) continue;
      mappings.push({ id: `m${++mappingSeq}`, source, target });
    } else if (head.startsWith('@')) {
      errors.push({ line: ln, msg: `unknown directive "${head}"` });
    }
    // lines that don't start with @ are ignored (free-form comments / prose)
  }

  // Semantic validation
  const actorNames = new Set(actors.map((a) => a.name));
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    for (const a of Object.keys(s.actors)) {
      if (!actorNames.has(a)) {
        errors.push({ line: 0, msg: `scene "${s.name}": actor "${a}" not declared` });
      }
    }
    // fill missing actors with false so toggles work
    const complete: Record<string, boolean> = {};
    for (const a of actorNames) complete[a] = s.actors[a] === true;
    scenes[i] = { ...s, actors: complete };
  }
  for (const m of mappings) {
    if (m.target.kind === 'scene') {
      const name = m.target.ref;
      if (!scenes.find((s) => s.name === name)) {
        errors.push({ line: 0, msg: `map target scene "${name}" not declared` });
      }
    }
    if (m.target.kind === 'actor.toggle' || m.target.kind === 'actor.param') {
      if (!actorNames.has(m.target.ref)) {
        errors.push({ line: 0, msg: `map target actor "${m.target.ref}" not declared` });
      }
    }
  }

  return { actors, scenes, mappings, errors };
}
