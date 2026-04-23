import type { Runtime } from '../core-mock';
import type { RuntimeAdapter } from './adapter';
import { strudelAdapter, tidalAdapter } from './strudel';
import { hydraAdapter } from './hydra';
import { p5Adapter } from './p5';
import { jsAdapter } from './webaudio';

const adapters = new Map<Runtime, RuntimeAdapter>([
  ['strudel', strudelAdapter],
  ['tidal', tidalAdapter],
  ['hydra', hydraAdapter],
  ['p5', p5Adapter],
  ['js', jsAdapter]
]);

/**
 * Runtimes Kanopi recognizes that don't (yet) have a live browser adapter:
 *  - `.scd` / `.py` → level 3 (osc-bridge → local sclang / python), Tauri v2.
 *  - `.kanopi` / `.bps` → session orchestration, handled by the session
 *    parser rather than a runtime adapter.
 *
 * Kept as a tiny fallback table so `runtimeFromExt` still routes files to
 * the right tab header / icon / placeholder, while the adapter list stays
 * the single source of truth for languages that actually execute.
 */
const PLACEHOLDER_EXTENSIONS: Record<string, Runtime> = {
  '.scd': 'sc',
  '.py': 'python',
  '.kanopi': 'kanopi',
  '.bps': 'kanopi'
};

export function getAdapter(runtime: Runtime): RuntimeAdapter | undefined {
  return adapters.get(runtime);
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
  return extToRuntime.get(ext.toLowerCase()) ?? 'kanopi';
}
