import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';
import type { Runtime } from '../core-mock';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';
import {
  parseBP3,
  parseSeFile,
  parseSoundObjects,
  parseAlFile,
  alphabetSoundRef,
  isNoteName
} from 'bp3-frontend';
import type { FileRef, SeEngineSettings, SceneActor } from 'bp3-frontend';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
// bpscript's musical catalogs, imported AS-IS (same path as
// lib/library/resources.ts). A `.bps` that declares `@alphabet.X` (+ optional
// `@tuning:Y`) resolves its pitches through these — bohlen-pierce, gamelan, etc.
import alphabetsJson from 'bpscript/lib/alphabets.json';
import tuningsJson from 'bpscript/lib/tunings.json';
import temperamentsJson from 'bpscript/lib/temperaments.json';
import octavesJson from 'bpscript/lib/octaves.json';
import scalesJson from 'bpscript/lib/scales.json';
// CV modulation library (`mod.adsr/lfo/ramp`): the param signatures AND the curve
// shape live here (declarative segments), consumed AS-IS — Kanopi's transport
// renders the curve generically, no built-in modulator. See CV.md.
import modLibJson from 'bpscript/lib/mod.json';
import { createSession, type Session, type TimedToken as BpxTimedToken } from 'bpx';
// KAN-orchestration P1 — Kairos is the SOURCE of the played timeline (projects the BPx
// tree into a Kronos Timeline, exposes a StructureSource the Transport PULLs). Consumed
// AS-IS: the host `charger`s it with the tree + BPx projection context, then hands it to
// `startKronosAudio`. Kairos is the SOLE projection source — no parallel host-side flattener.
import { Kairos } from '@kairos/core';
import { BUNDLED_SE, BUNDLED_SOUND, BUNDLED_AL } from './bp3-aux';
// Core runtime, reused AS-IS (no port): the dispatcher carries the per-actor
// transport/resolver structure Kronos reads (it never emits sound itself).
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';
// Audio output lives in runtime-audio: it provides the CV-curve factory `exprSource`
// (compiles a backtick curve → ModulationSource), injected into Kronos's composition
// so Kanopi NEVER compiles/renders CV. The AudioRuntime itself is built in kronos-audio.
import { exprSource } from 'runtime-audio';
// Per-actor MIDI transport for a voice routed `transport:midi`. Consumed AS-IS from
// the canonical runtime-MIDI package (conformité MIDI : zéro copie dans Kanopi/core —
// la copie core `dispatcher/transports/midi.js` est supprimée). runtime-MIDI OWNS the
// MIDI path; Kanopi only routes Kronos's per-actor events to it.
import { MidiTransport } from 'runtime-midi';
// Pitch resolution (token → Hz) AND the alphabet-aware "sounds" classification both live
// in KAIROS now: it OWNS the pitch module and GRAVES `content.pitch.hz` + `content.sounds`
// per note (KAI-10), from the catalogs the host supplies as `ctx.pitchLib`. Kanopi RESOLVES
// NOTHING and runs NO resolver — it only hands the `PitchLib` DATA down and READS the graven
// facets. The host imports ZERO of `@kronos/core/pitch` (logic AND type); only the `PitchLib`
// type survives, sourced from `@kairos/core` (the module's new owner), for the catalog constant.
import { type PitchLib } from '@kairos/core';
// Tree-derived dispatch events (M5+ multi-actor refacto): flatten BPx's
// `derive({ output: 'complete' }).tree` to ordered events that each carry their
// OWN actor/params payload, so a terminal shared by two actors routes distinctly.
// Kronos owns CV COMPOSITION (frontier R2 / migration #8): `buildModulators` fuses the
// scene's `cv … : mod.x(…)` declarations with the `mod` library into the modulator registry.
// The host builds it once and hands it to Kairos (`charger`'s `modulation:{registry,…}`);
// Kairos's projection composes the bindings at flatten (KRO-24). Consumed AS-IS.
import { buildModulators, type ModLib, type ExprSource } from '@kronos/core';
// Kronos drives the REAL audio (the only engine; legacy removed). The Kronos
// scheduler produces the timed events; a thin adapter bridges each to the existing
// WebAudio synth. The old dispatcher is NEVER started for sound — it survives only
// as the inert structure of transports/resolvers that Kronos reads.
import { startKronosAudio, type KronosAudioHandle, type KronosAudioOptions } from './kronos-audio';
import { beatsPerBarFromMeter, DEFAULT_BEATS_PER_BAR, type MeterLike } from './meter';
// EX4 phase 2: surface the ACTIVE Kronos cursor to the UI so the timeline draws
// the playhead off the SAME clock as the audio (aligned + monotone-from-0),
// instead of the central rAF clock (which lags ~1 note and jumps back at launch).
import { kronosCursor } from '../../stores/kronos-cursor.svelte';
// The LIVE Kairos instance, surfaced to the production views (text/timeline). Paired
// to EVERY kronosCursor.set: set(kairos) where a handle is published, set(null) on
// teardown. swapped() on every re-random re-charger so the views re-render.
import { productionFeed } from '../../stores/production-feed.svelte';
// The FULL derived production, set ONCE per eval (the complete TimedToken[] BPx
// produced at derive time, BEFORE playback). This is the whole sequence, the
// source of truth the Text panel (read by order via the tree) and the Structure
// visualizer read.
import { production } from '../../stores/production.svelte';
// Session-global transport toggles (loop on/off, re-random per cycle on/off).
// Read FRESH at each `dispatcher.start(...)` so the user's transport setting at
// play time decides looping + whether the grammar re-derives each cycle.
import { transport } from '../../stores/transport.svelte';
import type {
  ProductionToken,
  ProductionSection,
  ProductionTree,
  ProductionTreeNode,
  ProductionTreeSpan,
  RawTimedToken
} from '../../stores/production.svelte';
// Device library (@devices): resolve a voice's `transport.<name>` to a typed
// device and gate voice↔device compatibility BEFORE routing (DEVICES_SPEC §3,
// §4 / ADAPTER_SPEC §1bis b). Kanopi owns resolution; bpscript carries the
// name opaque.
import { resolveDevice, isCompatible, type Device } from '../devices/registry';
import type { VoiceOutputType } from './adapter';
// `@library.<engine>` bank loading: resolve a declared bank id to its source and
// load it through the Strudel `samples()` path. Consumed AS-IS — the adapter
// only maps ids → loader.
import { findBank } from '../library/audio-banks';
import { loadSampleBank, codeVoiceAdapters } from 'runtime-codevoices';
// OSC output (OSC-5b): the osc-bridge WS→UDP relay endpoint. Kanopi's WebSocket
// transport (built in startKronosAudio) connects here; the relay forwards UDP.
import routingJson from '../../../../library/routing.json';
// Head-rule sections read from the BPScript AST (`compileBPS().ast`), the single
// source of truth — replacing the deprecated regex-on-grammar-text reader for the
// `.bps` path. The `.gr` path keeps the local text reader (it never compiles
// through BPScript, so it has no AST — see `headSectionNames` below).
import { headSectionNamesFromAst, sectionLeafCounts } from './head-sections-ast';

/**
 * BPx language adapters (PRIMARY vertical slice).
 *
 * Two languages reach audible WebAudio output through the SAME upstream BPx
 * engine and Kanopi's own dispatcher — only the front-end differs:
 *
 *   .gr  : source → parseBP3 ──────────────┐
 *   .bps : source → compileToBPxAST ────────┤  (SceneAST direct, voie AST propre)
 *                                           ▼
 *     → SceneAST → createBPx().loadGrammar → derive({output:'complete'})
 *     → tree (+ payload par nœud) → Kairos (projection) → Kronos timeline
 *     → routage PAR ACTEUR (payload.actor) → WebAudioTransport (+ MIDI sink)
 *
 * Glue only. Les frontaux (bp3-frontend, bpscript), le moteur (bpx) et le
 * dispatcher / transport / resolver (core) sont consommés tels quels. SOURCE
 * UNIQUE = l'arbre : `.bps` passe par `compileToBPxAST` (AST direct, plus
 * d'aller-retour par le texte BP3 ni de tables parallèles) ; `.gr` par parseBP3
 * (le `.gr` EST du texte natif). Toute la structure (acteurs, scènes, drapeaux,
 * bibliothèques, sections, backticks) est lue DEPUIS l'arbre.
 *
 * The slice scopes to ONE engine instance + ONE transport per file.
 */

// The 5 shared pitch catalogs (`bpscript/lib`), handed to Kairos as the read-only
// `ctx.pitchLib` so IT builds the resolver and graves `content.pitch.hz`/`content.sounds`.
// Kanopi embeds no resolution logic and runs no resolver — it only supplies this DATA.
// The catalogs carry doc-only `_comment` keys, so cast through `unknown`.
const PITCH_LIB: PitchLib = {
  alphabets: alphabetsJson as unknown as PitchLib['alphabets'],
  tunings: tuningsJson as unknown as PitchLib['tunings'],
  temperaments: temperamentsJson as unknown as PitchLib['temperaments'],
  scales: scalesJson as unknown as PitchLib['scales'],
  octaves: octavesJson as unknown as PitchLib['octaves']
};

// A front-end turns language source into a derivable BP3 SceneAST + parse
// errors. Both languages produce the SAME `ast` shape (BPScript compiles down
// to a BP3 grammar that the BP3 front-end then parses), so the rest of the
// chain is shared verbatim.
type ParseError = { line?: number; message: string };
type Frontend = (code: string) => {
  ast: unknown | null;
  errors: ParseError[];
  // BP3 `-se.*` engine timing resolved from the grammar's file reference, when
  // available — drives native tempo (e.g. acceleration 750 ms vs 1000 ms).
  settings?: SeEngineSettings;
  // Alphabet symbols that carry a sound (front-end's per-symbol routing). A
  // derived token sounds if it's a note OR its symbol is in this set; everything
  // else renders as text. Empty for all-note grammars (they sound by default).
  soundingSymbols?: string[];
  // Multi-voice orchestration (BPScript `@actor`): each actor owns an alphabet
  // and a transport (midi / webaudio). Present only for orchestrator `.bps`.
  orchestration?: Orchestration;
  // Standalone backtick voices (lot 4, ADAPTER_SPEC §1bis): each `BT<interp><id>`
  // token placed in the derivation maps to `{ interp, code }`. The adapter routes
  // the token → interpreter at the dispatcher-scheduled time.
  backticks?: BacktickTable;
  // A5 named scenes: the flag→{alias→int} table compileBPS emits for `@flag scene:
  // calm:1, full:2`. Present only when the `.bps` declares named flag states; the
  // UI surfaces `flagStates.scene` as selectable scene buttons. `.gr` has none.
  flagStates?: FlagStates;
  // Per-engine sample/sound banks a `.bps` declares (`@library.strudel "dirt-samples"`
  // → `{ strudel: ["dirt-samples"] }`). The adapter loads each engine's declared
  // banks before/at the backtick eval so the code voices find their samples. `.gr`
  // has none.
  libraries?: Libraries;
  // Head-rule top-level sections (`S --> calm full` → ['calm','full']), used to
  // annotate the FULL production with section boundaries (production store). Cheap
  // to compute from the compiled grammar text; empty for a `.gr` (parseBP3 already
  // expanded the structure, so the head sequence isn't recoverable here).
  sections?: string[];
  // Declared metronome (`@mm:70`), the tempo BPx derives durations at. When
  // present the adapter adopts it as the global tempo so the displayed BPM, the
  // derivation, and the STEP beat grid all agree. Absent for `.gr` and `.bps`
  // without `@mm` (the current tempo is kept).
  mm?: number;
};

// `@library.<engine> "<id>"` → { engine → [bank ids] } (from compileBPS).
export type Libraries = Record<string, string[]>;

// `BT<interp><id>` → foreign code + its interpreter tag (from compileBPS).
type BacktickTable = Record<string, { interp: string; code: string }>;

// `@flag <name>: <alias>:<int>, …` → { name → { alias → int } } (from compileBPS).
export type FlagStates = Record<string, Record<string, number>>;

// The first named scene (lowest int) of a `.bps`'s `scene` flag table, or null
// when the file declares no named scenes. A `.bps` whose rules are all guarded
// by the scene flag derives nothing until a scene is set, so this is the scene
// that plays by default (A5: "a scene is active by default"). Shared so the
// scene bar can surface the SAME default the adapter derives.
export function defaultSceneName(flagStates: FlagStates | undefined): string | null {
  const table = flagStates?.scene;
  if (!table) return null;
  const entries = Object.entries(table);
  if (entries.length === 0) return null;
  return entries.reduce((lo, e) => (e[1] < lo[1] ? e : lo))[0];
}

// Apply the default-scene fallback to a caller's flags. When the file declares
// named scenes and the caller passed no `scene`, inject the lowest-int one so a
// guarded rule derives instead of leaking the unexpanded start symbol. Anything
// the caller did set is preserved untouched.
function withDefaultScene(
  flags: Record<string, number> | undefined,
  flagStates: FlagStates | undefined
): Record<string, number> | undefined {
  const table = flagStates?.scene;
  if (!table || (flags && 'scene' in flags)) return flags;
  const name = defaultSceneName(flagStates);
  if (name === null) return flags;
  return { ...(flags ?? {}), scene: table[name] };
}

