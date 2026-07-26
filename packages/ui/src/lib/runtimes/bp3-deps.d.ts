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
// SINGLE-SOURCE : l'arbre de scene vient du VRAI type publie par BPx, jamais d'une copie de
// surface. `bpx/dist/index.js` n'est pas mappe par tsconfig.paths (seul le specificateur NU
// `bpx` pointe vers ce fichier), donc cet import atteint la surface amont sans boucler.
// AVANT [951] ce fichier typait l'arbre `unknown` des DEUX cotes : Kanopi ne voyait donc
// JAMAIS `SceneAST`, et l'erreur qui en resultait a ete imputee a tort a BPx — dont le type
// etait publie et correct. Un calque qui efface un type amont est pire qu'un calque absent.
import type { SceneAST } from 'bpx/dist/index.js';
export type { SceneAST };
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

/** Session-level options (the upstream `SessionOptions`; subset the host passes).
 *  `createBPx`'s `flags` maps to `initialFlags` here. */
export interface SessionOptions {
  seed?: number;
  tempo?: number;
  initialFlags?: Record<string, number>;
  settings?: SeEngineSettings;
  /** [745] Interrupteur de la trace de dérivation, porté à la CONSTRUCTION de la
   *  Session (pas par derive()). true ⇒ BPx émet, résultat en compagnon d'arbre
   *  (DeriveResult.trace) résolu par Kairos. Absent/false = éteint. Type publié BPx
   *  (dist/session.d.ts:82, commit 143a2cf). */
  trace?: boolean;
}
/** Projection context the EXTERNAL flattener (Kairos `charger`) consumes — the
 *  symbol resolvers + emission options bundled by `Session.buildProjectionContext`
 *  (KAI-8). Opaque to Kanopi: built by BPx, handed straight to Kairos. */
export interface ProjectionContext {
  resolveName: (symbolId: number) => string;
  resolveKind?: (symbolId: number) => string;
  transformMs?: (ms: number) => number;
  kpressOffset?: number;
  order?: 'chronological' | 'voice-major';
  resolveRuntimeState?: (nodeId: number) => Record<string, number> | null;
}
/** [97] Charge par position de la chaîne finale (`DeriveResult.chainMarkers` — BPx
 *  session.ts:294/380). Même forme `{index, payload}` que `TraceControlMarkerEntry`
 *  et Kairos `EntreeMarqueurControle`. */
export interface ChainPayloadEntry {
  readonly index: number;
  readonly payload: unknown;
}
/** Options de `renderChain` (BPx `trace/surface.ts:313`). */
export interface RenderChainOptions {
  readonly payloads?: readonly ChainPayloadEntry[];
  readonly renderControl?: (payload: unknown) => string;
}
/** [97] Assemble une chaîne d'ids en texte BP3 (BPx `trace/surface.ts:338`, réexporté
 *  `index.ts:149`) — LA graphie, injectée en 4e argument à Kairos `rendreChaineFinale`
 *  (jamais réécrite côté hôte). */
export function renderChain(
  ids: readonly number[],
  resolveName: (id: number) => string,
  options?: RenderChainOptions
): string;
/** The upstream `Session` (carries `buildProjectionContext`, unlike `BPxInstance`).
 *  `derive()` returns the tree only; the flat tokens come from `emit('timed-tokens')`.
 *  `output:'complete'` has migrated to Kairos and now THROWS — the host uses the
 *  default 'sounding' path. */
