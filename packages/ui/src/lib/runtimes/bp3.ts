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
import { compileBPS } from 'bpscript/src/transpiler/index.js';
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
// Text grammars (bols, words, numbers — half the corpus) route here instead of
// audio: a timestamped-symbol console, fed AS-IS through the same dispatcher.
import { TextTransport } from '../../../../core/src/dispatcher/transports/text.js';
// Per-actor MIDI transport for orchestrator .bps (a voice routed `transport:midi`).
import { MidiTransport } from '../../../../core/src/dispatcher/transports/midi.js';
import { Resolver } from '../../../../core/src/dispatcher/resolver.js';
import { textStream } from '../../stores/textstream.svelte';
// The FULL derived production, set ONCE per eval (the complete TimedToken[] BPx
// produced at derive time, BEFORE playback). Distinct from the over-time
// textStream: this is the whole sequence, the source of truth the Text panel and
// the Structure visualizer read.
import { production } from '../../stores/production.svelte';
import type { ProductionToken, ProductionSection } from '../../stores/production.svelte';
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

/**
 * BPx language adapters (PRIMARY vertical slice).
 *
 * Two languages reach audible WebAudio output through the SAME upstream BPx
 * engine and Kanopi's own dispatcher — only the front-end differs:
 *
 *   .gr  : source → parseBP3 ───────────────────────────┐
 *   .bps : source → compileBPS → BP3 grammar text → parseBP3 ┤
 *                                                        ▼
 *     → SceneAST → createBPx().loadGrammar → derive() → TimedToken[]
 *     → Dispatcher.load() → Dispatcher.start() → WebAudioTransport (+ MIDI sink)
 *
 * Glue only. The frontends (bp3-frontend, bpscript), the engine (bpx) and the
 * dispatcher / transport / resolver (core) are all consumed as-is. BPScript
 * transpiles TO a BP3 grammar (`compileBPS().grammar`), so the `.bps` path just
 * feeds that text into the SAME BP3 front-end the keystone `.gr` uses — no
 * second engine, no token-shape shim. The TimedToken shape BPx emits
 * (`{ token, start, end }` in ms) is exactly what `Dispatcher.load()` reads.
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
  terminalActorMap: Record<string, string>;
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

// `.gr` — native BP3 grammar text straight into the BP3 front-end.
const WESTERN_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const grFrontend: Frontend = (code) => parseWithSound(code, WESTERN_NOTES);

// Head-rule top-level sections of a compiled grammar. The first `S --> …` line
// lists them as `|name|` terminals (or `{a,b}` simultaneous group = one section).
// Mirrors `bpsScenes.headSections` (kept local to avoid an adapter↔core cycle:
// bpsScenes imports core, which imports the registry, which imports this adapter).
function headSectionNames(grammar: string): string[] {
  const line = grammar.split('\n').find((l) => /\bS\s*-->/.test(l));
  if (!line) return [];
  const rhs = line.slice(line.indexOf('-->') + 3).trim();
  const sections: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of rhs) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (buf.trim()) sections.push(buf.trim().replace(/[|{}]/g, ''));
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) sections.push(buf.trim().replace(/[|{}]/g, ''));
  return sections;
}

// `.bps` — BPScript transpiles to a BP3 grammar (`compileBPS().grammar`), which
// we feed into the SAME BP3 front-end as `.gr`. The compiled alphabet drives
// parseBP3's terminal recognition. Two upstream tools, glue only.
const bpsFrontend: Frontend = (code) => {
  const c = compileBPS(code);
  if (c.errors.length > 0) {
    return { ast: null, errors: c.errors.map((e) => ({ line: e.line, message: e.message })) };
  }
  const alphabetNames = c.alphabet?.length ? c.alphabet : WESTERN_NOTES;
  const parsed = parseWithSound(c.grammar, alphabetNames);
  // Backtick voices: compileBPS keys foreign code by the EXACT BT token emitted
  // in the timeline (direct lookup, no parsing). Carry it through so the adapter
  // routes each BT terminal to its interpreter.
  const backticks = (c.backticks ?? {}) as BacktickTable;
  // A5 named scenes: carry the flag→{alias→int} table so the UI can offer one
  // selection button per named scene. Re-evaluating with `flags: { scene: <int> }`
  // makes the matching guarded rule derive (see `evaluate`).
  const flagStates = (c.flagStates ?? {}) as FlagStates;
  const withFlags = Object.keys(flagStates).length > 0 ? { ...parsed, flagStates } : parsed;
  // Declared per-engine banks (`@library.strudel "dirt-samples"`): carry them so
  // the adapter loads each engine's samples before the backtick voices eval.
  const libraries = (c.libraries ?? {}) as Libraries;
  const withLibs = Object.keys(libraries).length > 0 ? { ...withFlags, libraries } : withFlags;
  const withBt = Object.keys(backticks).length > 0 ? { ...withLibs, backticks } : withLibs;
  // Head-rule sections, used to annotate the FULL production with time bounds.
  const sections = headSectionNames(c.grammar);
  const base = sections.length > 0 ? { ...withBt, sections } : withBt;

  // Orchestrator `.bps`: `@actor` declarations compile to an actor table (each
  // actor owns an alphabet + a transport). When present, carry it so the adapter
  // routes each voice to its own transport (midi / webaudio).
  const actorTable = (c.actorTable ?? {}) as Record<
    string,
    { transport?: { key?: string }; alphabet?: string; eval?: string }
  >;
  const names = Object.keys(actorTable);
  if (names.length === 0) return base;
  const orchestration: Orchestration = {
    actorTable,
    terminalActorMap: (c.terminalActorMap ?? {}) as Record<string, string>,
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

// Minimal timed-token shape this adapter reads (BPx emits more fields).
type Tok = { token: string; start: number; end: number };

/**
 * STEP windowing (A5): keep only the tokens of one section of the derivation,
 * re-zeroed in time. The head rule's RHS is a flat sequence of `count` sections
 * (`S -> calm full` → 2); BP3 gives each equal proportions by default, so we
 * slice the derivation's total span into `count` equal windows and keep window
 * `index`, shifting it back to t=0 so it plays immediately. This is an
 * equal-proportion approximation — a section with a `*N` speed or an explicit
 * weight would occupy an unequal span the dispatcher knows but this slice does
 * not (documented limitation; faithful per-section spans need a section→span
 * map from the engine, not yet exposed).
 */