interface OrchestratedActor {
  name: string;
  transportKey: string; // device name referenced by `transport.<key>` (free identifier)
  /** Declared `@actor … alphabet:<key>` (`western` | `solfège` | catalog key, …), or
   *  `undefined` when the actor declares none. Passed THROUGH to the shared resolver
   *  builder: an absent alphabet makes it SNIFF western/solfège from the tokens, instead
   *  of a host-invented `'western'` lock (KAN-B04 — Kanopi invents no musical default). */
  alphabet?: string;
  // Interpreter tag of a code voice (`eval.strudel`, `eval.hydra`, …), or
  // undefined for a native notes voice. Drives the voice's output type for the
  // device-compatibility gate (DEVICES_SPEC §3 / ADAPTER_SPEC §1bis b).
  evalInterp?: string;
}
interface Orchestration {
  actorTable: Record<string, unknown>;
  actors: OrchestratedActor[];
  /** True when the scene declares NO `@actor`: the AST carries a single IMPLICIT `default`
   *  actor (audio transport, materialized upstream — bpscript for `.bps`, bp3-frontend for
   *  `.gr`), so a plain grammar travels the SAME path as an orchestrated one. The Actors
   *  panel stays empty for these. Read from the AST actor's `synthetic` flag — never
   *  host-fabricated. */
  synthetic?: boolean;
}

// Sounding alphabet symbols, loaded from the `-so`/`-mi`/`-cs` aux files the
// grammar references. Loads the raw aux text by reference. Injectable so a test
// can feed fixtures; the adapter wires it to the bundled aux maps.
type AuxLoader = (prefix: string, name: string) => string | undefined;
const bundledAuxLoader: AuxLoader = (prefix, name) =>
  prefix === 'al' ? BUNDLED_AL[name] : BUNDLED_SOUND[name];

function soundFromRef(prefix: string, name: string, load: AuxLoader): string[] {
  const text = load(prefix, name);
  if (!text) return [];
  try {
    return parseSoundObjects(text);
  } catch {
    return []; // aux unreadable — those symbols stay mute (text)
  }
}

// Resolve a grammar's alphabet AND its sounding symbols. The sound prototype is
// reached through the alphabet (`-gr → -al → -so/-mi/-cs`, decision
// routage-texte-son-par-symbole / bp3-frontend 6a26fc4): load the `-al`, take its
// alphabet, follow `alphabetSoundRef` to the prototype file. Fallback for the
// rare grammar that references a sound file directly. No `-al` / unbundled →
// the caller's default alphabet and no sounding non-note symbols (graceful).
export function resolveGrAux(
  fileRefs: FileRef[],
  load: AuxLoader,
  fallbackAlphabet: string[]
): { alphabetNames: string[]; soundSymbols: string[] } {
  const alRef = fileRefs.find((r) => r.prefix === 'al');
  if (alRef) {
    const alText = load('al', alRef.name);
    if (alText) {
      let alphabetNames = fallbackAlphabet;
      try {
        const names = parseAlFile(alText);
        if (names.length) alphabetNames = names;
      } catch {
        /* keep fallback */
      }
      const sref = alphabetSoundRef(alText);
      const soundSymbols = sref ? soundFromRef(sref.prefix, sref.name, load) : [];
      return { alphabetNames, soundSymbols };
    }
  }
  // No `-al`: the rare case of a sound file referenced straight from the `.gr`.
  const direct = fileRefs.filter(
    (r) => r.prefix === 'so' || r.prefix === 'mi' || r.prefix === 'cs'
  );
  const soundSymbols = direct.flatMap((r) => soundFromRef(r.prefix, r.name, load));
  return { alphabetNames: fallbackAlphabet, soundSymbols };
}

// The sounding non-note symbols the front-end assigned (actors[0].assignments),
// each `{ subject }` being an alphabet symbol that carries a sound.
function soundingFromAst(ast: unknown): string[] {
  const actors = (ast as { actors?: SceneActor[] } | null)?.actors;
  return (actors?.[0]?.assignments ?? []).map((a) => a.subject);
}

// Resolve the `-se` engine settings a grammar references. parseBP3 surfaces the
// reference in `fileRefs`; we load the bundled `-se` text and let the upstream
// parser interpret it. Absent reference / unbundled name → undefined (the
// engine then uses its 1000 ms default; graceful, never throws).
function resolveSeSettings(fileRefs: FileRef[]): SeEngineSettings | undefined {
  const ref = fileRefs.find((r) => r.prefix === 'se');
  if (!ref) return undefined;
  const text = BUNDLED_SE[ref.name];
  if (!text) return undefined;
  try {
    return parseSeFile(text).engine;
  } catch {
    return undefined;
  }
}

// Parse a BP3 grammar with per-symbol sound routing. parseBP3 surfaces the
// `-so`/`-mi`/`-cs` references in fileRefs; we load those, learn which symbols
// sound, and re-parse so the front-end can assign them (actors[0].assignments).
// All-note / no-prototype grammars need no second pass.
function parseWithSound(code: string, fallbackAlphabet: string[]) {
  const first = parseBP3(code, { alphabetNames: fallbackAlphabet });
  const { alphabetNames, soundSymbols } = resolveGrAux(
    first.fileRefs,
    bundledAuxLoader,
    fallbackAlphabet
  );
  const reparse = soundSymbols.length > 0 || alphabetNames !== fallbackAlphabet;
  const r = reparse ? parseBP3(code, { alphabetNames, soundSymbols }) : first;
  return {
    ast: r.ast,
    errors: r.errors.map((e) => ({ line: e.line, message: e.message })),
    settings: resolveSeSettings(r.fileRefs),
    soundingSymbols: soundingFromAst(r.ast)
  };
}

// `.gr` — native BP3 grammar text straight into the BP3 front-end. The head
// rule's top-level non-terminals (`S --> … A' B' C'`) are the macro structure;
// parseBP3 expands them away in the derivation, so we read the section names off
// the SOURCE head line. This is what lets STEP advance a `.gr` section by section
// (Part B). A `.gr` IS raw text — it never compiles through BPScript, so it has
// no AST to read sections from; the text reader (`headSectionNames`) stays for it.
// The `.bps` path reads its sections from the AST instead (`headSectionNamesFromAst`).
const WESTERN_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const grFrontend: Frontend = (code) => {
  const parsed = parseWithSound(code, WESTERN_NOTES);
  const sections = headSectionNames(code);
  const base = sections.length > 0 ? { ...parsed, sections } : parsed;
  // `.gr` (BP3) has no `@actor`, but bp3-frontend materializes one IMPLICIT `default`
  // actor (audio transport, `synthetic:true`) in the AST — so its events carry
  // `output.runtime='audio'` and it travels the SAME orchestrated path as `.bps`. Read
  // the orchestration straight off that AST; no host-synthesized default.
  const orchestration = buildOrchestration(parsed.ast as SceneAstView | null);
  return orchestration ? { ...base, orchestration } : base;
};

// Head-rule top-level sections of a `.gr` grammar TEXT — the macro structure STEP
// advances through. The first `S --> …` line lists them as a flat sequence of
// symbols (or `{a,b}` simultaneous group = one section). We keep the STRUCTURAL
// elements: a head sequence typically opens with inline control terminals
// (`_chan(1) _vel(50) _volume(80)`) and may inline a raw note before the section
// non-terminals (`A' B' C'`) — those are performance directives, not sections, so
// they're filtered out. The `gram#N[i]` rule tag, when present (`.gr` source), is
// stripped first. `.gr`-ONLY now: the `.bps` path reads sections from the AST
// (`headSectionNamesFromAst`), which reproduces this exact filtering on the AST.
function isControlTerminal(sym: string): boolean {
  // BP3 control/command terminals are underscore-prefixed (`_vel(50)`, `_striated`).
  if (sym.startsWith('_')) return true;
  // A bare note inlined in the head is a played event, not a section.
  if (isNoteName(sym)) return true;
  // A rest / silence placeholder.
  if (sym === '-' || sym === '_') return true;
  return false;
}

function headSectionNames(grammar: string): string[] {
  const line = grammar.split('\n').find((l) => /\bS\s*-->/.test(l));
  if (!line) return [];
  const rhs = line.slice(line.indexOf('-->') + 3).trim();
  // `.gr` head lines are tagged `gram#1[1] S --> …`; the tag precedes `S` so the
  // slice already dropped it. (Compiled `.bps` grammar has no tag.)
  const sections: string[] = [];
  let depth = 0;
  let buf = '';
  const flush = () => {
    const sym = buf.trim().replace(/[|{}]/g, '');
    if (sym && !isControlTerminal(sym)) sections.push(sym);
    buf = '';
  };
  for (const ch of rhs) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (/\s/.test(ch) && depth === 0) flush();
    else buf += ch;
  }
  flush();
  return sections;
}

// Minimal view of the BPScript AST (`compileBPS().ast`) this adapter reads. Only
// the nodes we derive the front-end view from are typed; bpscript carries more.
// Reading these directly off the AST is the single-source-of-truth migration:
// `flagStates`, `libraries` and `actorTable` no longer come from compileBPS's
// precomputed sidecar tables.
interface FlagStatesDirectiveNode {
  type: 'FlagStatesDirective';
  flag: string;
  states: { name: string; value: number }[];
}
interface LibraryDirectiveNode {
  type: 'LibraryDirective';
  engine: string;
  name: string;
}
interface TransportRefNode {
  key?: string;
  params?: Record<string, unknown>;
}
interface ActorDirectiveNode {
  type: 'ActorDirective';
  name: string;
  properties?: {
    alphabet?: string;
    transport?: TransportRefNode;
    eval?: string | null;
  };
  /** True for the IMPLICIT `default` actor the upstream front-end materializes when the
   *  scene declares no `@actor` (bpscript for `.bps`, bp3-frontend for `.gr`). Read so the
   *  Actors panel hides it — never host-fabricated. */
  synthetic?: boolean;
}
interface SceneAstView {
  directives?: ({ type?: string } & Record<string, unknown>)[];
  actors?: ActorDirectiveNode[];
  soundAssignments?: { subject: string }[] | null;
}

// A5 named scenes from the AST: each `FlagStatesDirective` (`@flag scene: calm:1,
// full:2`) → `{ [flag]: { [name]: value } }`. Same shape compileBPS's `flagStates`
// sidecar had, read straight from the directive nodes.
function flagStatesFromAst(a: SceneAstView | null): FlagStates {
  const out: FlagStates = {};
  for (const d of a?.directives ?? []) {
    if (d.type !== 'FlagStatesDirective') continue;
    const node = d as unknown as FlagStatesDirectiveNode;
    const table: Record<string, number> = {};
    for (const s of node.states) table[s.name] = s.value;
    out[node.flag] = table;
  }
  return out;
}

// Declared metronome from the AST directives: `@mm:70` parses to a `Directive`
// with `name:'mm'`, `value:70`. This is the tempo the BPx engine derives note
// durations at (loadGrammar reads `@mm` straight from the AST), so the central
// clock + STEP grid (`beatDurSec = 60/bpm`) MUST adopt it or the displayed tempo
// and the produced timeline diverge (a 70 bpm derivation stepped at 128 bpm
// yields fractional, phantom beats). Absent → undefined (keep the current tempo).
function mmFromAst(a: SceneAstView | null): number | undefined {
  for (const d of a?.directives ?? []) {
    const node = d as { name?: string; value?: unknown };
    if (node.name === 'mm' && typeof node.value === 'number' && node.value > 0) {
      return node.value;
    }
  }
  return undefined;
}

// Declared audio banks from the AST: each `LibraryDirective` (`@library.strudel
// "dirt-samples"`) accumulates by engine → `{ [engine]: [name, …] }`. Same shape
// compileBPS's `libraries` sidecar had.
function librariesFromAst(a: SceneAstView | null): Libraries {
  const out: Libraries = {};
  for (const d of a?.directives ?? []) {
    if (d.type !== 'LibraryDirective') continue;
    const node = d as unknown as LibraryDirectiveNode;
    (out[node.engine] ??= []).push(node.name);
  }
  return out;
}

// Backtick (code-voice) table from the AST: DFS for `BacktickInline` nodes →
// `{ [_btName]: { interp, code } }`. Each node carries `_btName` (the BT token the
// derivation emits), `code`, and the RESOLVED `interp` (its `tag`, or — untagged —
// the owning actor's `eval`, resolved by bpscript on the node: the one genuine
// language-semantic). Replaces compileBPS's `backticks` sidecar — single source
// of truth = the tree (BPscript 94c6f53, compileToBPxAST).
function backticksFromAst(ast: unknown): BacktickTable {
  const out: BacktickTable = {};
  const seen = new Set<unknown>();
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object' || seen.has(n)) return;
    seen.add(n);
    const node = n as Record<string, unknown>;
    if (node.type === 'BacktickInline' && typeof node._btName === 'string') {
      out[node._btName] = {
        interp: String(node.interp ?? node.tag ?? ''),
        code: String(node.code ?? '')
      };
    }
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(ast);
  return out;
}

// Map each orchestrated actor to the backtick token its rule emits, when the
// actor is a CODE voice. A rule `groove -> `…`` has the actor name as its LHS
// symbol and a `BacktickInline` (carrying `_btName`) in its RHS. We pair the two
// so the adapter can stop/re-eval a single code voice on arm/disarm (the BT
// token itself carries no actor on the derivation tree). Native (notes) voices
// have no entry — they are armed/disarmed through the dispatcher's note gate.
export function btTokenByActor(ast: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<unknown>();
  const findBt = (n: unknown, fbSeen: Set<unknown>): string | undefined => {
    if (!n || typeof n !== 'object' || fbSeen.has(n)) return undefined;
    fbSeen.add(n); // cycle guard: a shared/back-referenced node must not re-recurse
    const node = n as Record<string, unknown>;
    if (node.type === 'BacktickInline' && typeof node._btName === 'string') return node._btName;
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) {
        for (const x of v) {
          const r = findBt(x, fbSeen);
          if (r) return r;
        }
      } else if (v && typeof v === 'object') {
        const r = findBt(v, fbSeen);
        if (r) return r;
      }
    }
    return undefined;
  };
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object' || seen.has(n)) return;
    seen.add(n);
    const node = n as Record<string, unknown>;
    if (node.type === 'Rule') {
      const lhs = node.lhs as Array<{ name?: string }> | undefined;
      const name = lhs?.[0]?.name;
      if (typeof name === 'string') {
        const bt = findBt(node.rhs, new Set());
        if (bt) out[name] = bt;
      }
    }
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(ast);
  return out;
}

