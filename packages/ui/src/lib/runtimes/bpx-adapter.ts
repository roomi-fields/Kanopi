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
import { createBPx } from 'bpx';
import { BUNDLED_SE, BUNDLED_SOUND, BUNDLED_AL } from './bp3-aux';
// Core runtime, reused AS-IS (no port): the dispatcher schedules timed tokens
// on the WebAudio transport; the resolver turns pitch names into frequencies.
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';
import { WebAudioTransport } from '../../../../core/src/dispatcher/transports/webaudio.js';
// Per-actor MIDI transport for a voice routed `transport:midi`. Consumed AS-IS from
// the canonical runtime-MIDI package (conformité MIDI : zéro copie dans Kanopi/core —
// la copie core `dispatcher/transports/midi.js` est supprimée). runtime-MIDI OWNS the
// MIDI path; Kanopi only routes Kronos's per-actor events to it.
import { MidiTransport } from 'runtime-midi';
import { Resolver } from '../../../../core/src/dispatcher/resolver.js';
// Scale engine (core): turns a `ratios`/`compose`+`junction` scale name into a
// concrete ratio list (the only pitch maths — see PITCH.md 6-layer model).
import { resolveScaleRatios } from '../../../../core/src/dispatcher/scale.js';
// Tree-derived dispatch events (M5+ multi-actor refacto): flatten BPx's
// `derive({ output: 'complete' }).tree` to ordered events that each carry their
// OWN actor/params payload, so a terminal shared by two actors routes distinctly.
import { treeToDispatchEvents, resolveCvControls, type DispatchEvent } from './tree-dispatch';
// Kronos owns CV COMPOSITION (frontier R2 / migration #8): `buildModulators` fuses
// the scene's `cv … : mod.x(…)` declarations with the `mod` library into the modulator
// registry, and `composeTreeModulations` walks the realized tree to produce one
// `{leaf, bindings}` pair per modulated leaf (PURE — does NOT mutate the tree). The
// host only stamps each binding set onto its leaf so the flatten carries it to the
// Kronos audio path. Both consumed AS-IS.
import {
  buildModulators,
  composeTreeModulations,
  type ModLib,
  type ModulationBinding
} from '@kronos/core';
// Kronos drives the REAL audio (the only engine; legacy removed). The Kronos
// scheduler produces the timed events; a thin adapter bridges each to the existing
// WebAudio synth. The old dispatcher is NEVER started for sound — it survives only
// as the inert structure of transports/resolvers that Kronos reads.
import { startKronosAudio, type KronosAudioHandle, type KronosAudioOptions } from './kronos-audio';
// EX4 phase 2: surface the ACTIVE Kronos cursor to the UI so the timeline draws
// the playhead off the SAME clock as the audio (aligned + monotone-from-0),
// instead of the central rAF clock (which lags ~1 note and jumps back at launch).
import { kronosCursor } from '../../stores/kronos-cursor.svelte';
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
// load it through the SAME Strudel `samples()` path a `.kanopi` `@library`
// session used. Consumed AS-IS — the adapter only maps ids → loader.
import { findBank } from '../library/audio-banks';
import { loadSampleBank } from './strudel';
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
  /** True when there is NO `@actor` in the scene: a single implicit `default` actor
   *  was synthesized so a plain grammar travels the SAME path as an orchestrated one
   *  (mono = orchestration with one actor). The Actors panel stays empty for these. */
  synthetic?: boolean;
}

/** A scene with no `@actor` (plain `.bps` OR any `.gr`) routes through the SAME single
 *  orchestrated path as a multi-actor one — it just owns one implicit `default` actor
 *  (audio transport; pitch resolution falls to the scene resolver since events carry no
 *  `payload.actor`). Shared by both frontends so there is ONE code path, never a mono one. */
