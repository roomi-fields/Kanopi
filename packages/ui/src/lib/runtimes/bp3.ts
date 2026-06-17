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
import { createBPx } from 'bpx';
import { BUNDLED_SE, BUNDLED_SOUND, BUNDLED_AL } from './bp3-aux';
// MIDI output sink for the beta-ensemble. runtime-midi OWNS the ISO-BP3 MIDI
// path (hub/contrats/kanopi-runtime-midi.md); Kanopi feeds it the SAME raw BPx
// timed tokens it sends to the WebAudio dispatcher, on the SAME AudioContext
// clock, and runtime-midi emits the MIDI bytes. Consumed AS-IS — no
// reimplementation of the MIDI transport here.
import { MidiSink } from 'runtime-midi';
// Core runtime, reused AS-IS (no port): the dispatcher schedules timed tokens
// on the WebAudio transport; the resolver turns pitch names into frequencies.
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';
import { WebAudioTransport } from '../../../../core/src/dispatcher/transports/webaudio.js';
// Per-actor MIDI transport for orchestrator .bps (a voice routed `transport:midi`).
import { MidiTransport } from '../../../../core/src/dispatcher/transports/midi.js';
import { Resolver } from '../../../../core/src/dispatcher/resolver.js';
// Scale engine (core): turns a `ratios`/`compose`+`junction` scale name into a
// concrete ratio list (the only pitch maths — see PITCH.md 6-layer model).
import { resolveScaleRatios } from '../../../../core/src/dispatcher/scale.js';
// Tree-derived dispatch events (M5+ multi-actor refacto): flatten BPx's
// `derive({ output: 'complete' }).tree` to ordered events that each carry their
// OWN actor/params payload, so a terminal shared by two actors routes distinctly.
import { treeToDispatchEvents, type DispatchEvent } from './tree-dispatch';
// The FULL derived production, set ONCE per eval (the complete TimedToken[] BPx
// produced at derive time, BEFORE playback). This is the whole sequence, the
// source of truth the Text panel (read by order via the tree) and the Structure
// visualizer read.
import { production } from '../../stores/production.svelte';
import type {
  ProductionToken,
  ProductionSection,
  ProductionTree,
  RawTimedToken
} from '../../stores/production.svelte';
// Device library (@devices): resolve a voice's `transport.<name>` to a typed
// device and gate voice↔device compatibility BEFORE routing (DEVICES_SPEC §3,
// §4 / ADAPTER_SPEC §1bis b). Kanopi owns resolution; bpscript carries the
// name opaque.
import { resolveDevice, isCompatible, type Device } from '../devices/registry';
import type { VoiceOutputType } from './adapter';
// `@library.<engine>` bank loading: resolve a declared bank id to its source and
// load it through the SAME Strudel `samples()` path a `.kanopi` `@library`
// session used. Consumed AS-IS — the adapter only maps ids → loader.
import { findBank } from '../library/audio-banks';
import { loadSampleBank } from './strudel';
// Head-rule sections read from the BPScript AST (`compileBPS().ast`), the single
// source of truth — replacing the deprecated regex-on-grammar-text reader for the
// `.bps` path. The `.gr` path keeps the local text reader (it never compiles
// through BPScript, so it has no AST — see `headSectionNames` below).
import { headSectionNamesFromAst } from './head-sections-ast';

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
 *     → tree (+ payload par nœud) → treeToDispatchEvents → Dispatcher.loadEvents
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

// Western 12-TET resolver config. BP3 grammars in the slice use pitch names
// like `C4 D4 E4`; the resolver needs an alphabet + tuning + temperament to
// turn them into frequencies. This is a fixed default for the slice (the
// language's own alphabet/scale system is a SECONDARY concern).
const TWELVE_TET = Array.from({ length: 12 }, (_, i) => Math.pow(2, i / 12));
function makeWesternResolver(): Resolver {
  return new Resolver({
    alphabet: { notes: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], alterations: { '#': 1, b: -1 } },
    octaves: {
      position: 'suffix',
      separator: '',
      registers: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
      default: 4
    },
    tuning: { degrees: [0, 2, 4, 5, 7, 9, 11], baseHz: 440, baseNote: 'A', baseRegister: 4 },
    temperament: { divisions: 12, period_ratio: 2, ratios: TWELVE_TET }
  });
}

// Solfège 12-TET resolver — same grid, do/re/mi note names. Many BP3 grammars
// (Bol Processor heritage) emit French solfège terminals (`do3`, `fa#3`,
// `sol4`); the western resolver leaves those untouched, so a sealed transpose
// would never reach their pitch. Same degrees as western (do=la-relative C),
// la = A440. This is a BP3-naming concern kept in the BP3 adapter, NOT woven
// into the clean core resolver (guardrail: ISO-BP3 stays isolated).
const SOLFEGE_NOTES = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
function makeSolfegeResolver(): Resolver {
  return new Resolver({
    alphabet: { notes: SOLFEGE_NOTES, alterations: { '#': 1, b: -1 } },
    octaves: {
      position: 'suffix',
      separator: '',
      registers: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
      default: 4
    },
    tuning: { degrees: [0, 2, 4, 5, 7, 9, 11], baseHz: 440, baseNote: 'la', baseRegister: 4 },
    temperament: { divisions: 12, period_ratio: 2, ratios: TWELVE_TET }
  });
}

