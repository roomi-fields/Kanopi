import { compileBPS } from 'bpscript/src/transpiler/index.js';
import { core } from '../lib/core';
import { runtimeFromExt } from '../lib/workspace/types';
import type { Runtime } from '../lib/core';

// A5 — named selectable scenes + STEP, driven off the active `.bps` file.
//
// Two things are surfaced from compiling the active `.bps` (cheap: compileBPS
// only, no derive):
//   - SCENES: `@flag scene: calm:1, full:2` → selectable buttons. Selecting a
//     scene re-evaluates the file with `flags: { scene: <int> }`, which makes a
//     different flag-guarded rule derive (different armed actors).
//   - SECTIONS: the head rule's RHS sequence (`S -> calm full`) → STEP advances
//     section by section. The adapter slices the derived timeline into equal
//     windows (see bp3.ts) and plays the chosen one once.
//
// The compile itself is run reactively in BpsScenesBar.svelte (a real component
// reactive context); this store holds the resulting view model + the selection
// state and owns the re-evaluation actions.

export interface BpsScene {
  name: string;
  value: number;
}

export interface BpsSceneModel {
  // The active `.bps` file the scenes/sections were derived from (null = none).
  fileName: string | null;
  runtime: Runtime;
  code: string;
  scenes: BpsScene[];
  sections: string[];
}

const EMPTY: BpsSceneModel = {
  fileName: null,
  runtime: 'bpscript',
  code: '',
  scenes: [],
  sections: []
};

// Parse the head rule's RHS into its top-level sequence elements. The compiled
// grammar's first `S --> …` line lists them as `|name|` terminals (or `{a,b}`
// for a simultaneous group, which counts as one section). Used by STEP.
export function headSections(grammar: string): string[] {
  const line = grammar.split('\n').find((l) => /\bS\s*-->/.test(l));
  if (!line) return [];
  const rhs = line.slice(line.indexOf('-->') + 3).trim();
  const sections: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of rhs) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (buf.trim()) sections.push(buf.trim().replace(/[|{}]/g, ''));
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) sections.push(buf.trim().replace(/[|{}]/g, ''));
  return sections;
}

// Compile the active file content into the scenes/sections view model. Pure —
// the component calls this from a `$derived` so it re-runs on file/content
// change. Non-`.bps`, parse errors, or compile throws → an empty model.
export function modelFromFile(
  fileName: string | undefined,
  contents: string | undefined
): BpsSceneModel {
  if (!fileName || contents === undefined) return EMPTY;
  if (runtimeFromExt(fileName) !== 'bpscript') return EMPTY;
  try {
    const c = compileBPS(contents) as {
      errors: unknown[];
      grammar: string;
      flagStates?: Record<string, Record<string, number>>;
    };
    if (c.errors.length > 0) return EMPTY;
    const table = c.flagStates?.scene ?? {};
    const scenes = Object.entries(table).map(([name, value]) => ({ name, value }));
    return {
      fileName,
      runtime: 'bpscript',
      code: contents,
      scenes,
      sections: headSections(c.grammar)
    };
  } catch {
    return EMPTY;
  }
}

class BpsScenesStore {
  // Which named scene is currently armed, and which section STEP last played.
  activeScene = $state<string | null>(null);
  stepIndex = $state<number>(-1);

  // Select a named scene: re-evaluate the active `.bps` with its flag set.
  async select(model: BpsSceneModel, scene: BpsScene) {
    if (!model.fileName) return;
    this.activeScene = scene.name;
    this.stepIndex = -1;
    await core.evaluateBlock(model.runtime, model.code, model.fileName, 0, undefined, {
      scene: scene.value
    });
  }

  // STEP to the next head-rule section (wraps to the first at the end). Plays
  // that section once via the adapter's section window.
  async step(model: BpsSceneModel) {
    const count = model.sections.length;
    if (!model.fileName || count === 0) return;
    const next = (this.stepIndex + 1) % count;
    this.stepIndex = next;
    await core.evaluateBlock(model.runtime, model.code, model.fileName, 0, undefined, undefined, {
      index: next,
      count
    });
  }
}

export const bpsScenes = new BpsScenesStore();