// Orchestrated actors from the AST: each `ActorDirective` → the `{ transport:
// {key, params}, alphabet, eval }` entry the adapter routes on. Read straight from
// the AST nodes (single source of truth) — including the IMPLICIT `default` actor the
// upstream front-end materializes for a no-`@actor` scene (audio transport).
type AdapterActorTable = Record<
  string,
  {
    transport?: { key?: string; params?: Record<string, unknown> };
    alphabet?: string;
    eval?: string;
  }
>;
function actorTableFromAst(a: SceneAstView | null): AdapterActorTable {
  const out: AdapterActorTable = {};
  for (const actor of a?.actors ?? []) {
    const props = actor.properties ?? {};
    out[actor.name] = {
      transport: { key: props.transport?.key, params: props.transport?.params },
      alphabet: props.alphabet,
      eval: props.eval ?? undefined
    };
  }
  return out;
}

// Build the orchestration view from the AST actors — shared by BOTH frontends. The AST
// ALWAYS carries the actors (a no-`@actor` scene gets an implicit `default` audio actor
// materialized upstream: bpscript for `.bps`, bp3-frontend for `.gr`). `synthetic` is read
// from that default actor's own flag, never host-fabricated. No host-invented `'default'`
// nor a `'western'` alphabet lock (an absent alphabet makes the resolver sniff). Returns
// `undefined` only if the AST somehow carries no actor at all (defensive; never expected).
function buildOrchestration(a: SceneAstView | null): Orchestration | undefined {
  const actorTable = actorTableFromAst(a);
  const names = Object.keys(actorTable);
  if (names.length === 0) return undefined;
  const synthetic = names.length === 1 && a?.actors?.[0]?.synthetic === true;
  return {
    actorTable,
    actors: names.map((name) => ({
      name,
      // Free identifier `transport.<key>`; the implicit default carries `'audio'`.
      transportKey: actorTable[name]?.transport?.key ?? 'audio',
      alphabet: actorTable[name]?.alphabet,
      evalInterp: actorTable[name]?.eval
    })),
    synthetic
  };
}

// `.bps` — BPScript compiles to a SceneAST (`compileBPS().ast`) that BPx derives
// directly. The front-end view (tempo, flagStates, libraries, actorTable,
// sections) is read from THAT AST — the single source of truth — not the
// deprecated grammar text nor compileBPS's redundant sidecar tables.
const bpsFrontend: Frontend = (code) => {
  // M5: the SESSION default tempo enters the AST at transpile time. When the
  // user has set a session tempo (`userTempo`) AND the scene declares no `@mm`,
  // BPScript writes that tempo as the AST's `@mm` default; the host never
  // invents a constant. Omitted when no session tempo is set → BPScript/BPx
  // applies ITS OWN default (60). A declared `@mm` always wins (BPScript skips
  // the default when a tempo directive is present).
  const c = compileToBPxAST(code, userTempo != null ? { tempo: userTempo } : undefined);
  if (c.errors.length > 0) {
    return { ast: null, errors: c.errors.map((e) => ({ line: e.line, message: e.message })) };
  }
  // Voie (a) (décision Romain 2026-06-17, archi frontend→AST→BPx) : on feed le
  // SceneAST de BPScript DIRECTEMENT à BPx, au lieu de l'aller-retour par le TEXTE
  // de grammaire BP3 (`parseBP3(compileBPS().grammar)` — l'échafaudage de parité,
  // déprécié) qui EFFAÇAIT l'acteur par occurrence (`melody.`/`bass.` disparaissent
  // du texte → la charge ne portait plus l'acteur, d'où l'ancienne table à plat).
  // `compileBPS().ast` porte l'acteur par occurrence + les voix de code (backtick)
  // que BPx ingère désormais directement (gap fondateur levé, BPx bba7c2f : le
  // terminal backtick émis porte la clé `compileBPS().backticks`). Aucun `.bps` du
  // corpus n'utilise la chaîne son BP3 `-al/-so` ; le son vient des notes
  // (`isNoteName`) ou des `soundAssignments` de l'AST.
  // Everything below is read from the AST (`c.ast`), the single source of truth —
  // no longer from compileBPS's precomputed tables (`c.flagStates`, `c.libraries`,
  // `c.actorTable`, `c.settings`) nor from the BP3 grammar TEXT (`c.grammar`).
  const a = c.ast as SceneAstView | null;
  const soundAssignments = a?.soundAssignments ?? [];
  const parsed = {
    ast: c.ast,
    errors: [] as ParseError[],
    // Tempo: BPx's `loadGrammar` reads the `@mm`/`_mm` metronome straight from the
    // AST (loadGrammar.ts:1544/4346) and the playback tempo is the central clock's
    // `currentBpm` (passed to `createBPx` as `tempo`). The former `c.settings` was
    // an empty BP3 settings ARRAY that BPx ignored entirely (it only reads
    // `settings.pclock/.qclock/.quantization/.natureOfTime`), so the `.bps` path
    // never needed it — dropped. `settings` stays meaningful for `.gr` only (real
    // `-se` engine timing, see `resolveSeSettings`).
    settings: undefined as SeEngineSettings | undefined,
    soundingSymbols: soundAssignments.map((s) => s.subject),
    // Declared `@mm` metronome so the central clock + STEP grid adopt the tempo
    // the engine actually derives at (absent → current tempo kept).
    mm: mmFromAst(a)
  };
  // Backtick voices: compileBPS keys foreign code by the EXACT BT token emitted
  // in the timeline (direct lookup, no parsing). Carry it through so the adapter
  // routes each BT terminal to its interpreter.
  const backticks = backticksFromAst(c.ast);
  // A5 named scenes: read the flag→{alias→int} table from the AST's
  // `FlagStatesDirective` nodes (`@flag scene: calm:1, full:2`) so the UI can offer
  // one selection button per named scene. Re-evaluating with `flags: { scene: <int> }`
  // makes the matching guarded rule derive (see `evaluate`).
  const flagStates = flagStatesFromAst(a);
  const withFlags = Object.keys(flagStates).length > 0 ? { ...parsed, flagStates } : parsed;
  // Declared per-engine banks: read from the AST's `LibraryDirective` nodes
  // (`@library.strudel "dirt-samples"` → `{ strudel: ['dirt-samples'] }`) so the
  // adapter loads each engine's samples before the backtick voices eval.
  const libraries = librariesFromAst(a);
  const withLibs = Object.keys(libraries).length > 0 ? { ...withFlags, libraries } : withFlags;
  const withBt = Object.keys(backticks).length > 0 ? { ...withLibs, backticks } : withLibs;
  // Head-rule sections, read from the AST start rule (no longer the grammar text).
  const sections = headSectionNamesFromAst(c.ast);
  const base = sections.length > 0 ? { ...withBt, sections } : withBt;

  // Orchestrator `.bps`: `@actor` declarations are AST `ActorDirective` nodes (each actor
  // owns an alphabet + a transport device). A no-`@actor` scene carries an implicit
  // `default` audio actor (bpscript, `synthetic:true`). Read the orchestration off the AST
  // (single source of truth) — the OSC address travels in the tree (`metadata.actors` →
  // `event.output`), not via a host-read `.binding`.
  const orchestration = buildOrchestration(a);
  return orchestration ? { ...base, orchestration } : base;
};

interface BP3Voice {
  dispatcher: InstanceType<typeof Dispatcher>;
  /** Source file this dispatcher was evaluated from. Lets a new program stop the
   *  OUTGOING program's dispatcher (whose `loop:true` keeps re-firing its code
   *  voices — Hydra/Strudel — each cycle) without depending on the per-actor
   *  handle map. Undefined for legacy entries (treated as "current file"). */
  file?: string;
  /** True when this dispatcher is an orchestrator (`@actor` voices). Only these
   *  loop-and-re-fire foreign code; a plain mono grammar is left alone so a
   *  sibling re-eval doesn't cut it. */
  orchestrator?: boolean;
  /** The code interpreters this orchestrator's voices use (`hydra`, `strudel`,
   *  …) + their slot ids. Stopping the dispatcher kills the re-firing, but a
   *  fire ALREADY in flight at stop time can still paint one more frame; we hush
   *  these runtimes right after to guarantee the outgoing canvas/audio is cleared,
   *  independent of the per-actor handle map (which `__hush__` may have emptied). */
  codeSlots?: Array<{ runtime: Runtime; actorId: string }>;
  /** Kronos audio driver for this scene (the engine that actually sounds it).
   *  Stopped alongside the dispatcher; the dispatcher's own stop closes the
   *  transports that cut the scheduled sound. */
  kronosAudio?: KronosAudioHandle;
}

// Minimal shape of the grammar's own symbol table: the engine resolves a leaf's
// `symbolId` to its terminal name deterministically here. This is the
// authoritative resolver — used to name tree leaves WITHOUT the fragile temporal
// correlation that collides on simultaneous polymetric voices.
interface SymbolTable {
  getName(id: number): string;
}

// Walk the derivation tree (DFS) and resolve EVERY leaf's `symbolId` to its
// terminal name via the grammar's own symbol table — the deterministic source of
// truth, replacing the tree adapters' temporal correlation (which collides on
// polymetric voices). Guard rails: only run when the engine actually exposes
// `grammar.symbols.getName`; on any failure leave the table empty so the
// adapters fall back to temporal correlation. Returns `{}` when unavailable.
function buildSymbolNames(bpx: unknown, tree: unknown): Record<number, string> {
  const names: Record<number, string> = {};
  const symbols = (bpx as { grammar?: { symbols?: Partial<SymbolTable> } } | null)?.grammar
    ?.symbols;
  if (!symbols || typeof symbols.getName !== 'function') return names;
  const getName = symbols.getName.bind(symbols);
  const root = (tree as { root?: unknown } | null)?.root ?? tree;
  try {
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as {
        type?: string;
        symbolId?: number;
        children?: unknown[];
        voices?: unknown[];
      };
      if (
        (n.type === 'occupying' || n.type === 'event') &&
        typeof n.symbolId === 'number' &&
        // Rests carry symbolId -1 (no terminal) — getName(-1) THROWS and would
        // wipe the whole table via the catch below. Skip negative ids.
        n.symbolId >= 0 &&
        names[n.symbolId] === undefined
      ) {
        names[n.symbolId] = getName(n.symbolId);
      }
      if (Array.isArray(n.children)) for (const c of n.children) visit(c);
      if (Array.isArray(n.voices)) for (const v of n.voices) visit(v);
    };
    visit(root);
  } catch {
    // Engine API moved / threw — drop the partial table; adapters fall back.
    return {};
  }
  return names;
}

// Minimal timed-token shape this adapter reads (BPx emits more fields). `type`
// and `actor` are present on the real BPx tokens (cf. `TimedToken` in
// bp3-deps.d.ts) and forwarded raw to the piano-roll visualizer.
type Tok = {
  token: string;
  start: number;
  end: number;
  type?: string;
  actor?: string | null;
};

// (STEP windowing is no longer sliced/re-zeroed here: STEP auditions the FULL
// persisted timeline via a Kronos seek + `playWindow` bound, so the former
// `sliceBeat`/`sliceBeatEvents` helpers — nearest-beat re-zeroing — were dead and
// were removed.)

// Build the FULL-production view from a derivation and publish it to the
// production store (the source of truth the Text panel + Structure visualizer
// read). `tokens` are the WHOLE derived sequence (ms start/end); `sounds` is the
// adapter's per-token sound predicate (note OR sounding symbol). `beatDurSec`
// (`60/bpm`) is the STEP unit — the visualizer draws the beat cursor and STEP
// advances one beat at a time off it. Section names (head-rule RHS) get
// equal-proportion time bounds along the same timeline as PASSIVE visual
// landmarks only (no longer the STEP unit). Set ONCE per eval (replace).
// Real section boundaries from the derivation tree: the root is a flat sequence of
// timed leaf nodes (the sub-rules are expanded inline), so we walk those leaves IN
// ORDER and slice them into `leafCounts[i]` consecutive leaves per section. Each
// section's bounds = [first leaf's start, last leaf's end], converted ms→s. Returns
// null when the counts don't line up with the tree (sum mismatch, missing spans,
// non-sequence root) so the caller can fall back to the equal split. This replaces
// the equal `i*dur/count` slicing for grammars whose sections have unequal lengths
// (maqam Rast: Sayr 7, Rujoo 7, Qarar 4+tail → Qarar is visibly shorter).
export function sectionBoundsFromTree(
  tree: ProductionTree | undefined,
  leafCounts: number[]
): Array<{ startSec: number; endSec: number }> | null {
  if (!tree || leafCounts.length === 0) return null;
  const root: ProductionTreeNode | undefined = tree.root;
  if (!root || root.type !== 'sequence') return null;
  const children = root.children;
  if (!Array.isArray(children)) return null;
  // Ordered spans of the top-level leaves (every direct child carries a span;
  // occupying/event leaves and any nested group all expose `span.startMs/endMs`).
  const spans: ProductionTreeSpan[] = [];
  for (const c of children) {
    const span = c.span;
    if (!span || typeof span.startMs !== 'number' || typeof span.endMs !== 'number') return null;
    spans.push({ startMs: span.startMs, endMs: span.endMs });
  }
  const total = leafCounts.reduce((a, n) => a + n, 0);
  if (total !== spans.length) return null; // counts don't match the tree — fall back
  const bounds: Array<{ startSec: number; endSec: number }> = [];
  let cursor = 0;
  for (const n of leafCounts) {
    const first = spans[cursor];
    const last = spans[cursor + n - 1];
    bounds.push({ startSec: first.startMs / 1000, endSec: last.endMs / 1000 });
    cursor += n;
  }
  return bounds;
}

