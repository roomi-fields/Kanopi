import { compileBPS } from 'bpscript/src/transpiler/index.js';
import { core } from '../lib/core';
import { runtimeFromExt } from '../lib/workspace/types';
import type { Runtime } from '../lib/core';
import { production } from './production.svelte';
// Sections read from the BPScript AST (`compileBPS().ast`), the single source of
// truth — replaces the former regex-on-grammar-text `headSections` for the `.bps`
// scenes bar. Standalone module (no adapter/core import) → no cycle.
import { headSectionsFromAst } from '../lib/runtimes/head-sections-ast';

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
      ast: { scenes?: { name: string; file: string }[] } | null;
    };
    if (c.errors.length > 0) return {};
    // Read the `@scene <name> "<file>"` table from the AST's `SceneDirective`
    // nodes (single source of truth), instead of compileBPS's `sceneTable`
    // sidecar. `{ [name]: { file } }` — the same shape the sidecar produced.
    const out: Record<string, { file: string }> = {};
    for (const s of c.ast?.scenes ?? []) out[s.name] = { file: s.file };
    return out;
  } catch {
    return {};
  }
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
      ast: {
        directives?: { type?: string; flag?: string; states?: { name: string; value: number }[] }[];
      } | null;
    };
    if (c.errors.length > 0) return EMPTY;
    // Named scenes from the AST's `FlagStatesDirective` nodes (`@flag scene:
    // calm:1, full:2`) — single source of truth, replacing compileBPS's
    // `flagStates` sidecar. We read the `scene` flag's states.
    const sceneStates =
      c.ast?.directives?.find((d) => d.type === 'FlagStatesDirective' && d.flag === 'scene')
        ?.states ?? [];
    const scenes = sceneStates.map((s) => ({ name: s.name, value: s.value }));
    return {
      fileName,
      runtime: 'bpscript',
      code: contents,
      scenes,
      // Head-rule sections from the AST (the Scenes-bar variant keeps every
      // top-level element, mirroring the former no-filter text reader).
      sections: headSectionsFromAst(c.ast),
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
