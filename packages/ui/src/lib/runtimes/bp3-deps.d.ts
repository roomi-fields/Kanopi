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
 *
 * ⛔ `bp3-frontend` N'EST PLUS ICI, et il ne doit pas y revenir (2026-07-28). Sa surface était
 * RECOPIÉE À LA MAIN dans ce fichier pour empêcher le contrôleur de descendre dans ses sources
 * (leurs imports portent l'extension `.ts`). Cette copie MENTAIT : elle déclarait le prédicat de
 * note du frontal à UN
 * argument là où l'amont en attend DEUX — le second étant la convention de notes, qui DÉCIDE si un
 * mot est une note. Rien ne rougissait, et l'amont a chiffré l'exposition : 33 grammaires sur 113
 * changent de réponse selon la convention lue. Une surface écrite à la main chez le consommateur ne
 * ment pas « un peu » : elle ment ou elle est juste, et aucune rigueur individuelle ne l'attrape.
 * On lit donc les VRAIS types à la source (`allowImportingTsExtensions`, plus de mappage pour ce
 * paquet). Le jour où l'on est tenté de recopier une signature ici, c'est ce paragraphe qu'il faut
 * relire.
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
 *  `index.ts:149`) — LA graphie, jamais réécrite côté hôte.
 *  [130] TOUJOURS VIVANTE, et c'est la distinction qui compte : l'hôte la relaie à Kairos comme
 *  COMPAGNON DE TRACE (`charger(..., { entrees, rendreChaine })`), et la vue Trace s'en sert à
 *  chaque pas. C'est la CHAÎNE FINALE (`rendreChaineFinale` + son convoyage jusqu'à l'écran) qui a
 *  été retirée avec la seconde ligne de la vue Texte, pas cette fonction d'assemblage. */
export function renderChain(
  ids: readonly number[],
  resolveName: (id: number) => string,
  options?: RenderChainOptions
): string;
// SINGLE-SOURCE, ET C'EST UNE CORRECTION [994] : `Session` était RECOPIÉ ici à la main, avec les
// seuls membres que l'hôte connaissait au moment de la copie. Une copie de surface ne se met pas à
// jour toute seule — quand BPx a livré le raccord d'entrée (`brancherPorteAttente`,
// `evenementEntree`), le type de l'hôte l'ignorait, et le type-checker a refusé un appel POURTANT
// publié en amont : le calque effaçait le contrat, exactement le défaut déjà corrigé sur `SceneAST`
// juste au-dessus. Interdiction de copie de surface (`CLAUDE.md` + décision
// `hub/decisions/2026-07-19-copies-de-surface-cross-repo-single-source-ou-declaree-outillee.md`) :
// on importe le VRAI type. `bpx/dist/index.js` n'est pas mappé par `tsconfig.paths` (seul le
// spécificateur NU `bpx` l'est), donc cet import atteint l'amont sans boucler.
export type { Session } from 'bpx/dist/index.js';
export { createSession } from 'bpx/dist/index.js';

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
  /** Allowed values per directive (`mode` → ord/random/…), for `@dir:` completion. */
  directiveValues: Record<
    string,
    { description?: string; values: Array<{ name: string; description?: string }> }
  >;
  /** Fixed syntax words and operators, for hover + keyword completion. The set is the
   *  authority's and it varies — `lambda` left it on 2026-08-24 — so it is not enumerated
   *  here: an enumeration in a comment goes stale without ever turning red. */
  syntaxWords: Record<
    string,
    { kind: 'keyword' | 'operator'; description?: string; syntax?: string }
  >;
}
export function describeVocabulary(directives?: Array<{ name: string }>): Vocabulary;
