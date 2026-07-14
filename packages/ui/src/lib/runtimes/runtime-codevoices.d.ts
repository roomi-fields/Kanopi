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
 * runtime-codevoices OWNS the code voices (strudel/hydra/p5/mercury/csound/js)
 * as `RuntimeAdapter`s pulled by Kronos at the backtick token onset. The natives
 * bp3/bpscript stay in Kanopi (BPx path). The package's `RuntimeAdapter.id` is a
 * strict subset of Kanopi's `Runtime`, so its adapters stay assignable to the
 * Kanopi registry — declared here directly as Kanopi's `RuntimeAdapter`.
 */
import type { Extension } from '@codemirror/state';
import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';

// --- Le runtime UNIFORME des voix de code (frontière hôte↔runtimes de sortie, Phase 2) ---
export interface CodeVoicesRuntimeOptions {
  /** Table des backticks de la scène (dérivée BPx, territoire hôte). Vide pour une voix autonome. */
  backticks: Record<string, { interp: string; code: string }>;
  fileId: string;
  log: LogPush;
  /** Orchestration `.bps` (slots par acteur + mute). Absente ⇒ backtick simple / voix autonome. */
  orchestration?: {
    btToActor: Record<string, string>;
    mutedActors: Set<string>;
    slotForActor(actor: string): string;
  };
}

/** L'adaptateur uniforme : `send` (sink backtick tiré à l'onset) / `bindClock` (abonnement au bus
 *  de cycle de vie de Kronos) / `evaluate` (capture d'une voix autonome — `interp` en 3e arg) /
 *  `setActorMuted` / `dispose`. */
export interface CodeVoicesRuntime {
  send(ev: unknown): void;
  bindClock(clock: unknown): void;
  evaluate(code: string, src: EvalSource, interp?: string): Promise<void>;
  setActorMuted(actor: string, muted: boolean): void;
  /** MIXAGE (hote-runtimes-sortie.md:51, amendement 2026-07-09, arbitrage [73]) — même contrat
   *  gain 0..1 linéaire que runtime-audio/midi/osc, diffusé en interne à TOUS les adaptateurs de
   *  voix ; seuls strudel/csound l'implémentent réellement sur leur adaptateur individuel. */
  setActorGain(actor: string, gain: number): void;
  setMasterGain(gain: number): void;
  setMasterMuted(muted: boolean): void;
  /** INTROSPECTION LECTURE SEULE, NON-AUTORITAIRE (runtime-codevoices d8c3162) — coup d'œil sur
   *  l'horloge PROPRE d'un moteur de voix-code (Hydra : `synth.time`), pour la preuve/débogage
   *  hôte (banc e2e seek fin, `k.inspect.hydraClock()`). `undefined` : moteur absent ou sans
   *  horloge de scène observable (seul Hydra l'expose). Jamais consultée par une décision de temps
   *  (Kronos reste seul gardien). */
  peekClock(runtime: string): number | undefined;
  dispose(): void;
}

/** Fabrique de la sortie voix-de-code (parallèle à createAudioRuntime/createMidiRuntime/createOscRuntime). */
export declare function createCodeVoicesRuntime(opts: CodeVoicesRuntimeOptions): CodeVoicesRuntime;

// --- The 6 code-voice adapters ---
export declare const strudelAdapter: RuntimeAdapter;
export declare const hydraAdapter: RuntimeAdapter;
export declare const p5Adapter: RuntimeAdapter;
export declare const mercuryAdapter: RuntimeAdapter;
export declare const csoundAdapter: RuntimeAdapter;
export declare const jsAdapter: RuntimeAdapter;

/** The 6 voices, ready to spread into the Kanopi registry. */
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

// --- PRÉCHAUFFAGE au chargement (design ratifié archi [589]) ---
// Entrée de PAQUET idempotente : résout les interps EN INTERNE + warme leurs moteurs. Interface
// FIGÉE. PAS ENCORE livrée par le pair → déclarée POSSIBLEMENT ABSENTE (`| undefined`) pour que
// l'appel hôte soit optional-chained (`preload?.(…)`) = no-op tant qu'elle n'est pas exportée
// (au runtime elle est réellement `undefined`). Additif : quand le pair l'exporte comme fonction,
// le type reste satisfait et l'appel hôte s'active sans changement.
export declare const preload: ((interps: string[]) => Promise<void>) | undefined;
