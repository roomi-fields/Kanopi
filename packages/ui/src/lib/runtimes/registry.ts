import type { Runtime } from '../core-mock';
import type { RuntimeAdapter } from './adapter';
// The 6 code voices (strudel/hydra/p5/mercury/csound/js) live in the
// `runtime-codevoices` package and are pulled by Kronos at the backtick token
// onset. The natives bp3/bpscript stay in Kanopi (BPx path).
import { codeVoiceAdapters } from 'runtime-codevoices';
import { bp3Adapter, bpscriptAdapter } from './bpx-adapter';

const adapters = new Map<Runtime, RuntimeAdapter>([
  ...codeVoiceAdapters.map((a): [Runtime, RuntimeAdapter] => [a.id, a]),
  ['bp3', bp3Adapter],
  ['bpscript', bpscriptAdapter]
]);

/**
 * Runtimes Kanopi recognizes that don't (yet) have a live browser adapter:
 *  - `.scd` / `.py` → level 3 (osc-bridge → local sclang / python), Tauri v2.
 *
 * Kept as a tiny fallback table so `runtimeFromExt` still routes files to
 * the right tab header / icon / placeholder, while the adapter list stays
 * the single source of truth for languages that actually execute.
 */
const PLACEHOLDER_EXTENSIONS: Record<string, Runtime> = {
  '.scd': 'sc',
  '.py': 'python'
};

export function getAdapter(runtime: Runtime): RuntimeAdapter | undefined {
  return adapters.get(runtime);
}

// Code-voice runtimes (strudel/hydra/p5/mercury/csound/js). Their MASTER TEMPO
// arrives via Kronos's bus (`onTempo` → runtime-codevoices `reslaveTempo`, M2 [261]),
// NOT a parallel host tempo fan-out — `clock.svelte.ts` skips them so the guest engine
// has a single tempo authority (Kronos). bp3/bpscript are NOT here: their `setBpm`
// retunes the Kronos handle in place (the host warp), which stays.
const codeVoiceRuntimeIds = new Set<Runtime>(codeVoiceAdapters.map((a) => a.id));
export function isCodeVoiceRuntime(runtime: Runtime): boolean {
  return codeVoiceRuntimeIds.has(runtime);
}

export function listRuntimes(): Runtime[] {
  return [...adapters.keys()];
}

/**
 * Every file extension recognized by Kanopi (leading dot, e.g. `.hydra`).
 * Derived from each adapter's `extensions` field plus the placeholder list
 * above — adding a new language only means declaring `extensions` on its
 * adapter and dropping the adapter into the registry.
 */
export function knownExtensions(): string[] {
  const live = [...adapters.values()].flatMap((a) => [...a.extensions]);
  return [...live, ...Object.keys(PLACEHOLDER_EXTENSIONS)];
}

/** Lookup table: extension → Runtime, built once at module load. */
const extToRuntime: Map<string, Runtime> = (() => {
  const m = new Map<string, Runtime>();
  for (const [runtime, a] of adapters) {
    for (const ext of a.extensions) m.set(ext, runtime);
  }
  for (const [ext, runtime] of Object.entries(PLACEHOLDER_EXTENSIONS)) {
    m.set(ext, runtime);
  }
  return m;
})();

export function runtimeFromExtension(ext: string): Runtime {
  return extToRuntime.get(ext.toLowerCase()) ?? 'bpscript';
}
