/**
 * Local type surface for the cross-tree `runtime-codevoices` dependency, mapped via
 * `tsconfig.paths` — same pattern as `runtime-audio.d.ts` / `runtime-midi.d.ts`.
 *
 * The package ships RAW TypeScript and imports `@strudel/core` / `@strudel/draw`
 * under `@ts-expect-error` (those libs have no upstream `.d.ts`). Kanopi installs
 * the real libs, so pointing tsc at the package SOURCE would flip those directives
 * to "unused" errors. Hence: tsc reads THIS hand-written surface; Vite runs the
 * real source (see `vite.config.ts` resolve.alias). Only the exports Kanopi
 * consumes are declared.
 *
 * runtime-codevoices OWNS the code voices (strudel/tidal/hydra/p5/mercury/csound/js)
 * as `RuntimeAdapter`s pulled by Kronos at the backtick token onset. The natives
 * bp3/bpscript stay in Kanopi (BPx path). The package's `RuntimeAdapter.id` is a
 * strict subset of Kanopi's `Runtime`, so its adapters stay assignable to the
 * Kanopi registry — declared here directly as Kanopi's `RuntimeAdapter`.
 */
import type { Extension } from '@codemirror/state';
import type { RuntimeAdapter } from './adapter';

// --- The 7 code-voice adapters ---
export declare const strudelAdapter: RuntimeAdapter;
export declare const tidalAdapter: RuntimeAdapter;
export declare const hydraAdapter: RuntimeAdapter;
export declare const p5Adapter: RuntimeAdapter;
export declare const mercuryAdapter: RuntimeAdapter;
export declare const csoundAdapter: RuntimeAdapter;
export declare const jsAdapter: RuntimeAdapter;

/** The 7 voices, ready to spread into the Kanopi registry. */
export declare const codeVoiceAdapters: readonly RuntimeAdapter[];

// --- DOM attaches (canvas / container handed by the Svelte visual components) ---
export declare function attachHydraCanvas(el: HTMLCanvasElement): void;
export declare function attachP5Container(el: HTMLElement): void;

// --- Strudel CodeMirror bridge (inline widgets + togglable extensions) ---
export declare const widgetPlugin: Extension[];
/** Togglable Strudel CM6 features (mangled names in the dist bundle). */
export declare const extensions: Record<string, ((on: boolean) => Extension) | undefined>;
export declare const highlightExtension: Extension;

// --- Strudel status / error surface (status pill + block error tracking) ---
export type StrudelStatus = 'idle' | 'loading' | 'ready' | 'error';
export type StrudelErrorListener = (err: unknown) => void;
export declare function strudelStatus(): StrudelStatus;
export declare function onStrudelStatus(cb: (s: StrudelStatus) => void): () => void;
export declare function onStrudelError(cb: StrudelErrorListener): () => void;
export declare function onSlotErrorChange(cb: () => void): () => void;
export declare function getSlotErrors(): ReadonlyMap<string, Error>;

// --- Strudel editor view registration (highlight target) ---
export declare function registerStrudelEditorView(fileId: string, view: unknown): void;
export declare function unregisterStrudelEditorView(fileId: string): void;

// --- Sample bank loading (driven by bpx-adapter from `@sound` banks) ---
export declare function loadSampleBank(source: string): Promise<void>;