function publishProduction(
  id: Runtime,
  tokens: Tok[],
  sectionNames: string[],
  beatDurSec: number,
  tree?: ProductionTree,
  symbolNames?: Record<number, string>,
  sectionLeafCounts?: number[]
): void {
  // Scene length (display: beat count + piano-roll extent). PROJECT the BPx-compiled
  // authority — the derivation tree root's span ENCLOSES every leaf (trailing rests
  // included), so `root.span.endMs` IS the compiled scene end. Repli (token reduce)
  // only when no tree is carried (token-only path). Reduce, not
  // `Math.max(...tokens.map(...))`: spreading a large derivation (tens of thousands of
  // leaves) overflows the argument limit → RangeError.
  const rootSpanEndMs = tree?.root?.span?.endMs;
  const durationMs =
    typeof rootSpanEndMs === 'number' && rootSpanEndMs > 0
      ? rootSpanEndMs
      : tokens.reduce((m, t) => (t.end > m ? t.end : m), 0);
  const prodTokens: ProductionToken[] = tokens.map((t) => ({
    token: t.token,
    startSec: t.start / 1000,
    durSec: (t.end - t.start) / 1000
  }));
  const durationSec = durationMs / 1000;
  const count = sectionNames.length;
  // Real section bounds from the derivation tree's leaf spans when the per-section
  // leaf counts line up with it (maqam Rast: Sayr/Rujoo 7 notes, Qarar shorter);
  // otherwise the equal split, kept as a safe fallback (and for `.gr`, which has no
  // counts). Only meaningful when there is more than one section to draw.
  const treeBounds =
    count > 1 && sectionLeafCounts && sectionLeafCounts.length === count
      ? sectionBoundsFromTree(tree, sectionLeafCounts)
      : null;
  const sections: ProductionSection[] =
    count > 1
      ? sectionNames.map((name, i) => ({
          name,
          startSec: treeBounds ? treeBounds[i].startSec : (i * durationSec) / count,
          endSec: treeBounds ? treeBounds[i].endSec : ((i + 1) * durationSec) / count
        }))
      : [];
  // Raw flat tokens (times in MS, untransformed) for the polymetric piano-roll
  // visualizer, which assigns voices by temporal overlap from these alone.
  const rawTokens: RawTimedToken[] = tokens.map((t) => ({
    token: t.token,
    start: t.start,
    end: t.end,
    type: t.type,
    actor: t.actor
  }));
  production.set({
    source: id,
    tokens: prodTokens,
    durationSec,
    beatDurSec,
    sections,
    rawTokens,
    tree,
    symbolNames
  });
}

// SINGLE SOURCE OF TRUTH for the tempo. The derivation reports the EFFECTIVE
// tempo it ran at on `tree.metadata.tempo`; that ONE value reconciles the two
// host copies (`currentBpm` → the STEP/`beatDurSec` grid, and the central clock
// → display/transport), so they can never diverge (the « derived at 70, stepped
// at 128 » bug). Repli: a derivation that reports no usable tempo (absent / ≤0,
// e.g. a `.gr` that carries none) keeps the caller's `fallbackBpm` — the tempo
// that was fed INTO the derivation — so nothing regresses. Pure → unit-tested.
export function effectiveTempoBpm(
  derived: { tree?: { metadata?: { tempo?: number } } } | null | undefined,
  fallbackBpm: number
): number {
  const t = derived?.tree?.metadata?.tempo;
  return typeof t === 'number' && t > 0 ? t : fallbackBpm;
}

// The EFFECTIVE tempo of the CURRENT derivation, READ BACK from the engine
// (`tree.metadata.tempo`) — the host does NOT seed it with a fabricated default.
// It drives the STEP `beatDurSec` grid, the Kronos loop bound (× beatDurSec) and
// the live retune; the central clock display is fanned the SAME value. 0 until a
// scene has derived (no scene → no tempo; the readout shows « — », not a host « 128 »).
let currentBpm = 0;

// The CURRENT derivation's beats-per-bar, PROJECTED from `DeriveResult.meter` (BPx
// authority). Re-read each eval (it can change on hot-swap); fed to the Kronos handle's
// bar fold + the clock's time signature. `DEFAULT_BEATS_PER_BAR` until a meter is seen.
let sceneBeatsPerBar = DEFAULT_BEATS_PER_BAR;

// The user's LOCAL typed/tapped tempo (D10 — the only legitimate host-owned tempo:
// input made before/without a live scene). `null` until the user sets one. It is
// the pre-derive tempo INPUT only when a scene declares NO `@mm`; a declared `@mm`
// (an upstream source) always wins, and an undeclared, un-typed tempo passes
// `undefined` to BPx so the ENGINE's own default applies (and surfaces on
// `tree.metadata.tempo`). Never a fabricated host default — no « 128 ».
let userTempo: number | null = null;

// True WHILE the adapter fans the derivation's effective tempo to the central clock
// (which re-enters this adapter's `setBpm`). It tells that re-entrant `setBpm` NOT to
// record the projected SCENE tempo as `userTempo` — only a real type/tap is user input.
let projectingGrammarTempo = false;

// The random seed of the CURRENT production. A PRODUCE re-rolls it (a new
// variation); a Play/Step reuses it so the heard audio matches the produced
// structure. A loop cycle re-rolls only when re-random is on. undefined → BPx's
// deterministic default (a scene with no random rules is unaffected either way).
let currentSeed: number | undefined;
function freshSeed(): number {
  return Math.floor(Math.random() * 0x7ffffffe) + 1;
}

// Optional hook the core wires so a grammar's declared `@mm` can drive the
// CENTRAL clock (and thus the transport display) at eval, keeping the shown BPM,
// the derivation, and the STEP grid in agreement. The core sets this to
// `clock.setBpm`; left unset (tests, headless) the adapter still derives at the
// `@mm` tempo locally via `currentBpm`, only the UI clock isn't told.
let onTempoFromGrammar: ((bpm: number) => void) | undefined;
export function setTempoSink(fn: (bpm: number) => void): void {
  onTempoFromGrammar = fn;
}

// Sink to project the DERIVED scene's beats-per-bar (from `DeriveResult.meter`, BPx
// authority) onto the central clock's time signature, so the beat LEDs reflect the
// declared meter. The core sets this to `clock.setTimeSignature`; left unset
// (tests, headless) the adapter still folds bars at the derived value via the handle.
let onMeterFromGrammar: ((beatsPerBar: number) => void) | undefined;
export function setMeterSink(fn: (beatsPerBar: number) => void): void {
  onMeterFromGrammar = fn;
}

// Resume offset (in beats) for the NEXT looping play, set by the transport state
// machine (playback store) just before it triggers Play, and consumed ONCE by the
// next non-STEP `evaluate`. Lets "Step → Play" continue from the next unplayed
// beat instead of the top — the single source of the resume position is the
// machine, not a guessed store value. null/0 → start from the top.
let resumeBeat: number | null = null;
export function setResumeBeat(beat: number | null): void {
  resumeBeat = beat;
}

// INSTRUMENTATION (Model C proof): count every BPx derivation of the EVAL path
// (eval/edit/arm/produce/play-from-stopped). It does NOT count the per-loop-cycle
// `reDeriveTreeEvents` re-roll (a deliberate re-random at the loop boundary, not an
// eval). The PM reads this via a dynamic import to prove that two Play-from-stopped
// (now `replay`, no eval) leave the count untouched, while an edit bumps it by one.
let __bpxDeriveCount = 0;
export function __getBpxDeriveCount(): number {
  return __bpxDeriveCount;
}

// LIVE transport-toggle plumbing: each adapter registers an updater that pushes
// the loop / re-random toggle onto its currently-playing dispatchers, so flipping
// the 🎲 (or loop) while a scene plays takes effect at the next cycle WITHOUT
// re-evaluating. Pass null to leave a flag untouched.
type TransportLiveUpdater = (reRandom: boolean | null, loop: boolean | null) => void;
const transportLiveUpdaters: TransportLiveUpdater[] = [];
export function setReRandomLive(on: boolean): void {
  for (const u of transportLiveUpdaters) u(on, null);
}
export function setLoopLive(on: boolean): void {
  for (const u of transportLiveUpdaters) u(null, on);
}

/** One orchestrated actor as published to the Actors panel. */
export interface PublishedActor {
  name: string;
  /** The Kanopi runtime that voices it (a code voice → its interpreter's
   *  runtime, a native notes voice → 'bpscript'/'bp3'). */
  runtime: Runtime;
  /** Source file the orchestrator was evaluated from (so the UI can show it). */
  file?: string;
}

// Optional hook the core wires so an orchestrator `.bps`'s `@actor` list reaches
// the Actors panel (`core.actors.setActors`). Left unset (tests, headless) the
// adapter still routes/plays every actor; only the panel isn't populated.
let onActorsFromGrammar: ((actors: PublishedActor[], file: string) => void) | undefined;
export function setActorsSink(fn: (actors: PublishedActor[], file: string) => void): void {
  onActorsFromGrammar = fn;
}

// CV-native expr (décision langage Romain) : la factory qui compile une courbe `expr`
// (backtick custom) en `ModulationSource` est FOURNIE PAR LE RUNTIME (runtime-audio),
// jamais par Kanopi (Loi fondamentale n°2 : l'hôte ne compose/rend rien). Kanopi se
// contente de la PASSER à la composition Kronos. Absente ⇒ `expr` ignoré par Kronos
// (comportement actuel, additif et sans risque).
let onExprSource: ExprSource | undefined;
export function setExprSource(fn: ExprSource | undefined): void {
  onExprSource = fn;
}
// Wire runtime-audio's factory at module load: from now on Kronos composes `expr`
// curves through it (Kanopi still never compiles/renders — it only passes it on).
setExprSource(exprSource as unknown as ExprSource);

// Live arm/disarm handle for ONE orchestrated actor's voice. Registered per
// (file, actor) when an orchestrator evaluates; the core reaches it by actor
// name to silence/restore that single voice while the rest keep playing.
interface OrchestratedVoiceHandle {
  /** Mute/unmute the actor's NOTES on the running dispatcher (native voices). */
  setNoteMuted: (muted: boolean) => void;
  /** Stop the actor's CODE voice (Strudel/Hydra). Resolves once its adapter's
   *  `stop` has run (the Hydra hush that blackens the canvas + clears its rAF
   *  callbacks). Undefined for note voices. */
  stopCode?: () => Promise<void>;
  /** Re-evaluate the actor's CODE voice (Strudel/Hydra). Undefined for notes. */
  evalCode?: () => void;
  /** The orchestrator file this voice belongs to, so loading a DIFFERENT
   *  program can tear down only the OUTGOING voices (cf. `tearDownOutgoingVoices`). */
  file: string;
}
// actorName → its live voice handle, replaced on each orchestrator eval.
const orchestratedVoices = new Map<string, OrchestratedVoiceHandle>();

// Stop + forget every orchestrated CODE voice that belongs to a DIFFERENT file
// than the one now evaluating. A code voice (Strudel audio, Hydra canvas + its rAF
// loop) lives on its OWN adapter, not on this dispatcher — stopping the previous
// bp3 dispatcher does NOT kill it. So when a new program loads (a fresh
// orchestrator, OR a non-orchestrated scene that publishes no actors), the old
// scene's Hydra canvas keeps rendering on top until we call its adapter's `stop`
// — the SAME teardown a per-actor disarm uses (it blackens the canvas). We AWAIT
// each stop so the hush has landed before the new scene paints (no residual frame).
// `keepFile` is the incoming orchestrator's file (re-evaluating the SAME program
// must not tear down its own voices mid-swap); pass undefined to drop ALL.
async function tearDownOutgoingVoices(keepFile: string | undefined): Promise<void> {
  const pending: Promise<void>[] = [];
  for (const [name, h] of orchestratedVoices) {
    if (keepFile !== undefined && h.file === keepFile) continue;
    const p = h.stopCode?.();
    if (p) pending.push(p);
    orchestratedVoices.delete(name);
  }
  await Promise.all(pending);
}

/**
 * Live-arm an orchestrated actor: route/play its voice again. A code voice
 * (Strudel/Hydra) is re-evaluated; a native notes voice is un-muted on the
 * dispatcher. No-op when the actor isn't a live orchestrated voice.
 */
export function armOrchestratedActor(name: string): void {
  const h = orchestratedVoices.get(name);
  if (!h) return;
  h.setNoteMuted(false);
  h.evalCode?.();
}

/**
 * Live-disarm an orchestrated actor: silence its voice while the others keep
 * playing. A code voice is stopped; a native notes voice is muted on the
 * dispatcher. No-op when the actor isn't a live orchestrated voice.
 */
export function disarmOrchestratedActor(name: string): void {
  const h = orchestratedVoices.get(name);
  if (!h) return;
  h.setNoteMuted(true);
  h.stopCode?.();
}

/** True when the named actor is a live orchestrated voice (lets the core pick
 *  the orchestrated arm/disarm path). */
export function isOrchestratedActor(name: string): boolean {
  return orchestratedVoices.has(name);
}

let audioCtx: AudioContext | undefined;
// The dispatcher's lookahead clock schedules notes against `audioCtx.currentTime`.
// On the first eval after page load the context can still be `suspended` (its
// clock frozen near 0), so we must AWAIT the resume before starting playback —
// otherwise only the notes inside the first 100 ms lookahead window get
// scheduled and any grammar whose events are spread out (anacrusis / sparse
// rhythms) falls silent.
async function getCtx(): Promise<AudioContext> {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  return audioCtx;
}