export interface Session {
  readonly grammar: { symbols?: { getName?(id: number): string }; [k: string]: unknown };
  derive(options?: DeriveOptions): {
    tree: DerivationTree;
    /** [97] `DeriveResult.ids` (BPx session.ts:286) — TOUJOURS présent, la vue Texte est
     *  toujours active (contrairement à `trace`). Entrée `ids` de `renderChain`. */
    ids: number[];
    /** [97] `DeriveResult.chainMarkers` (BPx session.ts:380) — TOUJOURS construit. Entrée
     *  `payloads` de `renderChain` via `rendreChaineFinale`. */
    chainMarkers: readonly ChainPayloadEntry[];
    [k: string]: unknown;
  };
  emit<T>(format: string, options?: unknown): T;
  buildProjectionContext(order?: 'chronological' | 'voice-major'): ProjectionContext;
}
export function createSession(ast: SceneAST, options?: SessionOptions): Session;

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
  /** Note convention from the `-se` (ENGLISH=0, FRENCH=1, INDIAN=2). Drives the
   *  BP3-faithful alphabet KEY emitted on the actor (`bp3_english`/`bp3_fr`/`bp3_indian`)
   *  so Kairos resolves FR/sargam pitches — finding [79]. Read via
   *  `parseSeFile(...).protocol.noteConvention`. */
  noteConvention?: number | null;
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
export function parseSeFile(text: string): {
  engine: SeEngineSettings;
  /** PROTOCOLE du harnais BP3 (convention de notes, seed, c4key…). `noteConvention`
   *  (0=anglaise, 1=française, 2=indienne) pilote la clé d'alphabet BP3-fidèle — finding [79]. */
  protocol?: { noteConvention?: number | null; [k: string]: unknown };
  [k: string]: unknown;
};
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
// Clean BPx-AST entry point (BPscript 94c6f53): SOURCE UNIQUE = the tree. Returns
// ONLY `{ ast, errors, warnings }` — no parallel sidecar tables. The backtick
// nodes carry their resolved `interp` (tag, or the actor's eval). Everything Kanopi
// needs is read off the AST. This is the path the `.bps` adapter consumes.
export interface CompileToBPxASTResult {
  /** `null` quand `errors` est non vide — le narrowing revient a l'appelant. */
  ast: SceneAST | null;
  errors: CompileBPSError[];
  warnings: unknown[];
}
export function compileToBPxAST(
  source: string,
  environnement?: { tempo?: number }
): CompileToBPxASTResult;

// describeVocabulary (BPscript f79664d): the LIVING authority of the language's
// vocabulary — the same aggregation the compile guard uses — that the Kanopi
// editor consumes for autocompletion + hover tooltips (replaces the static
// `public/help/reference.json` catalog). Grows automatically with user libraries.
/** One control point / CV subject (`cc`, `wave`, `cutoff`, `vel`, …). */
export interface VocabControl {
  name: string;
  args?: string[];
  range?: [number, number];
  /** Enum options: a comma string ("sine, triangle, …") OR an array. */
  values?: string | string[];
  default?: string | number;
  description?: string;
  transportGroup?: string;
}
/** An overridable scene/occurrence value (e.g. `diapason`). */
export interface VocabValue {
  name: string;
  range?: [number, number];
  unit?: string;
  values?: string | string[];
  description?: string;
}
export interface Vocabulary {
  /** Reserved directive words (`mode`, `tempo`, `alphabet`, `tuning`, …). */
  keywords: string[];
  controls: VocabControl[];
  values: VocabValue[];
  /** Digital functions (`transpose`, `keyxpand`, `rotate`). */
  functions: string[];
  /** Catalog entries per axis (`alphabet`, `tuning`, `octaves`). */
  components: Record<string, string[]>;
  addressKeys: string[];
  modulationInputs: string[];
  /** Allowed values per directive (`mode` → ord/random/…), for `@dir:` completion. */
  directiveValues: Record<
    string,
    { description?: string; values: Array<{ name: string; description?: string }> }
  >;
  /** Fixed syntax words/operators (`gate`/`trigger`/`cv`/`lambda`, `->`, `<-`, `<>`) for hover + keyword completion. */
  syntaxWords: Record<
    string,
    { kind: 'keyword' | 'operator'; description?: string; syntax?: string }
  >;
}
export function describeVocabulary(directives?: Array<{ name: string }>): Vocabulary;
