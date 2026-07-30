import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';
import type { Runtime } from '../core-mock';
import { compileBps } from './compile-cache';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';
import {
  parseBP3,
  parseSeFile,
  parseSoundObjects,
  parseAlFile,
  alphabetSoundRef
} from 'bp3-frontend';
import type { FileRef, SeEngineSettings, ParseBP3Result } from 'bp3-frontend';
// L'ACTEUR VIENT DU TYPE PUBLIÉ, il ne se redéclare pas ici. `SceneActor` était une forme
// INVENTÉE par la copie de surface locale (supprimée le 2026-07-28) : l'amont n'a jamais publié ce
// nom. On dérive donc l'acteur de ce qu'il publie vraiment — l'arbre de `parseBP3`.
type Bp3Actor = NonNullable<NonNullable<ParseBP3Result['ast']>['actors']>[number];
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
// bpscript's musical catalogs, imported AS-IS (same path as
// lib/library/resources.ts). A `.bps` that declares `@alphabet.X` (+ optional
// `@tuning.Y`) resolves its pitches through these — bohlen-pierce, gamelan, etc.
import alphabetsJson from 'bpscript/lib/alphabets.json';
import tuningsJson from 'bpscript/lib/tunings.json';
import temperamentsJson from 'bpscript/lib/temperaments.json';
import octavesJson from 'bpscript/lib/octaves.json';
import scalesJson from 'bpscript/lib/scales.json';
// CV modulation library (`mod.adsr/lfo/ramp`): the param signatures AND the curve
// shape live here (declarative segments), consumed AS-IS — Kanopi's transport
// renders the curve generically, no built-in modulator. See CV.md.
import modLibJson from 'bpscript/lib/mod.json';
// Registre des VOIX (`lib/voices.json`, domaine 'voice' — LANG-SONS-3, résolution voix Kairos
// 79118df) : jumelle de `pitchLib`/`digitalLib`, donnée read-only fournie par l'hôte (L26).
// Kairos RÉSOUT terminal→voix (réf de l'acteur / binding d'alphabet), cascade `for:<device>`,
// et grave `content.voice`. ABSENT ⇒ pas de facette voix (rétro-compat : oscillateur du runtime).
// L'hôte TRANSPORTE le registre, il ne l'interprète pas. Le RENDU du backtick de voix (aval,
// runtime-audio) est tenu jusqu'à l'étude son [828] — ici c'est la plomberie de l'injection.
import voicesJson from 'bpscript/lib/voices.json';
// Lib de FONCTIONS DIGITALES fournie (KAI-B03) — jumelle de `mod.json` (CV) : Kairos applique
// ces fonctions TS déterministes (ex. `transpose`) à la projection. Donnée read-only fournie par
// l'hôte (3 provenances, comme PITCH_LIB) ; sans elle Kairos retombe sur un repli hérité hardcodé.
// SOURCE : le `body` (code TS de chaque fonction) n'est PAS dans `lib/digital.json` (signature seule) —
// il est CAPTÉ depuis `lib/digital/<fn>.ts` dans le BUNDLE navigateur `libs-data.js` (libs-bundle.js:52,
// commentaire de digital.json). On consomme donc `LIBS.digital` (avec body), pas le JSON nu.
import { LIBS as BPSCRIPT_LIBS } from 'bpscript/src/transpiler/libs-data.js';
import {
  createSession,
  renderChain,
  type SceneAST,
  type Session,
  type TimedToken as BpxTimedToken
} from 'bpx';
// [745] Interrupteur de la trace de dérivation — LU seul (jamais `setTraceEnabled`,
// matière propre de la vue Texte). L'hôte PORTE la valeur à la construction de la
// Session, il ne la résout ni ne l'abonne.
import { traceEnabled } from 'runtime-ui';
// KAN-orchestration P1 — Kairos is the SOURCE of the played timeline (projects the BPx
// tree into a Kronos Timeline, exposes a StructureSource the Transport PULLs). Consumed
// AS-IS: the host `charger`s it with the tree + BPx projection context, then hands it to
// `startKronosAudio`. Kairos is the SOLE projection source — no parallel host-side flattener.
import { Kairos } from '@kairos/core';
import { BUNDLED_SE, BUNDLED_SOUND, BUNDLED_AL } from './bp3-aux';
// Audio output lives in runtime-audio: it provides the CV-curve factory `exprSource`
// (compiles a backtick curve → ModulationSource), injected into Kronos's composition
// so Kanopi NEVER compiles/renders CV. The AudioRuntime itself is built in kronos-audio.
import { exprSource } from 'runtime-audio';
// Sortie MIDI — l'adaptateur uniforme de runtime-MIDI (frontière hôte↔runtimes, Phase 2).
// `createMidiRuntime` POSSÈDE son transport, résout le canal (output.channel) et normalise la
// vélocité DANS le paquet : l'hôte ne construit plus de transport, ne calcule plus vel/127 ni le
// canal (écarts #2/#3/#4/#6 rapatriés). Kanopi ne fait que l'enregistrer sur Kronos par sa clé ;
// Kronos lui passe l'événement BRUT et câble l'horloge+le bus via `bindClock`.
import { createMidiRuntime } from 'runtime-midi';
// Pitch resolution (token → Hz) AND the alphabet-aware "sounds" classification both live
// in KAIROS now: it OWNS the pitch module and GRAVES `content.pitch.hz` + `content.sounds`
// per note (KAI-10), from the catalogs the host supplies as `ctx.pitchLib`. Kanopi RESOLVES
// NOTHING and runs NO resolver — it only hands the `PitchLib` DATA down and READS the graven
// facets. The host imports ZERO of `@kronos/core/pitch` (logic AND type); only the `PitchLib`
// type survives, sourced from `@kairos/core` (the module's new owner), for the catalog constant.
import { type PitchLib, type DigitalLib } from '@kairos/core';
// Tree-derived dispatch events (M5+ multi-actor refacto): flatten BPx's
// `derive({ output: 'complete' }).tree` to ordered events that each carry their
// OWN actor/params payload, so a terminal shared by two actors routes distinctly.
// Kairos owns CV COMPOSITION (frontier R2 ; `buildModulators`/ModLib/ExprSource MIGRÉS de Kronos
// vers @kairos/core — point 5, kairos 094abf3). `buildModulators` fuses the scene's `cv … : mod.x(…)`
// declarations with the `mod` library into the modulator registry. The host builds it once and hands
// it to Kairos (`charger`'s `modulation:{registry,…}`); Kairos's projection composes the bindings at
// flatten (KRO-24). Consumed AS-IS. (Ménage point 3 — passer les données BRUTES plutôt qu'appeler
// buildModulators côté hôte — reste SÉPARÉ, plus tard : il touche la compo CV.)
// KRO-24 / KAI-9-10 — la COMPOSITION CV appartient à Kairos (il détient l'arbre, lit les cvInstances
// SUR l'arbre — tree.metadata.cvInstances, BPx ad4dfed — et compose à l'aplatissement). L'hôte ne
// COMPOSE plus : il n'appelle/importe plus `buildModulators` ; il forwarde l'arbre + la donnée-
// librairie de contexte (`modLib`, L26, hors arbre) + la fabrique de courbes `exprSource`.
import { type ModLib, type ExprSource } from '@kairos/core';
// Kronos drives the REAL audio (the only engine; legacy removed). The Kronos
// scheduler produces the timed events; a thin adapter bridges each to the existing
// WebAudio synth.
import { startKronosAudio, type KronosAudioHandle } from './kronos-audio';
import { DEFAULT_BEATS_PER_BAR, type MeterLike } from './meter';
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
// [921] Mode test : graine figée au lancement (`?seed=N`). POSÉ → tout produce + le re-roll
// utilisent CETTE graine (à la place de `freshSeed`) et le rattrapage `_randomize` NE s'arme PAS
// (refus honnête = reproductibilité tenue). ABSENT → défaut vivant intact.
import { testSeed, isTestMode } from '../mode-test';
// Session-global transport toggles (loop on/off, re-random per cycle on/off).
// Read FRESH at each play so the user's transport setting at play time decides
// looping + whether the grammar re-derives each cycle.
import { transport } from '../../stores/transport.svelte';
import type {
  ProductionToken,
  ProductionTree,
  RawTimedToken
} from '../../stores/production.svelte';
// Device library (@devices): resolve a voice's `transport.<name>` to a typed
// device and gate voice↔device compatibility BEFORE routing (DEVICES_SPEC §3,
// §4 / ADAPTER_SPEC §1bis b). Kanopi owns resolution; bpscript carries the
// name opaque.
import { resolveDevice, isCompatible, type Device } from '../devices/registry';
import type { VoiceOutputType } from './adapter';
// `@library.<engine>` bank loading: resolve a declared bank id against the
// upstream guestLibraries registry (SOURCE OF TRUTH — no host-side catalog) and
// load it through the Strudel `samples()` path. The adapter only maps ids → loader.
import {
  loadSampleBank,
  codeVoiceAdapters,
  createCodeVoicesRuntime,
  guestLibraries,
  mercurySamplesInPatch,
  // Catalogue des modules son (LANG-SONS §8-9) — SOURCE DE VÉRITÉ UNIQUE que l'hôte injecte à Kairos
  // dans `ActionLib`, via les deux aplatisseurs AUTORITAIRES du catalogue (demandes [155]/[156], pas de
  // 2e source hôte) : `catalogPortTypes()` = `{module:{port:type}}` (classe les actions) ;
  // `sinkRuntimeMap()` = `{module PUITS → runtime}` (route l'arm/cut). `moduleCatalog` sert seulement à
  // l'expansion des ALIAS (saw/sawtooth, tri/triangle). PORTER≠RÉSOUDRE : on transporte, Kairos résout.
  moduleCatalog,
  catalogPortTypes,
  sinkRuntimeMap
} from 'runtime-codevoices';
// Préchauffage au CHARGEMENT (design ratifié archi [589]) : entrée de PAQUET `preload` (résout les
// interps + warme les moteurs voix-de-code). Namespace import DÉFENSIF (historique : `preload`
// n'était pas encore exportée à l'écriture de ce module → `codevoices.preload` pouvait être
// `undefined` → `?.()` no-op) ; conservé tel quel, la fabrique publie désormais un type de
// surface réel (`runtime-codevoices` — plus de copie locale `.d.ts`).
import * as codevoices from 'runtime-codevoices';
// Helper hôte : énumération des interprètes voix-de-code d'une scène + réveil défensif du contexte
// audio des sorties (no-op tant que runtime-audio n'expose pas `warmup`).
import { codeVoiceInterps } from './warmup';
// OSC output (OSC-5b): the osc-bridge WS→UDP relay endpoint. Kanopi's WebSocket
// transport (built in startKronosAudio) connects here; the relay forwards UDP.
import routingJson from '../../../../library/routing.json';

/**
 * BPx language adapters (PRIMARY vertical slice).
 *
 * Two languages reach audible WebAudio output through the SAME upstream BPx
 * engine — only the front-end differs:
 *
 *   .gr  : source → parseBP3 ──────────────┐
 *   .bps : source → compileToBPxAST ────────┤  (SceneAST direct, voie AST propre)
 *                                           ▼
 *     → SceneAST → createBPx().loadGrammar → derive({output:'complete'})
 *     → tree (+ payload par nœud) → Kairos (projection) → Kronos timeline
 *     → routage PAR ACTEUR (payload.actor) → WebAudioTransport (+ MIDI sink)
 *
 * Glue only. Les frontaux (bp3-frontend, bpscript) et le moteur (bpx) sont
 * consommés tels quels. SOURCE UNIQUE = l'arbre : `.bps` passe par
 * `compileToBPxAST` (AST direct, plus
 * d'aller-retour par le texte BP3 ni de tables parallèles) ; `.gr` par parseBP3
 * (le `.gr` EST du texte natif). Toute la structure (acteurs, scènes, drapeaux,
 * bibliothèques, backticks) est lue DEPUIS l'arbre.
 *
 * The slice scopes to ONE engine instance + ONE transport per file.
 */

// The 5 shared pitch catalogs (`bpscript/lib`), handed to Kairos as the read-only
// `ctx.pitchLib` so IT builds the resolver and graves `content.pitch.hz`/`content.sounds`.
// Kanopi embeds no resolution logic and runs no resolver — it only supplies this DATA.
// The catalogs carry doc-only `_comment` keys, so cast through `unknown`.
// UNE SEULE SOURCE, celle de l'amont. Les conventions du moteur BP3 natif (`bp3_english`,
// `bp3_fr`, `bp3_indian`) sont des entrées ORDINAIRES de ces catalogues depuis le 2026-07-29 :
// bp3-frontend les a livrées VERBATIM à BPScript, qui les porte désormais (chaque entrée cite sa
// provenance). Un seul `ctx.pitchLib`, un seul résolveur Kairos générique — aucune branche BP3.
//
// ⛔ CE QUI A ÉTÉ RETIRÉ ICI, ET POURQUOI IL NE DOIT PAS REVENIR (2026-07-30) : l'hôte étalait
// PAR-DESSUS un second catalogue, `BP3_PITCH_CATALOG`, qu'exportait alors bp3-frontend — cet export
// A DEPUIS ÉTÉ SUPPRIMÉ CHEZ EUX (leur c35de48, dans la foulée de ce retrait) ; le symbole n'existe
// donc plus nulle part, et le nommer ici raconte l'histoire, il ne désigne rien de vivant. Ses clés
// étaient déclarées « disjointes des clés BPScript ». C'était FAUX et mesuré : les trois alphabets, les
// trois accordages et l'octavier `bp3_fr` existaient des DEUX côtés. Comme cet étalement passait
// en SECOND, c'est la copie vouée au retrait qui était en vigueur à l'exécution — la bifurcation
// silencieuse que ce dépôt interdit. Les deux formes avaient déjà divergé (7 naturelles + table
// d'altérations contre 21 notes en dur ; degrés `[0,2,4,5,7,9,11]` contre `[0,1,…,12,…]` ;
// tempérament `12TET` contre `tet12`). Elles restaient équivalentes en HAUTEUR : mesuré sous
// graine figée, les 14 grammaires `.gr` publiées et les 6 scènes `.bps` qui déclarent un alphabet
// `bp3_*` gravent EXACTEMENT les mêmes fréquences avec ou sans l'étalement. Le retrait est donc
// neutre à l'oreille — et il enlève la seule chose qui décidait laquelle des deux formes gagnait.
const PITCH_LIB: PitchLib = {
  alphabets: alphabetsJson as unknown as PitchLib['alphabets'],
  tunings: tuningsJson as unknown as PitchLib['tunings'],
  temperaments: temperamentsJson as unknown as PitchLib['temperaments'],
  scales: scalesJson as unknown as PitchLib['scales'],
  octaves: octavesJson as unknown as PitchLib['octaves']
};

