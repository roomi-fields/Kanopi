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
/** `derive()` restitution mode. `'complete'` restores control markers EN ORDRE
 *  as tree nodes / zero-duration tokens; `'sounding'` (default) omits them. */
export interface DeriveOptions {
  output?: 'sounding' | 'complete';
}
/** The derivation tree's metadata block (subset). `tempo` is the EFFECTIVE tempo
 *  the derivation ran at — the SINGLE SOURCE of truth the host projects onto its
 *  STEP grid and the central clock (matches `DerivationTree.metadata` in bpx's
 *  `dist/types/node.d.ts`, which the hand-maintained `dist/index.d.ts` exposes). */
export interface DerivationTreeMeta {
  tempo: number;
  totalDurationBeats: number;
  generation: number;
  seed: number;
  [k: string]: unknown;
}
/** The derived tree. `root`/node shape stays opaque (cast to `ProductionTree` at
 *  the consumers); only `metadata` is surfaced, the one host-projected facet. */
export interface DerivationTree {
  /** Tree root — opaque here; consumers cast the tree to `ProductionTree`. */
  root?: unknown;
  metadata: DerivationTreeMeta;
  [k: string]: unknown;
}
export interface BPxInstance {
  loadGrammar(ast: unknown): void;
  derive(options?: DeriveOptions): { tree: DerivationTree; tokens: TimedToken[] };
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
/** True when a symbol is a pitch name (English / solfège / sargam) — sounds by default. */
export function isNoteName(name: string): boolean;
/** Alphabet symbol names declared in a `-al.*` file. */
export function parseAlFile(text: string): string[];
/** The sound file a `-al.*` alphabet points to (`-gr → -al → -so/-mi/-cs` chain). */
export function alphabetSoundRef(text: string): { prefix: string; name: string } | null;

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

// Clean BPx-AST entry point (BPscript 94c6f53): SOURCE UNIQUE = the tree. Returns
// ONLY `{ ast, errors, warnings }` — no parallel sidecar tables. The backtick
// nodes carry their resolved `interp` (tag, or the actor's eval). Everything Kanopi
// needs is read off the AST. This is the path the `.bps` adapter consumes.
export interface CompileToBPxASTResult {
  ast: unknown | null;
  errors: CompileBPSError[];
  warnings: unknown[];
}
export function compileToBPxAST(
  source: string,
  environnement?: { tempo?: number }
): CompileToBPxASTResult;
