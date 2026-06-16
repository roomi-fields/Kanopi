import { compileBPS } from 'bpscript/src/transpiler/index.js';
import { core } from '../lib/core';
import { runtimeFromExt } from '../lib/workspace/types';
import type { Runtime } from '../lib/core';
import { production } from './production.svelte';

// A5 — named selectable scenes + STEP, driven off the active `.bps` file.
//
// Two things are surfaced from compiling the active `.bps` (cheap: compileBPS
// only, no derive):
//   - SCENES: `@flag scene: calm:1, full:2` → selectable buttons. Selecting a
//     scene re-evaluates the file with `flags: { scene: <int> }`, which makes a
//     different flag-guarded rule derive (different armed actors).
//   - SECTIONS: the head rule's RHS sequence (`S -> calm full`) → passive visual
//     landmarks in the Structure panel. STEP itself advances BEAT by beat over
//     the produced timeline (see `stepActive` + bp3.ts `sliceBeat`), not section
//     by section.
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
  // The scene that plays when none is explicitly selected (lowest int). A `.bps`
  // whose rules are all scene-guarded derives this one by default (see bp3.ts
  // `defaultSceneName`), so the bar shows it lit until the user picks another.
  defaultScene: string | null;
}

const EMPTY: BpsSceneModel = {
  fileName: null,
  runtime: 'bpscript',
  code: '',
  scenes: [],
  sections: [],
  defaultScene: null
};

// The first named scene (lowest int) — the one the adapter derives by default.
function defaultSceneOf(scenes: BpsScene[]): string | null {
  if (scenes.length === 0) return null;
  return scenes.reduce((lo, s) => (s.value < lo.value ? s : lo)).name;
}

// The `@scene <name> "<file>"` multi-file table of a `.bps` (compileBPS emits
// `sceneTable = { calm: { file: 'calm.bps' }, … }`). Drives the right-panel
// Scenes cards; activating a card loads + plays the referenced child `.bps`.
// Empty for a `.bps` that declares no file-scenes (or a non-`.bps` file).
export function sceneTableFromFile(
  fileName: string | undefined,
  contents: string | undefined
): Record<string, { file: string }> {
  if (!fileName || contents === undefined) return {};
  if (runtimeFromExt(fileName) !== 'bpscript') return {};
  try {
    const c = compileBPS(contents) as {
      errors: unknown[];
      sceneTable?: Record<string, { file: string }>;
    };
    if (c.errors.length > 0) return {};
    return c.sceneTable ?? {};
  } catch {
    return {};
  }
}

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
      sections: headSections(c.grammar),
      defaultScene: defaultSceneOf(scenes)
    };
  } catch {
    return EMPTY;
  }
}

class BpsScenesStore {
  // Which named scene is currently armed. (The STEP cursor lives on the
  // production store — it's a property of the current production, reset on every
  // fresh eval.)
  activeScene = $state<string | null>(null);

  // Select a named scene: re-evaluate the active `.bps` with its flag set.
  async select(model: BpsSceneModel, scene: BpsScene) {
    if (!model.fileName) return;
    this.activeScene = scene.name;
    await core.evaluateBlock(model.runtime, model.code, model.fileName, 0, undefined, {
      scene: scene.value
    });
  }

  // STEP to the next BEAT of the PRODUCED timeline (wraps at the end). Driven off
  // the `production` store, NOT the `.bps` head rule, so it works for ANY runtime
  // whose last eval produced a timeline — BP3 `.gr`, backtick `.bps`, plain `.bps`
  // alike. The STEP unit is one clock beat (`beatDurSec = 60/bpm`); the number of
  // beats is `ceil(durationSec / beatDurSec)`, and the adapter slices the derived
  // timeline into one-beat windows, playing beat `index` once. Re-evaluates the
  // ACTIVE file (the one the production was derived from).
  async stepActive(file: { runtime: Runtime; name: string; contents: string }) {
    const cur = production.current;
    const beatDurSec = cur?.beatDurSec ?? 0;
    const count = cur && beatDurSec > 0 ? Math.max(0, Math.ceil(cur.durationSec / beatDurSec)) : 0;
    if (count < 2) return;
    // The re-eval republishes the FULL production and resets `stepIndex` to -1,
    // so compute the next beat from the CURRENT cursor first, then set it after
    // the await (the cursor then lands on the beat that's actually playing).
    const next = (production.stepIndex + 1) % count;
    await core.evaluateBlock(file.runtime, file.contents, file.name, 0, undefined, undefined, {
      index: next,
      count
    });
    production.stepIndex = next;
  }
}

export const bpsScenes = new BpsScenesStore();
