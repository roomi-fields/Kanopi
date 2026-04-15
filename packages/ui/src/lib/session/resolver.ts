import type {
  Actor,
  Mapping,
  MapSource,
  MapTarget,
  Runtime,
  Scene
} from '../core-mock';
import type { Diagnostic, Range, SessionAST } from './ast';

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

export interface ResolveResult {
  actors: Actor[];
  scenes: Scene[];
  mappings: Mapping[];
  diagnostics: Diagnostic[];
}

export function resolve(ast: SessionAST): ResolveResult {
  const actors: Actor[] = [];
  const scenes: Scene[] = [];
  const mappings: Mapping[] = [];
  const diagnostics: Diagnostic[] = [...ast.diagnostics];
  let mappingSeq = 0;

  for (const node of ast.nodes) {
    if (node.type === 'actor') {
      const runtime = node.runtime.text;
      if (!RUNTIMES.has(runtime as Runtime)) {
        diagnostics.push({ severity: 'error', message: `unknown runtime "${runtime}"`, range: node.runtime.range });
      }
      const dup = actors.findIndex((a) => a.name === node.name.text);
      if (dup !== -1) {
        diagnostics.push({
          severity: 'warning',
          message: `actor "${node.name.text}" redeclared (previous one ignored)`,
          range: node.name.range
        });
        actors.splice(dup, 1);
      }
      actors.push({
        name: node.name.text,
        file: node.file.text,
        runtime: runtime as Runtime,
        active: false
      });
    } else if (node.type === 'scene') {
      const map: Record<string, boolean> = {};
      for (const a of node.actors) map[a.text] = true;
      const dup = scenes.findIndex((s) => s.name === node.name.text);
      if (dup !== -1) {
        diagnostics.push({
          severity: 'warning',
          message: `scene "${node.name.text}" redeclared (previous one ignored)`,
          range: node.name.range
        });
        scenes.splice(dup, 1);
      }
      scenes.push({ name: node.name.text, actors: map, active: false });
    } else if (node.type === 'map') {
      const source = liftSource(node.source);
      const target = liftTarget(node.target);
      mappings.push({ id: `m${++mappingSeq}`, source, target });
    }
  }

  // Semantic validation phase
  const actorNames = new Set(actors.map((a) => a.name));
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const node = ast.nodes.find((n) => n.type === 'scene' && n.name.text === s.name);
    for (const a of Object.keys(s.actors)) {
      if (!actorNames.has(a)) {
        const refRange = nodeActorRange(node, a);
        diagnostics.push({
          severity: 'error',
          message: `scene "${s.name}": actor "${a}" not declared`,
          range: refRange
        });
      }
    }
    // Fill missing actors with false so toggles work
    const complete: Record<string, boolean> = {};
    for (const a of actorNames) complete[a] = s.actors[a] === true;
    scenes[i] = { ...s, actors: complete };
  }

  for (let i = 0; i < mappings.length; i++) {
    const m = mappings[i];
    const node = mapNodeOf(ast, i);
    const tgt = m.target;
    if (tgt.kind === 'scene') {
      if (!scenes.find((s) => s.name === tgt.ref)) {
        diagnostics.push({
          severity: 'error',
          message: `map target scene "${tgt.ref}" not declared`,
          range: targetRangeOf(node)
        });
      }
    } else if (tgt.kind === 'actor.toggle' || tgt.kind === 'actor.param') {
      if (!actorNames.has(tgt.ref)) {
        diagnostics.push({
          severity: 'error',
          message: `map target actor "${tgt.ref}" not declared`,
          range: targetRangeOf(node)
        });
      }
    }
  }

  return { actors, scenes, mappings, diagnostics };
}

function liftSource(node: import('./ast').MapSourceNode): MapSource {
  const kind = node.kind.text as 'cv' | 'trig' | 'gate';
  const index = parseInt(node.index.text, 10);
  const ch = node.channel ? parseInt(node.channel.text, 10) : undefined;
  return { kind, index, ch };
}

function liftTarget(node: import('./ast').MapTargetNode): MapTarget {
  switch (node.type) {
    case 'tempo':
      return { kind: 'tempo' };
    case 'scene':
      return { kind: 'scene', ref: node.ref.text };
    case 'actor.toggle':
      return { kind: 'actor.toggle', ref: node.actor.text };
    case 'actor.param':
      return { kind: 'actor.param', ref: node.actor.text, param: node.param.text };
  }
}

function nodeActorRange(node: import('./ast').Node | undefined, name: string): Range {
  if (node && node.type === 'scene') {
    const tok = node.actors.find((a) => a.text === name);
    if (tok) return tok.range;
    return node.range;
  }
  return defaultRange();
}

function mapNodeOf(ast: SessionAST, index: number): import('./ast').Node | undefined {
  const maps = ast.nodes.filter((n) => n.type === 'map');
  return maps[index];
}

function targetRangeOf(node: import('./ast').Node | undefined): Range {
  if (node && node.type === 'map') return node.target.range;
  return defaultRange();
}

function defaultRange(): Range {
  return {
    start: { line: 0, col: 0, offset: 0 },
    end: { line: 0, col: 0, offset: 0 }
  };
}