// BUILD-ONLY context accessor (Model C produce/load): get the shared context WITHOUT
// resuming it — a produce must not WAKE the audio (the architect rule: building the
// persistent handle on load stays silent, like a Stop keeps a silent handle). The
// context's `currentTime` is a valid (frozen, if suspended) clock source for the built-
// but-not-playing Transport; the first Play resumes it via `getCtx()` on `replay`.
function peekCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

// True PAUSE for the WebAudio path: suspend the shared audio context. The
// dispatcher's lookahead clock schedules against `audioCtx.currentTime`, so
// freezing the context freezes playback in place WITHOUT tearing down the
// dispatchers — resume continues exactly where it stopped. No context yet (never
// played) → no-op. The core wires these to the central clock's pause/resume.
export async function pauseAudioContext(): Promise<void> {
  if (audioCtx && audioCtx.state === 'running') await audioCtx.suspend();
}
export async function resumeAudioContext(): Promise<void> {
  if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
}

function srcKey(s: EvalSource): string {
  return s.actorId ?? s.fileId;
}

// Map a backtick interpreter tag (`strudel`, `hydra`, `tidal`, `js`, …) to a
// The set of code-voice runtimes the registry is built from (`registry.ts` keys
// its adapter map off this same `codeVoiceAdapters` list). Derived here — NOT a
// second hand-maintained table — so adding a code voice to `codeVoiceAdapters`
// exposes it for free. Imported from `runtime-codevoices` (already a dependency),
// which avoids the bp3 ↔ registry module-eval cycle a static `./registry` import
// would create.
const codeVoiceRuntimes = new Set<Runtime>(codeVoiceAdapters.map((a) => a.id));

// Kanopi Runtime. The tag is the eval tag from the .bps backtick (`strudel: …`);
// each code-voice tag IS its registered adapter's id, so an interp resolves iff
// the registry has an adapter for it. `auto` has no interpreter (the user must
// tag the code). `sc`/`py` are level-3 (osc-bridge), absent from the registry →
// unknown-interp (surfaced clearly, never silent).
function runtimeForInterp(interp: string): Runtime | undefined {
  return codeVoiceRuntimes.has(interp as Runtime) ? (interp as Runtime) : undefined;
}

// What a voice PRODUCES (ADAPTER_SPEC §1bis b). A code voice's output type is
// its interpreter adapter's declared `outputType`; a native notes voice (no
// `eval`) produces `notes`. The registry is reached lazily (dynamic import) to
// break the bp3 ↔ registry module cycle.
async function voiceOutputType(evalInterp: string | undefined): Promise<VoiceOutputType> {
  if (!evalInterp) return 'notes';
  const runtime = runtimeForInterp(evalInterp);
  if (!runtime) {
    // Unknown interpreter (sc/py = level-3, no browser adapter): the backtick
    // sink already surfaces this clearly at fire time; for the compat gate treat
    // it as `notes` (its bps voice still derives notes terminals) so the gate
    // doesn't reject a voice the engine will itself report on.
    return 'notes';
  }
  const { getAdapter } = await import('./registry');
  return getAdapter(runtime)?.outputType ?? 'notes';
}

// DEVICES_SPEC §3/§4 + ADAPTER_SPEC §1bis (b): resolve a voice's transport to a
// typed device and verify compatibility BEFORE routing. Two clear, thrown errors
// (never a silent skip): unknown device, or output type the device rejects.
// Returns the resolved device so the caller drives transport selection off
// `device.type` (so `audio`/`webaudio` both map to WebAudio, `midi` to MIDI).
async function gateVoiceDevice(
  actorName: string,
  transportKey: string,
  evalInterp: string | undefined,
  id: Runtime,
  log: LogPush
): Promise<Device> {
  const device = resolveDevice(transportKey);
  if (!device) {
    const msg = `appareil inconnu : ${transportKey}`;
    log({ runtime: id, level: 'error', msg });
    throw new Error(`${id}: ${msg}`);
  }
  const outputType = await voiceOutputType(evalInterp);
  if (!isCompatible(outputType, device.type)) {
    const msg = `voix ${actorName} (${outputType}) incompatible avec l'appareil ${transportKey} (${device.type})`;
    log({ runtime: id, level: 'error', msg });
    throw new Error(`${id}: ${msg}`);
  }
  return device;
}

/**
 * Build a backtick sink (lot 4, ADAPTER_SPEC §1bis). A `BT<interp><id>` token in
 * the derivation is a REFERENCE to foreign code; Kronos (the single emitter)
 * places it in time and fires this sink at the scheduled moment — it receives the
 * returned closures via `startKronosAudio({ isBacktick, backtickSink })`.
 * The sink looks up `backticks[token]` (direct, no parsing), resolves the
 * interpreter adapter, and evaluates the code — the engine then plays, PLACED in
 * time by Kronos. Layering: the scheduler (packages/core) never imports an
 * adapter; bp3.ts builds this closure.
 *
 * - unknown interp → clear log error (never silent).
 * - async evaluate → fire-and-forget, errors logged.
 * - §1bis (b) device-type compatibility is gated UP-FRONT in `evaluate` (see
 *   `gateVoiceDevice`), per actor, before the dispatcher starts — not here at
 *   fire time. This sink only PLACES the already-validated voice in time.
 */
function registerBacktickSink(
  backticks: BacktickTable,
  id: Runtime,
  src: EvalSource,
  log: LogPush,
  // Orchestrator-only: map a BT token → its owning actor, the set of actors
  // currently disarmed, and the slot id to evaluate each code voice into. When
  // an actor is disarmed, its BT token does not fire; each code voice owns a
  // DISTINCT slot so it can be stopped independently. Absent for a plain (non-
  // orchestrated) backtick file — all voices then share `src.actorId` as before.
  orchestration?: {
    btToActor: Record<string, string>;
    mutedActors: Set<string>;
    slotForActor: (actor: string) => string;
  }
): {
  isBacktick: (t: string) => boolean;
  sink: (
    t: string,
    info?: { startSec: number; durSec: number; absTime: number },
    interp?: string
  ) => void;
} {
  const isBacktick = (token: string) => Object.prototype.hasOwnProperty.call(backticks, token);
  // `interp` (KAI-9): the code voice's interpreter now travels on `event.output.device`
  // (graven by Kairos), not on the AST backtick node — Kronos's 'code' adapter passes it
  // here. Fall back to the table's own `interp` for any path that still carries it.
  const sink = (
    token: string,
    _info?: { startSec: number; durSec: number; absTime: number },
    interp?: string
  ) => {
    const entry = backticks[token];
    if (!entry) return;
    const actor = orchestration?.btToActor[token];
    // Disarmed code voice: don't (re)fire it. The dispatcher loops, so skipping
    // here keeps it silent until the actor is re-armed (which re-evaluates it).
    if (actor && orchestration?.mutedActors.has(actor)) return;
    // Each orchestrated code voice evaluates into its OWN slot (file + actor) so
    // arm/disarm can stop just that voice. A plain backtick file keeps the
    // whole-file slot.
    const actorId = actor && orchestration ? orchestration.slotForActor(actor) : src.actorId;
    const interpName = interp ?? entry.interp;
    const runtime = runtimeForInterp(interpName);
    if (!runtime) {
      log({
        runtime: id,
        level: 'error',
        msg: `backtick: unknown interpreter "${interpName}" (token ${token}) — tag the code with a known runtime`
      });
      return;
    }
    // The registry is reached lazily (dynamic import) to break the bp3 ↔ registry
    // module cycle: registry.ts imports bp3Adapter/bpscriptAdapter at load, so
    // bp3.ts must NOT pull registry at module-eval. Fire-and-forget: the engine
    // renders itself in time (capture-for-retransport is backlog B4); errors are
    // logged, never thrown into the audio clock.
    import('./registry')
      .then(({ getAdapter }) => {
        const adapter = getAdapter(runtime);
        if (!adapter) {
          log({
            runtime: id,
            level: 'error',
            msg: `backtick: no adapter for "${interpName}" (token ${token})`
          });
          return;
        }
        return adapter.evaluate(entry.code, { actorId, fileId: src.fileId }, log);
      })
      .catch((err) =>
        log({ runtime: id, level: 'error', msg: `backtick ${interpName}: ${String(err)}` })
      );
  };
  // Return the closures so the orchestrated kronos path can hand them to the Kronos
  // scheduler (it intercepts BT tokens itself; the dispatcher is not started there).
  return { isBacktick, sink };
}

/**
 * Load the sample/sound banks a `.bps` declares per engine (`@library.strudel
 * "dirt-samples"`). Only the `strudel` engine has a bank loader today (the
 * `samples()` path); other engines'
 * declarations are recorded but have no loader yet — logged, never silent. A
 * declared id with no catalog entry is an explicit error, not a quiet skip.
 *
 * Fire-and-forget per bank (de-duped inside `loadSampleBank`): the backtick
 * voice that uses the samples is itself fired in time by the dispatcher, and the
 * Strudel sound map is global, so a bank that lands a beat late simply means the
 * first cycle is silent — acceptable, and the common case (dirt-samples) is
 * cached after the first eval.
 */
function loadDeclaredLibraries(libraries: Libraries, id: Runtime, log: LogPush): void {
  for (const [engine, ids] of Object.entries(libraries)) {
    if (engine !== 'strudel') {
      log({
        runtime: id,
        level: 'info',
        msg: `@library.${engine} déclarée (${ids.join(', ')}) : pas de chargeur de banque pour ce moteur (ignoré)`
      });
      continue;
    }
    for (const bankId of ids) {
      const bank = findBank(bankId);
      if (!bank) {
        log({
          runtime: id,
          level: 'error',
          msg: `@library.strudel "${bankId}" : banque inconnue (absente du catalogue)`
        });
        continue;
      }
      void loadSampleBank(bank.source)
        .then(() => log({ runtime: id, level: 'info', msg: `library loaded: ${bank.name}` }))
        .catch((err) =>
          log({ runtime: id, level: 'error', msg: `library ${bankId}: ${String(err)}` })
        );
    }
  }
}

/**
 * Build a BPx-language adapter. `frontend` is the only thing that varies between
 * `.gr` (parseBP3) and `.bps` (compileBPS → parseBP3); everything downstream —
 * derive, dispatch, MIDI, stop, tempo, dispose — is shared verbatim. Each
 * adapter owns its own event bus and live-voice map; the AudioContext, MIDI
 * probe and global tempo are shared module singletons.
 */
