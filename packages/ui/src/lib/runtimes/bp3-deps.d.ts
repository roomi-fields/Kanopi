/**
 * Local type surface for the cross-tree Bol Processor dependencies, mapped via
 * `tsconfig.paths` so the type-checker uses THESE types instead of descending
 * into the sibling repos' source (per the integration mandate — no edits to
 * /home/romi/dev/bp/*).
 *
 * Upstream gaps this papers over:
 *  1. `bpx`'s hand-maintained `dist/index.d.ts` omits `createBPx`, although the
 *     bundled `dist/index.js` exports it (verified: dist/index.js ~line 20045).
 *     Reported to the BPx maintainer — the `.d.ts` should re-export it.
 *  2. `bp3-frontend` ships raw TypeScript whose relative imports carry explicit
 *     `.ts` extensions; following them under svelte-check trips
 *     `allowImportingTsExtensions`. The path mapping stops that descent.
 *
 * Both modules are re-exported below so `tsconfig.paths` resolves the bare
 * specifiers (`bpx`, `bp3-frontend`) to this single module file.
 */

// --- bpx -------------------------------------------------------------------
export interface TimedToken {
  token: string;
  start: number;
  end: number;
  duration: number;
  type: 'terminal' | 'rest' | 'control' | 'out_time';
  actor: string | null;
  [k: string]: unknown;
}
export interface SeEngineSettings {
  pclock?: number;
  qclock?: number;
  quantization?: number;
  quantize?: boolean;
  minPeriod?: number;
  natureOfTime?: 'smooth' | 'striated';
}
export interface BPxConfig {
  seed?: number;
  tempo?: number;
  flags?: Record<string, number>;
  /** BP3 `-se.*` engine timing (pclock/qclock/quantization). Drives native tempo. */
  settings?: SeEngineSettings;
}
export interface BPxInstance {
  loadGrammar(ast: unknown): void;
  derive(): { tree: unknown; tokens: TimedToken[] };
  getTokens(): TimedToken[];
  destroy(): void;
}
export function createBPx(config?: BPxConfig): BPxInstance;

// --- bp3-frontend ----------------------------------------------------------
export interface ParseError {
  code: string;
  message: string;
  line: number;
}
export interface ParseBP3Options {
  alphabetNames?: string[];
  /** Per-symbol sound routing: alphabet symbols that carry a sound prototype
   *  (loaded by the caller from the -so/-mi/-cs that fileRefs signals). */
  soundSymbols?: string[];
}
export interface FileRef {
  prefix: string;
  name: string;
  line: number;
}
/** One per SOUNDING alphabet symbol (decision routage-texte-son-par-symbole). */
export interface SoundAssignment {
  type: 'SoundAssignment';
  subject: string;
  target:
    | { kind: 'named-ref'; name: string }
    | { kind: 'inline-props'; props: Record<string, unknown> };
  [k: string]: unknown;
}
export interface SceneActor {
  name: string;
  assignments?: SoundAssignment[];
  [k: string]: unknown;
}
export interface ParseBP3Result {
  ast: { actors?: SceneActor[]; [k: string]: unknown } | null;
  fileRefs: FileRef[];
  errors: ParseError[];
  notes: string[];
}
export function parseBP3(source: string, options?: ParseBP3Options): ParseBP3Result;
/** Parse a `-se.*` settings file (JSON) → engine timing the BPx session consumes. */
export function parseSeFile(text: string): { engine: SeEngineSettings; [k: string]: unknown };
/** Extract the sounding-symbol names from a `-so`/`-mi`/`-cs` aux file. */
export function parseSoundObjects(text: string): string[];

// --- bpscript --------------------------------------------------------------
// BPScript transpiler facade. Ships raw ESM JS with no `.d.ts`; we only use the
// fields the `.bps` front-end needs (the BP3 grammar text + alphabet + errors).
export interface CompileBPSError {
  message: string;
  line?: number;
  col?: number;
}
export interface CompileBPSResult {
  grammar: string;
  alphabet: string[];
  ast: unknown | null;
  errors: CompileBPSError[];
  warnings: unknown[];
  [k: string]: unknown;
}
export function compileBPS(source: string): CompileBPSResult;