// The provided DIGITAL function library (`bpscript/lib/digital.json`), handed to Kairos as the
// read-only `ctx.digitalLib` — the exact sibling of `PITCH_LIB`. Kairos applies these deterministic
// TS functions (e.g. `transpose`) AT PROJECTION (KAI-B03); the host supplies the DATA and runs no
// function itself. Without it Kairos falls back to its legacy hardcoded transpose. `_comment` doc
// keys → cast through `unknown`. Personal/community digital libs overlay here later (3 provenances).
const DIGITAL_LIB: DigitalLib = BPSCRIPT_LIBS.digital as unknown as DigitalLib;

// ActionLib (LANG-SONS §4/§8/§9) — deux vues AUTORITAIRES du catalogue runtime-codevoices, injectées
// pour Kairos (PORTER≠RÉSOUDRE : on transporte, Kairos résout). Source de vérité UNIQUE = les
// aplatisseurs du catalogue (demandes [155]/[156]), pas une ré-implémentation hôte :
//  • `modules` = `catalogPortTypes()` (`{module:{port:type}}`) → Kairos classe l'appel-composant opaque
//    en `content.action`. On ajoute par-dessus les ALIAS (saw/sawtooth, tri/triangle) en clés-modules
//    jumelles : Kairos fait un lookup BRUT `modules[module]?.[port]` (aucune résolution d'alias chez
//    lui) → sans expansion, un `tri.freq` émis crierait à tort (les alias sont dans le catalogue même).
//  • `runtimeParModule` = `sinkRuntimeMap()` (`{module PUITS → runtime déclaré}`, arbitrage [414]) →
//    Kairos grave `output.runtime` sur l'arm/cut d'une voix persistante (le module TERMINAL du câblage
//    `saw>>lpf>>audio` = `audio` décide OÙ router). ZÉRO nom de runtime en dur (ni hôte ni Kairos : le
//    runtime est DÉCLARÉ par le sink au catalogue, runtime-codevoices f694701) ; module PUITS sans
//    runtime ⇒ `content.controlError` fail-loud côté Kairos, jamais un drop silencieux (bug [414]).
const ACTION_LIB = {
  modules: (() => {
    const modules: Record<string, Record<string, string>> = catalogPortTypes();
    for (const m of moduleCatalog) for (const a of m.aliases ?? []) modules[a] = modules[m.name];
    return modules;
  })(),
  runtimeParModule: sinkRuntimeMap()
};