function makeBpxAdapter(
  id: Runtime,
  extensions: readonly string[],
  frontend: Frontend
): RuntimeAdapter {
  const adapterEvents: EventBus = createEventBus();
  // One dispatcher per source (file or actor block). Re-evaluating a source
  // stops its previous dispatcher before scheduling the new derivation.
  const voices = new Map<string, BP3Voice>();

  // Live loop/re-random updates reach THIS adapter's currently-playing voices via
  // the ACTIVE Kronos handle (it, not the inert dispatcher, drives the audio + owns
  // the scheduler). A voice with no kronos handle just skips the optional call.
  transportLiveUpdaters.push((reRandom, loop) => {
    for (const v of voices.values()) {
      if (reRandom !== null) v.kronosAudio?.setReRandom(reRandom);
      if (loop !== null) v.kronosAudio?.setLoop(loop);
    }
  });

  function emitLifecycle(name: 'eval' | 'stop', fileId: string) {
    adapterEvents.emit({
      schemaVersion: 1,
      type: 'trigger',
      runtime: id,
      source: fileId,
      t: performance.now(),
      name
    });
  }

  return {
    id,
    extensions,
    // ADAPTER_SPEC §1bis (b): bp3/bpscript derive pitched terminals → `notes`
    // (non-sounding symbols still route to the text console per-symbol, but the
    // voice's declared product is notes).
    outputType: 'notes',
    events: adapterEvents,
    async evaluate(code: string, src: EvalSource, log: LogPush) {
      const {
        ast,
        errors,
        settings,
        orchestration,
        backticks,
        flagStates,
        libraries,
        sections: headSections,
        mm: declaredMm
      } = frontend(code);
      if (errors.length > 0) {
        const msg = errors.map((e) => `line ${e.line ?? '?'}: ${e.message}`).join('; ');
        log({ runtime: id, level: 'error', msg: `parse: ${msg}` });
        throw new Error(`${id} parse error: ${msg}`);
      }
      if (!ast) {
        const msg = 'no grammar found (empty AST)';
        log({ runtime: id, level: 'error', msg });
        throw new Error(`${id}: ${msg}`);
      }

      // `@library.<engine>` banks: start loading the declared sample banks now
      // (before derive/dispatch) so a backtick voice that references them finds
      // its samples. De-duped + fire-and-forget inside the helper.
      if (libraries && Object.keys(libraries).length > 0) {
        loadDeclaredLibraries(libraries, id, log);
      }

      // Pre-derive tempo INPUT to `createBPx({ tempo })`. The default tempo now
      // lives IN the AST: BPScript writes the session tempo as `@mm` when the
      // scene declares none (M5), so `declaredMm` (= `mmFromAst`) already reads
      // either the DECLARED `@mm` (it wins) OR the injected session default —
      // the `?? userTempo` reconciliation became redundant. `undefined` when the
      // AST carries no tempo at all → BPx applies ITS OWN default (60), surfaced
      // on `tree.metadata.tempo`; never a fabricated host « 128 ». (BPx does NOT
      // re-read `@mm` itself to set `metadata.tempo`; the adapter routes the
      // value in. The SINGLE SOURCE OF TRUTH stays the EFFECTIVE tempo the
      // derivation reports back, reconciled below — that one value drives
      // `currentBpm` (STEP grid) AND the central clock fan-out.)
      const deriveTempo: number | undefined = declaredMm && declaredMm > 0 ? declaredMm : undefined;

      // A5 named scenes: a `.bps` whose rules are ALL guarded by a named scene
      // flag (`[scene==calm] S -> …`) has no rule that derives without a scene
      // set — `S` would stay an unexpanded non-terminal and leak as a bogus
      // token to the audio transport. Match the A5 UX ("a scene is active by
      // default"): when the file declares named scenes and the caller gave no
      // scene, default to the first named one (lowest int). Reflected as the
      // active scene in the scene bar (see `defaultScene` consumers).
      const effectiveFlags = withDefaultScene(src.flags, flagStates);

      // RE-RANDOM seeding. BPx derives with a deterministic LCG seeded to a fixed
      // default (1), so a grammar with weighted/`@mode:random` rules yields the
      // EXACT same derivation every time. The seed model (Romain):
      //   • Every PRODUCE (incl. the load-produce) re-rolls → a NEW variation:
      //     `currentSeed` gets a fresh value here, on a produceOnly eval.
      //   • A Play/Step REUSES `currentSeed` so the audio matches the produced
      //     structure (same seed → same derivation), not a fresh roll.
      //   • A loop cycle re-derives with a fresh seed ONLY when re-random is on
      //     (`reDeriveTreeEvents` below); off → the dispatcher loops the same
      //     events. `seed` is a documented BPx config field — glue, not a RNG port.
      if (src.produceOnly) currentSeed = freshSeed();

      let tokens;
      let tree: ProductionTree | undefined;
      // The BPx-COMPILED scene length, in beats, read off the derivation metadata
      // (`derived.tree.metadata.totalDurationBeats` — BPx authority). Carried out of
      // the try block so the Kronos-audio call site can project it into the loop bound
      // (× `beatDurSec`), instead of the host's reduce(max) of the last sounding leaf.
      // Undefined when the engine omits it → the call site falls back to the reduce.
      let totalDurationBeats: number | undefined;
      // The derived scene's actor→output table (`tree.metadata.actors`, BPx authority).
      // Carried out of the try so the Kronos-audio call site hands it down to ENUMERATE
      // the OSC devices at setup (actors whose `runtime==='osc'`). Per-event routing is by
      // `event.output`, not this table. Undefined for a scene with no transport actors.
      let actorOutputs:
        | Record<string, { runtime: string; params?: Record<string, unknown> }>
        | undefined;
      // DETERMINISTIC leaf-name table (`symbolId → name`) read off the grammar's
      // own symbol table — the authoritative resolver the tree-view adapters use,
      // replacing the fragile temporal correlation. Empty when the engine doesn't
      // expose it (adapters then fall back).
      let symbolNames: Record<number, string> = {};
      // Modulator registry, built ONCE from CONSTANT inputs (ast.cvInstances +
      // modLibJson). Identical for the eval-path composition AND the per-cycle
      // re-random re-derivation (only the derivation's random draw differs), so
      // it is hoisted above the try and reused by both (no duplicate build).
      let kronosRegistry: ReturnType<typeof buildModulators>;
      // KAN-orchestration P1 — Kairos handle: `charger`ed with the derived tree + the
      // BPx projection context (resolvers + emit options). It becomes the SOURCE of the
      // played timeline (its `sourceStructure()` is bound on the Transport in
      // `startKronosAudio`). Built inside the try (needs `bpx`/`rawTree` in scope).
      let kairos: Kairos | undefined;
      // KAI-10 — the host builds NO pitch resolver at all. Kairos graves `content.pitch.hz`
      // (read by every output) AND `content.sounds` (the DISPLAY note-vs-text predicate, read
      // below off the timeline), both from `ctx.pitchLib` + the tree; the sound transpose
      // lives in Kairos too. The host imports no runtime pitch builder anymore.
      try {
        // `effectiveFlags` (e.g. `{ scene: 2 }`) is applied as the BPx engine's
        // initial flag state, so a flag-guarded rule (`/scene=2/`) derives
        // instead of leaving `S` unexpanded. Absent named scenes → unchanged.
        // KAN-orchestration P1 (option A) — the host's BPx entry is the upstream
        // `createSession(ast, opts)` (it CARRIES `buildProjectionContext`, which the
        // Kairos projection path needs). `loadGrammar` is folded into the factory.
        // Config → SessionOptions: tempo→tempo, settings→settings, flags→initialFlags,
        // seed→seed (BPxInstance applied the same mapping). Proven derivation-identical
        // to the former `createBPx + loadGrammar` by `createsession-parity.test.ts`.
        const bpx: Session = createSession(ast, {
          // `undefined` when no `@mm` and no user tempo → BPx applies ITS OWN
          // default (60) and surfaces it on `tree.metadata.tempo`; we never
          // overwrite that default with a host-fabricated value.
          ...(deriveTempo !== undefined ? { tempo: deriveTempo } : {}),
          ...(settings !== undefined ? { settings } : {}),
          ...(effectiveFlags !== undefined ? { initialFlags: effectiveFlags } : {}),
          ...(currentSeed !== undefined ? { seed: currentSeed } : {})
        });
        // Keep BOTH halves of the derivation: `.tree` (from `derive()`) carries the
        // polymetric structure (groups + voices + nesting) the piano-roll's struct band
        // needs; `tokens` (from `emit('timed-tokens')`) is the flat timed sequence
        // (audio/MIDI/text). The `output:'complete'` mode (control markers as tree
        // nodes / zero-duration tokens) has MIGRATED to Kairos and now THROWS in BPx —
        // the default ('sounding') is the host's path: notes + rests, no control nodes.
        const deriveResult = bpx.derive();
        const derived = {
          tree: deriveResult.tree,
          tokens: bpx.emit<BpxTimedToken[]>('timed-tokens')
        };
        // METER (BPx authority): the resolved `[meter:…]` graven on the derivation
        // root. Re-read EVERY derive (it can change on hot-swap). Absent → the host
        // projects no bar of its own (the documented default 4 stands downstream).
        sceneBeatsPerBar = beatsPerBarFromMeter((deriveResult as { meter?: MeterLike }).meter);
        // Model C proof: this is THE eval-path derivation (eval/edit/arm/produce/play-from-
        // stopped). Count it. The loop-boundary re-roll (`reDeriveTreeEvents`) is NOT counted
        // here — a Play-from-stopped on a persisted scene replays without reaching this point.
        __bpxDeriveCount++;
        // SINGLE SOURCE OF TRUTH: project the EFFECTIVE tempo the derivation ran
        // at onto BOTH ex-copies — `currentBpm` (the STEP/`beatDurSec` grid below)
        // AND the central clock (display + transport, via the grammar sink) — so
        // they can never diverge. The repli (`effectiveTempoBpm`'s fallback) is the
        // tempo fed INTO the derivation — `@mm`, else the user's tempo, else BPx's
        // own default (60) — NEVER a host « 128 ». `clock.setBpm` is a no-op on an
        // unchanged tempo and never re-enters this path, so the fan-out cannot loop.
        currentBpm = effectiveTempoBpm(derived, deriveTempo ?? 60);
        // Fan the EFFECTIVE tempo to the central clock (display). This re-enters the
        // adapter's own `setBpm` via the clock fan-out, so guard against the projected
        // SCENE tempo being mistaken for fresh USER input (which would wrongly seed the
        // next no-`@mm` scene). Only a genuine type/tap should set `userTempo`.
        if (currentBpm > 0) {
          projectingGrammarTempo = true;
          try {
            onTempoFromGrammar?.(currentBpm);
          } finally {
            projectingGrammarTempo = false;
          }
        }
        // Project the DERIVED meter onto the clock's time signature (beat LEDs). A no-op
        // on an unchanged value (`setTimeSignature` guards), so a no-meter / 4/4 scene
        // never churns. Pure local state — no cross-runtime fan-out, no re-entry guard.
        onMeterFromGrammar?.(sceneBeatsPerBar);
        // The TREE (with control nodes) drives the multi-actor dispatcher. The
        // FLAT tokens keep their prior `'sounding'` shape for every legacy
        // consumer (production readout, STEP slicing, MIDI sink, mono/text
        // dispatcher.load): `'complete'` ALSO injects zero-duration `type:
        // 'control'` tokens into the flat stream, which those paths never saw —
        // drop them here so nothing downstream regresses.
        // CV — the modulator registry is built ONCE from CONSTANT inputs (ast.cvInstances +
        // modLibJson) and handed to Kairos in the charger's `modulation:{registry,...}`:
        // Kairos's projection COMPOSES the bindings at flatten (KRO-24) and carries them on
        // `content.modulations` for the runtime-audio AudioRuntime to render. The host no
        // longer composes/stamps CV bindings itself — the Kairos projection owns CV composition.
        kronosRegistry = buildModulators(
          ((ast as { cvInstances?: unknown[] } | null)?.cvInstances ?? []) as Parameters<
            typeof buildModulators
          >[0],
          modLibJson as unknown as ModLib
        );
        // CV is composed by Kronos (Kairos projection) and RENDERED by the runtime-audio
        // AudioRuntime. The legacy `resolveCvControls`
        // (which stamped `{__cv}` descriptors for the now-removed internal WebAudio synth)
        // is GONE — Kanopi neither resolves nor renders CV.
        // Flat tokens (control markers dropped) — the resolver context + downstream consumers.
        tokens = derived.tokens.filter((t) => t.type !== 'control');
        // KAN-orchestration P1 — hand the derived tree + projection context to Kairos.
        // `charger` projects the tree into a Kronos Timeline (modulations composed inside)
        // and bumps its generation; `startKronosAudio` binds `sourceStructure()` on the
        // Transport so Kronos PULLs that timeline. The context (symbol resolvers, kpress
        // offset, runtime state, emission order) is built by BPx — Kanopi never assembles
        // it. `output:'voice-major'` is `buildProjectionContext`'s default (the parity
        // corpus' voice-major order); see Open notes on the order choice.
        kairos = new Kairos();
        kairos.charger(
          derived.tree as unknown as Parameters<Kairos['charger']>[0],
          {
            ...(bpx.buildProjectionContext() as object),
            // KAI-10 — hand Kairos the shared pitch CATALOGS (read-only library DATA,
            // the 5 `bpscript/lib` JSONs bundled at `PITCH_LIB`), the exact sibling of
            // `modulation.registry`: host-composed data on the projection context, NOT a
            // Kairos-side import (the host is the single freshness gatekeeper, LAN-14).
            // The declared identity (alphabet/tuning per actor) rides the TREE
            // (`metadata.actors` + `metadata.scenePitch`, written by BPx) — Kanopi poses ONLY
            // the catalogs. Kairos consumes this to build the resolver and grave
            // `content.pitch.hz` + `content.sounds`; the host calls no resolver itself.
            pitchLib: PITCH_LIB,
            // KRO-24 — hand Kairos the CV registry (hoisted, cycle-invariant) + the
            // `exprSource` factory so `projeter` COMPOSES the modulations AT FLATTEN and
            // carries them on `content.modulations` (+ scene span) for the audio runtime
            // to sample. Empty registry (no CV) ⇒ no bindings ⇒ notes without automation,
            // unchanged (normal/maqâm parity preserved). Kanopi composes no CV bindings itself
            // — the Kairos projection is the single owner of CV composition.
            // KAI-10 — the SOUND transpose now lives in Kairos (`resolvePitch` = resolve ∘
            // transpose per actor, off `ctx.pitchLib` + the tree). The host lends no
            // `transposeToken` (the old host path was a prod no-op, FLAG3); a display-only
            // token transpose, if ever needed, comes from the Kairos views (KAN-18).
            modulation: { registry: kronosRegistry, exprSource: onExprSource }
          } as unknown as Parameters<Kairos['charger']>[1]
        );
        // BPx authority for the scene's compiled length (includes any trailing rest);
        // projected into the Kronos loop bound below.
        totalDurationBeats = derived.tree?.metadata?.totalDurationBeats;
        // BPx authority for the actor→output table (used only to enumerate OSC devices).
        actorOutputs = derived.tree?.metadata?.actors as typeof actorOutputs;
        tree = derived.tree as unknown as ProductionTree;
        // Resolve every leaf's name now, while `bpx` (and its grammar symbol
        // table) is in scope. Guarded inside the helper — never throws here.
        symbolNames = buildSymbolNames(bpx, derived.tree);
      } catch (err) {
        log({ runtime: id, level: 'error', msg: `derive: ${String(err)}` });
        throw err;
      }

      if (!tokens || tokens.length === 0) {
        const msg = 'derivation produced no tokens';
        log({ runtime: id, level: 'error', msg });
        throw new Error(`${id}: ${msg}`);
      }

      // FULL production readout (Romain's request): publish the WHOLE derived
      // sequence now, BEFORE any STEP slicing or time-scheduled playback, so the
      // production views (Text/Timeline, now runtime-ui reading the Kairos tree)
      // see the entire production at once. KAI-10: the host computes no note-vs-text
      // "sounding" flag anymore — that classification is runtime-ui's, off `content.sounds`
      // graven by Kairos; the host only hands down the raw tokens + tree.
      // `beatDurSec` (`60/bpm`) is the STEP unit. The grammar derived at
      // `currentBpm`, so every beat boundary on the produced timeline is one
      // beat of the clock — STEP advances one of those at a time.
      const beatDurSec = currentBpm > 0 ? 60 / currentBpm : 0;
      // Per-section leaf counts (from the AST head rule) so the visualizer draws
      // the REAL section boundaries off the tree's leaf spans, not an equal split.
      // Empty for `.gr` (no AST) or an unmappable macro shape → equal-split fallback.
      const leafCounts = sectionLeafCounts(ast);
      publishProduction(id, tokens, headSections ?? [], beatDurSec, tree, symbolNames, leafCounts);

      // PRODUCE-only (scene opened/loaded/armed, not played) — Model C: a LOAD is a content
      // change, so it must BUILD + PERSIST the Kronos handle (timeline) so the FIRST Play is a
      // replay (zero re-derivation), exactly as the architect rule demands. We therefore fall
      // THROUGH the same build path as a real play, but in BUILD-ONLY mode: `startKronosAudio`
      // constructs the machine + timeline WITHOUT playing (transport 'stopped', driver not
      // started → no sound, no audio-context wake), and the handle is registered. The publish /
      // teardown below is the SAME as a full eval's (the synthetic `default` orchestration makes
      // mono scenes go through this block too). `buildOnly` is consumed at the audio edges only.
      const buildOnly = !!src.produceOnly;

      // STEP: when a beat is requested, audition exactly ONE beat of the REAL
      // production, IN PLACE — NOT a sliced + re-zeroed copy. We keep the FULL
      // timeline (full tokens, full treeEvents, real scene times, full CV windows)
      // and ask Kronos to seek to the beat's scene-second and stop after one beat
      // (clock.start + scheduler.start = seek; a timed driver.stop ends the beat).
      // This way the modulation at that beat is EXACTLY what full Play would sound
      // there (no envelope shrink-to-note, no muted successive steps). Otherwise
      // loop the whole derivation when the transport's LOOP toggle is on (default).
      // `section.index` is the beat index (the `section` field is reused as a
      // generic step window).
      const section = src.section;
      const isStep = !!(section && section.count > 1);
      const looping = !section && transport.loop;
      // Re-derive at each cycle only when looping AND re-random is on — re-rolls
      // the grammar's weighted/random choices tour to tour (vs replaying the same
      // derivation). Snapshotted here at start time off the session toggle.
      const reRandom = looping && transport.reRandom;
      // Resume-from-step offset (STEP → Play): the transport machine set
      // `resumeBeat` before triggering Play; start the loop at that beat instead of
      // the top, then consume it (one-shot). Only for a looping, non-STEP start.
      const startOffsetSec =
        !section && resumeBeat != null && resumeBeat > 0 && currentBpm > 0
          ? resumeBeat * (60 / currentBpm)
          : 0;
      if (!section) resumeBeat = null;
      // The beat's position on the REAL (full-production) timeline + its duration:
      // one beat = 60/bpm s, at `section.index * (60/bpm)` — the same beat grid the
      // flat slice used (`round(start / (60000/bpm)) === index`). The full timeline
      // is seeked here, so the beat's note(s) keep their true scene onset and CV.
      const beatDurSecStep = currentBpm > 0 ? 60 / currentBpm : 0;
      const stepWindow = isStep
        ? { fromSec: section!.index * beatDurSecStep, durSec: beatDurSecStep }
        : undefined;

      const key = srcKey(src);
      const prev = voices.get(key);
      if (prev) {
        prev.kronosAudio?.stop();
        prev.dispatcher.stop();
      }
      // Loading a DIFFERENT program: stop the previous ORCHESTRATOR's dispatcher.
      // Its `loop:true` keeps re-firing its code voices (re-evaluating the Hydra
      // patch each cycle), so hushing the canvas once is useless — the next cycle
      // re-lights it. The fix that the per-actor disarm relies on is to STOP THE
      // RE-FIRING, i.e. stop the dispatcher. We read the source `file` straight off
      // each `voices` entry (self-contained — no dependency on the per-actor handle
      // map, which the previous attempt relied on and which can be empty here). Only
      // orchestrator dispatchers are stopped: a plain mono grammar from another
      // file is left alone so a sibling re-eval / a multi-actor `.bps` doesn't cut
      // unrelated voices. A re-eval of the SAME
      // file keeps its own dispatcher (it was already replaced via `prev` above).
      const outgoingCodeSlots: Array<{ runtime: Runtime; actorId: string }> = [];
      for (const [vKey, v] of voices) {
        if (vKey === key) continue;
        if (v.orchestrator && v.file !== undefined && v.file !== src.fileId) {
          v.kronosAudio?.stop();
          v.dispatcher.stop();
          if (v.codeSlots) outgoingCodeSlots.push(...v.codeSlots);
          voices.delete(vKey);
        }
      }
      // Hush the outgoing orchestrator's code runtimes (Hydra canvas/rAF, Strudel
      // audio) AFTER its dispatcher is stopped — so a fire that was in flight at
      // stop time can't leave the canvas lit with nothing left to clear it.
      if (outgoingCodeSlots.length > 0) {
        const { getAdapter } = await import('./registry');
        for (const slot of outgoingCodeSlots) {
          await getAdapter(slot.runtime)
            ?.stop({ actorId: slot.actorId, fileId: slot.actorId }, log)
            .catch(() => {});
        }
      }

      // BUILD-ONLY (produce/load) must NOT wake the audio: take the context WITHOUT resuming
      // it (`peekCtx`). A real play resumes via `getCtx()`. The built handle stays silent until
      // the first Play's `replay` resumes the context (the `__replay__` sentinel does so).
      const ctx = buildOnly ? peekCtx() : await getCtx();
      const dispatcher = new Dispatcher(ctx);

      // Orchestrator-only: BT token → owning actor (rule LHS), and the live set
      // of disarmed actors (consulted by the backtick sink + the per-actor note
      // gate). Per-eval — a re-eval rebuilds them. A code voice evaluates into a
      // distinct slot `<fileId>::<actor>` so arm/disarm can stop just that voice.
      const isOrchestrated = !!(orchestration && orchestration.actors.length > 0);
      // actor → BT token (rule LHS → its backtick). The sink needs the INVERSE
      // (token → actor) to find which voice a fired BT belongs to; `evalCode`
      // (re-arm) needs actor → token. Build both from the one extraction.
      const actorToBt = isOrchestrated ? btTokenByActor(ast) : {};
      const btToActor: Record<string, string> = {};
      for (const [actor, token] of Object.entries(actorToBt)) btToActor[token] = actor;
      const mutedActors = new Set<string>();
      const slotForActor = (actor: string) => `${src.fileId}::${actor}`;

      // Backtick voices (lot 4): route each `BT<interp><id>` terminal to its
      // interpreter, fired in time by the dispatcher. Registered before load so
      // both the orchestrated and the simple path place backticks correctly.
      let backtickHandles:
        | { isBacktick: (t: string) => boolean; sink: (t: string) => void }
        | undefined;
      if (backticks && Object.keys(backticks).length > 0) {
        backtickHandles = registerBacktickSink(
          backticks,
          id,
          src,
          log,
          isOrchestrated ? { btToActor, mutedActors, slotForActor } : undefined
        );
      }

      // Orchestrator `.bps`: each `@actor` owns an alphabet and a transport
      // (an @devices appliance). The dispatcher routes each note by its OWN
      // `payload.actor` (off the tree) → actor → transport; there is no flat
      // symbol→actor map. MIDI is silent-but-safe without hardware.
      if (orchestration && orchestration.actors.length > 0) {
        // Device GATE (DEVICES_SPEC §3/§4, ADAPTER_SPEC §1bis b): resolve every
        // voice's appliance and verify type compatibility BEFORE routing/start.
        // An unknown appliance or an incompatible voice throws a clear eval error
        // (logged AND thrown so the promise rejects) — never a silent skip. Done
        // up-front for all actors so a later voice's rejection doesn't leave the
        // earlier ones already playing.
        // A `.gr` (like any mono scene) plays AUDIO by default: its synthetic `default`
        // actor keeps `transport:audio` and MUST be audible. MIDI is an EXPLICIT choice
        // (`@actor … transport:midi`) — never auto-routed off a granted Web MIDI port,
        // which used to make every `.gr` SILENT on a machine that simply HAS a MIDI port.
        const devices = new Map<string, Device>();
        for (const actor of orchestration.actors) {
          devices.set(
            actor.name,
            await gateVoiceDevice(actor.name, actor.transportKey, actor.evalInterp, id, log)
          );
        }

        // MIDI SINK — built ONCE and handed to Kronos as the 'midi' sink. The host NAMES no
        // route and chooses no sink: each event carries its `output.runtime` (graven by Kairos
        // from `metadata.actors`), and Kronos routes on it. The MidiTransport stays registered
        // on the dispatcher for LIFECYCLE only (`dispatcher.stop()` closes it) — never read for
        // routing. AUDIO + OSC sinks are built inside `startKronosAudio` (they need the shared
        // clock); the OSC device enumeration is derived there from `metadata.actors`.
        // KAI-10 — no host resolver: the MIDI sink reads `event.pitch.hz` (graven by Kairos)
        // and derives note+bend from it; its own token→Hz resolver is now only a stand-in.
        let midi: InstanceType<typeof MidiTransport> | undefined;
        for (const actor of orchestration.actors) {
          if (devices.get(actor.name)!.type === 'midi' && !midi) {
            midi = new MidiTransport({});
            await midi.init().catch(() => {}); // no hardware → silent, never throws
            dispatcher.addTransport('midi', midi); // lifecycle: dispatcher.stop() closes it
          }
        }
        // Per-actor routing (KAI-9): each note carries its OWN output layer — Kairos
        // graves `event.output` ({runtime, channel?, device?}) from the tree's
        // `metadata.actors`, and Kronos routes each event to the sink registered under
        // `output.runtime`. A terminal shared by two actors ('sitar.Sa' vs 'tabla.Sa')
        // routes to DISTINCT sinks via its own `output`; Kanopi reads no actor→transport
        // map and chooses no sink.
        //
        // The dispatcher is now ONLY the inert resolver structure (per-actor pitch
        // resolvers) + the MIDI transport's lifecycle owner; it NEVER emits, carries no
        // timeline, and is NOT read for routing. The PLAYED timeline is the Kairos
        // projection (bound on the Transport). Live mute is the shared `mutedActors` set
        // (consulted by the backtick sink) + `kairos.demande` for the note voices — no
        // host event pre-filtering. Code voices (Strudel/Hydra backticks) fire via the
        // Kronos adapter's `'code'` sink (interpreter from `output.device`).
        let kronosAudio: KronosAudioHandle | undefined;
        // Kronos is the ONLY engine (legacy removed): it drives notes + CV + the code
        // voices, routing each event on its own `output.runtime`. The dispatcher is NEVER
        // started as an emitter — it remains purely the inert resolver structure.
        {
          // KAN-orchestration P1 — RE-RANDOM re-derive on the Kairos path. This closure is
          // what Kronos fires at each loop edge (`StructureSource.auBord` → `cb`): it
          // re-derives the grammar with a FRESH seed (re-rolling `@mode:random` / weighted
          // rules) and `charger`s the new tree → Kairos bumps its generation → Kronos
          // re-pulls + swaps the new flat at that same edge (quantized).
          //
          // Built UNCONDITIONALLY (not gated by `reRandom` here) and handed to
          // `startKronosAudio` as `reDeriveKairos`: that centralizes the arming —
          // `startKronosAudio` installs it via `kairos.setReDerive(reRandom && loop ? cb : null)`
          // at construction AND re-arms it on every live `setReRandom`/`setLoop` toggle, so
          // flipping re-random mid-play now takes effect (the old direct `setReDerive` here
          // armed only at load). The legacy `reDeriveTreeEvents` (→ DispatchEvents) stays dormant.
          const reDeriveKairos = (): void => {
            try {
              // Fresh-seed re-derivation — identical opts to the eval path + the dormant
              // `reDeriveTreeEvents`, only the random draw differs.
              const rbpx: Session = createSession(ast, {
                ...(currentBpm !== undefined ? { tempo: currentBpm } : {}),
                ...(settings !== undefined ? { settings } : {}),
                ...(effectiveFlags !== undefined ? { initialFlags: effectiveFlags } : {}),
                seed: freshSeed()
              });
              const rtree = rbpx.derive().tree;
              // Re-charge Kairos with the NEW tree + a context rebuilt from the NEW session
              // (resolvers/kpress/order) + the cycle-invariant CV registry (KRO-24 — Kairos
              // composes the modulations at flatten) + B03 transpose (same scene resolver;
              // alphabet/tuning are identical across cycles). The generation bump makes
              // Kronos re-pull this fresh flat at the edge.
              kairos!.charger(
                rtree as unknown as Parameters<Kairos['charger']>[0],
                {
                  ...(rbpx.buildProjectionContext() as object),
                  // KAI-10 — same read-only catalogs on every re-derive (cycle-invariant).
                  pitchLib: PITCH_LIB,
                  // KAI-10 — sound transpose in Kairos; host lends no transposeToken.
                  modulation: { registry: kronosRegistry, exprSource: onExprSource }
                } as unknown as Parameters<Kairos['charger']>[1]
              );
              // Same instance re-charger'd → bump generation so the views re-render.
              productionFeed.swapped();
              // Refresh the Structure/Text view so it shows THIS cycle's variation
              // (display only — mirrors what the dormant `reDeriveTreeEvents` publishes).
              const rnames = buildSymbolNames(rbpx, rtree);
              const rtokens = rbpx
                .emit<BpxTimedToken[]>('timed-tokens')
                .filter((t) => t.type !== 'control');
              publishProduction(
                id,
                rtokens,
                headSections ?? [],
                beatDurSec,
                rtree as unknown as ProductionTree,
                rnames,
                sectionLeafCounts(ast)
              );
            } catch (err) {
              // On any failure, do NOT charger — Kairos keeps the current flat and Kronos
              // replays it (no silent gap, no crash at the loop edge).
              log({ runtime: id, level: 'warn', msg: `re-random derive failed: ${String(err)}` });
            }
          };
          // Kronos drives notes + per-note CV for the scene. The host no longer judges
          // "does this sound" — every terminal is dispatched as a note and the RESOLUTION
          // decides (an unresolved token is silent at the sink). Routing is by each event's
          // OWN `output.runtime` (graven by Kairos from `metadata.actors`): Kanopi only
          // REGISTERS the per-runtime sinks ('midi' here, 'audio'/'webaudio'/'osc'/'code'
          // built inside startKronosAudio) — it chooses no route and keeps no actor→transport
          // map. The `default`/mono case carries `output.runtime='audio'` from the AST.
          kronosAudio = startKronosAudio({
            audioCtx: ctx,
            derivedTempo: currentBpm,
            // Beats-per-bar PROJECTED from the derived meter (BPx authority). The handle
            // folds bar/beat with it and surfaces it to the cursor store (onBar events).
            beatsPerBar: sceneBeatsPerBar,
            // LOOP BOUND = BPx authority. The compiled scene length in beats
            // (`totalDurationBeats`, includes any trailing rest) × the effective
            // beat duration (`beatDurSec = 60/currentBpm`, the same projected tempo)
            // gives the scene-seconds loop length. This PROJECTS the engine's
            // compiled length; the timeline's reduce(max)-of-last-event becomes a
            // pure repli for paths where the engine omits `totalDurationBeats`.
            durationSec:
              totalDurationBeats != null && beatDurSec > 0
                ? totalDurationBeats * beatDurSec
                : undefined,
            loop: looping,
            // Per-runtime OUTPUT SINKS the host builds: only MIDI (per-actor resolver). The
            // 'audio'/'webaudio' (AudioRuntime) and 'osc' (OscAdapter) sinks are built inside
            // startKronosAudio (they need the shared clock).
            sinks: midi
              ? ({ midi } as unknown as Parameters<typeof startKronosAudio>[0]['sinks'])
              : undefined,
            // The actor→output table (BPx authority) — used ONLY to enumerate the OSC devices
            // at setup. Per-event device/channel/runtime rides `event.output`.
            actors: actorOutputs,
            startSceneSec: startOffsetSec,
            // KAI-10 — no host pitch resolver fed to the outputs. The AudioRuntime reads
            // `content.pitch.hz` (graven by Kairos) off each event; MIDI/OSC likewise. The
            // host stopped resolving token→Hz (the audio fallback is retired in the final
            // pitch-module cleanup).
            // OSC output (OSC-5b): the relay WS URL. startKronosAudio builds the OscAdapter
            // (it needs the shared clock) when the scene has OSC actors (from `metadata.actors`).
            oscWsUrl: (routingJson as { osc?: { ws?: string } })?.osc?.ws,
            // Model C — PRODUCE/LOAD builds + persists the handle WITHOUT playing it (stopped,
            // silent); the first Play `replay`s it (0 re-derivation). A STEP overrides this.
            buildOnly,
            // Kairos is the SOURCE of the played timeline: its `sourceStructure()` is bound
            // on the Transport (PULL), the driver ticks the Transport, tempo/mute route via
            // `kairos.demande`. Kanopi builds NO timeline from events — the single read path
            // is the tree → Kairos projection.
            kairos,
            // RE-RANDOM re-derive: `startKronosAudio` installs it on Kairos (`setReDerive`)
            // gated by `reRandom && loop`, AND re-arms it on every live `setReRandom`/`setLoop`
            // toggle. A STEP never re-derives (no loop), so omit it there.
            reDeriveKairos: section || stepWindow ? undefined : reDeriveKairos,
            reRandom,
            step: stepWindow,
            // Kronos is the single emitter: a code voice is routed by `output.runtime==='code'`
            // (graven by Kairos) to the 'code' sink — the SAME backtick sink the legacy
            // dispatcher used. No host-side `isBacktick` token sniff anymore.
            backtickSink: backtickHandles?.sink as KronosAudioOptions['backtickSink'],
            stopCodeVoices: () => {
              for (const a of orchestration.actors) {
                void orchestratedVoices.get(a.name)?.stopCode?.();
              }
            },
            refireCodeVoices: () => {
              for (const a of orchestration.actors) {
                orchestratedVoices.get(a.name)?.evalCode?.();
              }
            },
            log: (m) => log({ runtime: id, level: 'info', msg: `[kronos] ${m}` })
          });
          // The timeline reads ITS playhead (aligned to the heard audio), as on mono.
          kronosCursor.set(kronosAudio);
          // The production views read the LIVE Kairos tree/flat off this same eval.
          productionFeed.set(kairos ?? null);
        }
        // Code-voice slots of THIS orchestrator (hydra/strudel + their per-actor
        // slot id), recorded on the dispatcher entry so a LATER program can hush
        // them after stopping this dispatcher (covers a fire in flight at stop).
        const codeSlots: Array<{ runtime: Runtime; actorId: string }> = [];
        voices.set(key, {
          dispatcher,
          file: src.fileId,
          orchestrator: true,
          codeSlots,
          kronosAudio
        });

        // Publish the actor list to the Actors panel (groove + viz, …) and
        // register a live arm/disarm handle per actor. A code voice (Strudel/
        // Hydra) is stopped/re-evaluated through its own adapter + slot; a native
        // notes voice is muted via Kronos's scheduler (`kronosAudio.setActorMuted`)
        // + the shared `mutedActors` set. The handle map is keyed by actor name and
        // replaced on each re-eval.
        // Tear down the OUTGOING program's code voices (a previous orchestrator's
        // Hydra canvas + its rAF loop, Strudel audio) before registering this one's
        // — loading a new program must not leave the old scene's voices rendering
        // on top. Keep this file's own voices (a re-eval of the SAME orchestrator).
        await tearDownOutgoingVoices(src.fileId);
        const published: PublishedActor[] = [];
        // A synthetic `default` actor (plain scene, no `@actor`) is never shown nor
        // armed: publish an empty list (the panel clears, as the old mono path did) and
        // register no per-actor handle. Real orchestrators publish every actor.
        for (const actor of orchestration.synthetic ? [] : orchestration.actors) {
          const codeRuntime = actor.evalInterp ? runtimeForInterp(actor.evalInterp) : undefined;
          if (codeRuntime)
            codeSlots.push({ runtime: codeRuntime, actorId: slotForActor(actor.name) });
          published.push({ name: actor.name, runtime: codeRuntime ?? id, file: src.fileId });
          const btToken = actorToBt[actor.name];
          orchestratedVoices.set(actor.name, {
            file: src.fileId,
            setNoteMuted: (muted: boolean) => {
              // The live mute set is the single source of truth per re-derive cycle
              // (consulted by `orchestratedLive` + the backtick sink).
              if (muted) mutedActors.add(actor.name);
              else mutedActors.delete(actor.name);
              // Kronos drives the notes, so the live mute must reach ITS scheduler.
              kronosAudio?.setActorMuted(actor.name, muted);
            },
            stopCode: codeRuntime
              ? () =>
                  import('./registry').then(({ getAdapter }) =>
                    getAdapter(codeRuntime)?.stop(
                      { actorId: slotForActor(actor.name), fileId: src.fileId },
                      log
                    )
                  )
              : undefined,
            // Re-arm a code voice by re-firing it now (the dispatcher's loop also
            // re-fires the BT token on the next cycle, but evaluating immediately
            // restores sound without waiting a full cycle). No BT token → no-op.
            evalCode:
              codeRuntime && btToken && backticks?.[btToken]
                ? () => {
                    const entry = backticks[btToken];
                    void import('./registry').then(({ getAdapter }) => {
                      void getAdapter(codeRuntime)
                        ?.evaluate(
                          entry.code,
                          { actorId: slotForActor(actor.name), fileId: src.fileId },
                          log
                        )
                        .catch(() => {});
                    });
                  }
                : undefined
          });
        }
        onActorsFromGrammar?.(published, src.fileId);

        log({
          runtime: id,
          level: 'info',
          msg: `orchestrated [${key}] (${orchestration.actors.length} actors)`
        });
        emitLifecycle('eval', src.fileId);
        return;
      }
    },
    setBpm(bpm: number, _log: LogPush) {
      currentBpm = bpm;
      // Record the user's LOCAL tempo (D10): it becomes the pre-derive INPUT for the
      // NEXT eval of a scene that declares no `@mm` (a declared `@mm` still wins). This
      // is the only legitimate host-owned tempo — user input — never a fabricated default.
      // Skip when this `setBpm` is the re-entrant fan-out of a derivation's OWN effective
      // tempo (`projectingGrammarTempo`): a scene's projected tempo is not user input and
      // must not seed the next no-`@mm` scene.
      if (!projectingGrammarTempo) userTempo = bpm;
      // Live retune every running voice WITHOUT re-deriving (requirement A): Kronos
      // drives the audio, so the retune reaches ITS clock (same warp, no re-derivation;
      // mirrors the re-random / loop live-toggle wiring). `currentBpm` still updates so
      // the NEXT derivation uses the new tempo. The dispatcher carries no tempo any more.
      for (const voice of voices.values()) {
        voice.kronosAudio?.retune(bpm);
      }
      // The MIDI sink owns its own internal dispatcher (runtime-midi private); we
      // don't reach into it to retune live. Its timing comes from the tokens it
      // was loaded with at the previous tempo, so a tempo change takes effect on
      // the next eval (re-derivation at the new `currentBpm`). Consistent with the
      // integration rule: no poking upstream internals.
    },
    async stop(src: EvalSource, log: LogPush) {
      const key = srcKey(src);
      // Model C — STOP-IN-PLACE sentinel (transport Stop button). Return every live scene's
      // playhead to 0 and cut its sound + code voices, but KEEP the handle: the derived
      // timeline PERSISTS in Kronos, only the head moves. We do NOT clear `voices`,
      // `kronosCursor`, or `orchestratedVoices` — `kronosCursor.active` stays the same handle
      // and its `transport.state` flips to 'stopped' (the mirror updates via onStateChange, so
      // `playback.mode` reads 'stopped' correctly while the handle lives). A later `__replay__`
      // restarts the SAME scheduler with ZERO re-derivation.
      if (key === '__stop_in_place__') {
        for (const voice of voices.values()) {
          voice.kronosAudio?.stopInPlace();
          // NOTE: dispatcher.stop() is NOT called — it would `close()` the WebAudio transport
          // and clear its node map; `stopInPlace` already cut the sounding nodes via
          // `transport.stop()`, and the dispatcher must stay the inert resolver/transport
          // structure Kronos reads on replay. The code voices are cut inside `stopInPlace`.
        }
        log({ runtime: id, level: 'info', msg: 'stop in place (handle kept)' });
        emitLifecycle('stop', src.fileId);
        return;
      }
      // Model C — REPLAY sentinel (Play from a STOPPED-in-place scene). Restart the persisted
      // handle from 0 with no eval. Only replays handles whose transport is 'stopped' (a
      // running/paused handle is left untouched — Play-from-paused is the resume path, handled
      // in the store, not here).
      if (key === '__replay__') {
        // WAKE the audio context first: a build-only (produce/load) handle left it
        // suspended (no wake on load, by design), and a Stop-in-place may have parked it
        // too — the WebAudio transport schedules against `currentTime`, frozen while
        // suspended, so `replay` would queue notes that never sound. This Play is a user
        // gesture, so resuming is allowed. `getCtx()` resumes if suspended (no-op if running).
        await getCtx();
        for (const voice of voices.values()) {
          if (voice.kronosAudio?.transport.state === 'stopped') voice.kronosAudio.replay();
        }
        log({ runtime: id, level: 'info', msg: 'replay active scene (no derive)' });
        emitLifecycle('eval', src.fileId);
        return;
      }
      // `__hush__` is the core's "stop everything" sentinel (transport stop,
      // Ctrl+. panic): no single voice matches it, so we tear down every live
      // dispatcher. Without this, stopping the transport left playback looping.
      if (key === '__hush__') {
        // EXPLICIT stop → cut the sustained code voices (Strudel/Hydra). This is the
        // single place a transport Stop kills them; the per-handle stop does NOT (a
        // same-file re-eval reuses that handle's stop to drop only its note timeline,
        // keeping the code voice). Cut BEFORE clearing the map so each slot is reached.
        for (const h of orchestratedVoices.values()) void h.stopCode?.();
        for (const voice of voices.values()) {
          voice.kronosAudio?.stop();
          voice.dispatcher.stop();
        }
        voices.clear();
        // Stop everything → no live handle, so the kronos-cursor store reads `null`
        // and the timeline cursor + bar·beat display fall back to rest (001·01.00).
        kronosCursor.set(null);
        productionFeed.set(null);
        // "Stop everything" also FORGETS the live orchestrated-voice handles: every
        // dispatcher is down and the core hushes every code runtime alongside this
        // call, so a lingering handle would only let a stale voice be torn down /
        // re-armed later. Clearing keeps the global map honest (and stops it
        // leaking handles across re-evals).
        orchestratedVoices.clear();
        log({ runtime: id, level: 'info', msg: 'hush (all voices)' });
        emitLifecycle('stop', src.fileId);
        return;
      }
      const voice = voices.get(key);
      if (voice) {
        if (voice.kronosAudio) {
          kronosCursor.set(null);
          productionFeed.set(null);
        }
        voice.kronosAudio?.stop();
        voice.dispatcher.stop();
        voices.delete(key);
      }
      log({ runtime: id, level: 'info', msg: `stop [${key}]` });
      emitLifecycle('stop', src.fileId);
    },
    async dispose() {
      for (const voice of voices.values()) {
        try {
          voice.kronosAudio?.stop();
          voice.dispatcher.stop();
        } catch {
          /* engine may already be torn down */
        }
      }
      voices.clear();
      kronosCursor.set(null);
      productionFeed.set(null);
    }
  };
}

// `.gr` keystone (Bol Processor native grammar) and `.bps` (BPScript) — same
// engine, different front-end. Created here so both register their live
// transport-updaters before the sinks below are wired.
export const bp3Adapter: RuntimeAdapter = makeBpxAdapter('bp3', ['.gr'], grFrontend);
export const bpscriptAdapter: RuntimeAdapter = makeBpxAdapter('bpscript', ['.bps'], bpsFrontend);

// Wire the transport toggles to the live updaters: flipping loop / re-random now
// reaches the playing dispatchers immediately (effective at the next cycle).
transport.setReRandomSink(setReRandomLive);
transport.setLoopSink(setLoopLive);