function sliceSection<T extends Tok>(tokens: T[], index: number, count: number): T[] {
  if (count <= 1) return tokens;
  const span = Math.max(...tokens.map((t) => t.end), 0);
  const winLen = span / count;
  const from = index * winLen;
  const to = (index + 1) * winLen;
  // A token belongs to the window whose start falls inside [from, to).
  return tokens
    .filter((t) => t.start >= from - 1e-6 && t.start < to - 1e-6)
    .map((t) => ({ ...t, start: t.start - from, end: t.end - from }));
}

// Build the FULL-production view from a derivation and publish it to the
// production store (the source of truth the Text panel + Structure visualizer
// read). `tokens` are the WHOLE derived sequence (ms start/end); `sounds` is the
// adapter's per-token sound predicate (note OR sounding symbol). Section names
// (head-rule RHS) get equal-proportion time bounds along the same timeline the
// dispatcher uses — matching `sliceSection`'s windowing so STEP and the
// visualizer agree on where each section sits. Set ONCE per eval (replace).
function publishProduction(
  id: Runtime,
  tokens: Tok[],
  sounds: (token: string) => boolean,
  sectionNames: string[]
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
  production.set({ source: id, tokens: prodTokens, durationSec, sections });
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
        sections: headSections
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

      // A5 named scenes: a `.bps` whose rules are ALL guarded by a named scene
      // flag (`[scene==calm] S -> …`) has no rule that derives without a scene
      // set — `S` would stay an unexpanded non-terminal and leak as a bogus
      // token to the audio transport. Match the A5 UX ("a scene is active by
      // default"): when the file declares named scenes and the caller gave no
      // scene, default to the first named one (lowest int). Reflected as the
      // active scene in the scene bar (see `defaultScene` consumers).
      const effectiveFlags = withDefaultScene(src.flags, flagStates);

      let tokens;
      try {
        // `effectiveFlags` (e.g. `{ scene: 2 }`) is applied as the BPx engine's
        // initial flag state, so a flag-guarded rule (`/scene=2/`) derives
        // instead of leaving `S` unexpanded. Absent named scenes → unchanged.
        const bpx = createBPx({ tempo: currentBpm, settings, flags: effectiveFlags });
        bpx.loadGrammar(ast);
        tokens = bpx.derive().tokens;
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
      const actorMap = orchestration?.terminalActorMap ?? {};
      const btTable = backticks ?? {};
      const productionSounds = (token: string) =>
        isNoteName(token) ||
        soundingSet.has(token) ||
        Object.prototype.hasOwnProperty.call(actorMap, token) ||
        Object.prototype.hasOwnProperty.call(btTable, token);
      publishProduction(id, tokens, productionSounds, headSections ?? []);

      // STEP (A5): when a section is requested, keep only that section's tokens
      // (re-zeroed) and play them once. Otherwise loop the whole derivation as
      // usual. The window is an equal-proportion slice of the timeline.
      const section = src.section;
      const looping = !section;
      if (section && section.count > 1) {
        tokens = sliceSection(tokens, section.index, section.count);
        if (tokens.length === 0) {
          log({
            runtime: id,
            level: 'info',
            msg: `step: section ${section.index + 1}/${section.count} is empty`
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
      // (an @devices appliance). The dispatcher does per-token actor lookup
      // (terminalActorMap → actor → transport). MIDI is silent-but-safe without
      // hardware.
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
          setActors(t: unknown, m: Record<string, string>): void;
          setActorTransport(actor: string, transport: string): void;
          setActorResolver(actor: string, resolver: Resolver): void;
        };
        da.setActors(orchestration.actorTable, orchestration.terminalActorMap);
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
        // Defense-in-depth (twin of the default-scene fix above): never hand a
        // structural non-terminal to a transport. In an orchestrated `.bps`,
        // sound routing isn't wired, so any token with no actor mapping that is
        // neither a backtick nor a note would fall through to the WebAudio
        // fallback and log `unresolved terminal`. An unexpanded start symbol
        // (e.g. `S` when no guarded rule matched) is exactly that — drop it.
        const terminalActorMap = orchestration.terminalActorMap;
        const isBacktick = backticks ?? {};
        const playable = tokens.filter((t: Tok) => {
          if (Object.prototype.hasOwnProperty.call(terminalActorMap, t.token)) return true;
          if (Object.prototype.hasOwnProperty.call(isBacktick, t.token)) return true;
          return isNoteName(t.token);
        });
        dispatcher.load(playable);
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

      // Per-symbol sound routing (decision routage-texte-son-par-symbole): a
      // token sounds if it's a note OR its symbol carries a sound assignment
      // from the front-end — those go to audio/MIDI; everything else streams to
      // the symbolic console. Both transports share one dispatcher, so a mixed
      // grammar voices its sounding symbols AND prints the rest, in time.
      const sounding = new Set(soundingSymbols ?? []);
      const soundsFn = (token: string) => isNoteName(token) || sounding.has(token);

      const resolver = pickResolver(tokens);
      dispatcher.addTransport('default', new WebAudioTransport(ctx, { resolver }));
      // The dispatcher routes via per-token resolver/transport lookup; this
      // global resolver is the fallback the WebAudio path uses for pitches.
      (dispatcher as unknown as { _resolver: Resolver })._resolver = resolver;
      dispatcher.addTransport(
        'text',
        new TextTransport({
          onSymbol: (s) =>
            textStream.push({ token: s.token, startSec: s.startSec, durSec: s.durSec })
        })
      );
      (
        dispatcher as unknown as {
          setSoundRouting(fn: (t: string) => boolean, name: string): void;
        }
      ).setSoundRouting(soundsFn, 'text');
      // Label the console panel when this grammar will emit any non-sounding symbol.
      if (tokens.some((t: { token: string }) => !soundsFn(t.token))) textStream.setSource(id);

      dispatcher.load(tokens);
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