// Pick the resolver matching the grammar's note naming. BP3 grammars are either
// western (`C4`) or solfège (`do4`); a derivation is homogeneous, so the first
// pitched terminal decides. Solfège names are checked longest-first so `sol`
// isn't shadowed by `so`/`s`. Falls back to western (the slice default).
function pickResolver(tokens: { token: string }[]): Resolver {
  const solfegeHead = /^(do|re|mi|fa|sol|la|si)([#b]|\d|$)/;
  for (const t of tokens) {
    if (solfegeHead.test(t.token)) return makeSolfegeResolver();
    if (/^[A-G]([#b]|\d|$)/.test(t.token)) return makeWesternResolver();
  }
  return makeWesternResolver();
}

// Minimal shapes of the bpscript catalogs this adapter reads (they carry more
// fields; only what the Resolver / scale engine needs is typed). The 6-layer
// model (PITCH.md): alphabets, octaves, temperaments, scales, tunings (bindings).
//
// A tuning binding carries the `temperament` it pairs with, the `alphabet` it
// belongs to, and either `degrees`/`ascending` (western mode) or a `scale`
// reference. A scales entry carries `ratios`, `compose`+`junction`, OR
// `degrees` — never two at once (PITCH.md «une représentation»).
type TuningEntry = {
  temperament?: string;
  alphabet?: string;
  scale?: string;
  degrees?: number[];
  ascending?: number[];
  baseHz?: number;
  baseNote?: string;
  baseRegister?: number;
};
type AlphabetEntry = { notes?: string[]; octaves?: string };
// The catalogs carry doc-only `_comment` keys (arrays), so a direct cast to the
// typed record doesn't structurally overlap — go through `unknown` (the catalogs
// are read-only data, validated at use).
const ALPHABETS = alphabetsJson as unknown as Record<string, AlphabetEntry | undefined>;
const TUNINGS = tuningsJson as unknown as Record<string, TuningEntry | undefined>;
const TEMPERAMENTS = temperamentsJson as unknown as Record<string, unknown>;
const SCALES = scalesJson as unknown as Record<string, unknown>;
const OCTAVES = octavesJson as unknown as Record<string, unknown>;

// When a scene declares an alphabet but NO `@tuning`, pick the binding whose
// `alphabet` field matches (each alphabet has one in tunings.json). Used for
// bohlen-pierce.bps (→ bohlen_pierce_just) and gamelan.bps (→ gamelan_slendro).
function defaultBindingKey(alphabetKey: string): string | undefined {
  for (const [key, t] of Object.entries(TUNINGS)) {
    if (key.startsWith('_') || !t) continue;
    if (t.alphabet === alphabetKey) return key;
  }
  return undefined;
}

// Build the Resolver from a tuning BINDING (degrees + temperament grid). This is
// the classic western/indian/gamelan path — the binding indexes a temperament's
// fixed ratio grid via its `degrees`. Returns null if the temperament is absent.
function resolverFromBinding(
  alphabet: AlphabetEntry,
  octaves: unknown,
  tuning: TuningEntry
): Resolver | null {
  const temperament = tuning.temperament ? TEMPERAMENTS[tuning.temperament] : undefined;
  if (!temperament) return null;
  return new Resolver({ alphabet, tuning, temperament, octaves });
}

// Build the Resolver from a SCALE that carries intrinsic intonation (`ratios`)
// or is a composed maqam (`compose`+`junction`). The core scale engine computes
// the concrete ratios; the resolver then runs in table mode over them, with the
// alphabet's notes laid on consecutive degrees [0..N-1] and the scale's period
// (last ratio, octave by default) as `period_ratio`. `binding` is the optional
// tunings.json entry that supplies baseHz/baseNote/baseRegister; sensible
// defaults (440 / first note / register 4) apply when none is given.
function resolverFromScale(
  alphabet: AlphabetEntry,
  octaves: unknown,
  scaleName: string,
  binding: TuningEntry | undefined
): Resolver | null {
  const ratios = resolveScaleRatios(scaleName, SCALES);
  if (!ratios || ratios.length === 0) return null;
  const notes = alphabet.notes ?? [];
  const period = ratios[ratios.length - 1] || 2;
  const degrees = notes.map((_, i) => i);
  const tuning = {
    degrees,
    baseHz: binding?.baseHz ?? 440,
    baseNote: binding?.baseNote ?? notes[0],
    baseRegister: binding?.baseRegister ?? 4
  };
  const temperament = { divisions: ratios.length, period_ratio: period, ratios };
  return new Resolver({ alphabet, tuning, temperament, octaves });
}

// Build a Resolver from the bpscript catalogs for a scene's declared
// `@alphabet`/`@tuning` (PITCH.md 6-layer model). Resolution of the `@tuning`
// reference Y:
//   1. Y is a BINDING (tunings.json) → degrees+temperament path (western, gamelan…),
//      OR a binding referencing a `scale` → scale-ratio path with that binding's base.
//   2. Y is a GAMME (scales.json) with `ratios`/`compose` → scale-ratio path with
//      the scale-ratio defaults (440 / first note of the alphabet / register 4).
//   3. No `@tuning` declared → the alphabet's default binding (bohlen-pierce, gamelan).
// The catalogs are consumed AS-IS; the only maths (compose+junction) lives in the
// core scale engine. Returns the resolver + the alphabet's sounding note set, or
// null when the alphabet is absent or the scale isn't resolvable (caller then
// keeps the western/solfège sniffing fallback).
export function catalogResolver(
  alphabetKey: string | undefined,
  declaredTuning: string | undefined
): { resolver: Resolver; notes: Set<string> } | null {
  if (!alphabetKey) return null;
  const alphabet = ALPHABETS[alphabetKey];
  if (!alphabet?.notes?.length) return null;
  const octaves = OCTAVES[alphabet.octaves ?? 'western'] ?? OCTAVES.western;

  let resolver: Resolver | null = null;
  if (declaredTuning) {
    const binding = TUNINGS[declaredTuning];
    if (binding) {
      // A binding either references a scale (scale-ratio path with its base) or
      // carries degrees directly (degrees+temperament path).
      resolver = binding.scale
        ? resolverFromScale(alphabet, octaves, binding.scale, binding)
        : resolverFromBinding(alphabet, octaves, binding);
    } else if (SCALES[declaredTuning]) {
      // Not a binding → a scale referenced directly (`@tuning:maqam_rast`). No
      // binding supplies the reference pitch, so the scale-ratio defaults apply
      // (440 / first note of the alphabet / register 4) — exactly the PITCH.md
      // oracle for maqam_rast on the arabic alphabet (do4 = 440).
      resolver = resolverFromScale(alphabet, octaves, declaredTuning, undefined);
    }
  } else {
    // No tuning declared → the alphabet's default binding (bohlen-pierce, gamelan).
    const defKey = defaultBindingKey(alphabetKey);
    const binding = defKey ? TUNINGS[defKey] : undefined;
    if (binding) {
      resolver = binding.scale
        ? resolverFromScale(alphabet, octaves, binding.scale, binding)
        : resolverFromBinding(alphabet, octaves, binding);
    }
  }

  if (!resolver) return null;
  return { resolver, notes: new Set(alphabet.notes) };
}

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
  // Declared scale system from the `.bps` directives: `@alphabet.<key>` →
  // `alphabet`, `@tuning:<key>` → `tuning`. The non-orchestrated WebAudio path
  // builds its pitch resolver from the bpscript catalogs when these are present
  // (bohlen-pierce, gamelan), instead of sniffing western/solfège note names.
  // Absent for `.gr` and for `.bps` that declare no alphabet.
  alphabet?: string;
  tuning?: string;
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
  alphabet: string; // 'western' | 'solfège' | …
  // Interpreter tag of a code voice (`eval.strudel`, `eval.hydra`, …), or
  // undefined for a native notes voice. Drives the voice's output type for the
  // device-compatibility gate (DEVICES_SPEC §3 / ADAPTER_SPEC §1bis b).
  evalInterp?: string;
}
interface Orchestration {
  actorTable: Record<string, unknown>;
  actors: OrchestratedActor[];
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
  return sections.length > 0 ? { ...parsed, sections } : parsed;
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

// Declared scale system from the AST directives. `@alphabet.<key>:browser`
// parses to `{ name:'alphabet', subkey:<key> }` (the alphabet key is the
// subkey); `@tuning:<key>` to `{ name:'tuning', runtime:<key> }` (the tuning key
// is in `runtime`). Both optional — a `.bps` may declare an alphabet with no
// explicit tuning (the catalog default for that alphabet then applies).
function scaleSystemFromAst(a: SceneAstView | null): { alphabet?: string; tuning?: string } {
  let alphabet: string | undefined;
  let tuning: string | undefined;
  for (const d of a?.directives ?? []) {
    const node = d as { name?: string; subkey?: string | null; runtime?: string | null };
    if (node.name === 'alphabet' && node.subkey) alphabet = node.subkey;
    else if (node.name === 'tuning' && node.runtime) tuning = node.runtime;
  }
  return { alphabet, tuning };
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

// Orchestrated actors from the AST: each `ActorDirective` → the `{ transport:
// {key, params}, alphabet, eval }` entry the adapter routes on. The dispatcher's
// `setActors` keeps only the actor KEYS + reads `def.params`/`def.transportParams`
// (absent here, as in the old sidecar → empty), so reconstructing from the AST
// nodes is behavior-identical to compileBPS's `actorTable`.
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

// `.bps` — BPScript compiles to a SceneAST (`compileBPS().ast`) that BPx derives
// directly. The front-end view (tempo, flagStates, libraries, actorTable,
// sections) is read from THAT AST — the single source of truth — not the
// deprecated grammar text nor compileBPS's redundant sidecar tables.
const bpsFrontend: Frontend = (code) => {
  const c = compileToBPxAST(code);
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
    mm: mmFromAst(a),
    // Declared `@alphabet`/`@tuning` so the WebAudio path resolves pitches from
    // the bpscript catalogs (bohlen-pierce, gamelan) rather than sniffing note
    // names. Absent keys leave the western/solfège fallback in place.
    ...scaleSystemFromAst(a)
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

  // Orchestrator `.bps`: `@actor` declarations are AST `ActorDirective` nodes (each
  // actor owns an alphabet + a transport device). When present, carry the table so
  // the adapter routes each voice to its own transport (midi / webaudio).
  const actorTable = actorTableFromAst(a);
  const names = Object.keys(actorTable);
  if (names.length === 0) return base;
  const orchestration: Orchestration = {
    actorTable,
    actors: names.map((name) => ({
      name,
      transportKey: actorTable[name]?.transport?.key ?? 'audio',
      alphabet: actorTable[name]?.alphabet ?? 'western',
      evalInterp: actorTable[name]?.eval
    }))
  };
  return { ...base, orchestration };
};

interface BP3Voice {
  dispatcher: InstanceType<typeof Dispatcher>;
  midiSink?: MidiSink;
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

/**
 * STEP windowing: keep only the tokens of ONE beat of the derivation, re-zeroed
 * in time. The STEP unit is the clock beat (`60/bpm` seconds, here `beatMs` in
 * ms), NOT the head-rule section: beat `index` covers `[index*beatMs,
 * (index+1)*beatMs)` along the dispatcher timeline, and we shift it back to t=0
 * so it plays immediately. This works for ANY derivation with a timeline (the
 * old section-slicing only made sense for a head rule with >1 section). Tokens
 * are kept by their onset falling inside the beat window.
 */
export function sliceBeat<T extends Tok>(tokens: T[], index: number, beatMs: number): T[] {
  if (!(beatMs > 0)) return tokens;
  const from = index * beatMs;
  const to = from + beatMs;
  // A token belongs to the window whose start falls inside [from, to).
  return tokens
    .filter((t) => t.start >= from - 1e-6 && t.start < to - 1e-6)
    .map((t) => ({ ...t, start: t.start - from, end: t.end - from }));
}

/**
 * STEP windowing for tree-derived dispatch events — the `sliceBeat` twin on the
 * SECONDS timeline the dispatcher loads (`treeToDispatchEvents`). Keeps only the
 * events whose onset falls inside beat `index` (`[index*beatSec, +beatSec)`) and
 * re-zeroes them to t=0 so the beat plays immediately. Same onset rule as the
 * flat `sliceBeat`, applied uniformly now that ALL grammars load via events.
 */
export function sliceBeatEvents(
  events: DispatchEvent[],
  index: number,
  beatSec: number
): DispatchEvent[] {
  if (!(beatSec > 0)) return events;
  const from = index * beatSec;
  const to = from + beatSec;
  return events
    .filter((e) => e.startSec >= from - 1e-9 && e.startSec < to - 1e-9)
    .map((e) => ({ ...e, startSec: e.startSec - from }));
}

// Build the FULL-production view from a derivation and publish it to the
// production store (the source of truth the Text panel + Structure visualizer
// read). `tokens` are the WHOLE derived sequence (ms start/end); `sounds` is the
// adapter's per-token sound predicate (note OR sounding symbol). `beatDurSec`
// (`60/bpm`) is the STEP unit — the visualizer draws the beat cursor and STEP
// advances one beat at a time off it. Section names (head-rule RHS) get
// equal-proportion time bounds along the same timeline as PASSIVE visual
// landmarks only (no longer the STEP unit). Set ONCE per eval (replace).
function publishProduction(
  id: Runtime,
  tokens: Tok[],
  sounds: (token: string) => boolean,
  sectionNames: string[],
  beatDurSec: number,
  tree?: ProductionTree,
  symbolNames?: Record<number, string>
): void {
  const durationMs = Math.max(...tokens.map((t) => t.end), 0);
  const prodTokens: ProductionToken[] = tokens.map((t) => ({
    token: t.token,
    startSec: t.start / 1000,
    durSec: (t.end - t.start) / 1000,
    sounding: sounds(t.token)
  }));
  const durationSec = durationMs / 1000;
  const count = sectionNames.length;
  const sections: ProductionSection[] =
    count > 1
      ? sectionNames.map((name, i) => ({
          name,
          startSec: (i * durationSec) / count,
          endSec: ((i + 1) * durationSec) / count
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

// One-shot info when no MIDI output port is present (the normal headless / no
// hardware case): WebAudio still plays, so this is informational, not an error,
// and we log it once to avoid spamming on every eval. Shared across both
// adapters — the MIDI availability of the machine is a global fact.
let midiUnavailableLogged = false;

// Probe Web MIDI permission ONCE (cached). Without MIDI access, requestMIDIAccess
// rejects (NotAllowedError); we record that and never construct a MidiSink —
// runtime-midi's transport logs a console.error on denial (transports/midi.js:49),
// pure noise on a machine without MIDI. Probing ourselves keeps that denial silent.
let midiProbe: Promise<boolean> | undefined;
function webMidiAvailable(): Promise<boolean> {
  if (!midiProbe) {
    const req = (navigator as Navigator & { requestMIDIAccess?: () => Promise<unknown> })
      .requestMIDIAccess;
    midiProbe = req
      ? req
          .call(navigator)
          .then(() => true)
          .catch(() => false)
      : Promise.resolve(false);
  }
  return midiProbe;
}

// Current global tempo, kept in sync with the central clock via `setBpm`.
// A grammar derives at this tempo and live voices retune to it. Shared: both
// languages play under the one central transport tempo. Defaults to the clock's
// own default so a fresh page already matches the transport.
let currentBpm = 128;

// Optional hook the core wires so a grammar's declared `@mm` can drive the
// CENTRAL clock (and thus the transport display) at eval, keeping the shown BPM,
// the derivation, and the STEP grid in agreement. The core sets this to
// `clock.setBpm`; left unset (tests, headless) the adapter still derives at the
// `@mm` tempo locally via `currentBpm`, only the UI clock isn't told.
let onTempoFromGrammar: ((bpm: number) => void) | undefined;
export function setTempoSink(fn: (bpm: number) => void): void {
  onTempoFromGrammar = fn;
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

function srcKey(s: EvalSource): string {
  return s.actorId ?? s.fileId;
}

// Map a backtick interpreter tag (`strudel`, `hydra`, `tidal`, `js`, …) to a
// Kanopi Runtime. The tag is the eval tag from the .bps backtick (`strudel: …`);
// most map 1:1 to a registered adapter. `auto` has no interpreter — it's an
// error (the user must tag the code). `sc`/`py` are level-3 (osc-bridge), no
// browser adapter yet → unknown-interp error, surfaced clearly (never silent).
function runtimeForInterp(interp: string): Runtime | undefined {
  const known: Record<string, Runtime> = {
    strudel: 'strudel',
    tidal: 'tidal',
    hydra: 'hydra',
    p5: 'p5',
    mercury: 'mercury',
    csound: 'csound',
    js: 'js'
  };
  return known[interp];
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
 * Register a backtick sink on a dispatcher (lot 4, ADAPTER_SPEC §1bis). A
 * `BT<interp><id>` token in the derivation is a REFERENCE to foreign code; the
 * dispatcher places it in time and fires this sink at the scheduled moment.
 * The sink looks up `backticks[token]` (direct, no parsing), resolves the
 * interpreter adapter, and evaluates the code — the engine then plays, PLACED in
 * time by the dispatcher. Layering: the dispatcher (packages/core) never imports
 * an adapter; bp3.ts injects this closure.
 *
 * - unknown interp → clear log error (never silent).
 * - async evaluate → fire-and-forget, errors logged.
 * - §1bis (b) device-type compatibility is gated UP-FRONT in `evaluate` (see
 *   `gateVoiceDevice`), per actor, before the dispatcher starts — not here at
 *   fire time. This sink only PLACES the already-validated voice in time.
 */
function registerBacktickSink(
  dispatcher: InstanceType<typeof Dispatcher>,
  backticks: BacktickTable,
  id: Runtime,
  src: EvalSource,
  log: LogPush
): void {
  const isBacktick = (token: string) => Object.prototype.hasOwnProperty.call(backticks, token);
  const sink = (token: string) => {
    const entry = backticks[token];
    if (!entry) return;
    const runtime = runtimeForInterp(entry.interp);
    if (!runtime) {
      log({
        runtime: id,
        level: 'error',
        msg: `backtick: unknown interpreter "${entry.interp}" (token ${token}) — tag the code with a known runtime`
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
            msg: `backtick: no adapter for "${entry.interp}" (token ${token})`
          });
          return;
        }
        return adapter.evaluate(entry.code, { actorId: src.actorId, fileId: src.fileId }, log);
      })
      .catch((err) =>
        log({ runtime: id, level: 'error', msg: `backtick ${entry.interp}: ${String(err)}` })
      );
  };
  (
    dispatcher as unknown as {
      setBacktickSink(
        isBacktick: (t: string) => boolean,
        sink: (t: string, ts: { startSec: number; durSec: number; absTime: number }) => void
      ): void;
    }
  ).setBacktickSink(isBacktick, sink);
}

/**
 * Load the sample/sound banks a `.bps` declares per engine (`@library.strudel
 * "dirt-samples"`). Only the `strudel` engine has a bank loader today (the same
 * `samples()` path the `.kanopi` `@library` directive used); other engines'
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
        soundingSymbols,
        orchestration,
        backticks,
        flagStates,
        libraries,
        sections: headSections,
        alphabet: declaredAlphabet,
        tuning: declaredTuning,
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

      // `@mm` tempo: a grammar that declares its own metronome derives at THAT
      // tempo (BPx's loadGrammar reads `@mm`), so adopt it as the global tempo
      // BEFORE deriving — otherwise the STEP grid (`beatDurSec = 60/currentBpm`)
      // and the displayed BPM use a stale tempo and disagree with the produced
      // timeline (a 70 bpm derivation stepped at 128 bpm yields phantom beats).
      // Push it to the central clock too (display + transport) when the core has
      // wired the sink. No `@mm` → keep the current tempo untouched.
      if (declaredMm && declaredMm > 0) {
        currentBpm = declaredMm;
        onTempoFromGrammar?.(declaredMm);
      }

      // A5 named scenes: a `.bps` whose rules are ALL guarded by a named scene
      // flag (`[scene==calm] S -> …`) has no rule that derives without a scene
      // set — `S` would stay an unexpanded non-terminal and leak as a bogus
      // token to the audio transport. Match the A5 UX ("a scene is active by
      // default"): when the file declares named scenes and the caller gave no
      // scene, default to the first named one (lowest int). Reflected as the
      // active scene in the scene bar (see `defaultScene` consumers).
      const effectiveFlags = withDefaultScene(src.flags, flagStates);

      let tokens;
      let tree: ProductionTree | undefined;
      // The raw BPx `DerivationTree` (control nodes included) for the multi-actor
      // dispatcher path; `tree` above is the visualizer-shaped cast.
      let rawTree: unknown;
      // DETERMINISTIC leaf-name table (`symbolId → name`) read off the grammar's
      // own symbol table — the authoritative resolver the tree-view adapters use,
      // replacing the fragile temporal correlation. Empty when the engine doesn't
      // expose it (adapters then fall back).
      let symbolNames: Record<number, string> = {};
      try {
        // `effectiveFlags` (e.g. `{ scene: 2 }`) is applied as the BPx engine's
        // initial flag state, so a flag-guarded rule (`/scene=2/`) derives
        // instead of leaving `S` unexpanded. Absent named scenes → unchanged.
        const bpx = createBPx({ tempo: currentBpm, settings, flags: effectiveFlags });
        bpx.loadGrammar(ast);
        // Keep BOTH halves of the derivation: `.tokens` is the flat timed
        // sequence (audio/MIDI/text), `.tree` carries the polymetric structure
        // (groups + voices + nesting) the piano-roll's struct band needs.
        // `output: 'complete'` restores the control markers EN ORDRE as tree
        // nodes / zero-duration tokens, and the per-node payload (actor/params on
        // notes, marker payload on controls) the multi-actor dispatcher routes on
        // — the flat `.tokens` carry `actor: null` and fuse simultaneous leaves.
        const derived = bpx.derive({ output: 'complete' });
        // The TREE (with control nodes) drives the multi-actor dispatcher. The
        // FLAT tokens keep their prior `'sounding'` shape for every legacy
        // consumer (production readout, STEP slicing, MIDI sink, mono/text
        // dispatcher.load): `'complete'` ALSO injects zero-duration `type:
        // 'control'` tokens into the flat stream, which those paths never saw —
        // drop them here so nothing downstream regresses.
        rawTree = derived.tree;
        tokens = derived.tokens.filter((t) => t.type !== 'control');
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
      // Text panel + Structure visualizer see the entire production at once. The
      // sound predicate marks which tokens reach audio/MIDI vs the symbolic
      // readout: a note, a front-end sounding symbol, an orchestrated actor
      // terminal, or a backtick reference all "sound"; everything else is text.
      const soundingSet = new Set(soundingSymbols ?? []);
      const btTable = backticks ?? {};
      // Orchestrated actor terminals are "sounding" too. With the flat
      // symbol→actor map gone, membership is read off the tree itself: any
      // terminal that appears as an actor-bound note (`payload.actor`) sounds.
      const actorTerminals = new Set<string>();
      if (orchestration && orchestration.actors.length > 0) {
        for (const e of treeToDispatchEvents(
          rawTree as Parameters<typeof treeToDispatchEvents>[0],
          symbolNames
        )) {
          if (e.type === 'note' && (e.payload as { actor?: string | null } | null)?.actor) {
            actorTerminals.add(e.token);
          }
        }
      }
      const productionSounds = (token: string) =>
        isNoteName(token) ||
        soundingSet.has(token) ||
        actorTerminals.has(token) ||
        Object.prototype.hasOwnProperty.call(btTable, token);
      // `beatDurSec` (`60/bpm`) is the STEP unit. The grammar derived at
      // `currentBpm`, so every beat boundary on the produced timeline is one
      // beat of the clock — STEP advances one of those at a time.
      const beatDurSec = currentBpm > 0 ? 60 / currentBpm : 0;
      publishProduction(
        id,
        tokens,
        productionSounds,
        headSections ?? [],
        beatDurSec,
        tree,
        symbolNames
      );

      // STEP: when a beat is requested, keep only that beat's tokens (re-zeroed)
      // and play them once. Otherwise loop the whole derivation as usual. The
      // window is ONE beat (`60000/bpm` ms) of the timeline; `section.index` is
      // the beat index (the `section` field is reused as a generic step window).
      const section = src.section;
      const looping = !section;
      if (section && section.count > 1) {
        const beatMs = currentBpm > 0 ? 60000 / currentBpm : 0;
        tokens = sliceBeat(tokens, section.index, beatMs);
        if (tokens.length === 0) {
          log({
            runtime: id,
            level: 'info',
            msg: `step: beat ${section.index + 1}/${section.count} is empty`
          });
        }
      }

      const key = srcKey(src);
      const prev = voices.get(key);
      if (prev) {
        prev.dispatcher.stop();
        prev.midiSink?.stop();
      }

      const ctx = await getCtx();
      const dispatcher = new Dispatcher(ctx);

      // Backtick voices (lot 4): route each `BT<interp><id>` terminal to its
      // interpreter, fired in time by the dispatcher. Registered before load so
      // both the orchestrated and the simple path place backticks correctly.
      if (backticks && Object.keys(backticks).length > 0) {
        registerBacktickSink(dispatcher, backticks, id, src, log);
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
        const devices = new Map<string, Device>();
        for (const actor of orchestration.actors) {
          devices.set(
            actor.name,
            await gateVoiceDevice(actor.name, actor.transportKey, actor.evalInterp, id, log)
          );
        }

        const da = dispatcher as unknown as {
          setActors(t: unknown): void;
          setActorTransport(actor: string, transport: string): void;
          setActorResolver(actor: string, resolver: Resolver): void;
        };
        da.setActors(orchestration.actorTable);
        const webaudio = new WebAudioTransport(ctx, { resolver: makeWesternResolver() });
        let webaudioAdded = false;
        let midi: InstanceType<typeof MidiTransport> | undefined;
        for (const actor of orchestration.actors) {
          const resolver =
            actor.alphabet === 'solfège' ? makeSolfegeResolver() : makeWesternResolver();
          // Drive transport selection off the RESOLVED device TYPE, not the raw
          // key string: `transport.audio` and `transport.webaudio` (alias) both
          // map to WebAudio, `transport.midi` to MIDI.
          const device = devices.get(actor.name)!;
          if (device.type === 'midi') {
            if (!midi) {
              midi = new MidiTransport({ resolver });
              await midi.init().catch(() => {}); // no hardware → silent, never throws
              dispatcher.addTransport('midi', midi);
            }
            da.setActorTransport(actor.name, 'midi');
          } else if (device.type === 'audio') {
            if (!webaudioAdded) {
              dispatcher.addTransport('webaudio', webaudio);
              webaudioAdded = true;
            }
            da.setActorTransport(actor.name, 'webaudio');
          } else {
            // video/dmx/osc: compat passed but the dispatcher transport isn't
            // wired yet (DEVICES_SPEC §6 — declarable-but-unwired). A code voice
            // renders ITSELF via its backtick adapter (capture-for-retransport is
            // backlog B4), so there is nothing to route here. Documented, not
            // hidden: log the limitation rather than crashing.
            log({
              runtime: id,
              level: 'info',
              msg: `voix ${actor.name} → appareil ${actor.transportKey} (${device.type}) : transport non câblé (le moteur se rend lui-même)`
            });
          }
          da.setActorResolver(actor.name, resolver);
        }
        // Multi-actor routing (M5+ refacto): build dispatch events FROM THE TREE
        // so each note carries its OWN `payload.actor` — a terminal shared by two
        // actors ('sitar.Sa' vs 'tabla.Sa') routes to DISTINCT transports (the
        // dispatcher keys on `payload.actor`; there is NO flat symbol→actor map).
        // Control nodes carry their marker payload + `nature` for per-actor flux.
        //
        // Defense-in-depth (twin of the default-scene fix above): never hand a
        // structural non-terminal to a transport. Keep an event when it is a
        // control, an actor-bound note, a backtick reference, or a plain note
        // name; drop an unexpanded start symbol (e.g. `S` when no guarded rule
        // matched). Every orchestrated terminal carries its `payload.actor`, so
        // membership is read off the event itself — not the upstream map.
        const isBacktick = backticks ?? {};
        const treeEvents = treeToDispatchEvents(
          rawTree as Parameters<typeof treeToDispatchEvents>[0],
          symbolNames
        ).filter((e) => {
          if (e.type === 'control') return true;
          if (e.type === 'rest') return false;
          const actor = (e.payload as { actor?: string | null } | null)?.actor;
          if (actor) return true;
          if (Object.prototype.hasOwnProperty.call(isBacktick, e.token)) return true;
          return isNoteName(e.token);
        });
        (dispatcher as unknown as { loadEvents(ev: unknown[]): void }).loadEvents(treeEvents);
        dispatcher.start(undefined, { loop: looping });
        voices.set(key, { dispatcher });
        log({
          runtime: id,
          level: 'info',
          msg: `orchestrated [${key}] (${orchestration.actors.length} actors)`
        });
        emitLifecycle('eval', src.fileId);
        return;
      }

      // Per-symbol play-vs-skip (decision routage-texte-son-par-symbole): a
      // token sounds if it's a note OR its symbol carries a sound assignment
      // from the front-end — those reach audio/MIDI. A mute token is simply NOT
      // PLAYED (skipped by the dispatcher); the symbolic readout is a VIEW of
      // the production tree (Text panel via `orderedTokensFromTree`), not a
      // routed output. Decided per token, so a mixed grammar voices its sounding
      // symbols and skips the rest.
      const sounding = new Set(soundingSymbols ?? []);
      // When the scene declares an `@alphabet` (+ a resolvable `@tuning`, or the
      // catalog default for that alphabet), build the pitch resolver from the
      // bpscript catalogs and treat the alphabet's own notes as sounding — so
      // non-western symbols (`C H J` bohlen, `nem barang…` gamelan) reach audio.
      // Otherwise keep the western/solfège sniffing fallback unchanged (western
      // scenes with octaves like cv-adsr resolve identically through either).
      const catalog = catalogResolver(declaredAlphabet, declaredTuning);
      if (catalog) for (const n of catalog.notes) sounding.add(n);
      const soundsFn = (token: string) => isNoteName(token) || sounding.has(token);

      const resolver = catalog ? catalog.resolver : pickResolver(tokens);
      dispatcher.addTransport('default', new WebAudioTransport(ctx, { resolver }));
      // The dispatcher routes via per-token resolver/transport lookup; this
      // global resolver is the fallback the WebAudio path uses for pitches.
      (dispatcher as unknown as { _resolver: Resolver })._resolver = resolver;
      // The predicate decides play-vs-skip — there is no text transport. A mute
      // token is not routed anywhere.
      (
        dispatcher as unknown as {
          setSoundPredicate(fn: (t: string) => boolean): void;
        }
      ).setSoundPredicate(soundsFn);

      // Unified routing (M5+ refacto): a NON-orchestrated grammar loads through
      // the SAME payload path as an orchestrated one. Flatten the tree to events
      // (no `payload.actor`). The dispatcher routes each terminal uniformly: a
      // SOUNDING token (`soundsFn` true) → 'default' audio, a MUTE token is
      // SKIPPED (not played) — the per-symbol split is honoured for every token,
      // so a mixed grammar voices its notes and skips its mute symbols (which
      // still appear in the Text panel's tree view). Each leaf carries its
      // sealed E-016 `rq`, so velocity/transpose/channel still fold over
      // controlState exactly as the old flat `dispatcher.load` did. We keep ALL
      // terminals (sounding AND mute) — only rests drop here (the dispatcher
      // itself skips silences/prolongations). BPx already expanded the grammar,
      // so the flat terminal stream carries no unexpanded start symbol to guard
      // against (that leak was scene-guarded `.bps` only, handled by the
      // orchestrated/default-scene paths above).
      let treeEvents = treeToDispatchEvents(
        rawTree as Parameters<typeof treeToDispatchEvents>[0],
        symbolNames
      ).filter((e) => e.type !== 'rest');
      // STEP: when a beat is requested, keep only that beat's events (re-zeroed)
      // — the events twin of the flat `sliceBeat` already applied to `tokens`.
      if (section && section.count > 1) {
        const beatSec = currentBpm > 0 ? 60 / currentBpm : 0;
        treeEvents = sliceBeatEvents(treeEvents, section.index, beatSec);
      }
      (dispatcher as unknown as { loadEvents(ev: unknown[]): void }).loadEvents(treeEvents);
      // Loop so an armed actor sustains like a Strudel pattern: the grammar's
      // derivation repeats at each cycle boundary until the actor is toggled off,
      // the transport stops, or the page hushes. A Ctrl+Enter on a standalone
      // grammar goes through this same code, so it loops too — intended: "play
      // the grammar" means keep playing it, and Ctrl+. silences. A STEP (section
      // window) plays once instead — `looping` is false then.
      dispatcher.start(undefined, { loop: looping });

      // MIDI sink: route the SAME raw BPx tokens to runtime-midi, on the SAME
      // AudioContext clock — but only when Web MIDI access is actually granted
      // (probed once, silently). Otherwise skip it entirely: WebAudio playback
      // stays intact and the console stays clean on machines without MIDI.
      let midiSink: MidiSink | undefined;
      if (await webMidiAvailable()) {
        try {
          const sink = new MidiSink(ctx);
          const hasPort = await sink.init();
          if (hasPort) {
            sink.load(tokens);
            sink.start();
            midiSink = sink;
            log({ runtime: id, level: 'info', msg: `midi out [${key}]` });
          }
        } catch (err) {
          // A MIDI failure must never take down the (already-playing) WebAudio path.
          log({ runtime: id, level: 'info', msg: `midi sink skipped: ${String(err)}` });
        }
      } else if (!midiUnavailableLogged) {
        midiUnavailableLogged = true;
        log({ runtime: id, level: 'info', msg: 'no Web MIDI — WebAudio only' });
      }

      voices.set(key, { dispatcher, midiSink });
      log({ runtime: id, level: 'info', msg: `eval ok [${key}] (${tokens.length} tokens)` });
      emitLifecycle('eval', src.fileId);
    },
    setBpm(bpm: number, _log: LogPush) {
      currentBpm = bpm;
      // Retune live voices so a tempo change from the central clock (or a
      // `@map tempo` MIDI knob) takes effect without re-deriving. The dispatcher
      // reads `_tempo` for its beats→seconds conversion and pushes it onto the
      // clock; setting both keeps already-scheduled and future cycles in step.
      for (const voice of voices.values()) {
        const d = voice.dispatcher as unknown as { _tempo?: number; clock?: { tempo?: number } };
        d._tempo = bpm;
        if (d.clock) d.clock.tempo = bpm;
      }
      // The MIDI sink owns its own internal dispatcher (runtime-midi private); we
      // don't reach into it to retune live. Its timing comes from the tokens it
      // was loaded with at the previous tempo, so a tempo change takes effect on
      // the next eval (re-derivation at the new `currentBpm`). Consistent with the
      // integration rule: no poking upstream internals.
    },
    async stop(src: EvalSource, log: LogPush) {
      const key = srcKey(src);
      // `__hush__` is the core's "stop everything" sentinel (transport stop,
      // Ctrl+. panic): no single voice matches it, so we tear down every live
      // dispatcher. Without this, stopping the transport left playback looping.
      if (key === '__hush__') {
        for (const voice of voices.values()) {
          voice.dispatcher.stop();
          voice.midiSink?.stop();
        }
        voices.clear();
        log({ runtime: id, level: 'info', msg: 'hush (all voices)' });
        emitLifecycle('stop', src.fileId);
        return;
      }
      const voice = voices.get(key);
      if (voice) {
        voice.dispatcher.stop();
        voice.midiSink?.stop();
        voices.delete(key);
      }
      log({ runtime: id, level: 'info', msg: `stop [${key}]` });
      emitLifecycle('stop', src.fileId);
    },
    async dispose() {
      for (const voice of voices.values()) {
        try {
          voice.dispatcher.stop();
          voice.midiSink?.stop();
        } catch {
          /* engine may already be torn down */
        }
      }
      voices.clear();
    }
  };
}

// `.gr` keystone (Bol Processor native grammar) and `.bps` (BPScript) — same
// engine, different front-end.
export const bp3Adapter: RuntimeAdapter = makeBpxAdapter('bp3', ['.gr'], grFrontend);
export const bpscriptAdapter: RuntimeAdapter = makeBpxAdapter('bpscript', ['.bps'], bpsFrontend);