// HomomorphismLib (`lib/homomorphism`, fonction `substitute`) — jumelle structurelle de `digital` :
// on consomme `LIBS.homomorphism` (AVEC le `body` TS capté depuis `lib/homomorphism/substitute.ts`
// par libs-bundle, PAS le JSON nu qui n'a que la description). Kairos APPLIQUE la substitution de
// symbole à la résolution (HOST-HOMOLIB-INJECT). SÛR à injecter : BPx NE SUBSTITUE PLUS au niveau
// feuille (ex-`applyImage` retiré, session.ts:1155 / node.ts:495 de BPx e339dec ; bascule PROUVÉE
// anti-double-substitution par l'e2e ISO HZ 75/75 de kairos 63f38b2). Le `Image()` de TEMPLATE reste
// un mécanisme BPx séparé et inchangé, non concerné par cette lib.
const HOMOMORPHISM_LIB = BPSCRIPT_LIBS.homomorphism;

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
  // and a transport (midi / audio). Present only for orchestrator `.bps`.
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
// rare grammar that references a sound file directly.
//
// ⛔ PLUS D'ALPHABET DE REPLI (2026-07-29, bp3-frontend db2a1ab). Ce lecteur recevait une liste de
// notes à mettre dans `alphabetNames` quand la grammaire n'a pas de `-al` — et cette liste ne
// partait pas que dans la tokenisation : elle alimentait la TABLE D'ALPHABET du natif. Mesuré en
// face : 58 grammaires sur 113 en sortaient avec « C C# D D# E F… » pour table, alors qu'une note
// n'y a rien à faire et que l'ABSENCE y veut dire « je ne sais pas », pas « vide ». Pas de `-al`
// → on ne passe RIEN, et l'absence reste franche.
export function resolveGrAux(
  fileRefs: FileRef[],
  load: AuxLoader
): { alphabetNames: string[] | undefined; soundSymbols: string[] } {
  const alRef = fileRefs.find((r) => r.prefix === 'al');
  if (alRef) {
    const alText = load('al', alRef.name);
    if (alText) {
      let alphabetNames: string[] | undefined;
      try {
        const names = parseAlFile(alText);
        if (names.length) alphabetNames = names;
      } catch {
        /* -al illisible → aucune table, pas une table inventée */
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
  return { alphabetNames: undefined, soundSymbols };
}

// The sounding non-note symbols the front-end assigned (actors[0].assignments),
// each `{ subject }` being an alphabet symbol that carries a sound.
function soundingFromAst(ast: unknown): string[] {
  const actors = (ast as { actors?: Bp3Actor[] } | null)?.actors;
  return (actors?.[0]?.assignments ?? []).map((a) => a.subject);
}

// Resolve the `-se` engine settings a grammar references. parseBP3 surfaces the
// reference in `fileRefs`; we load the bundled `-se` text and let the upstream
// parser interpret it. NO `-se` reference → undefined (legitimate: the grammar
// wants the engine default). But a REFERENCED-yet-missing/unparseable `-se` is a
// BUG, not a graceful default: the scene silently falls to a 1000 ms beat (×4/3
// off the native tempo, e.g. acceleration) with NO signal. Per « l'hôte n'invente
// rien / pas de repli silencieux », we WARN LOUDLY (once per name) instead of
// swallowing it. Degradation stays graceful (no throw → the scene still plays),
// but it is never SILENT — and `se-bundle-coverage.test.ts` catches it at build time.
const _warnedSe = new Set<string>();
function warnSeOnce(msg: string): void {
  if (_warnedSe.has(msg)) return;
  _warnedSe.add(msg);
  console.warn(`[bp3] ${msg}`);
}
export function resolveSeSettings(fileRefs: FileRef[]): SeEngineSettings | undefined {
  const ref = fileRefs.find((r) => r.prefix === 'se');
  if (!ref) return undefined; // pas de -se référencé → défaut moteur voulu, RAS
  const text = BUNDLED_SE[ref.name];
  if (!text) {
    warnSeOnce(
      `-se « ${ref.name} » référencé par la scène mais ABSENT de BUNDLED_SE → timing moteur ` +
        `par défaut (1000 ms/beat, ×4/3 hors tempo natif). Ajouter se.${ref.name}.json au bundle.`
    );
    return undefined;
  }
  try {
    return parseSeFile(text).engine;
  } catch (e) {
    warnSeOnce(
      `-se « ${ref.name} » bundlé mais NON PARSABLE (${(e as Error)?.message ?? e}) → timing ` +
        `moteur par défaut (×4/3 hors tempo natif).`
    );
    return undefined;
  }
}

// Le TEXTE du `-se` que la grammaire référence, rendu TEL QUEL au frontal (2026-07-29,
// bp3-frontend db2a1ab). La convention de notes y est écrite ; c'est LUI qui l'en tire, pas moi.
// Avant, j'ouvrais ce fichier pour en extraire un entier (0 anglaise / 1 française / 2 indienne)
// que je repassais en option — la convention traversait donc ma frontière alors que la règle dit
// qu'elle n'est connue que du frontal (décision
// `hub/decisions/2026-07-29-notre-mecanique-n-utilise-que-des-alphabets.md`). Je PORTE le fichier,
// je ne le RÉSOUS plus. Absent du bundle → undefined : le frontal appliquera son propre défaut,
// ce n'est plus à moi d'en avoir un.
export function resolveSeText(fileRefs: FileRef[]): string | undefined {
  const ref = fileRefs.find((r) => r.prefix === 'se');
  if (!ref) return undefined;
  return BUNDLED_SE[ref.name];
}

// Parse a BP3 grammar with per-symbol sound routing. parseBP3 surfaces the
// `-so`/`-mi`/`-cs` references in fileRefs; we load those, learn which symbols
// sound, and re-parse so the front-end can assign them (actors[0].assignments).
// All-note / no-prototype grammars need no second pass.
function parseWithSound(code: string) {
  // 1re passe SANS RIEN : elle ne sert qu'à récupérer les `fileRefs` (dont le `-se`), et ceux-là ne
  // dépendent pas de la tokenisation des notes. Je passais ici une liste de notes anglaises — un
  // défaut de convention déguisé en argument.
  const first = parseBP3(code);
  // 2e passe : je rends au frontal LE TEXTE du `-se` (`seText`), et c'est LUI qui en tire la
  // convention de notes (2026-07-29, bp3-frontend db2a1ab). La convention ne traverse plus ma
  // frontière : je ne l'extrais pas, je ne la nomme pas, je ne la choisis pas. `alphabetNames`
  // redevient ce que son nom dit — les noms du `-al`, et rien d'autre ; absent → je ne passe rien.
  const seText = resolveSeText(first.fileRefs);
  const { alphabetNames, soundSymbols } = resolveGrAux(first.fileRefs, bundledAuxLoader);
  const reparse = soundSymbols.length > 0 || alphabetNames !== undefined || seText !== undefined;
  const r = reparse ? parseBP3(code, { alphabetNames, soundSymbols, seText }) : first;
  return {
    ast: r.ast,
    errors: r.errors.map((e) => ({ line: e.line, message: e.message })),
    settings: resolveSeSettings(r.fileRefs),
    soundingSymbols: soundingFromAst(r.ast)
  };
}

// `.gr` — native BP3 grammar text straight into the BP3 front-end. The head
// rule's top-level non-terminals are NOT read here — voir la note « SECTIONS » en
// tête de `publishProduction`.
const grFrontend: Frontend = (code) => {
  const base = parseWithSound(code);
  // `.gr` (BP3) has no `@actor`, but bp3-frontend materializes one IMPLICIT `default`
  // actor (audio transport, `synthetic:true`) in the AST — so its events carry
  // `output.runtime='audio'` and it travels the SAME orchestrated path as `.bps`. Read
  // the orchestration straight off that AST; no host-synthesized default.
  const orchestration = buildOrchestration(base.ast as SceneAstView | null);
  return orchestration ? { ...base, orchestration } : base;
};

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

// Declared metronome from the AST directives: `@tempo:70` (v0.8 canon, arbitrage
// 2026-06-26) OR the legacy `@mm:70` parse to a `Directive` with `name:'tempo'`/`'mm'`,
// `value:70`. This is the tempo the BPx engine derives note durations at, so the central
// clock + STEP grid (`beatDurSec = 60/bpm`) MUST adopt it or the displayed tempo and the
// produced timeline diverge (a 70 bpm derivation stepped at 128 bpm yields fractional,
// phantom beats). We read BOTH names — matching `writeMmDirective` — so a migrated `@tempo`
// scene keeps its declared tempo instead of falling back to BPx's default (60). Absent →
// undefined (keep the current tempo).
function mmFromAst(a: SceneAstView | null): number | undefined {
  for (const d of a?.directives ?? []) {
    const node = d as { name?: string; value?: unknown };
    if (
      (node.name === 'mm' || node.name === 'tempo') &&
      typeof node.value === 'number' &&
      node.value > 0
    ) {
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

// Backtick (code-voice) table from the AST: DFS for backtick nodes → `{ [_btName]:
// { interp, code } }`. bpscript emits TWO node types for the same backtick concept:
// `BacktickInline` (the backtick IS an actor's whole rule body, e.g. `groove -> `…``)
// and `BacktickStandalone` (a backtick sitting as ONE terminal among several in a
// rule's flow, e.g. `S -> C4 `strudel: …` E4` — confirmed on the AST dump, both carry
// `_btName`/`tag`/`code` identically). Missing the second type here left `backticks`
// empty for any scene using a standalone backtick terminal, so `codeVoicesRuntime`
// was never built and Kronos never got a 'code' sink for it (regression: silent
// standalone Strudel/Hydra/… backtick terminals, Romain 2026-07-14, corpus A/B diag).
// Each node carries `_btName` (the BT token the derivation emits), `code`, and the
// RESOLVED `interp` (its `tag`, or — untagged — the owning actor's `eval`, resolved by
// bpscript on the node: the one genuine language-semantic). Replaces compileBPS's
// `backticks` sidecar — single source of truth = the tree (BPscript 94c6f53, compileToBPxAST).
const BACKTICK_NODE_TYPES = new Set(['BacktickInline', 'BacktickStandalone']);
function backticksFromAst(ast: unknown): BacktickTable {
  const out: BacktickTable = {};
  const seen = new Set<unknown>();
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object' || seen.has(n)) return;
    seen.add(n);
    const node = n as Record<string, unknown>;
    if (BACKTICK_NODE_TYPES.has(node.type as string) && typeof node._btName === 'string') {
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

// L ACTEUR D UNE VOIX DE CODE SE LIT SUR LE BLOC, PAR LA GRAPHIE — jamais sur le nom de la règle.
//
// ⚠️ CE QUI ÉTAIT LU AVANT, ET POURQUOI C'EST MORT (2026-07-29). Cette fonction lisait le NOM DE LA
// TÊTE DE RÈGLE et le cherchait dans la table des acteurs : `groove -> \`…\`` liait le bloc à
// l'acteur `groove` PARCE QUE LES DEUX PORTAIENT LE MÊME NOM. Romain a interdit cette homonymie —
// un acteur est un ensemble de terminaux, une tête de règle est une étiquette, les amalgamer est
// une erreur. Ce chemin ne peut donc plus RIEN trouver : une tête ne peut plus porter un nom
// d'acteur. Il est RETIRÉ, pas gardé à côté.
//
// CE QUE ÇA COÛTAIT DE NE PAS LE VOIR, mesuré à l'écran avant la réparation : avec un bloc
// simplement TAGUÉ (`\`strudel: …\``), le langage revenait mais l'identité NON — le bloc
// n'appartenait à personne. Le muet par acteur du mixeur et l'armement perdaient leur sujet, et
// surtout LE VOYANT DE SANTÉ RESTAIT VERT pendant qu'une voix erreurait en continu (le répartiteur
// clé ses erreurs en `fichier::acteur`, plus personne ne répondait à ce nom). 52 scènes, 59 acteurs.
//
// LA GRAPHIE : `acteur.\`code\`` — l'acteur qualifie le bloc à droite, là où il qualifie déjà une
// note. Elle rend les DEUX : le langage (le moteur déclaré de l'acteur) ET l'identité. Le nœud
// porte alors `actor` en clair, et c'est CE champ qu'on lit. Un tag explicite reste prioritaire
// pour le langage, mais il ne dit rien de l'acteur : un bloc tagué sans point est un ORPHELIN
// ASSUMÉ (une ligne ponctuelle dans le flux), et il n'a pas d'entrée ici — c'est voulu.
export function btTokenByActor(ast: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<unknown>();
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object' || seen.has(n)) return;
    seen.add(n);
    const node = n as Record<string, unknown>;
    if (
      typeof node.type === 'string' &&
      node.type.startsWith('Backtick') &&
      typeof node.actor === 'string' &&
      typeof node._btName === 'string'
    ) {
      out[node.actor] = node._btName;
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

/**
 * PRÉCHAUFFAGE À L'OUVERTURE ([762]/#755.1) — les interprètes voix-de-code qu'une scène DÉCLARE,
 * lus sur l'AST COMPILÉ via les MÊMES extracteurs que le produce (`buildOrchestration` +
 * `backticksFromAst` → `codeVoiceInterps`) : AUCUNE re-dérivation texte côté hôte (l'AST est la
 * source). Vide pour une scène sans voix de code. L'hôte s'en sert pour appeler `preload` DÈS
 * l'ouverture (pas seulement au produce/play) : quand l'utilisateur joue, le moteur est déjà chargé
 * (seul l'unlock du contexte audio attend le geste, règle autoplay). `compileBps` est mémoïsé →
 * appeler ceci à chaque changement de fichier actif est bon marché (même compile que la puce d'état).
 */
export function interpsForScene(text: string): string[] {
  let c: { ast?: unknown };
  try {
    c = compileBps(text) as typeof c;
  } catch {
    return [];
  }
  const a = (c.ast ?? null) as SceneAstView | null;
  if (!a) return [];
  return codeVoiceInterps(buildOrchestration(a), backticksFromAst(c.ast));
}

/** Une ENTRÉE déclarée par la scène — recopiée VERBATIM du nœud `InDirective` de l'AST amont
 *  (`bpscript/src/transpiler/parser.js:1211`). L'hôte ne complète rien : `mapping` reste `null`
 *  quand la scène n'invoque aucune table, parce qu'il n'existe AUCUNE table par défaut (décision
 *  `2026-07-27-forme-des-entrees-in-mapping-adresse-nue.md`). */
export interface DeclaredInput {
  /** Le RÔLE, tel que la scène le nomme (`@in pedale …`) — jamais un nom d'appareil. */
  readonly name: string;
  /** Le canal d'entrée déclaré : `midi` · `keyboard` · `osc`. Liste FERMÉE tenue en amont. */
  readonly transport: string;
  /** La table de correspondance invoquée, ou `null`. */
  readonly mapping: string | null;
}

/**
 * LES ENTRÉES QUE LA SCÈNE DÉCLARE — lues sur l'AST compilé, jamais re-analysées du texte.
 *
 * Même statut que `interpsForScene` juste au-dessus : `compileBps` est mémoïsé, donc appeler ceci
 * à chaque frappe coûte le même compile que la puce d'état. Une scène qui ne compile pas ne
 * déclare rien de lisible — liste vide, sans cri : la faute de compilation se dit déjà ailleurs
 * (voyant de santé), la redire ici ferait deux voix pour un seul défaut.
 *
 * CE QUE L'HÔTE EN FAIT, ET SA LIMITE : il PRÉSENTE ces rôles et laisse l'utilisateur y associer un
 * appareil réel. Il ne route rien — associer un événement reçu au rôle qui l'attend est le mandat
 * du routeur de BPx (`entrees/routeur.ts`), à qui l'hôte tend l'événement VERBATIM et l'association
 * en DONNÉE (voir `pousserEvenementEntree` plus bas ; contrat `hub/contrats/hote-runtime-in.md`).
 */
export function declaredInputsForScene(text: string): readonly DeclaredInput[] {
  let c: { ast?: unknown };
  try {
    c = compileBps(text) as typeof c;
  } catch {
    return [];
  }
  const inputs = (c.ast as { inputs?: unknown } | null)?.inputs;
  if (!Array.isArray(inputs)) return [];
  return inputs
    .filter((d): d is { name: string; transport: string; mapping?: string | null } => {
      const n = d as { name?: unknown; transport?: unknown };
      return typeof n?.name === 'string' && typeof n?.transport === 'string';
    })
    .map((d) => ({ name: d.name, transport: d.transport, mapping: d.mapping ?? null }));
}

// ════════════════════════════════════════════════════════════════════════════════
// [994] LE BRANCHEMENT DU POINT D'ATTENTE — deux fils, aucune décision
// ════════════════════════════════════════════════════════════════════════════════
//
// La chaîne complète est : une touche arrive sur le bus → le routeur de BPx décide QUEL point
// d'attente elle lève (il connaît les `@in` déclarés ET les points écrits dans l'arbre) → la porte
// de Kairos désarme le point → Kronos, qui consulte l'état armé à l'instant du gel, repart.
//
// L'HÔTE N'EST NI L'UN NI L'AUTRE BOUT. Il tient exactement les deux fils que personne d'autre ne
// peut tenir, parce que lui seul voit les deux côtés à la fois :
//   1. il REMET la porte de Kairos à BPx (`brancherPorteAttente`) — Kairos dépend de BPx et jamais
//      l'inverse, donc le routeur ne peut pas l'importer ;
//   2. il POUSSE l'événement du bus vers ce routeur, VERBATIM.
// Il ne lit aucun signal, ne compare aucune adresse, ne connaît aucune touche : `signal` traverse
// opaque. Décisions `2026-07-27-le-routage-d-entree-rejoint-le-map-existant.md` (« l'hôte branche
// le bus, il ne route pas ») et `2026-07-27-la-levee-passe-par-la-porte-de-kairos-le-streaming-
// sort.md` (la porte de Kairos est l'unique voie de levée).
//
// POURQUOI LA SESSION VIVANTE EST TENUE ICI, ET PAS AILLEURS. Le routeur résout sur l'arbre de SA
// session ; une session périmée viserait un arbre que Kronos ne joue plus. Elle est donc posée au
// même endroit et au même instant que l'arbre remis à Kairos — à l'éval ET à chaque re-derive — et
// RETIRÉE au démontage, pour qu'une touche frappée après un stop ne trouve rien plutôt que de
// lever un point d'un arbre mort.

/** La session BPx qui a chargé l'arbre COURANT — celle dont le routeur vise l'arbre que Kronos joue. */
let sessionEntrees: Session | null = null;

/** Remet la porte de Kairos au routeur de BPx et publie la session vivante. Appelé avec l'arbre. */
function brancherAttente(session: Session, k: Kairos | undefined): void {
  if (k === undefined) return;
  // La porte, telle quelle : `demande` EST la forme qu'attend BPx (`PorteAttente`), y compris son
  // accusé — un refus doit remonter jusqu'au routeur, qui en fait une erreur d'assemblage bruyante.
  session.brancherPorteAttente((d) => k.demande(d as Parameters<Kairos['demande']>[0]));
  sessionEntrees = session;
}

/** Démontage : plus d'arbre joué, plus de cible. Une touche tardive ne lève alors plus rien. */
export function debrancherAttente(): void {
  sessionEntrees = null;
}

/**
 * UN ÉVÉNEMENT D'ENTRÉE PART VERS LE ROUTEUR. Rend le nombre de points levés (0 = il ne visait
 * rien, ce qui est le cas ordinaire d'une touche frappée hors point d'attente).
 *
 * L'ASSOCIATION voyage en DONNÉE, telle que l'utilisateur l'a faite dans le panneau des entrées :
 * elle vit hors de la scène (décision `2026-07-27-forme-des-entrees-in-mapping-adresse-nue.md`) et
 * ne sert qu'à lever une ambiguïté quand deux rôles partagent un canal. L'hôte la PORTE ; c'est le
 * routeur qui décide si elle compte.
 *
 * ⚠️ C'EST L'IDENTITÉ QUI VOYAGE, PLUS L'ÉTIQUETTE — et ça répare un défaut que j'avais trouvé sans
 * pouvoir le corriger. Je remettais l'identifiant du port comme association pendant que `runtime-in`
 * remplissait `source` avec le NOM du port : les deux ne se rencontraient jamais, et une scène à
 * deux pédales MIDI aurait échoué. BPx a retiré `source` de sa surface plutôt que de l'assortir d'un
 * avertissement — ne pas la déclarer rend la faute impossible à refaire. Des deux côtés, c'est
 * désormais `sourceId`, exigé, jamais facultatif : deux appareils sans identité se compareraient
 * égaux, et le second ne serait jamais servi sans qu'une seule erreur le dise.
 */
export function pousserEvenementEntree(
  evenement: { device: string; sourceId: string; signal: unknown },
  associations: readonly { role: string; sourceId: string }[]
): number {
  if (sessionEntrees === null) return 0;
  return sessionEntrees.evenementEntree(evenement, associations);
}

// Extracts the `gm_*` soundfont names a strudel backtick's code USES, by regex over its
// `sound(...)` / `.sound(...)` call arguments — no re-derivation, just a text scan of the code the
// AST already carries verbatim (same status as `interpsForScene`'s AST read: the host TRANSPORTS
// names, never resolves them — `runtime-codevoices/prefetchStrudelAssets` does the resolution).
const SOUND_CALL_RE = /\.?sound\(\s*(['"`])([\s\S]*?)\1/g;
const GM_TOKEN_RE = /gm_[a-zA-Z0-9_]+/g;
function gmInstrumentsFromCode(code: string): string[] {
  const out = new Set<string>();
  let call: RegExpExecArray | null;
  SOUND_CALL_RE.lastIndex = 0;
  while ((call = SOUND_CALL_RE.exec(code))) {
    const arg = call[2];
    let tok: RegExpExecArray | null;
    GM_TOKEN_RE.lastIndex = 0;
    while ((tok = GM_TOKEN_RE.exec(arg))) out.add(tok[0]);
  }
  return [...out];
}

// Which backtick TOKENS carry a given interp (`strudel`, `mercury`, …), for a scene. A tagged
// backtick (`` `strudel: …` ``) carries its own resolved `interp` already (`backticksFromAst`). An
// UNTAGGED backtick — the common case, e.g. `v -> \`stack(…)\`` under `@actor v eval.strudel` —
// carries no `interp`/`tag` on the AST node itself (verified against the live `compileToBPxAST`
// output, 2026-07-15): its language comes from the OWNING ACTOR's `eval.<lang>`, paired to the
// backtick token via `btTokenByActor` — the same actor→token pairing `codeVoiceInterps`'s caller
// already builds for arm/disarm. Reused here, not re-derived: both `btTokenByActor` and
// `actorTableFromAst` are existing pure AST readers. Generalized (was `strudelBtTokens`) to serve
// both strudel (`gm_*` instrument scan) and mercury (`mercurySamplesInPatch`) asset extraction.
function btTokensForInterp(
  a: SceneAstView | null,
  ast: unknown,
  backticks: BacktickTable,
  interp: string
): Set<string> {
  const out = new Set<string>();
  for (const [token, bt] of Object.entries(backticks)) {
    if (bt.interp === interp) out.add(token);
  }
  const actorTable = actorTableFromAst(a);
  const btByActor = btTokenByActor(ast);
  for (const [actorName, token] of Object.entries(btByActor)) {
    if (actorTable[actorName]?.eval === interp) out.add(token);
  }
  return out;
}

/**
 * PRÉ-TIRAGE DES ASSETS À L'OUVERTURE (chantier latence [788]/[791]/[795], design [789] : préfetch
 * APRÈS le warmup moteur, `runtime-codevoices/src/preload.ts`). Énumère ce qu'une scène DÉCLARE —
 * banques `@library.strudel "<id>"` (`librariesFromAst`, même lecture que `loadDeclaredLibraries`) +
 * instruments `gm_*` utilisés dans les backticks strudel + samples mercury utilisés dans les
 * backticks mercury (`backticksFromAst` + `btTokensForInterp` + scan du code déjà porté par l'AST,
 * `mercurySamplesInPatch` pour la syntaxe mercury `new sample <nom>`) — pour les passer tels quels à
 * `preload(interps, assets)`. AUCUNE résolution ici (pas de fetch, pas de lookup) : l'hôte TRANSPORTE
 * des noms, le paquet les résout. `{}` si la scène ne déclare/n'utilise rien. `compileBps` est
 * mémoïsé → appel bon marché au même rythme que `interpsForScene` (même geste d'ouverture,
 * `preload-on-open.svelte.ts`).
 */
export function assetsForScene(text: string): {
  strudel?: { banks?: string[]; gmInstruments?: string[] };
  mercury?: { samples?: string[] };
} {
  let c: { ast?: unknown };
  try {
    c = compileBps(text) as typeof c;
  } catch {
    return {};
  }
  const a = (c.ast ?? null) as SceneAstView | null;
  if (!a) return {};
  // PRÉFETCH = uniquement les banques AUTO-HÉBERGÉES (VPS, fiables). Une banque DISTANTE (github,
  // `selfHosted:false` comme dirt-samples) déclenche, si son fetch échoue à l'ouverture (réseau/gate),
  // un `console.error` INTERNE de strudel `samples()` (que le best-effort de `prefetchStrudelAssets`
  // ne peut pas ravaler) — et ce n'est PAS le goulot de latence (le gain mesuré = soundfonts GM du VPS).
  // Les banques distantes restent en chargement PARESSEUX à l'éval (inchangé). Filtre via le flag
  // `selfHosted` de `guestLibraries` (résolu par `resolveStrudelLibrary`). Préfetch banques distantes =
  // à réactiver une fois l'amont robuste au fetch de banque qui échoue (routé runtime-codevoices).
  const banks = (librariesFromAst(a).strudel ?? []).filter(
    (id) => resolveStrudelLibrary(id)?.selfHosted
  );
  const backticks = backticksFromAst(c.ast);
  const strudelTokens = btTokensForInterp(a, c.ast, backticks, 'strudel');
  const gmInstruments = new Set<string>();
  for (const [token, bt] of Object.entries(backticks)) {
    if (!strudelTokens.has(token)) continue;
    for (const inst of gmInstrumentsFromCode(bt.code)) gmInstruments.add(inst);
  }
  // Mercury : samples RÉFÉRENCÉS (`new sample <nom>`) par les backticks mercury de la scène — best
  // effort (une extraction ratée laisse simplement `mercury` absent → comportement eager d'origine,
  // jamais de crash).
  const mercuryTokens = btTokensForInterp(a, c.ast, backticks, 'mercury');
  const mercurySamples = new Set<string>();
  for (const [token, bt] of Object.entries(backticks)) {
    if (!mercuryTokens.has(token)) continue;
    for (const name of mercurySamplesInPatch(bt.code)) mercurySamples.add(name);
  }
  const strudel: { banks?: string[]; gmInstruments?: string[] } = {};
  if (banks && banks.length > 0) strudel.banks = banks;
  if (gmInstruments.size > 0) strudel.gmInstruments = [...gmInstruments];
  const result: { strudel?: typeof strudel; mercury?: { samples?: string[] } } = {};
  if (Object.keys(strudel).length > 0) result.strudel = strudel;
  if (mercurySamples.size > 0) {
    result.mercury = { samples: [...mercurySamples] };
  } else if (mercuryTokens.size > 0) {
    // Scène MERCURY (≥1 backtick mercury) mais AUCUN `new sample` référencé (synthé pur) : le
    // tableau VIDE est le SENTINEL "déclaré vide" (≠ absence de `mercury`), distinct de "pas de
    // backtick mercury du tout" — `setMercurySampleAllowlist` (runtime-codevoices) le préserve via
    // `Array.isArray` et pose le global à `[]`, que le patch mercury-engine lit pour charger
    // STRICTEMENT 0 sample au lieu du jeu entier (~428 requêtes) [797/799].
    result.mercury = { samples: [] };
  }
  return result;
}

// `.bps` — BPScript compiles to a SceneAST (`compileBPS().ast`) that BPx derives
// directly. The front-end view (tempo, flagStates, libraries, actorTable) is
// read from THAT AST — the single source of truth — not the
// deprecated grammar text nor compileBPS's redundant sidecar tables.
const bpsFrontend: Frontend = (code) => {
  // FERMER LA PORTE (Romain 2026-07-01) : l'hôte n'injecte PLUS AUCUN tempo dans BPx — ni le
  // @tempo de scène (BPx le lit), ni la saisie utilisateur. La saisie utilisateur (tempo de
  // session) atteint le son par WARP Kronos (retune), jamais par une graine dans l'AST. On ne
  // seed donc plus `userTempo` : une scène sans directive dérive au défaut moteur BPx (60), et
  // on la WARPE au tempo de session à la construction du handle (voir plus bas).
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
  // (résolues par le frontal) ou des `soundAssignments` de l'AST.
  // Everything below is read from the AST (`c.ast`), the single source of truth —
  // no longer from compileBPS's precomputed tables (`c.flagStates`, `c.libraries`,
  // `c.actorTable`, `c.settings`) nor from the BP3 grammar TEXT (`c.grammar`).
  const a = c.ast as SceneAstView | null;
  const soundAssignments = a?.soundAssignments ?? [];
  const parsed = {
    ast: c.ast,
    errors: [] as ParseError[],
    // Tempo: BPx's `loadGrammar` reads the `@mm`/`@tempo` metronome straight from the
    // AST (loadGrammar.ts) and poses `tree.metadata.tempo`. PORTE FERMÉE : l'hôte ne passe PLUS
    // de tempo à BPx (champ supprimé, 8741f9f) ; le tempo de session utilisateur warpe via
    // Kronos. The former `c.settings` was
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
  const base = withBt;

  // Orchestrator `.bps`: `@actor` declarations are AST `ActorDirective` nodes (each actor
  // owns an alphabet + a transport device). A no-`@actor` scene carries an implicit
  // `default` audio actor (bpscript, `synthetic:true`). Read the orchestration off the AST
  // (single source of truth) — the OSC address travels in the tree (`metadata.actors` →
  // `event.output`), not via a host-read `.binding`.
  const orchestration = buildOrchestration(a);
  return orchestration ? { ...base, orchestration } : base;
};

interface BP3Voice {
  /** Source file this voice was evaluated from. Lets a new program tear down the
   *  OUTGOING program's voice (whose `loop:true` keeps re-firing its code
   *  voices — Hydra/Strudel — each cycle) without depending on the per-actor
   *  handle map. Undefined for legacy entries (treated as "current file"). */
  file?: string;
  /** True when this voice is an orchestrator (`@actor` voices). Only these
   *  loop-and-re-fire foreign code; a plain mono grammar is left alone so a
   *  sibling re-eval doesn't cut it. */
  orchestrator?: boolean;
  /** The code interpreters this orchestrator's voices use (`hydra`, `strudel`,
   *  …) + their slot ids. Tearing down the voice kills the re-firing, but a
   *  fire ALREADY in flight at stop time can still paint one more frame; we hush
   *  these runtimes right after to guarantee the outgoing canvas/audio is cleared,
   *  independent of the per-actor handle map (which `__hush__` may have emptied). */
  codeSlots?: Array<{ runtime: Runtime; actorId: string }>;
  /** Kronos audio driver for this scene (the engine that actually sounds it).
   *  Its own `stop()` closes the transport that cuts the scheduled sound. */
  kronosAudio?: KronosAudioHandle;
  /** MIDI runtime (runtime-MIDI's uniform adapter) for this scene — POSSÈDE son propre
   *  MidiTransport. Disposé au teardown de scène (le paquet possède son propre cycle
   *  de vie de transport). */
  midi?: ReturnType<typeof createMidiRuntime>;
  /** MISE À JOUR VIVANTE (re-éval same-file) : refs REUTILISÉES au lieu de teardown+recreate —
   *  le handle Kairos (re-charger la nouvelle dérivation sur le transport qui TOURNE), l'adaptateur
   *  voix-de-code (son bus n'émet pas 'stopped' → Hydra/Strudel CONTINUE), et la table de backticks
   *  (MUTÉE en place : le runtime la lit frais à chaque send). */
  kairos?: InstanceType<typeof Kairos>;
  codeVoicesRuntime?: ReturnType<typeof createCodeVoicesRuntime>;
  backticks?: BacktickTable;
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
// ⛔ SECTIONS : PLUS RIEN ICI, ET ÇA NE REVIENT PAS (décision 2026-07-29,
// `hub/decisions/2026-07-29-notre-mecanique-n-utilise-que-des-alphabets.md`).
// L'hôte lisait l'axiome de la scène, écartait les notes des sections et datait les bandes.
// DEUX raisons de l'avoir supprimé, pas déplacé :
//  1. écarter les notes suppose de trancher « ce mot est-il une note ? », ce qui demandait un
//     prédicat BP3 à trois conventions — or les conventions SONT des alphabets, et le corpus en
//     déclare douze. La question était mal posée : elle n'appartient pas à l'hôte, et l'alphabet
//     n'est connu que du frontal BP3.
//  2. le champ alimentait un canal que les vues ont DÉJÀ QUITTÉ — elles lisent Kairos par
//     `production-feed`, pas ce magasin. Mesuré avant de couper : aucune vue, aucun test hors
//     ceux du calcul lui-même. Même geste que la chaîne finale ([130], plus bas dans ce dépôt).
// Qui devra dessiner des bandes les lira sur l'arbre, où l'amont marque ce qui est une note.
function publishProduction(
  id: Runtime,
  tokens: Tok[],
  beatDurSec: number,
  tree?: ProductionTree,
  symbolNames?: Record<number, string>
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
// input made before/without a live scene). `null` until the user sets one. PORTE FERMÉE
// (Romain 2026-07-01) : il n'entre JAMAIS dans BPx (le champ d'injection de tempo est SUPPRIMÉ
// côté BPx, 8741f9f) — il atteint le son par WARP Kronos (retune), appliqué au handle QUAND la
// scène n'a PAS de directive `@tempo`/`@mm` (une directive de scène gagne, BPx la lit). Le tempo
// EFFECTIF est lu sur `tree.metadata.tempo`. Never a fabricated host default — no « 128 ».
let userTempo: number | null = null;

// Set `userTempo` from a GENUINE user type/tap only — the clock store calls this from
// its `setBpm` (user input). The SCENE tempo channel (`setSceneTempo`) never reaches
// here, so a scene's projected tempo can no longer leak into the next no-`@mm` scene.
export function setUserTempo(bpm: number): void {
  userTempo = bpm;
}

// The random seed of the CURRENT production. A PRODUCE re-rolls it (a new
// variation); a Play/Step reuses it so the heard audio matches the produced
// structure. A loop cycle re-rolls only when re-random is on. undefined → BPx's
// default = REAL CLOCK (fresh draw in seconds, native style) since the seed-meaning
// inversion (BPx b4a8b3e, décision Romain : on tire frais par défaut, on ne fige
// QU'AVEC une graine posée). A scene with no random rules is unaffected either way.
let currentSeed: number | undefined;
// Graine FRAÎCHE pour le re-roll (PRODUCE + re-random) : distincte à CHAQUE clic. On
// NE la remplace PAS par le défaut horloge du moteur — celui-ci est à granularité
// SECONDE (deux re-rolls dans la même seconde ⇒ MÊME graine ⇒ même variation, une
// régression UX silencieuse). Le re-roll pose donc TOUJOURS une graine explicite
// (currentSeed = freshSeed()), garde confirmée par l'architecte 2026-07-25.
function freshSeed(): number {
  return Math.floor(Math.random() * 0x7ffffffe) + 1;
}

// [769] RATTRAPAGE `_randomize` (décision Romain 2026-07-25, option (a)). Le produce pose
// la graine FIGÉE (cas normal : reproductible, Play/Step identique — 99 % des grammaires,
// INCHANGÉ). Mais une grammaire à re-semis `_randomize`/`_srand(-1)` REFUSE de dériver sous
// une graine figée : son intention est de tirer FRAIS sur l'horloge, non reproductible par
// nature (BPx session.ts:142, lcg.ts requireTime). Sur CE refus PRÉCIS et lui seul, l'hôte
// réessaie UNE fois SANS graine (session par défaut = horloge) → la grammaire dérive frais.
// CONSÉQUENCE ASSUMÉE (voulue) : pour ces grammaires, Play/Step REJOUE DIFFÉREMMENT à chaque
// fois — l'invariant « produire une structure, rejouer à l'identique » NE TIENT PAS pour
// elles, et c'est CE que leur auteur demande. Ce n'est PAS un bug de rejeu.
// Détection : BPx lève un `Error` nu (pas de code/classe dédiée) au libellé stable ci-dessous.
function isRandomizeNeedsClock(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('reseedOrShuffle') && msg.includes('needs a wall-clock seed');
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
// (setMeterSink RETIRÉ, KAN-C09 [562] : le mètre de scène n'est plus POUSSÉ vers le clock. Le
//  readout DÉRIVE `kronosCursor.active.beatsPerBar` en direct — l'autorité est le handle Kronos,
//  que `startKronosAudio({ beatsPerBar: sceneBeatsPerBar })` porte déjà. L'hôte ne tient plus de copie.)

// (Resume-offset hôte RETIRÉ — RC-B / Kronos [489] : le resume-après-step est géré par KRONOS via son
// park interne ; `play()` reprend à la position ATTEINTE par le step, jamais à 0. Plus de `resumeBeat`
// hôte ni de `setResumeBeat` — l'hôte ne calcule aucune position de reprise.)

// INSTRUMENTATION (Model C proof): count every BPx derivation of the EVAL path
// (eval/edit/arm/produce/play-from-stopped). It does NOT count the per-loop-cycle
// `reDeriveTreeEvents` re-roll (a deliberate re-random at the loop boundary, not an
// eval). The PM reads this via a dynamic import to prove that two Play-from-stopped
// (now `replay`, no eval) leave the count untouched, while an edit bumps it by one.
let __bpxDeriveCount = 0;
export function __getBpxDeriveCount(): number {
  return __bpxDeriveCount;
}

// INSTRUMENTATION (F06/F07 proof): read the module's tempo state so a test can prove
// the SCENE tempo channel never seeds `userTempo` (F06) and never clamps `currentBpm`
// (F07). Not part of the runtime API.
export function __getUserTempo(): number | null {
  return userTempo;
}
export function __getCurrentBpm(): number {
  return currentBpm;
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
  /**
   * The actor's declared output transport family, read off `actorOutputs[actor.name]
   * .runtime` (`tree.metadata.actors`, BPx authority — the SAME `output.runtime` key
   * Kronos routes events on, decision [624], see the `routesToMidi` read a few hundred
   * lines above this publish loop). Absent declaration ⇒ the AST's implicit default,
   * 'audio' (the audio bus) — mirrors the `default`/mono-scene default documented at
   * the `startKronosAudio` call site. Host-UI concern only (gates the mixer slider);
   * Kanopi performs no routing decision off this field.
   */
  outputTransport?: string;
  /** Erreur de BRANCHEMENT de l'hôte pour cet acteur (ex. sortie MIDI indisponible
   *  au Play) — état UI par-acteur, reconstruit à CHAQUE publication (donc courant :
   *  une ré-éval réussie republie sans ce champ → le badge disparaît). Concern hôte
   *  (branchement/routage), pas une autorité amont. */
  error?: string;
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

// Librairies HAUTEUR PERSONNELLES de l'utilisateur (`ctx.pitchLibMine`), sur le MÊME patron que
// `onExprSource`/`setExprSource` : bpx-adapter ne compose/parse rien et n'importe aucun store
// (garde `npm run arch`, cycle interdit) — un module hôte séparé (le composeur,
// `stores/personal-pitch-lib.svelte.ts`) lit les fichiers perso du stockage et POUSSE la MAP ici.
//
// FORME (décision 2026-07-13, co-signée archi [714] / Kairos [713]) : une MAP PLATE
// `Record<string, string>` — clé = chemin du fichier sous `libraries/` (extension retirée,
// `/`→`.`), valeur = CONTENU BRUT du fichier (string, verbatim). Le fichier DÉCLARE son domaine
// DEDANS (champ JSON `domain`) : c'est KAIROS qui lit + parse (rôle résolveur, un fichier
// malformé crie CHEZ LUI). L'hôte ne fait AUCUN `JSON.parse`, aucun bucketing par domaine.
// Vide par défaut = no-op total : le kairos consommé (231d207, ancien type `PitchLib`) lit
// `mine[<domaine>]` sur cette map plate → sous-clés absentes → factory INTACT, aucun crash.
let personalPitchLib: Record<string, string> = {};

// Barrière de CHARGEMENT des libs perso (trou timing, archi [729]#1). En session cloud, le
// composeur (`personal-pitch-lib.svelte.ts`) va CHERCHER le contenu des libs perso de façon
// ASYNCHRONE (`storage.read`). Un derive déclenché AVANT la fin de ce fetch verrait
// `personalPitchLib = {}` → Kairos résout `@mine.*` sur une map vide et crie « lib introuvable »
// (constaté : 1er eval après chargement de page échouait, les suivants passaient). L'hôte doit
// GARANTIR sa projection FOURNIE avant que Kairos la consomme (loi 26/27) — sans rien inventer :
// il attend juste sa propre donnée. Le composeur SIGNALE le début d'un (re)chargement
// (`markPersonalPitchLibLoading`, synchrone) et sa fin (`setPersonalPitchLib`) ; `evaluate` attend
// cette barrière AVANT de dériver. Défaut = déjà résolu (rien à charger → aucune attente).
let personalPitchLibReady: Promise<void> = Promise.resolve();
let resolvePersonalPitchLibReady: (() => void) | null = null;

export function setPersonalPitchLib(map: Record<string, string>): void {
  personalPitchLib = map;
  // Fin de (re)chargement : lève la barrière (seule une reconstruction GAGNANTE appelle ce setter).
  resolvePersonalPitchLibReady?.();
  resolvePersonalPitchLibReady = null;
}

/** Le composeur appelle ceci de façon SYNCHRONE dès qu'une (re)construction de la map perso
 *  démarre — AVANT tout derive possible — pour qu'`evaluate` attende la map à jour au lieu de
 *  dériver sur `{}`. Idempotent : une seule barrière en vol à la fois (les fires d'effet
 *  intermédiaires ne créent pas de nouvelle promesse ; la reconstruction gagnante la résout). */
export function markPersonalPitchLibLoading(): void {
  if (!resolvePersonalPitchLibReady) {
    personalPitchLibReady = new Promise<void>((res) => {
      resolvePersonalPitchLibReady = res;
    });
  }
}

/** La barrière de chargement des libs perso — `evaluate` l'attend avant de dériver ; exposée
 *  aussi pour le banc/les tests (prouver l'ordre : en vol tant qu'un chargement n'a pas fini). */
export function whenPersonalPitchLibReady(): Promise<void> {
  return personalPitchLibReady;
}

// Live mute + teardown handle for ONE orchestrated actor's voice. Registered per
// (file, actor) when an orchestrator evaluates.
interface OrchestratedVoiceHandle {
  /** Route the mute INTENT through Kronos's own state machine
   *  (`kronosAudio.setActorMuted` → `kairos.demande({type:'mute',...})` → Kronos's
   *  registry, which pilots BOTH the notes scheduler AND runtime-codevoices' sink —
   *  contracts kanopi-runtime-codevoices.md:72, kronos-transport.md:62/108,
   *  temps-horloge.md:65, arbitrage [671]/[673]). The host carries the intent only;
   *  it no longer decides itself whether/when a code voice fires or stops — that WAS
   *  the deviation (`armOrchestratedActor`/`disarmOrchestratedActor` calling
   *  `evalCode`/`stopCode` directly, retired 2026-07-11 per [673]). */
  setActorMuted: (muted: boolean) => void;
  /** Stop the actor's CODE voice (Strudel/Hydra) for SCENE-SWAP teardown
   *  (`tearDownOutgoingVoices`) and global hush (`__hush__`) — NOT for mute, which
   *  routes through `setActorMuted` above. Resolves once its adapter's `stop` has run
   *  (the Hydra hush that blackens the canvas + clears its rAF callbacks). Undefined
   *  for note voices. */
  stopCode?: () => Promise<void>;
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
 * Live-mute/un-mute an orchestrated actor's voice — notes AND code voices alike,
 * through the SAME channel (`kronosAudio.setActorMuted`). No-op when the actor
 * isn't a live orchestrated voice.
 */
export function setOrchestratedActorMuted(name: string, muted: boolean): void {
  orchestratedVoices.get(name)?.setActorMuted(muted);
}

/** True when the named actor is a live orchestrated voice (lets the core pick
 *  the orchestrated mute path). */
export function isOrchestratedActor(name: string): boolean {
  return orchestratedVoices.has(name);
}

// Frontière hôte↔runtimes (Phase 2 audio, #7) : l'hôte ne CRÉE plus, ne POSSÈDE plus, ne RÉVEILLE
// plus d'AudioContext. runtime-audio possède+réveille le sien (via le bus de cycle de vie, à la
// transition replay/resume portée par la pile du geste utilisateur). Le temps de Kronos vient de
// `performance.now()` (createTransport), plus d'un contexte audio. Les anciens getCtx/peekCtx/
// pauseAudioContext/resumeAudioContext (contexte partagé hôte) sont RETIRÉS.

function srcKey(s: EvalSource): string {
  return s.actorId ?? s.fileId;
}

// Map a backtick interpreter tag (`strudel`, `hydra`, `js`, …) to a
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
// `device.type` (so `audio` maps to WebAudio, `midi` to MIDI).
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
 * Load the sample/sound banks a `.bps` declares per engine (`@library.strudel
 * "dirt-samples"`). Only the `strudel` engine has a bank loader today (the
 * `samples()` path); other engines'
 * declarations are recorded but have no loader yet — logged, never silent. A
 * declared id with no catalog entry is an explicit error, not a quiet skip.
 *
 * Fire-and-forget per bank (de-duped inside `loadSampleBank`): the backtick
 * voice that uses the samples is itself fired in time by Kronos, and the
 * Strudel sound map is global, so a bank that lands a beat late simply means the
 * first cycle is silent — acceptable, and the common case (dirt-samples) is
 * cached after the first eval.
 */
/** Resolve a declared `@library.strudel "<bankId>"` against the upstream
 *  `guestLibraries` registry (SOURCE OF TRUTH, [773] — no host-side catalog).
 *  Exported as a pure function so the resolution can be proven in Node/vitest
 *  without exercising the whole adapter/logging pipeline. */
export function resolveStrudelLibrary(bankId: string) {
  return guestLibraries.find((l) => l.engine === 'strudel' && l.declarable && l.id === bankId);
}

/**
 * Resource-resolution check for a scene's TEXT, independent of a live eval attempt —
 * signal 2 of the compile chip's 3-signal health voyant (decision 2026-07-15-voyant-
 * sante-niveau3.md). `loadDeclaredLibraries` below performs the SAME check during a
 * real eval, but only sees the event-bus source key (a display name), not the
 * workspace file id the chip's `resourceStatus` store keys on (same convention as
 * `deriveStatus`) — so this pure sibling is exposed for callers that DO have the
 * workspace id (blocks.svelte.ts's produce/replay sites) to report from. Reuses
 * `resolveStrudelLibrary` (single source of truth against `guestLibraries`) — no
 * duplicated resolution logic, only the AST read is repeated (cheap: `compileBps` is
 * memoized, same pattern as `interpsForScene`/`referencedLibraries`). Non-'strudel'
 * engines are informational only (no loader) — never a resource error, matching
 * `loadDeclaredLibraries`'s own info-vs-error split.
 */
export function resourceResolutionErrors(text: string): { message: string }[] {
  let c: { ast?: unknown };
  try {
    c = compileBps(text) as typeof c;
  } catch {
    return [];
  }
  const a = (c.ast ?? null) as SceneAstView | null;
  if (!a) return [];
  const libs = librariesFromAst(a);
  const out: { message: string }[] = [];
  for (const bankId of libs.strudel ?? []) {
    if (!resolveStrudelLibrary(bankId)) {
      out.push({ message: `banque inconnue: ${bankId}` });
    }
  }
  return out;
}

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
      const lib = resolveStrudelLibrary(bankId);
      if (!lib) {
        log({
          runtime: id,
          level: 'error',
          msg: `@library.strudel "${bankId}" : banque inconnue (absente du catalogue)`
        });
        continue;
      }
      void loadSampleBank(lib.source)
        .then(() => log({ runtime: id, level: 'info', msg: `library loaded: ${lib.label}` }))
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
  // One voice entry per source (file or actor block). Re-evaluating a source
  // tears down its previous voice before scheduling the new derivation.
  const voices = new Map<string, BP3Voice>();

  // Live loop/re-random updates reach THIS adapter's currently-playing voices via
  // the ACTIVE Kronos handle (it drives the audio + owns the scheduler). A voice
  // with no kronos handle just skips the optional call.
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
        // LECTURE (pas injection) : la directive @tempo/@mm déclarée par la scène, pour SAVOIR
        // si le tempo de session (userTempo) doit s'appliquer par warp. Directive présente →
        // la scène joue à SON tempo (BPx le lit) ; absente → on warpe au tempo de session.
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

      // Trou timing (archi [729]#1) : attendre que les libs perso soient FOURNIES avant TOUT
      // derive de ce bloc — sinon une scène `@mine.*` résout sur une map vide au 1er eval (le
      // fetch cloud n'est pas fini) et Kairos crie « lib introuvable ». En régime établi (rien à
      // charger), la barrière est déjà résolue → attente négligeable. Une seule attente par
      // `evaluate`, couvre les deux branches de derive (mono + orchestré).
      await personalPitchLibReady;

      // `@library.<engine>` banks: start loading the declared sample banks now
      // (before derive/dispatch) so a backtick voice that references them finds
      // its samples. De-duped + fire-and-forget inside the helper.
      if (libraries && Object.keys(libraries).length > 0) {
        loadDeclaredLibraries(libraries, id, log);
      }

      // PRÉCHAUFFAGE au CHARGEMENT (design ratifié archi [589]) : à l'ouverture/produce d'une scène
      // (PAS au 1er play), on préchauffe les MOTEURS voix-de-code (leurs contextes) via l'entrée
      // paquet `preload` de runtime-codevoices, dans la chaîne du geste (produce = clic library /
      // Ctrl+Enter). Best-effort → un warmup qui échoue NE casse PAS le produce (try/catch, loggé,
      // jamais throw). Idempotent (repose sur l'idempotence du paquet, l'hôte n'ajoute aucun état).
      // Le CONTEXTE AUDIO (runtime-audio) est warmé À PART, dans `startKronosAudio` au `buildOnly`
      // (l'AudioRuntime vit sur le handle, PAS dans la registry statique de l'hôte).
      if (src.produceOnly) {
        const interps = codeVoiceInterps(orchestration, backticks);
        if (interps.length > 0) {
          try {
            await codevoices.preload?.(interps);
          } catch (e) {
            log({
              runtime: id,
              level: 'warn',
              msg: `warmup voix-de-code: ${(e as Error)?.message ?? e}`
            });
          }
        }
      }

      // PORTE FERMÉE (décision Romain 2026-07-01, contrat temps-horloge.md) : l'hôte n'injecte
      // AUCUN tempo dans BPx — le champ d'injection est SUPPRIMÉ côté BPx (8741f9f). BPx lit le
      // `@tempo`/`@mm` de l'AST et pose `tree.metadata.tempo` (défaut moteur 60 sans directive ;
      // BPM = 60·Qclock/Pclock). Le tempo de SESSION utilisateur (`userTempo`, D10) n'entre
      // JAMAIS dans BPx : il atteint le son par WARP Kronos (retune), appliqué au handle plus bas
      // QUAND la scène n'a pas de directive. Le tempo EFFECTIF (dérivé) est lu sur
      // `tree.metadata.tempo` (garanti peuplé, plus bas).

      // A5 named scenes: a `.bps` whose rules are ALL guarded by a named scene
      // flag (`[scene==calm] S -> …`) has no rule that derives without a scene
      // set — `S` would stay an unexpanded non-terminal and leak as a bogus
      // token to the audio transport. Match the A5 UX ("a scene is active by
      // default"): when the file declares named scenes and the caller gave no
      // scene, default to the first named one (lowest int). Reflected as the
      // active scene in the scene bar (see `defaultScene` consumers).
      const effectiveFlags = withDefaultScene(src.flags, flagStates);

      // GRAINE DE PRODUCTION. Une graine POSÉE fige la dérivation (reproductible) ; ABSENTE,
      // BPx tire frais sur l'horloge (défaut natif, inversion [769]). Le modèle (Romain),
      // à jour Model C ([448]/[489]) :
      //   • Chaque PRODUCE (y compris le produce-au-chargement) RE-TIRE → une variation
      //     NEUVE : `currentSeed` reçoit une graine fraîche ici, sur un éval produceOnly. La
      //     dérivation qui suit l'utilise et la GRAVE dans le handle Kronos persistant.
      //   • PLAY/STEP NE RE-DÉRIVENT PAS : ils rejouent/steppent le HANDLE persistant
      //     (`replayActiveScene`/`transport.step`, real-core.ts / playback.svelte.ts) — aucun
      //     `createSession`, aucun `derive`, `currentSeed` N'EST PAS relu. L'audio colle à la
      //     structure produite parce que c'est LE MÊME handle, pas parce qu'on re-dériverait à
      //     l'identique. (L'ancien commentaire « Play REUSES currentSeed → same derivation »
      //     décrivait le modèle pré-Model-C, faux depuis — corrigé 2026-07-25.)
      //   • Une CYCLE de boucle re-dérive avec une graine fraîche UNIQUEMENT si le re-random
      //     est ON (site re-random plus bas) ; OFF → le dispatcher reboucle les mêmes
      //     événements. `seed` est un champ de config BPx documenté — glue, pas un port de RNG.
      // [921] MODE TEST : `?seed=N` posé → `currentSeed` reçoit CETTE graine (au lieu d'une fraîche)
      // à CHAQUE produce → deux produces redonnent la MÊME suite (reproduction du comparateur).
      // Absent → `freshSeed()`, le défaut vivant strictement inchangé.
      if (src.produceOnly) currentSeed = testSeed() ?? freshSeed();

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
      // KAN-orchestration P1 — Kairos handle: `charger`ed with the derived tree + the
      // BPx projection context (resolvers + emit options). It becomes the SOURCE of the
      // played timeline (its `sourceStructure()` is bound on the Transport in
      // `startKronosAudio`). Built inside the try (needs `bpx`/`rawTree` in scope).
      let kairos: Kairos | undefined;
      // MISE À JOUR VIVANTE (re-éval same-file) : arbre dérivé + contexte de projection capturés du
      // charger (dans le bloc où `bpx`/`derived` vivent) pour re-charger le Kairos VIVANT au teardown.
      let liveUpdateTree: Parameters<Kairos['charger']>[0] | undefined;
      let liveUpdateCtx: Parameters<Kairos['charger']>[1] | undefined;
      // [745] Idem tree/ctx : la trace COMPAGNON de CE derive (si demandée), pour que la
      // MISE À JOUR VIVANTE (re-éval same-file, plus bas) recharge Kairos avec la trace
      // FRAÎCHE — sinon ce 3e site de `charger()` resterait le trou (repéré à la vérif
      // écran : toggle ON + Ctrl+Entrée sur un fichier déjà en lecture emprunte CE chemin,
      // pas le chemin d'éval "neuf").
      let liveUpdateTrace: Parameters<Kairos['charger']>[2] | undefined;
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
        // Config → SessionOptions: settings→settings, flags→initialFlags, seed→seed (le champ
        // `tempo` a été SUPPRIMÉ de SessionOptions côté BPx — porte fermée 8741f9f — il n'est
        // donc plus jamais passé ici). Proven derivation-identical to the former
        // `createBPx + loadGrammar` by `createsession-parity.test.ts`.
        // FERMER LA PORTE : AUCUNE injection de tempo. BPx lit le @tempo/@mm de l'AST et pose
        // metadata.tempo (défaut moteur 60 sans directive). La saisie utilisateur (session)
        // atteint le son par WARP Kronos à la construction du handle (plus bas), pas ici.
        const buildSession = (withSeed: boolean): Session =>
          createSession(ast as SceneAST, {
            ...(settings !== undefined ? { settings } : {}),
            ...(effectiveFlags !== undefined ? { initialFlags: effectiveFlags } : {}),
            ...(withSeed && currentSeed !== undefined ? { seed: currentSeed } : {}),
            // [745] Coût nul strict quand éteint : la clé `trace` est ABSENTE (pas `false`).
            ...(traceEnabled() ? { trace: true } : {})
          });
        // Keep BOTH halves of the derivation: `.tree` (from `derive()`) carries the
        // polymetric structure (groups + voices + nesting) the piano-roll's struct band
        // needs; `tokens` (from `emit('timed-tokens')`) is the flat timed sequence
        // (audio/MIDI/text). The `output:'complete'` mode (control markers as tree
        // nodes / zero-duration tokens) has MIGRATED to Kairos and now THROWS in BPx —
        // the default ('sounding') is the host's path: notes + rests, no control nodes.
        // [769] Rattrapage `_randomize` (voir `isRandomizeNeedsClock`) : le produce dérive
        // d'ABORD sous la graine figée ; sur le refus PRÉCIS d'une grammaire à re-semis, on
        // réessaie UNE fois SANS graine et on OUBLIE la graine (`currentSeed = undefined`)
        // pour que Play/Step de CETTE grammaire rejouent frais eux aussi. Tout autre échec
        // de dérivation RESTE une erreur (relancée telle quelle, trace attachée).
        //
        // [921] EXCEPTION MODE TEST : sous `?seed=N`, le retry NE s'arme PAS. Une grammaire
        // `_randomize` sous graine figée REFUSE, et ce refus REMONTE tel quel (trace attachée,
        // écran lisible). C'est la sémantique cohérente du mode test — reproductible OU refus
        // honnête, jamais un retry sans graine qui casse silencieusement la reproductibilité de
        // la session. Hors mode test, le retry reste inchangé.
        let bpx: Session = buildSession(true);
        let deriveResult;
        try {
          deriveResult = bpx.derive();
        } catch (err) {
          if (currentSeed !== undefined && !isTestMode() && isRandomizeNeedsClock(err)) {
            currentSeed = undefined;
            bpx = buildSession(false);
            deriveResult = bpx.derive();
          } else {
            throw err;
          }
        }
        const derived = {
          tree: deriveResult.tree,
          tokens: bpx.emit<BpxTimedToken[]>('timed-tokens')
        };
        // METER (BPx authority): l'hôte LIT la facette `DeriveResult.meter.cycleBeats`
        // (longueur de cycle repliée, RÉSOLUE par BPx — fe33ab0/B3) et la passe telle
        // quelle au fold-barre entier de Kronos ; il ne SOMME plus les numérateurs
        // (résolution sortie de l'hôte, décision archi 2026-07-01 option b). Re-lu à CHAQUE
        // derive (peut changer au hot-swap). Absent (pas de `[meter:…]`) → défaut documenté 4.
        sceneBeatsPerBar =
          (deriveResult as { meter?: MeterLike }).meter?.cycleBeats ?? DEFAULT_BEATS_PER_BAR;
        // Model C proof: this is THE eval-path derivation (eval/edit/arm/produce/play-from-
        // stopped). Count it. The loop-boundary re-roll (`reDeriveTreeEvents`) is NOT counted
        // here — a Play-from-stopped on a persisted scene replays without reaching this point.
        __bpxDeriveCount++;
        // SINGLE SOURCE OF TRUTH: project the EFFECTIVE tempo the derivation ran at
        // onto BOTH ex-copies — `currentBpm` (the STEP/`beatDurSec` grid below) AND the
        // central clock (display + transport, via the grammar sink) — so they can never
        // diverge. `tree.metadata.tempo` is GARANTI toujours peuplé par BPx (nombre requis,
        // = 60 par défaut moteur explicite sans directive ni injection ; BPx 27fbf72,
        // bp3-frontend fd91457 pour `.gr`) → l'hôte n'a plus AUCUN littéral de tempo de
        // secours. `effectiveTempoBpm`'s fallback est mort-mais-défensif : `currentBpm`
        // (jamais atteint puisque metadata.tempo est toujours là). `clock.setBpm` est un
        // no-op sur tempo inchangé et ne ré-entre pas ici, donc la diffusion ne boucle pas.
        currentBpm = effectiveTempoBpm(derived, currentBpm);
        // FERMER LA PORTE : `currentBpm` = le tempo DÉRIVÉ (BPx, t_scène) — pilote le handle
        // (`derivedTempo`), la borne de boucle et la grille STEP (tous en t_scène). Le tempo
        // ENTENDU est le tempo de SESSION utilisateur (`userTempo`, D10) s'il existe, sinon le
        // dérivé ; on l'obtient par WARP Kronos (retune), jamais par injection. `heardBpm` fane
        // vers l'affichage + les autres runtimes ; le handle audio est warpé après sa construction.
        // Le tempo de session ne s'applique QU'aux scènes SANS directive (`declaredMm == null`) :
        // une scène qui DÉCLARE son tempo joue à son tempo (BPx le lit), pas au tempo de session.
        const heardBpm =
          declaredMm == null && userTempo != null && userTempo > 0 ? userTempo : currentBpm;
        // Fan the HEARD tempo to the central clock (display) + runtimes via the SCENE tempo
        // channel (`clock.setSceneTempo`): NOT clamped and NEVER recorded as `userTempo`, so a
        // scene's projected tempo can no longer leak into the next scene.
        if (heardBpm > 0) {
          onTempoFromGrammar?.(heardBpm);
        }
        // (Le mètre dérivé n'est plus POUSSÉ vers le clock — KAN-C09 [562] : le readout le DÉRIVE
        //  de `kronosCursor.active.beatsPerBar`, que le handle porte déjà via `startKronosAudio`.)
        // The TREE (with control nodes) drives the multi-actor dispatcher. The
        // FLAT tokens keep their prior `'sounding'` shape for every legacy
        // consumer (production readout, STEP slicing, MIDI sink, mono/text
        // dispatcher.load): `'complete'` ALSO injects zero-duration `type:
        // 'control'` tokens into the flat stream, which those paths never saw —
        // drop them here so nothing downstream regresses.
        // CV — la COMPOSITION appartient à Kairos (KRO-24) : il lit les cvInstances SUR l'arbre
        // (`tree.metadata.cvInstances`, BPx ad4dfed) et compose à l'aplatissement. L'hôte ne
        // construit plus de registre (`buildModulators` retiré) ; il forwarde l'arbre + la
        // donnée-librairie `modLib` (contexte L26, hors arbre) + la fabrique `exprSource`.
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
        // [97] Contexte de projection capturé NOMMÉ (pas un appel inline) : servi à `charger`
        // ci-dessous ET à `resolveName` pour la chaîne d'items — un seul appel à
        // `buildProjectionContext()`, pas de 2e résolveur fabriqué côté hôte.
        const evalProjectionCtx = bpx.buildProjectionContext();
        kairos.charger(
          derived.tree as unknown as Parameters<Kairos['charger']>[0],
          {
            ...(evalProjectionCtx as object),
            // KAI-10 — hand Kairos the shared pitch CATALOGS (read-only library DATA,
            // the 5 `bpscript/lib` JSONs bundled at `PITCH_LIB`), the exact sibling of
            // `modulation.registry`: host-composed data on the projection context, NOT a
            // Kairos-side import (the host is the single freshness gatekeeper, LAN-14).
            // The declared identity (alphabet/tuning per actor) rides the TREE
            // (`metadata.actors` + `metadata.scenePitch`, written by BPx) — Kanopi poses ONLY
            // the catalogs. Kairos consumes this to build the resolver and grave
            // `content.pitch.hz` + `content.sounds`; the host calls no resolver itself.
            pitchLib: PITCH_LIB,
            // Librairies PERSONNELLES (`ctx.pitchLibMine`) : MAP PLATE chemin→contenu BRUT
            // (chaque fichier déclare son domaine dedans, Kairos lit/parse). Vide par défaut =
            // no-op total, factory intact ([714]/[713]). Cast `as unknown` ci-dessous : absorbe
            // l'écart avec le kairos consommé (type PitchLib de l'ancien modèle, sans crash).
            pitchLibMine: personalPitchLib,
            // KAI-B03 — hand Kairos the provided DIGITAL function lib (transpose &c.), exact
            // sibling of `pitchLib`. Kairos applies it at projection; without it the sound transpose
            // falls back to Kairos's legacy hardcode (decision tout-par-librairies, 2026-06-29).
            digitalLib: DIGITAL_LIB,
            // LANG-SONS-3 — the voices registry (sibling of pitchLib/digitalLib). Kairos resolves
            // terminal→voice and graves `content.voice`; absent ⇒ no voice facet (backward-compat).
            voicesLib: voicesJson,
            // LANG-SONS §4/§8 — action catalog (flattened runtime-codevoices ports) + §homomorphism
            // lib. Kairos graves `content.action` (opaque module.port classed from the catalog) and
            // applies symbol substitution at resolution; runtime-audio renders the patchbay. Siblings
            // of pitchLib/voicesLib — host transports DATA, resolves nothing.
            actionLib: ACTION_LIB,
            homomorphismeLib: HOMOMORPHISM_LIB,
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
            modulation: { modLib: modLibJson as unknown as ModLib, exprSource: onExprSource }
          } as unknown as Parameters<Kairos['charger']>[1],
          // [745] Relais de la trace COMPAGNON : l'hôte remet la trace BPx à Kairos AVEC
          // l'arbre, verbatim (PORTER ≠ RÉSOUDRE). Absente quand éteint ⇒ 3e arg undefined
          // ⇒ Kairos #trace reste null ⇒ coût nul par construction.
          // [97] Le contrat CompagnonTrace a évolué avec le lot graphie (Kairos kairos.ts:90) :
          // le journal brut voyage sous `entrees` (ex-`pas`) ET la fonction d'assemblage BPx
          // `rendreChaine` (= `renderChain`, OBLIGATOIRE) l'accompagne — la même que la chaîne
          // d'items. L'hôte PORTE les deux, n'en résout aucun.
          deriveResult.trace !== undefined
            ? ({
                entrees: deriveResult.trace,
                rendreChaine: renderChain
              } as unknown as Parameters<Kairos['charger']>[2])
            : undefined
        );
        // [994] LA PORTE D'ATTENTE — l'hôte REMET, il ne route pas. Kairos dépend de BPx et
        // jamais l'inverse : le raccord entrée→attente vit chez BPx (`entrees/routeur.ts`,
        // décision `2026-07-27-le-routage-d-entree-rejoint-le-map-existant.md`) et ne peut pas
        // importer la porte de Kairos — c'est la boîte de branchement qui la lui tend, une fois,
        // avec l'arbre. Sans ce geste, BPx CRIE au premier événement (jamais un silence).
        brancherAttente(bpx, kairos);
        // Capture pour la MISE À JOUR VIVANTE (re-éval same-file) : arbre + contexte de projection,
        // pour re-charger le Kairos VIVANT au teardown sans reconstruire la scène (bpx/derived ne
        // vivent que dans ce bloc). Contexte reconstruit à frais comme le fait le re-random.
        liveUpdateTree = derived.tree as unknown as Parameters<Kairos['charger']>[0];
        liveUpdateCtx = {
          ...(bpx.buildProjectionContext() as object),
          pitchLib: PITCH_LIB,
          pitchLibMine: personalPitchLib,
          digitalLib: DIGITAL_LIB,
          voicesLib: voicesJson,
          actionLib: ACTION_LIB,
          homomorphismeLib: HOMOMORPHISM_LIB,
          modulation: { modLib: modLibJson as unknown as ModLib, exprSource: onExprSource }
        } as unknown as Parameters<Kairos['charger']>[1];
        // [745]/[97] Idem site d'éval : même trace au nouveau contrat CompagnonTrace
        // (`entrees` + `rendreChaine`), portée pour le rechargement vivant.
        liveUpdateTrace =
          deriveResult.trace !== undefined
            ? ({
                entrees: deriveResult.trace,
                rendreChaine: renderChain
              } as unknown as Parameters<Kairos['charger']>[2])
            : undefined;
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
      publishProduction(id, tokens, beatDurSec, tree, symbolNames);

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
      // LOOP : la boucle tourne quand le toggle transport LOOP est ON (défaut). Le STEP ne passe
      // PLUS par ici (RC-B) — il va sur le handle PERSISTANT via `transport.step(1)` (playback.step →
      // handle.step). Donc plus de fenêtre de step hôte, plus de grain grille-beat, plus d'offset de
      // reprise : KRONOS gère play-après-step (la lecture reprend à la position ATTEINTE par le step,
      // jamais à 0 — prouvé transport.test.ts:77-95 monotone + bugs23-repro, réponse Kronos [489]).
      const looping = transport.loop;
      // Re-derive at each cycle only when looping AND re-random is on — re-rolls the grammar's
      // weighted/random choices tour to tour (vs replaying the same derivation).
      const reRandom = looping && transport.reRandom;

      const key = srcKey(src);
      const prev = voices.get(key);
      // MISE À JOUR VIVANTE (re-éval du MÊME fichier, scène orchestrée déjà VIVANTE) : une re-éval
      // est une mise à jour LIVE (live-coding), pas une fin de scène (arbitrage archi [556]). On NE
      // teardown PAS — on re-charge Kairos sur le transport qui TOURNE (Kronos swap les notes au
      // prochain bord, comme le re-random), on MUTE la table de backticks EN PLACE (le runtime la lit
      // frais à chaque send → le nouveau code s'applique aux prochains onsets), et on réutilise le
      // handle + le runtime voix-de-code. AUCUN 'stopped' émis sur le bus → la voix Hydra/Strudel
      // CONTINUE (fin de la régression : une re-éval same-file ne coupe plus les voix de code).
      if (
        prev &&
        prev.file === src.fileId &&
        prev.kronosAudio &&
        prev.kairos &&
        prev.codeVoicesRuntime &&
        prev.backticks &&
        orchestration &&
        orchestration.actors.length > 0 &&
        !buildOnly &&
        liveUpdateTree &&
        liveUpdateCtx
      ) {
        for (const k of Object.keys(prev.backticks)) delete prev.backticks[k];
        Object.assign(prev.backticks, backticks);
        // [745] 3e site — la MISE À JOUR VIVANTE recharge le MÊME Kairos avec le
        // tree/ctx *fraîchement dérivés* (ci-dessus) : la trace doit suivre le même
        // relais que les 2 autres sites, sinon un re-éval same-file en lecture perd
        // silencieusement la trace (gap distinct des sites eval/re-random).
        prev.kairos.charger(liveUpdateTree, liveUpdateCtx, liveUpdateTrace);
        productionFeed.swapped();
        // Si le transport était ARRÊTÉ (handle build-only d'une ouverture qui PRODUIT sans jouer,
        // ou un Stop), l'éval le DÉMARRE (replay : stopped→running → Kronos re-tire les notes + les
        // backticks à leurs onsets). S'il TOURNE déjà (vraie re-éval live), on ne touche PAS la
        // position — le swap de dérivation prend au prochain bord et la voix Hydra/Strudel continue.
        if (prev.kronosAudio.transport.state === 'stopped') prev.kronosAudio.replay();
        kronosCursor.set(prev.kronosAudio as unknown as Parameters<typeof kronosCursor.set>[0]);
        emitLifecycle('eval', src.fileId);
        return;
      }
      if (prev) {
        prev.kronosAudio?.stop();
        prev.midi?.dispose(); // le runtime MIDI possède son transport → on le ferme ici
      }
      // Loading a DIFFERENT program: tear down the previous ORCHESTRATOR's voice.
      // Its `loop:true` keeps re-firing its code voices (re-evaluating the Hydra
      // patch each cycle), so hushing the canvas once is useless — the next cycle
      // re-lights it. The fix that the per-actor disarm relies on is to STOP THE
      // RE-FIRING, i.e. stop its Kronos audio driver. We read the source `file`
      // straight off each `voices` entry (self-contained — no dependency on the
      // per-actor handle map, which the previous attempt relied on and which can
      // be empty here). Only orchestrator voices are torn down: a plain mono
      // grammar from another file is left alone so a sibling re-eval / a
      // multi-actor `.bps` doesn't cut unrelated voices. A re-eval of the SAME
      // file keeps its own voice (it was already replaced via `prev` above).
      const outgoingCodeSlots: Array<{ runtime: Runtime; actorId: string }> = [];
      for (const [vKey, v] of voices) {
        if (vKey === key) continue;
        if (v.orchestrator && v.file !== undefined && v.file !== src.fileId) {
          v.kronosAudio?.stop();
          v.midi?.dispose(); // ferme le transport que le runtime MIDI possède
          if (v.codeSlots) outgoingCodeSlots.push(...v.codeSlots);
          voices.delete(vKey);
        }
      }
      // Hush the outgoing orchestrator's code runtimes (Hydra canvas/rAF, Strudel
      // audio) AFTER its Kronos audio driver is stopped — so a fire that was in
      // flight at stop time can't leave the canvas lit with nothing left to clear it.
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

      // Orchestrator-only: BT token → owning actor (rule LHS). Per-eval — a
      // re-eval rebuilds it. A code voice evaluates into a distinct slot
      // `<fileId>::<actor>` so a scene swap can tear down just that voice.
      const isOrchestrated = !!(orchestration && orchestration.actors.length > 0);
      // actor → BT token (rule LHS → its backtick). The sink needs the INVERSE
      // (token → actor) to find which voice a fired BT belongs to.
      const actorToBt = isOrchestrated ? btTokenByActor(ast) : {};
      const btToActor: Record<string, string> = {};
      for (const [actor, token] of Object.entries(actorToBt)) btToActor[token] = actor;
      const slotForActor = (actor: string) => `${src.fileId}::${actor}`;

      // Backtick voices (lot 4): route each `BT<interp><id>` terminal to its
      // interpreter, fired in time by Kronos. Registered before load so
      // both the orchestrated and the simple path place backticks correctly.
      // La sortie voix-de-code : l'adaptateur uniforme de runtime-codevoices (send = sink backtick
      // tiré à l'onset, evaluate = capture d'une voix autonome, bindClock = abonnement au bus de
      // cycle de vie de Kronos → le relais lifecycle DESCEND, plus de code-voice-lifecycle hôte). La
      // table des backticks (dérivée BPx) RESTE territoire hôte, remise au constructeur. Enregistré
      // sur la clé 'code' dans startKronosAudio.
      const codeVoicesRuntime =
        backticks && Object.keys(backticks).length > 0
          ? createCodeVoicesRuntime({
              backticks,
              fileId: src.fileId,
              log,
              // `mutedActors` is VESTIGIAL: mute now routes through Kronos's state
              // machine (kronosAudio.setActorMuted → runtime-codevoices' own ACTIVE
              // sink), so the host neither reads nor writes it any more — never
              // populated, kept only because the field is still required by the
              // TYPE ([673]: coordinated removal once confirmed unused both sides).
              orchestration: isOrchestrated
                ? { btToActor, mutedActors: new Set<string>(), slotForActor }
                : undefined
            })
          : undefined;

      // Orchestrator `.bps`: each `@actor` owns an alphabet and a transport
      // (an @devices appliance). Kronos routes each event by its OWN
      // `output.runtime` (graven by Kairos off the tree); there is no flat
      // symbol→actor map. MIDI is silent-but-safe without hardware.
      if (orchestration && orchestration.actors.length > 0) {
        // Device GATE (DEVICES_SPEC §3/§4, ADAPTER_SPEC §1bis b): resolve every
        // voice's appliance and verify type compatibility BEFORE routing/start.
        // An unknown appliance or an incompatible voice throws a clear eval error
        // (logged AND thrown so the promise rejects) — never a silent skip. Done
        // up-front for all actors so a later voice's rejection doesn't leave the
        // earlier ones already playing.
        // A `.gr` (like any mono scene) plays AUDIO by default: its synthetic `default`
        // actor keeps `transport.audio` and MUST be audible. MIDI is an EXPLICIT choice
        // (`@actor … transport.midi`) — never auto-routed off a granted Web MIDI port,
        // which used to make every `.gr` SILENT on a machine that simply HAS a MIDI port.
        //
        // Only voices that route through ONE OF OUR transports get device-gated: the
        // implicit-`js` default and the symbolic alphabet→`sound` voices. An `eval.<X>`
        // producer (strudel/hydra/p5/csound/mercury AND explicit `eval.js`) SORT EN NATIF —
        // « on ne route pas sa sortie native » (décision 2026-07-14 producteur/canal, §Modèle
        // axe 1 + §Conséquences 1/3 ; parser bpscript rejette désormais tout `transport` sur un
        // `eval.*`). Ces voix N'ONT PAS de transport → rien à résoudre/valider ici. Sans ce
        // saut, le défaut `transportKey ?? 'audio'` (l.701) device-gaterait une voix visuelle
        // hydra contre l'appareil audio → rejet à tort. Le `devices` map ne sert QU'à cette
        // validation (write-only) ; le routage réel est par `event.output.runtime` (Kairos).
        const devices = new Map<string, Device>();
        for (const actor of orchestration.actors) {
          if (actor.evalInterp) continue; // producteur eval = natif, hors transport
          devices.set(
            actor.name,
            await gateVoiceDevice(actor.name, actor.transportKey, actor.evalInterp, id, log)
          );
        }

        // MIDI SINK — built ONCE and handed to Kronos as the 'midi' sink. The host NAMES no
        // route and chooses no sink: each event carries its `output.runtime` (graven by Kairos
        // from `metadata.actors`), and Kronos routes on it. The MidiTransport's lifecycle is
        // owned by this `midi` runtime itself (`midi.dispose()` closes it on teardown) — never
        // read for routing. AUDIO + OSC sinks are built inside `startKronosAudio` (they need the
        // shared clock); the OSC device enumeration is derived there from `metadata.actors`.
        // KAI-10 — no host resolver: the MIDI sink reads `event.pitch.hz` (graven by Kairos)
        // and derives note+bend from it; its own token→Hz resolver is now only a stand-in.
        let midi: ReturnType<typeof createMidiRuntime> | undefined;
        // Un sink MIDI existe SSI un acteur SORT en MIDI. L'AUTORITÉ est `output.runtime`
        // (gravé par BPx dans `tree.metadata.actors`, la MÊME clé sur laquelle Kronos route
        // — invariant « un sink existe pour la clé routée », contrat hote-runtimes-sortie.md:121,
        // tranché archi [624]). PAS `devices.type` : l'appareil @devices est l'ADRESSE (canal/
        // port) DANS le runtime, un concern SÉPARÉ (KAI-9, bpscript-bpx.md:32). Un `@actor
        // transport.midi` grave `runtime='midi'` → même clé, même sink que tout futur
        // `@alphabet.X:midi` qui convergera vers `runtime='midi'` à la source.
        // État UI de branchement par-acteur, reconstruit à CHAQUE éval (donc courant :
        // une ré-éval réussie republie sans erreur → le badge disparaît). Rempli par le
        // gate MIDI ci-dessous, lu dans la boucle de publication (même portée).
        const actorWiringErrors: Record<string, string> = {};
        const routesToMidi =
          !!actorOutputs && Object.values(actorOutputs).some((a) => a.runtime === 'midi');
        if (routesToMidi) {
          // runtime-MIDI possède/construit/init SON transport (#6). L'adaptateur est enregistré
          // sur Kronos dans startKronosAudio ; teardown = `midi.dispose()` (ci-dessous), plus de
          // `dispatcher.addTransport` (le paquet possède le cycle de vie de son transport).
          midi = createMidiRuntime({});
          // RÈGLE PRODUIT (Romain, [619]) : une scène écrite pour MIDI sans périphérique au
          // PLAY NE joue PAS en silence trompeur — l'hôte GATE (bloque) et CRIE. Contrat pinné
          // hub/contrats/kanopi-runtime-midi.md §3 (2bcbdc9). `init()` ouvre/réutilise le
          // SINGLETON d'accès (device sélectionné dans une scène précédente persiste — on ne
          // retient rien côté hôte) et NE DOIT PAS servir de gate : `init().ok` reflète « un
          // port existe » (le loopback ALSA « Midi Through » est TOUJOURS là) même SANS device
          // choisi — gater dessus laisserait le play muet passer (root cause du bug remonté
          // par Romain [647]). Le GATE réel sonde `status().ready` APRÈS init, qui reflète un
          // device EXPLICITEMENT sélectionné (résolu par setOutput(id) dans le panneau
          // Hardware, hors playback). ready===false → throw un message actionnable mappé sur
          // reason (ajoute 'no-selection' : aucun device choisi malgré un accès disponible).
          await midi.init().catch(() => undefined);
          const { ready, reason } = midi.status();
          if (!ready) {
            midi.dispose();
            midi = undefined;
            const msg =
              reason === 'no-webmidi'
                ? 'Ce navigateur ne supporte pas Web MIDI — la sortie MIDI est indisponible.'
                : reason === 'no-output'
                  ? 'Aucun périphérique MIDI détecté — branche un périphérique MIDI, puis réessaie.'
                  : reason === 'no-selection'
                    ? 'Aucun périphérique MIDI sélectionné — choisis-en un dans le panneau Hardware, puis réessaie.'
                    : 'Accès MIDI refusé — autorise le MIDI dans les paramètres de ce site, puis réessaie.';
            // Scope au(x) SEUL(S) acteur(s) MIDI (Object.values(actorOutputs) au-dessus
            // ne dit que "au moins un" — on redérive les noms ici pour le message).
            // Le CRI reste (contrat kanopi-runtime-midi.md §3, [619]) mais NE THROW PLUS :
            // un acteur audio de la même scène (ex. `bass` dans midi-actors.bps) n'a
            // rien à voir avec MIDI et doit continuer à dériver/publier/jouer — throw ici
            // abortait `evaluate()` en ENTIER avant startKronosAudio + la publication des
            // acteurs, rendant TOUTE la scène silencieuse et « derive error » pour un
            // manque de matériel MIDI sur UN SEUL acteur. Laisser `midi = undefined` (déjà
            // fait ci-dessus) suffit : `sinks` omet la clé 'midi', et Kronos fait déjà
            // échouer fort chaque évènement routé MIDI via son diagnostic
            // `unknown-output-runtime` (kronos-audio.ts ~349-356) — jamais de repli muet.
            const midiActorNames = actorOutputs
              ? Object.entries(actorOutputs)
                  .filter(([, a]) => a.runtime === 'midi')
                  .map(([name]) => name)
              : [];
            const scopedMsg =
              midiActorNames.length > 0
                ? `acteur(s) MIDI muet(s) (${midiActorNames.join(', ')}) : ${msg}`
                : msg;
            log({ runtime: id, level: 'error', msg: scopedMsg });
            for (const n of midiActorNames) actorWiringErrors[n] = scopedMsg;
          }
        }
        // Per-actor routing (KAI-9): each note carries its OWN output layer — Kairos
        // graves `event.output` ({runtime, channel?, device?}) from the tree's
        // `metadata.actors`, and Kronos routes each event to the sink registered under
        // `output.runtime`. A terminal shared by two actors ('sitar.Sa' vs 'tabla.Sa')
        // routes to DISTINCT sinks via its own `output`; Kanopi reads no actor→transport
        // map and chooses no sink.
        //
        // The PLAYED timeline is the Kairos projection, bound on the Transport: Kronos
        // reads it directly and is NOT told a separate routing table. Live mute for
        // EVERY actor kind routes through `kairos.demande` → Kronos's own registry (no
        // host event pre-filtering, [673]). Code voices (Strudel/Hydra backticks) fire
        // via the Kronos adapter's `'code'` sink (interpreter from `output.device`).
        let kronosAudio: KronosAudioHandle | undefined;
        // Kronos is the ONLY engine (legacy removed): it drives notes + CV + the code
        // voices, routing each event on its own `output.runtime`, reading straight off
        // the Kairos projection bound on the Transport.
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
              const rbpx: Session = createSession(ast as SceneAST, {
                // FERMER LA PORTE : le re-roll aussi dérive au @tempo de l'AST (BPx le lit),
                // sans injection ; le WARP live (retune) persiste côté Kronos à travers le swap.
                ...(settings !== undefined ? { settings } : {}),
                ...(effectiveFlags !== undefined ? { initialFlags: effectiveFlags } : {}),
                // [921] MODE TEST : le re-roll aussi utilise la graine figée → une session de test
                // est déterministe de bout en bout (chaque cycle re-tire la MÊME variation). Hors
                // mode test, `freshSeed()` — chaque cycle re-random tire une variation neuve.
                seed: testSeed() ?? freshSeed(),
                // [745] Idem site d'éval : coût nul strict quand éteint (clé absente).
                ...(traceEnabled() ? { trace: true } : {})
              });
              const rDerive = rbpx.derive();
              const rtree = rDerive.tree;
              // [97] Contexte nommé, comme au site d'éval — servi à `charger` ci-dessous ET
              // à `resolveName` pour la chaîne d'items de CE cycle.
              const rProjectionCtx = rbpx.buildProjectionContext();
              // Re-charge Kairos with the NEW tree + a context rebuilt from the NEW session
              // (resolvers/kpress/order) + the cycle-invariant CV registry (KRO-24 — Kairos
              // composes the modulations at flatten) + B03 transpose (same scene resolver;
              // alphabet/tuning are identical across cycles). The generation bump makes
              // Kronos re-pull this fresh flat at the edge.
              kairos!.charger(
                rtree as unknown as Parameters<Kairos['charger']>[0],
                {
                  ...(rProjectionCtx as object),
                  // KAI-10 — same read-only catalogs on every re-derive (cycle-invariant).
                  pitchLib: PITCH_LIB,
                  // Catalogue perso — même patron, cycle-invariant lui aussi (lu par référence
                  // module au moment du re-derive, pas re-composé ici).
                  pitchLibMine: personalPitchLib,
                  // KAI-B03 — same provided digital lib on every re-derive (transpose &c.).
                  digitalLib: DIGITAL_LIB,
                  // LANG-SONS-3 — same voices registry on every re-derive (cycle-invariant).
                  voicesLib: voicesJson,
                  // LANG-SONS §4/§8 — same action catalog + homomorphism lib every re-derive.
                  actionLib: ACTION_LIB,
                  homomorphismeLib: HOMOMORPHISM_LIB,
                  // KAI-10 — sound transpose in Kairos; host lends no transposeToken.
                  modulation: { modLib: modLibJson as unknown as ModLib, exprSource: onExprSource }
                } as unknown as Parameters<Kairos['charger']>[1],
                // [745]/[97] Idem site d'éval : relais verbatim de la trace COMPAGNON au
                // re-random, nouveau contrat (`entrees` + `rendreChaine`).
                rDerive.trace !== undefined
                  ? ({
                      entrees: rDerive.trace,
                      rendreChaine: renderChain
                    } as unknown as Parameters<Kairos['charger']>[2])
                  : undefined
              );
              // [994] LE RE-ROLL CHANGE DE SESSION — donc de porte ET d'arbre. `rbpx` est une
              // session NEUVE : sans ce re-branchement, la touche continuerait de viser l'arbre
              // du cycle précédent, et une scène re-randomisée cesserait de repartir sans qu'un
              // seul message le dise. On rebranche sur la session VIVANTE, celle qui vient de
              // charger l'arbre que Kronos va jouer.
              brancherAttente(rbpx, kairos);
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
                beatDurSec,
                rtree as unknown as ProductionTree,
                rnames
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
          // REGISTERS the per-runtime sinks ('midi' here, 'audio'/'osc'/'code'
          // built inside startKronosAudio) — it chooses no route and keeps no actor→transport
          // map. The `default`/mono case carries `output.runtime='audio'` from the AST.
          kronosAudio = startKronosAudio({
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
            // 'audio' (AudioRuntime) and 'osc' (OscAdapter) sinks are built inside
            // startKronosAudio (they need the shared clock).
            sinks: midi
              ? ({ midi } as unknown as Parameters<typeof startKronosAudio>[0]['sinks'])
              : undefined,
            // The actor→output table (BPx authority) — used ONLY to enumerate the OSC devices
            // at setup. Per-event device/channel/runtime rides `event.output`.
            actors: actorOutputs,
            startSceneSec: 0, // Kronos gère le resume-après-step via play() (park interne) — plus d'offset hôte ([489])
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
            reDeriveKairos,
            reRandom,
            // Kronos est le seul émetteur : une voix de code est routée par `output.runtime==='code'`
            // (gravé par Kairos) vers l'adaptateur uniforme de runtime-codevoices, enregistré sur
            // 'code'. Son `send(ev)` tire le backtick à l'onset ; son `bindClock` l'abonne au bus de
            // cycle de vie (gel/reprise/tais-toi) — plus de sink ni de relais hôte.
            codeVoicesRuntime,
            log: (m) => log({ runtime: id, level: 'info', msg: `[kronos] ${m}` })
          });
          // The timeline reads ITS playhead (aligned to the heard audio), as on mono.
          kronosCursor.set(kronosAudio);
          // FERMER LA PORTE : la scène est DÉRIVÉE au tempo BPx (`currentBpm`, handle
          // `derivedTempo`) ; si l'utilisateur a un tempo de SESSION (`userTempo`, D10) différent,
          // on WARPE le handle dessus (retune Kronos = même chaud que le changement live), jamais
          // par injection dans BPx. Ex. : scène SANS directive dérivée à 60 + session 100 → warp
          // à 100 → entendue à 100 (cas validé Romain). No-op si égal/absent.
          if (
            declaredMm == null &&
            userTempo != null &&
            userTempo > 0 &&
            userTempo !== currentBpm
          ) {
            kronosAudio.transport.setTempo(userTempo);
          }
          // The production views read the LIVE Kairos tree/flat off this same eval.
          productionFeed.set(kairos ?? null);
        }
        // Code-voice slots of THIS orchestrator (hydra/strudel + their per-actor
        // slot id), recorded on the voice entry so a LATER program can hush
        // them after tearing down this voice (covers a fire in flight at stop).
        const codeSlots: Array<{ runtime: Runtime; actorId: string }> = [];
        voices.set(key, {
          file: src.fileId,
          orchestrator: true,
          codeSlots,
          kronosAudio,
          midi,
          // Refs pour la MISE À JOUR VIVANTE d'une re-éval same-file (voir BP3Voice).
          kairos: kairos ?? undefined,
          codeVoicesRuntime,
          backticks
        });

        // Publish the actor list to the Actors panel (groove + viz, …) and register
        // a live handle per actor: mute (ANY actor kind) routes uniformly through
        // `kronosAudio.setActorMuted`; `stopCode` stays for scene-swap teardown only
        // (code voices live on their own adapter, outside this dispatcher). The
        // handle map is keyed by actor name and replaced on each re-eval.
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
          // Same authority + default as `routesToMidi` above ('audio' when the actor
          // declares no explicit `transport.` — the AST's implicit default).
          const outputTransport = actorOutputs?.[actor.name]?.runtime ?? 'audio';
          published.push({
            name: actor.name,
            runtime: codeRuntime ?? id,
            file: src.fileId,
            outputTransport,
            error: actorWiringErrors[actor.name]
          });
          orchestratedVoices.set(actor.name, {
            file: src.fileId,
            // Uniform channel for EVERY actor kind (notes AND code voices): Kronos's
            // registry now pilots both the scheduler's emission gate and
            // runtime-codevoices' sink from this ONE call — the host carries the
            // intent only ([673], see OrchestratedVoiceHandle doc above).
            setActorMuted: (muted: boolean) => {
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
      // Reached by BOTH tempo fan-outs (user input AND scene projection). It NEVER
      // records `userTempo` any more — that is set only by `setUserTempo` on a genuine
      // type/tap (clock store). Here we just keep `currentBpm` (the STEP/`beatDurSec`
      // grid, used by the NEXT derivation) and retune the live voices in place.
      currentBpm = bpm;
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
          // NOTE: no further teardown call is made here — `stopInPlace` already cut
          // the sounding nodes via `transport.stop()` and the handle must stay ALIVE
          // for the Kairos projection Kronos reads on replay. The code voices are cut
          // inside `stopInPlace`.
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
        // Le RÉVEIL du contexte audio n'est plus l'affaire de l'hôte : runtime-audio possède le sien
        // et le réveille à la transition `replay`/`resume` du bus de cycle de vie (ce Play est un
        // geste utilisateur, dans la pile — le réveil y est autorisé). L'hôte se contente de
        // COMMANDER le replay ; Kronos propage, le sink réveille son contexte (frontière Phase 2).
        for (const voice of voices.values()) {
          if (voice.kronosAudio?.transport.state === 'stopped') voice.kronosAudio.replay();
        }
        log({ runtime: id, level: 'info', msg: 'replay active scene (no derive)' });
        emitLifecycle('eval', src.fileId);
        return;
      }
      // `__hush__` is the core's "stop everything" sentinel (transport stop,
      // Ctrl+. panic): no single voice matches it, so we tear down every live
      // voice. Without this, stopping the transport left playback looping.
      if (key === '__hush__') {
        // EXPLICIT stop → cut the sustained code voices (Strudel/Hydra). This is the
        // single place a transport Stop kills them; the per-handle stop does NOT (a
        // same-file re-eval reuses that handle's stop to drop only its note timeline,
        // keeping the code voice). Cut BEFORE clearing the map so each slot is reached.
        for (const h of orchestratedVoices.values()) void h.stopCode?.();
        for (const voice of voices.values()) {
          voice.kronosAudio?.stop();
        }
        voices.clear();
        // Stop everything → no live handle, so the kronos-cursor store reads `null`
        // and the timeline cursor + bar·beat display fall back to rest (001·01.00).
        kronosCursor.set(null);
        productionFeed.set(null);
        debrancherAttente();
        // "Stop everything" also FORGETS the live orchestrated-voice handles: every
        // voice is down and the core hushes every code runtime alongside this
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
          debrancherAttente();
        }
        voice.kronosAudio?.stop();
        voices.delete(key);
      }
      log({ runtime: id, level: 'info', msg: `stop [${key}]` });
      emitLifecycle('stop', src.fileId);
    },
    async dispose() {
      for (const voice of voices.values()) {
        try {
          voice.kronosAudio?.stop();
        } catch {
          /* engine may already be torn down */
        }
      }
      voices.clear();
      kronosCursor.set(null);
      productionFeed.set(null);
      debrancherAttente();
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