function syntheticDefaultOrchestration(): Orchestration {
  return {
    actorTable: { default: { transport: { key: 'audio' }, alphabet: 'western' } },
    actors: [{ name: 'default', transportKey: 'audio', alphabet: 'western' }],
    synthetic: true
  };
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
  // `.gr` (BP3) has no `@actor` → one implicit `default` actor, SAME path as `.bps`.
  // Pitch resolution falls to the scene resolver (`pickResolver(tokens)` — no declared
  // alphabet), exactly as the old mono branch did for `.gr`.
  return { ...base, orchestration: syntheticDefaultOrchestration() };
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

// Map each orchestrated actor to the backtick token its rule emits, when the
// actor is a CODE voice. A rule `groove -> `…`` has the actor name as its LHS
// symbol and a `BacktickInline` (carrying `_btName`) in its RHS. We pair the two
// so the adapter can stop/re-eval a single code voice on arm/disarm (the BT
// token itself carries no actor on the derivation tree). Native (notes) voices
// have no entry — they are armed/disarmed through the dispatcher's note gate.
export function btTokenByActor(ast: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<unknown>();
  const findBt = (n: unknown): string | undefined => {
    if (!n || typeof n !== 'object') return undefined;
    const node = n as Record<string, unknown>;
    if (node.type === 'BacktickInline' && typeof node._btName === 'string') return node._btName;
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) {
        for (const x of v) {
          const r = findBt(x);
          if (r) return r;
        }
      } else if (v && typeof v === 'object') {
        const r = findBt(v);
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
        const bt = findBt(node.rhs);
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

// CV modulation libraries Kanopi can resolve (by lib name). Each declares its
// objects' param signatures + curve shape. The modulators live in `mod` (mod.json).
interface CVLib {
  objects?: Record<string, { parameters?: Record<string, { default?: unknown }>; curve?: unknown }>;
}
const CV_LIBS: Record<string, CVLib> = { mod: modLibJson as unknown as CVLib };

// A CV modulator DECLARATION in the AST (`cv env1 : mod.adsr(…)`). It defines the
// modulator only — its target/input is set at the BRANCHEMENT point on a note
// (`Bass -> C2 (cutoff: env1)`), surfaced via `leaf.controls`, not here.
interface CVInstanceNode {
  name: string;
  lib?: string;
  objectType?: string;
  args?: unknown[];
  namedArgs?: Record<string, unknown>;
  code?: string;
}

/** A resolved modulator: its named params + its curve (from the library). Keyed by
 *  NAME in the registry. The destination input is decided at the note branchement. */
export interface Modulator {
  objectType?: string;
  params: Record<string, unknown>;
  curve: unknown;
}

// Build the MODULATOR REGISTRY (name → resolved modulator) from the AST's
// `cvInstances` (the `cv name : mod.obj(…)` declarations). Resolves each
// modulator's params (library defaults < positional args by the library's
// parameter order < named args) and attaches the library's `curve` (declarative
// segments/periodic) so the transport renders it generically per note. A backtick
// modulator (code) becomes an `expr` curve. The note branchement `(cutoff: name)`
// (in `leaf.controls`) selects WHICH modulator drives WHICH input on that note.
export function modulatorsFromAst(ast: unknown): Record<string, Modulator> {
  const instances = (ast as { cvInstances?: CVInstanceNode[] } | null)?.cvInstances;
  const registry: Record<string, Modulator> = {};
  if (!Array.isArray(instances)) return registry;
  for (const cv of instances) {
    const objDef = cv.lib ? CV_LIBS[cv.lib]?.objects?.[cv.objectType ?? ''] : undefined;
    const paramDefs = objDef?.parameters ?? {};
    const order = Object.keys(paramDefs);
    const params: Record<string, unknown> = {};
    for (const k of order) {
      if (paramDefs[k]?.default !== undefined) params[k] = paramDefs[k].default;
    }
    (cv.args ?? []).forEach((v, idx) => {
      if (order[idx]) params[order[idx]] = v;
    });
    Object.assign(params, cv.namedArgs ?? {});
    const curve = cv.code ? { kind: 'expr', code: cv.code } : objDef?.curve;
    registry[cv.name] = { objectType: cv.objectType, params, curve };
  }
  return registry;
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
  if (names.length === 0) {
    // No `@actor`: one implicit `default` actor so a plain grammar travels the SAME
    // orchestrated path (its pitch resolution comes from the scene resolver via the
    // WebAudio transport base, events carrying no `payload.actor`). Shared helper.
    return { ...base, orchestration: syntheticDefaultOrchestration() };
  }
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
  /** Source file this dispatcher was evaluated from. Lets a new program stop the
   *  OUTGOING program's dispatcher (whose `loop:true` keeps re-firing its code
   *  voices — Hydra/Strudel — each cycle) without depending on the per-actor
   *  handle map. Undefined for legacy entries (treated as "current file"). */
  file?: string;
  /** True when this dispatcher is an orchestrator (`@actor` voices). Only these
   *  loop-and-re-fire foreign code; a plain mono grammar / `.kanopi` per-actor
   *  voice is left alone so a sibling re-eval doesn't cut it. */
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

/**
 * STEP windowing: keep only the tokens of ONE beat of the derivation, re-zeroed
 * in time. The STEP unit is the clock beat (`60/bpm` seconds, here `beatMs` in
 * ms). A token belongs to the beat its onset is CLOSEST to (`round(start/beat)`),
 * NOT a half-open window `[k·beat, (k+1)·beat)`. The window form floored, and the
 * engine emits note onsets at a slightly different grid than the theoretical
 * `60000/bpm` (rounding: a note at k·857.0 ms vs a beat at k·857.14 ms), so the
 * window's upper edge swept the NEXT note into the current beat — beat 0 then held
 * two notes and the error accumulated. Nearest-beat assignment is robust to that
 * sub-millisecond drift: each onset lands in exactly one beat. Shifted back to ~0
 * so the beat plays immediately.
 */
export function sliceBeat<T extends Tok>(tokens: T[], index: number, beatMs: number): T[] {
  if (!(beatMs > 0)) return tokens;
  const from = index * beatMs;
  return tokens
    .filter((t) => Math.round(t.start / beatMs) === index)
    .map((t) => ({ ...t, start: t.start - from, end: t.end - from }));
}

/**
 * STEP windowing for tree-derived dispatch events — the `sliceBeat` twin on the
 * SECONDS timeline the dispatcher loads (`treeToDispatchEvents`). Same
 * nearest-beat assignment (`round(startSec/beatSec)`) as the flat `sliceBeat`, for
 * the same reason (onset/beat-grid rounding drift), re-zeroed to ~0.
 */
export function sliceBeatEvents(
  events: DispatchEvent[],
  index: number,
  beatSec: number
): DispatchEvent[] {
  if (!(beatSec > 0)) return events;
  const from = index * beatSec;
  return events
    .filter((e) => Math.round(e.startSec / beatSec) === index)
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
  sounds: (token: string) => boolean,
  sectionNames: string[],
  beatDurSec: number,
  tree?: ProductionTree,
  symbolNames?: Record<number, string>,
  sectionLeafCounts?: number[]
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

// Current global tempo, kept in sync with the central clock via `setBpm`.
// A grammar derives at this tempo and live voices retune to it. Shared: both
// languages play under the one central transport tempo. Defaults to the clock's
// own default so a fresh page already matches the transport.
let currentBpm = 128;

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
 *  the per-actor path over the `.kanopi` file-bound path). */
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
): { isBacktick: (t: string) => boolean; sink: (t: string) => void } {
  const isBacktick = (token: string) => Object.prototype.hasOwnProperty.call(backticks, token);
  const sink = (token: string) => {
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
        return adapter.evaluate(entry.code, { actorId, fileId: src.fileId }, log);
      })
      .catch((err) =>
        log({ runtime: id, level: 'error', msg: `backtick ${entry.interp}: ${String(err)}` })
      );
  };
  // Return the closures so the orchestrated kronos path can hand them to the Kronos
  // scheduler (it intercepts BT tokens itself; the dispatcher is not started there).
  return { isBacktick, sink };
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

  // Live loop/re-random updates reach THIS adapter's currently-playing voices.
  // Both audio paths are updated: the LEGACY dispatcher (its own re-derive gate) and
  // the ACTIVE Kronos handle (kronos mode — it, not the dispatcher, drives the audio,
  // so the toggle must reach its scheduler too). A voice with no kronos handle
  // (orchestrated/legacy scene) just skips the optional call.
  transportLiveUpdaters.push((reRandom, loop) => {
    for (const v of voices.values()) {
      const d = v.dispatcher as unknown as {
        setReRandom(on: boolean): void;
        setLoop(on: boolean): void;
      };
      if (reRandom !== null) {
        d.setReRandom(reRandom);
        v.kronosAudio?.setReRandom(reRandom);
      }
      if (loop !== null) {
        d.setLoop(loop);
        v.kronosAudio?.setLoop(loop);
      }
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
        const bpx = createBPx({
          tempo: currentBpm,
          settings,
          flags: effectiveFlags,
          seed: currentSeed
        });
        bpx.loadGrammar(ast);
        // Keep BOTH halves of the derivation: `.tokens` is the flat timed
        // sequence (audio/MIDI/text), `.tree` carries the polymetric structure
        // (groups + voices + nesting) the piano-roll's struct band needs.
        // `output: 'complete'` restores the control markers EN ORDRE as tree
        // nodes / zero-duration tokens, and the per-node payload (actor/params on
        // notes, marker payload on controls) the multi-actor dispatcher routes on
        // — the flat `.tokens` carry `actor: null` and fuse simultaneous leaves.
        const derived = bpx.derive({ output: 'complete' });
        // Model C proof: this is THE eval-path derivation (eval/edit/arm/produce/play-from-
        // stopped). Count it. The loop-boundary re-roll (`reDeriveTreeEvents`) is NOT counted
        // here — a Play-from-stopped on a persisted scene replays without reaching this point.
        __bpxDeriveCount++;
        // The TREE (with control nodes) drives the multi-actor dispatcher. The
        // FLAT tokens keep their prior `'sounding'` shape for every legacy
        // consumer (production readout, STEP slicing, MIDI sink, mono/text
        // dispatcher.load): `'complete'` ALSO injects zero-duration `type:
        // 'control'` tokens into the flat stream, which those paths never saw —
        // drop them here so nothing downstream regresses.
        // CV (A) — Kronos audio path: compose a modulation BINDING per modulated
        // input off the NEW BPx facets (`controls` ⊕ `controlSubjects` ⊕
        // `controlScopes`) and stamp it on each leaf, BEFORE `resolveCvControls`
        // rewrites `controls` for the legacy path. The sibling-voice resolver lets
        // `*:cutoff:Env` follow env1→env2→env3 as the Env voice drew them.
        const nameOf = (sid: number) =>
          (bpx as { grammar?: { symbols?: Partial<SymbolTable> } }).grammar?.symbols?.getName?.(
            sid
          );
        const kronosRegistry = buildModulators(
          ((ast as { cvInstances?: unknown[] } | null)?.cvInstances ?? []) as Parameters<
            typeof buildModulators
          >[0],
          modLibJson as unknown as ModLib
        );
        // Stamp Kronos's composed bindings onto each modulated leaf (the flatten reads
        // `leaf.__cvBindings`); `composeTreeModulations` itself leaves the tree untouched.
        for (const { leaf, bindings } of composeTreeModulations(
          derived.tree,
          nameOf,
          kronosRegistry
        )) {
          (leaf as { __cvBindings?: ModulationBinding[] }).__cvBindings = bindings;
        }
        // Resolve each subject-driven value into the uniform `{__cv:true, …}` descriptor
        // the WebAudio transport reads — mutates leaf.controls in place, reading the SAME
        // facets as the Kronos CV bindings above. Runs unconditionally (the WebAudio synth
        // Kronos drives consumes these descriptors).
        resolveCvControls(derived.tree, nameOf, new Set(Object.keys(modulatorsFromAst(ast))));
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

      // RE-RANDOM per cycle (old dispatcher's `_reDerive`): re-run the grammar
      // from scratch so weighted/random rules re-roll, returning a FRESH set of
      // tree dispatch events for the next loop cycle. Same derive path as above
      // (`createBPx` → `loadGrammar` → `derive('complete')`), then the SAME
      // event filter the caller applies to the first cycle (`filterEvents`), so a
      // re-derived cycle routes identically — only the random choices differ.
      // Returns null on any error (the dispatcher then replays the existing
      // events rather than going silent). Built once; passed to `start()` only
      // when the transport's re-random toggle is on AND looping.
      const reDeriveTreeEvents = (filterEvents: (e: DispatchEvent) => boolean) => () => {
        try {
          const rbpx = createBPx({
            tempo: currentBpm,
            settings,
            flags: effectiveFlags,
            seed: freshSeed()
          });
          rbpx.loadGrammar(ast);
          const rderived = rbpx.derive({ output: 'complete' });
          const rNameOf = (sid: number) =>
            (rbpx as { grammar?: { symbols?: Partial<SymbolTable> } }).grammar?.symbols?.getName?.(
              sid
            );
          // Same CV composition + legacy resolution as the main path — each re-roll
          // re-samples the phrase spans and which env sounds under each leaf, so the
          // Kronos audio path keeps its env variety on every re-randomised cycle.
          const rRegistry = buildModulators(
            ((ast as { cvInstances?: unknown[] } | null)?.cvInstances ?? []) as Parameters<
              typeof buildModulators
            >[0],
            modLibJson as unknown as ModLib
          );
          for (const { leaf, bindings } of composeTreeModulations(
            rderived.tree,
            rNameOf,
            rRegistry
          )) {
            (leaf as { __cvBindings?: ModulationBinding[] }).__cvBindings = bindings;
          }
          resolveCvControls(rderived.tree, rNameOf, new Set(Object.keys(modulatorsFromAst(ast))));
          const rnames = buildSymbolNames(rbpx, rderived.tree);
          // Refresh the STRUCTURE view so it shows THIS cycle's variation — the
          // re-derive otherwise only reloads the dispatcher (audio re-rolls) and
          // the struct stays frozen on the first cycle. Same publish as the eval.
          const rtokens = rderived.tokens.filter((t) => t.type !== 'control');
          publishProduction(
            id,
            rtokens,
            productionSounds,
            headSections ?? [],
            beatDurSec,
            rderived.tree as unknown as ProductionTree,
            rnames,
            sectionLeafCounts(ast)
          );
          return treeToDispatchEvents(
            rderived.tree as Parameters<typeof treeToDispatchEvents>[0],
            rnames
          ).filter(filterEvents);
        } catch (err) {
          log({ runtime: id, level: 'warn', msg: `re-random derive failed: ${String(err)}` });
          return null;
        }
      };

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
      // Per-section leaf counts (from the AST head rule) so the visualizer draws
      // the REAL section boundaries off the tree's leaf spans, not an equal split.
      // Empty for `.gr` (no AST) or an unmappable macro shape → equal-split fallback.
      const leafCounts = sectionLeafCounts(ast);
      publishProduction(
        id,
        tokens,
        productionSounds,
        headSections ?? [],
        beatDurSec,
        tree,
        symbolNames,
        leafCounts
      );

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
      // orchestrator dispatchers are stopped: a plain mono grammar or a `.kanopi`
      // per-actor voice from another file is left alone so a sibling re-eval / a
      // multi-actor session doesn't cut unrelated voices. A re-eval of the SAME
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

      // CV modulation table (CV.md): teach the dispatcher which terminals are CVs
      // (env1…) and their resolved params + curve, so each CV occurrence routes to
      // `transport.sendCV` (→ the generic curve renderer on the chosen CV input)
      // Modulator registry (name → resolved curve/params) from the `cv … : mod.x(…)`
      // declarations. The dispatcher forwards it to its transports; per-note
      // modulation is applied at `send()` from a note's branchement controls
      // (`leaf.controls` carrying e.g. `cutoff: 'env1'`). No `cvInstances` → {}.
      (dispatcher as unknown as { setModulators(r: Record<string, unknown>): void }).setModulators(
        modulatorsFromAst(ast)
      );

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

        const da = dispatcher as unknown as {
          setActors(t: unknown): void;
          setActorTransport(actor: string, transport: string): void;
          setActorResolver(actor: string, resolver: Resolver): void;
        };
        da.setActors(orchestration.actorTable);
        // Scene-level resolver + sound predicate (the mono concerns, now universal so
        // the single path covers a plain grammar = an orchestration with 1 `default`
        // actor). The scene `@alphabet`/`@tuning` builds a catalog resolver (bohlen,
        // gamelan, …) and marks its notes as sounding; otherwise the western/solfège
        // sniff stays. `soundsFn` decides play-vs-skip per symbol — a note OR a
        // front-end sound assignment sounds, everything else is skipped (it still
        // shows in the Text panel's tree view).
        const sceneCatalog = catalogResolver(declaredAlphabet, declaredTuning);
        const sounding = new Set(soundingSymbols ?? []);
        if (sceneCatalog) for (const n of sceneCatalog.notes) sounding.add(n);
        // Each actor's own alphabet contributes its catalog notes too, so a non-western
        // actor (gamelan/bohlen) sounds (its tokens aren't western note names — without
        // this `soundsFn` would mark them non-sounding rests).
        for (const actor of orchestration.actors) {
          const c = catalogResolver(actor.alphabet, declaredTuning);
          if (c) for (const n of c.notes) sounding.add(n);
        }
        const soundsFn = (token: string) => isNoteName(token) || sounding.has(token);
        const sceneResolver = sceneCatalog ? sceneCatalog.resolver : pickResolver(tokens);
        // Per-actor resolver: an actor's own alphabet wins (catalog for bohlen/gamelan,
        // else western/solfège); the `default` actor (no `@actor`) inherits the scene
        // resolver. The shared WebAudio transport's BASE resolver is the scene one, so
        // an event with NO `payload.actor` (the mono/default case) still resolves right.
        const resolverFor = (alphabet: string): Resolver =>
          catalogResolver(alphabet, declaredTuning)?.resolver ??
          (alphabet === 'solfège' ? makeSolfegeResolver() : makeWesternResolver());
        const webaudio = new WebAudioTransport(ctx, { resolver: sceneResolver });
        let webaudioAdded = false;
        let midi: InstanceType<typeof MidiTransport> | undefined;
        for (const actor of orchestration.actors) {
          const resolver = resolverFor(actor.alphabet);
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
        const orchestratedFilter = (e: DispatchEvent) => {
          if (e.type === 'control') return true;
          if (e.type === 'rest') return false;
          const actor = (e.payload as { actor?: string | null } | null)?.actor;
          if (actor) return true;
          if (Object.prototype.hasOwnProperty.call(isBacktick, e.token)) return true;
          return isNoteName(e.token);
        };
        // Drop events that belong to a CURRENTLY-disarmed actor, read LIVE from
        // the shared `mutedActors` set at the moment the filter runs (initial load
        // AND every re-derived cycle). A note carries its owning actor on
        // `payload.actor`; a code voice (backtick) carries only its BT token, whose
        // owner we resolve through `btToActor`. Without this, re-random re-derives
        // a disarmed voice's events each cycle and re-fires it (the regression):
        // the sink's own live guard then has to catch the BT case, but a native
        // note voice would still re-sound — filtering here keeps BOTH silent and
        // makes the live mute the single source of truth per cycle. Re-arming
        // clears the set, so the next cycle's filter lets the voice back through.
        const notMutedActor = (e: DispatchEvent) => {
          if (mutedActors.size === 0) return true;
          const noteActor = (e.payload as { actor?: string | null } | null)?.actor;
          if (noteActor && mutedActors.has(noteActor)) return false;
          const btActor = btToActor[e.token];
          if (btActor && mutedActors.has(btActor)) return false;
          return true;
        };
        const orchestratedLive = (e: DispatchEvent) => orchestratedFilter(e) && notMutedActor(e);
        const treeEvents = treeToDispatchEvents(
          rawTree as Parameters<typeof treeToDispatchEvents>[0],
          symbolNames
        ).filter(orchestratedLive);
        (dispatcher as unknown as { loadEvents(ev: unknown[]): void }).loadEvents(treeEvents);
        // The events' seconds encode `currentBpm` at derive time — tell the
        // dispatcher so its anchored tempo map can live-rescale (requirement A).
        (dispatcher as unknown as { setDerivedTempo(bpm: number): void }).setDerivedTempo(
          currentBpm
        );
        // Orchestrated path: Kronos drives the REAL note+CV audio for EVERY actor
        // (routed per-actor through `pickTransport`), exactly as on the mono path, AND
        // the CODE voices (Strudel/Hydra backticks) via the Kronos adapter's backtick
        // sink. The dispatcher is NEVER started as an emitter (no `.start()`); it stays
        // the inert transport/resolver/`_actors` structure Kronos reads.
        // The per-actor mute set below is SHARED with the Kronos scheduler (it reads the
        // same `_mutedActors` to skip an actor), so it backs live arm/disarm — not a
        // dispatcher emission guard.
        const da2 = dispatcher as unknown as { setActorMuted(actor: string, muted: boolean): void };
        let kronosAudio: KronosAudioHandle | undefined;
        // Kronos is the ONLY engine (legacy removed): it drives notes + CV + the code
        // voices. The dispatcher is NEVER started as an emitter — it remains purely the
        // transport/resolver/`_actors` structure Kronos reads through `pickTransport`.
        {
          // Kronos drives notes + per-note CV for the scene. `soundsFn` does play-vs-skip
          // (universal: notes + sound-assigned symbols + every actor alphabet's catalog
          // notes sound; backticks are always dispatched, handled in the adapter). The
          // ORCHESTRATED re-derive/live filter (`orchestratedLive`, honours the live mute
          // set) lets re-random/loop re-roll the derivation. Routing is per-actor via the
          // dispatcher's `_actors` map (wired above) + its transports; an event with no
          // actor (the `default`/mono case) falls back to the WebAudio transport's scene resolver.
          kronosAudio = startKronosAudio({
            events: treeEvents,
            audioCtx: ctx,
            derivedTempo: currentBpm,
            loop: looping,
            dispatcher: dispatcher as unknown as Parameters<
              typeof startKronosAudio
            >[0]['dispatcher'],
            startSceneSec: startOffsetSec,
            soundsFn,
            // Model C — PRODUCE/LOAD builds + persists the handle WITHOUT playing it (stopped,
            // silent); the first Play `replay`s it (0 re-derivation). A STEP overrides this.
            buildOnly,
            // STEP audition + re-derive mirror the mono path; a STEP never re-derives.
            reDerive: section ? null : reDeriveTreeEvents(orchestratedLive),
            reRandom,
            step: stepWindow,
            // Kronos is the single emitter: it intercepts BT (code-voice) tokens and
            // fires them through the SAME sink the legacy dispatcher used, and cuts the
            // sustained code voices when the scheduler stops.
            isBacktick: backtickHandles?.isBacktick,
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
        // notes voice is muted on this dispatcher's per-actor note gate. The
        // handle map is keyed by actor name and replaced on each re-eval (`da2`
        // — the dispatcher's per-actor note mute — was declared above).
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
              // (consulted by `orchestratedLive` + the backtick sink), in BOTH engines.
              if (muted) mutedActors.add(actor.name);
              else mutedActors.delete(actor.name);
              if (kronosAudio) {
                // Kronos mode: it drives the notes, so the note mute must reach ITS
                // scheduler. The dispatcher's note-actors are PERMANENTLY muted here
                // (no double audio), so we must NOT toggle `da2` — re-arming it would
                // make the dispatcher start routing this actor's notes too.
                kronosAudio.setActorMuted(actor.name, muted);
              } else {
                // Legacy mode: the dispatcher drives the notes; mute it directly.
                da2.setActorMuted(actor.name, muted);
              }
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
      // Live retune every running voice WITHOUT re-deriving (requirement A): the
      // dispatcher's anchored tempo map rescales its already-loaded events in
      // place — slower BPM spreads notes out, faster compresses — anchored so the
      // currently playing position does not jump. `currentBpm` still updates so
      // the NEXT derivation uses the new tempo.
      for (const voice of voices.values()) {
        (voice.dispatcher as unknown as { setLiveTempo(bpm: number): void }).setLiveTempo(bpm);
        // In kronos mode the Kronos handle (not the legacy dispatcher) drives the
        // audio, so the live retune must reach its clock too — same warp, no
        // re-derivation. Mirrors the re-random / loop live-toggle wiring.
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
        if (voice.kronosAudio) kronosCursor.set(null);
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
