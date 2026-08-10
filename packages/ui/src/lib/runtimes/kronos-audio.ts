// Kronos AUDIO driver — Kronos drives the REAL sound (the ONLY engine; legacy removed).
//
// The Kronos scheduler produces the timed events and a thin RuntimeAdapter bridges
// each one to the EXISTING WebAudio synthesis. Kronos alone schedules sound.
//
// Coverage: NOTE + per-note CV (cutoff/pan/…) + actor routing + backtick/code
// voices (via the backtick sink) + per-actor MIDI (MidiTransport). The one
// residual gap is control-token STATE mutation — NOT folded yet; this module
// LOGS what it skips (never a silent drop), it does not fall back anywhere.
//
// Integration rule: `@kronos/core` and the WebAudio transport are consumed
// AS-IS. This file is glue — the PLAYED timeline is the Kairos projection (bound on the
// Transport via `bindStructureSource`); this maps each Kronos `ScheduledEvent` → the event
// shape `WebAudioTransport.send(event, absTime)` expects, reusing the transport already
// configured with the scene's resolver (control-value coercion lives in the runtime now).

// Chantier transport-SM [471-482] : Kanopi ne CONSTRUIT plus le moteur (garantie ARCHITECTURALE).
// La FABRIQUE `createTransport` assemble clock+scheduler+cursor+driver EN INTERNE et ne rend qu'un
// handle (commandes + observables LECTURE SEULE + câblage sorties + pompe) — `InternalClock`/
// `Scheduler`/`Cursor` sont RETIRÉS du public (tsc refuse : c'est la preuve que l'hôte n'a plus les
// primitives pour reconstruire une position/step). `MaterializedTimeline` reste exporté comme
// contrat de DONNÉES public que Kairos et l'hôte construisent (kronos/src/index.ts ; contrat hub
// kairos-kronos-donnee.md). `ModulationBinding` :
// résidu parti (point 5). `Transport`/`RealtimeDriver` : types seuls (portés par le handle).
import {
  createTransport,
  type KronosTransport,
  type Transport,
  type RuntimeAdapter
} from '@kronos/core';
// KAN-orchestration P1 — Kairos is the SOURCE of the played timeline (it projects the
// BPx tree into a Kronos Timeline and exposes a StructureSource the Transport PULLs).
// Consumed AS-IS: the host builds it, `charger`s the tree+context, and hands it here.
import type { Kairos } from '@kairos/core';
// Audio OUTPUT — the runtime-audio package's RuntimeAdapter (Web Audio synthesis +
// CV rendering), consumed AS-IS. Kanopi renders NOTHING: it hands the AudioRuntime
// the shared clock and routes Kronos's ScheduledEvents to it (the AudioRuntime reads
// `content.pitch.hz` graven by Kairos — KAI-10 — and renders `content.modulations`).
import { createAudioRuntime } from 'runtime-audio';
// OSC OUTPUT — runtime-OSC's adapter (output profile + WebSocket transport to the
// osc-bridge relay), consumed AS-IS. Kanopi resolves no address: it builds the
// adapter on the shared clock, hands it the actor→device bindings, and routes
// OSC actors' ScheduledEvents to it. The profile maps controls → device addresses.
//
// Imported from the package's BROWSER entry (`runtime-osc/browser`): the default
// barrel re-exports `DeviceLibrary` (`node:os`/`node:fs`) and `UdpTransport`
// (`node:dgram`), Node-only modules that crash in the browser. The `/browser`
// subpath exposes only the browser-safe surface (OscAdapter/OscBridgeProfile/
// WebSocketTransport) — deterministic under both Vite and vitest.
import { createOscRuntime } from 'runtime-osc/browser';
import type { EventBus } from '../events/types';
import { DEFAULT_BEATS_PER_BAR } from './meter';
// Relais lifecycle voix de code (chantier voix-code-transport S2) : suit l'état RÉEL du
// Transport (pause quantifiée comprise) et relaie gel réel / reprise resynchronisée /
// tais-toi aux moteurs de voix (option (b) 2026-07-03, arbitrage [524]).

/** Une SORTIE que ce module enregistre, par NOM DE RUNTIME (la clé que Kairos grave dans
 *  `event.output.runtime`) ; Kanopi n'en choisit aucune — chaque ScheduledEvent porte déjà sa
 *  route.
 *
 *  C'EST LE CONTRAT DE KRONOS, PAS UNE FORME D'HÔTE. Ce module a porté jusqu'au 2026-08-10 un
 *  `TransportLike` local — `send(event, absTime?)` — qui ressemblait au contrat sans être lui, et
 *  qui coûtait une conversion forcée à chaque enregistrement. Mesuré avant de le retirer : le
 *  second paramètre n'était appelé de NULLE PART (l'hôte ne pousse jamais dans une sortie, c'est
 *  Kronos qui envoie), et les conversions de `audio` et `midi` ne cachaient RIEN — leurs surfaces
 *  publiées satisfont le contrat telles quelles. Une forme d'hôte qui double un contrat ratifié
 *  cache les écarts au lieu de les montrer. */
type TransportLike = RuntimeAdapter;

export interface KronosAudioOptions {
  /** Compiled loop length in scene seconds (BPx-compiled scene end). Seeds the placeholder
   *  timeline; the REAL loop bound comes from the Kairos timeline `bindStructureSource`
   *  swaps in (it sets the scheduler timeline AND the cursor loop length at bind). */
  durationSec?: number;
  // (audioCtx RETIRÉ, frontière Phase 2 audio : le temps vient de performance.now (createTransport),
  //  et runtime-audio possède+réveille SON propre contexte — l'hôte n'en fournit plus.)
  /** SEAM de test : horloge déterministe injectée dans createTransport. Jamais posé en prod
   *  (défaut = `performance.now()/1000`). Permet aux tests de piloter le temps sans AudioContext. */
  now?: () => number;
  /** Tempo (BPM) the events' seconds were derived at. */
  derivedTempo: number;
  /** Beats-per-bar PROJECTED from the derived meter (`DeriveResult.meter`, BPx authority)
   *  for the bar/beat fold. Absent (tests/headless) → `DEFAULT_BEATS_PER_BAR` (4/4). */
  beatsPerBar?: number;
  /** Whether to loop the scene. */
  loop: boolean;
  /** LE BUS D'ÉVÉNEMENTS DE L'HÔTE, remis aux sorties construites ICI pour qu'elles s'y ABONNENT
   *  elles-mêmes (§5.7 : l'hôte le tient sans le posséder). Miroir de `bindClock` côté temps —
   *  la sortie filtre sur SA clé et retranche SA latence, rien de tout cela ne vit ici.
   *  Absent (tests, headless) ⇒ aucune sortie ne s'abonne, et rien ne casse : tant que Kronos
   *  APPELLE au lieu de publier, l'abonnement ne reçoit rien. */
  events?: EventBus;
  /** Per-runtime OUTPUT SINKS built by the host (e.g. the per-actor MIDI transport), keyed
   *  by the runtime name Kairos emits in `event.output.runtime` ('midi', …). The AUDIO
   *  ('audio') and OSC sinks are built HERE (they need the shared clock); a key
   *  present here OVERRIDES the built-in (tests inject capture sinks this way). */
  sinks?: Record<string, TransportLike>;
  /** The derived scene's actor→output table (`tree.metadata.actors`, BPx authority). Used
   *  ONLY to ENUMERATE the OSC devices at setup (actors whose `runtime==='osc'`) so
   *  runtime-OSC can pre-fetch their surfaces (`prepareSurfaces`/`setActorTable`). The
   *  per-event device/channel still travels on `event.output`. Absent ⇒ no OSC. */
  actors?: Record<string, { runtime: string; params?: Record<string, unknown> }>;
  /** OSC output: the osc-bridge WS→UDP relay endpoint the OscAdapter's WebSocket
   *  transport connects to (from `library/routing.json`). */
  oscWsUrl?: string;
  /** Scene-second offset to start from (STEP / resume). Default 0. */
  startSceneSec?: number;
  /** Whether re-random is active (gates the Kairos `reDeriveKairos` re-derive). */
  reRandom?: boolean;
  // (Le champ `step` hôte est RETIRÉ, RC-B : un STEP passe par le handle persistant
  //  `handle.step`/`transport.step(1)`, plus par une construction dédiée avec grain de fenêtre.)
  /** Host logger (routed to the Console panel). */
  log?: (msg: string) => void;
  /** Sortie VOIX DE CODE : l'adaptateur uniforme de runtime-codevoices (`send`/`bindClock`/
   *  `evaluate`/`dispose`), construit par la dérivation hôte (table backticks BPx). Enregistré
   *  sur la clé 'code' ; c'est LUI qui tire les backticks à l'onset et s'abonne au bus de cycle
   *  de vie (le relais lifecycle a DESCENDU dans le paquet — plus de code-voice-lifecycle hôte). */
  codeVoicesRuntime?: RuntimeAdapter;
  /** BUILD-ONLY (Model C produce/load): construire la machine (clock/scheduler/cursor/driver/
   *  transport) et la timeline SANS jouer — le transport reste 'stopped', le driver n'est PAS
   *  démarré, donc AUCUN `send` n'a lieu (zéro son, le contexte audio n'est pas réveillé ici).
   *  Le handle persistant ainsi obtenu est REJOUABLE : le premier Play appelle `replay()`
   *  (= 0 dérivation). Ignoré quand `step` est fourni (un STEP joue toujours une fenêtre). */
  buildOnly?: boolean;
  /** The Kairos handle the host already `charger`ed with the derived tree + projection
   *  context. It is the SOURCE of the played timeline: its `sourceStructure()` is bound on
   *  the Transport (PULL — Kronos swaps in its projected Timeline at bind AND sets the cursor
   *  loop length), the RealtimeDriver ticks the TRANSPORT (drains Kairos ops, then the
   *  scheduler), and live tempo/mute route through `kairos.demande(...)`. REQUIRED — Kanopi
   *  has a single read path (Kronos via Kairos); there is no legacy events-timeline path. */
  kairos: Kairos;
  /** RE-RANDOM re-derive. The host builds this closure (re-derive grammar with a fresh seed
   *  → `kairos.charger` the new tree → Kronos re-pulls + swaps at the loop edge).
   *  `startKronosAudio` installs it via `kairos.setReDerive(reRandom && loop ? cb : null)` at
   *  construction AND re-arms it on every live `setReRandom`/`setLoop` toggle — so flipping
   *  re-random mid-play takes effect. */
  reDeriveKairos?: () => void;
}

/** Beat/bar readout for the transport display, derived from the SAME playhead as
 *  the audio (loop-folded) → aligned + monotone-from-0. */
export interface KronosCursorBeat {
  beatsTotal: number;
  bar: number;
  beat: number;
  phase: number;
}

export interface KronosAudioHandle {
  /** Kronos's Transport — the single execution state machine + position authority
   *  (`play/pause/stop/step/seek/setTempo/setLoop`, observable `state/position()/
   *  beatPosition()/onStateChange`). The host projects on it; it holds no FSM/counter. */
  transport: Transport;
  /** Beats-per-bar this handle folds bar/beat with (projected from the derived meter).
   *  Read by the cursor store for the onBar/onBeat event derivation. */
  beatsPerBar: number;
  stop(): void;
  /** STOP-IN-PLACE (Model C): return the playhead to 0 and silence everything, but KEEP the
   *  handle REPLAYABLE. `transport.stop()` (→ position 0, emission off, state 'stopped') +
   *  `driver.stop()` + cut the code voices. Unlike `stop()` this poses NO one-shot teardown
   *  flag — a later `replay()` restarts the SAME scheduler/timeline. Used by the transport
   *  Stop button (the timeline persists; only the head moves). */
  stopInPlace(): void;
  /** REPLAY the persisted scene from 0 after a `stopInPlace` (Model C): `transport.play()`
   *  (re-anchors clock+scheduler at resume=0, re-arms emission) + `driver.start()` (idempotent)
   *  + re-fire the code voices. No re-derivation, no new scheduler — the SAME timeline the
   *  derivation built plays again. No-op after a full-teardown `stop()`. */
  replay(): void;
  /** STEP `n` tree UNITS in place on the PERSISTENT handle (Model C, RC-B fix): `transport.step(n)`
   *  (Kronos plays the bounded window `[P, position+n)`, snap-to-onset so the reached column SOUNDS
   *  — bug 2 fix — and lands at the next unit boundary) + pump. NO re-derivation, NO host beat
   *  counter (`%n`), NO grille-beat grain: the grain IS Kronos's tree unit (CVA-7). The host gesture
   *  just forwards `step(1)` — it neither counts beats nor re-derives the scene. */
  step(n: number): void;
  /** Live re-random toggle (transport): installs/removes the re-derive on the
   *  ACTIVE scheduler so toggling re-random mid-play takes effect at the next loop
   *  boundary (gated by the current loop state). The legacy dispatcher path has the
   *  twin; in kronos mode this handle drives the audio, so the toggle must reach it. */
  setReRandom(on: boolean): void;
  /** Live loop toggle (transport): updates the scheduler + cursor loop state and
   *  re-evaluates whether the re-derive should be installed (re-random ⊗ loop). */
  setLoop(on: boolean): void;
  /** Playhead in scene seconds, READ from the Transport (cursor while running, frozen
   *  position when paused/stopped). The host reads this per-frame; one authority. */
  position(): number;
  /** Beat/bar readout, READ from the Transport (frozen-aware). */
  beatPosition(): KronosCursorBeat;
  /** Re-anchor + reposition the playhead to a scene second (seek, no new audio):
   *  same primitive a Play-from-position uses — the next scheduled events fire
   *  from there and the cursor reads from there. */
  seek(sceneSec: number): void;
  /** Resume IN PLACE after a pause — WITHOUT re-evaluating the scene.
   *  Clears the pause emission bound, re-anchors clock+scheduler at `sceneSec` (the
   *  frozen beat boundary), and restarts the driver pump. The SAME scheduler/timeline
   *  lives across the whole play→pause→play cycle, so no second emitter is ever
   *  created (the re-eval-on-resume path stacked schedulers → intermittent doubling). */
  resume(sceneSec: number): void;
  /** Live tempo change WITHOUT re-deriving: warps the heard tempo by re-anchoring
   *  the clock at the current instant and adopting the new BPM for future
   *  scene→audio conversions (the scene position stays continuous, no jump). The
   *  legacy dispatcher's `setLiveTempo` has the twin; in kronos mode this handle
   *  drives the audio, so a BPM/TAP change mid-play must reach it here. */
  retune(bpm: number): void;
  /** Arm/disarm an orchestrated actor's NOTE voice while the rest keep playing
   *  (orchestrated kronos path). Disarming silences that actor's notes at the
   *  scheduler's emission gate (Kronos owns the audio in this mode); re-arming
   *  lets them through again at the next emission. A code voice (Strudel/Hydra)
   *  is NOT note-routed — its arm/disarm is handled by its own adapter, not here.
   *  No-op for the mono path (no actors). */
  setActorMuted(actor: string, muted: boolean): void;
}

// Scheduler look-ahead window (seconds).
const LOOKAHEAD_SEC = 0.12;

// Frontière hôte↔runtimes (Phase 2 OSC) : la DÉRIVATION des liaisons OSC (device/channel depuis
// `metadata.actors`) a quitté l'hôte (écart #5) — `createOscRuntime` la fait DANS le paquet à
// partir de la table BRUTE d'acteurs. L'hôte ne dérive plus rien.

/**
 * Start Kronos driving the real audio for one scene. Call JUST BEFORE the host
 * would have started the old dispatcher (the transports are already configured);
 * in kronos mode the host then SKIPS `dispatcher.start` so only Kronos sounds.
 * `stop()` tears down the driver; the host's `dispatcher.stop()` closes the
 * transports (cuts the scheduled audio) as usual.
 */
// PILOTAGE (DEV) — affordance de MESURE de la sortie : Kanopi ne tient AUCUN nœud audio ; il lit
// seulement des NOMBRES via l'affordance lecture-seule de runtime-audio (enableMeter/getMeasurement/
// getFloatFrequencyData/disableMeter, commit 6148d03). Référence sur l'AudioRuntime COURANT (mis à
// jour à chaque build de handle) que la façade `window.kanopi` lit. Nul en prod.
export interface AudioMeter {
  enableMeter(opts?: { fftSize?: number }): void;
  disableMeter(): void;
  getMeasurement(): { rms: number; spectralCentroid: number } | null;
  getFloatFrequencyData(arr: Float32Array): void;
  // [334] LE JUMEAU DU COMPTEUR — journal des ENVOIS REÇUS, livré par runtime-audio (46cb4e3) à sa
  // propre frontière. Même statut que le compteur juste au-dessus : opt-in, coût nul éteint, lecture
  // seule, HORS du chemin du son. L'hôte ALLUME et LIT ; il n'enveloppe aucun `send` — un `send`
  // enveloppé côté hôte est nommément une violation (`§Garde 1` du portillon), et c'est précisément
  // pour ça que l'instrument a été ouvert chez le runtime plutôt qu'ici.
  enableEventLog?(opts?: { cap?: number }): void;
  disableEventLog?(): void;
  getEventLog?(): ReadonlyArray<Record<string, unknown>> | null;
}
let currentAudioMeter: AudioMeter | null = null;
export function pilotAudioMeter(): AudioMeter | null {
  return currentAudioMeter;
}

// MIXAGE (KAN-UX3, contrat hote-runtimes-sortie.md:51, amendement 2026-07-09) — l'affordance
// GAIN (setMasterGain/setMasterMuted/setActorGain) est désormais ratifiée IDENTIQUE sur les
// TROIS runtimes de sortie sonnants (runtime-audio adapter.js:706+, runtime-midi
// midi-runtime.js:209+, runtime-osc adapter.js:265+ — noms/signature/sémantique 0..1 linéaire,
// effectif = acteur × maître, confirmés par les 3 équipes [661]-[665]). MÊME chemin d'accès que
// la sonde meter pour chacun : une référence sur l'instance COURANTE (mise à jour à chaque
// build de handle), lue par la couche mixer de l'hôte. L'hôte ne porte que l'INTENTION ; la
// réalisation sur le fil (rampe anti-clic pour l'audio, mise à l'échelle de la vélocité pour
// midi/osc — protocole discret, effet à la PROCHAINE note) est ENTIÈREMENT interne à chaque
// runtime.
export interface AudioGainControl {
  setMasterGain(value: number): void;
  setMasterMuted(muted: boolean): void;
  setActorGain(actor: string, value: number): void;
}
let currentAudioGain: AudioGainControl | null = null;
export function audioGainControl(): AudioGainControl | null {
  return currentAudioGain;
}
let currentMidiGain: AudioGainControl | null = null;
/** Même contrat gain que `audioGainControl()`, porté par l'instance MIDI VIVANTE de la scène
 *  (`voice.midi` en amont — bpx-adapter.ts — passé ici en `opts.sinks.midi`). `null` quand la
 *  scène n'a aucun acteur MIDI (pas de sink construit). */
export function midiGainControl(): AudioGainControl | null {
  return currentMidiGain;
}
let currentOscGain: AudioGainControl | null = null;
/** Même contrat gain que `audioGainControl()`, porté par l'`OscAdapter` VIVANT (recréé à
 *  chaque `startKronosAudio`, jamais en `buildOnly` — mêmes gardes que `oscRuntime` plus bas).
 *  `null` quand la scène n'a aucun acteur OSC ou pas d'URL de relais. */
export function oscGainControl(): AudioGainControl | null {
  return currentOscGain;
}
let currentCodeVoicesGain: AudioGainControl | null = null;
/** Même contrat gain que `audioGainControl()`, porté par l'instance runtime-codevoices VIVANTE
 *  (`opts.codeVoicesRuntime`, bpx-adapter.ts — construite par createCodeVoicesRuntime, transmise
 *  telle quelle). `null` quand la scène n'a aucun backtick (pas de voix de code). Diffusé en
 *  interne à TOUS les adaptateurs de voix (paquet, [73]). Qui réagit, à jour au 2026-07-24 :
 *  le niveau PAR ACTEUR (`setActorGain`) reste strudel/csound seuls (pas de point d'insertion
 *  par acteur ailleurs — voices/js.ts:72-75) ; le MAÎTRE (`setMasterGain`/`setMasterMuted`) est
 *  désormais honoré AUSSI par mercury, js et p5 (étage `voices/master-out.ts`, amont 5c4f4e8).
 *  hydra n'a rien à couper et reste sans méthode (voices/hydra.ts:163). */
export function codeVoicesGainControl(): AudioGainControl | null {
  return currentCodeVoicesGain;
}
/** L'instance runtime-codevoices VIVANTE vue pour l'INTROSPECTION lecture seule du banc
 *  (`k.inspect.hydraClock()`) : `peekClock(runtime)` relit l'horloge PROPRE d'un moteur (Hydra :
 *  `synth.time`), pour PROUVER le recalage au seek fin. MÊME instance que `codeVoicesGainControl()`
 *  (`opts.codeVoicesRuntime`), ré-exposée avec sa capacité de peek. `null` sans voix de code.
 *  Lecture seule, non-autoritaire — Kronos reste seul gardien du temps. */
export function pilotCodeVoicesRuntime(): {
  peekClock(runtime: string): number | undefined;
} | null {
  return currentCodeVoicesGain as unknown as {
    peekClock(runtime: string): number | undefined;
  } | null;
}

export function startKronosAudio(opts: KronosAudioOptions): KronosAudioHandle {
  const { derivedTempo } = opts;
  // Bar fold width = the derived meter's beats-per-bar (BPx authority), default 4.
  const beatsPerBar = opts.beatsPerBar ?? DEFAULT_BEATS_PER_BAR;
  // BUILD-ONLY (Model C produce/load): construct the machine + timeline but DON'T play.
  // Determined HERE (not just before the play branch) so every "would actually sound"
  // side-effect — including the OSC relay socket below — can stay gated behind it.
  // (Le STEP hôte est RETIRÉ, RC-B : il passe par le handle PERSISTANT `transport.step(1)`
  // via `handle.step`, plus par une construction dédiée avec un grain.)
  const buildOnly = !!opts.buildOnly;
  const loop = opts.loop;
  const startScene = opts.startSceneSec ?? 0;
  const log = opts.log ?? (() => {});

  // 1. Placeholder timeline — Kronos's `Scheduler`/`Cursor` need an initial Timeline, but
  //    the REAL played timeline is the Kairos projection that `bindStructureSource` swaps in
  //    at bind (it ALSO sets the cursor loop length from the swapped view — Kronos 4aea362).
  //    So this empty placeholder is transient; its only seed is `opts.durationSec` (the
  //    BPx-compiled length) for the brief window before the swap. Kanopi builds NO timeline
  //    from events — the single read path is the tree → Kairos projection.
  const duration = opts.durationSec ?? 0;

  // FABRIQUE (chantier transport-SM [471-482]) — DRAFT en cours : UN appel assemble
  // clock+scheduler+cursor+driver+transport EN INTERNE et rend le handle (commandes + observables
  // LECTURE SEULE + câblage sorties + pompe). Remplace l'ancien assemblage manuel (new InternalClock
  // / new Scheduler / new Cursor / new Transport / new RealtimeDriver, tous retirés du public). La
  // timeline placeholder est créée EN INTERNE (durationSec) ; Kairos la remplace au bind.
  // À FINALISER (dès surface Kronos confirmée finale) : les usages downstream `scheduler`/`cursor`/
  // `transport`/`driver` deviennent `kronos.addAdapter`/`kronos.transport`/`kronos.driver` ;
  // le fold hôte `alignToSpeaker` (cursor.loopDuration) → `kronos.transport.position()` /
  // `loopDurationScene()` (repli INTERNE, plus aucun fold hôte = la garantie).
  const kronos: KronosTransport = createTransport({
    // SOURCE DE TEMPS de Kronos = horloge monotone PROPRE (décision temps-audio-multicontextes,
    // #8). PLUS d'`audioCtx.currentTime` : le temps n'est plus couplé à un contexte audio (chaque
    // sink sonnant possède le sien). `performance.now()/1000` = secondes, monotone, zéro AudioContext.
    // `opts.now` = SEAM de test (horloge déterministe injectée), jamais posé en prod.
    now: opts.now ?? (() => performance.now() / 1000),
    derivedTempo,
    startScene,
    durationSec: duration,
    loop,
    lookahead: LOOKAHEAD_SEC,
    intervalMs: 25
  });

  // 2b. AUDIO OUTPUT = the runtime-audio AudioRuntime (the 'audio' SINK). KAI-10 — it
  //     reads `content.pitch.hz` off each event (graven by Kairos) and renders `content.modulations`.
  //     A host-provided `sinks.audio` (tests inject capture) OVERRIDES it.
  // CANAL (B) — CÂBLÉ ([485]→[494], archi tranché + openDAW) : le time-view du sink (musicalNow/
  //    audioTimeFor pour placer les CV) NE PASSE PAS par l'hôte — sinon l'hôte pourrait reconstruire
  //    la position. KRONOS l'injecte lui-même : à `addAdapter`, il appelle `adapter.bindClock?.(clock)`
  //    (scheduler.ts:118,124) avec SA vue `ClockProvider` LECTURE SEULE ; l'`audioAdapter` ci-dessous
  //    la TRANSMET au moteur de rendu (champ public `audioRuntime.clock`, lu frais à chaque usage).
  //    L'hôte ne construit plus de clock et n'appelle JAMAIS musicalNow — par construction.
  // AUDIO OWNERSHIP (#7) : createAudioRuntime SANS contexte injecté → runtime-audio CRÉE et POSSÈDE
  // le sien (new AudioContext), et le RÉVEILLE lui-même (via le bus de cycle de vie, à la transition
  // replay/resume portée par la pile du geste). L'hôte ne fabrique plus, ne réveille plus, ne met
  // plus en forme (pitch/vel/modulations = DANS le paquet). La vue horloge arrive par bindClock.
  // Gardé derrière l'override de sink : si un `sinks.audio` est fourni (tests de capture /
  // headless), on ne crée PAS le runtime — sinon il ferait un `new AudioContext()` inutile (et
  // impossible en jsdom). En prod (pas d'override), createAudioRuntime crée+possède son contexte.
  const audioRuntime = opts.sinks?.audio ? null : createAudioRuntime({ sounds: undefined });
  // PRÉCHAUFFAGE au CHARGEMENT (design ratifié archi [589]) : à un PRODUCE/LOAD (`buildOnly`, dans
  // la chaîne du geste : clic library / Ctrl+Enter), on RÉVEILLE le contexte audio de runtime-audio
  // MAINTENANT (`warmup()` = resume one-shot, 16933ca) au lieu d'attendre la 1ʳᵉ transition de play →
  // 1er son sans glitch. C'est ICI que se fait le warmup audio (PAS via la registry statique de
  // l'hôte : l'AudioRuntime n'y est pas, il vit sur le handle). Best-effort, jamais bloquant.
  if (buildOnly && audioRuntime) {
    void (audioRuntime as unknown as { warmup?: () => Promise<void> }).warmup?.();
  }
  // PILOTAGE (DEV) : expose l'AudioRuntime courant pour la sonde audio de `window.kanopi`. Lecture
  // seule (le pilot n'appelle QUE l'affordance meter). Écrase la ref précédente → l'ancien runtime
  // reste GC-able à la destruction du handle.
  currentAudioMeter = audioRuntime as unknown as AudioMeter;
  // MIXAGE (KAN-UX3) : même mise à jour que la sonde meter — la couche mixer lit toujours
  // l'AudioRuntime COURANT (recréé à chaque eval ; la re-projection des niveaux persistés
  // se fait aux points d'accroche de real-core, publish + replay). Nul sous sink de test.
  currentAudioGain = audioRuntime as unknown as AudioGainControl | null;
  const audioSink: TransportLike | null =
    opts.sinks?.audio ?? (audioRuntime as unknown as TransportLike | null);

  // MIDI OUTPUT = the host-built per-actor MidiTransport, handed in as `sinks.midi`.
  const midiSink: TransportLike | null = opts.sinks?.midi ?? null;
  // MIXAGE : `midiSink` EST déjà l'instance MIDI vivante (bpx-adapter la construit et la passe
  // ici telle quelle, `sinks: { midi }` — pas de wrapper hôte) ; même mise à jour que la sonde
  // audio ci-dessus.
  currentMidiGain = midiSink as unknown as AudioGainControl | null;

  // OSC OUTPUT — l'adaptateur uniforme de runtime-OSC (frontière hôte↔runtimes, Phase 2). La
  // fabrique POSSÈDE tout : socket WS→pont, profil d'adressage, DÉRIVATION des devices depuis la
  // table BRUTE d'acteurs (l'hôte ne dérive plus rien, écart #5). Kronos câble l'horloge via
  // `bindClock` à l'enregistrement → plus de `now: audioCtx.currentTime` côté hôte (écart #8).
  // Gardée par `!buildOnly` (un produce/load n'ouvre AUCUN WebSocket réel). La fabrique rend
  // `null` si aucun acteur OSC ou pas d'URL de relais → on n'enregistre rien. `sinks.osc` (tests)
  // reste prioritaire.
  const oscRuntime = buildOnly
    ? null
    : createOscRuntime({
        oscWsUrl: opts.oscWsUrl,
        actors: opts.actors,
        log: (m: string) => log(m)
      });
  // MIXAGE : même garde que `currentAudioGain` — l'instance RÉELLE (`oscRuntime`, pas
  // `oscSink` qui peut être un test override), nulle en `buildOnly`/sans acteur OSC.
  // `createOscRuntime` rend `OscAdapter | null` (surface publiée, plus de copie de pont) :
  // `OscAdapter` porte structurellement `setMasterGain`/`setMasterMuted`/`setActorGain` et
  // `send`, donc aucun cast n'est nécessaire — le `| null` circule tel quel.
  currentOscGain = oscRuntime;
  // OSC — enregistré par le CONTRAT, comme les trois autres. Ce module a porté du 2026-08-10
  // au 2026-08-10 une conversion pour cette sortie SEULE : `OscAdapter` ne satisfaisait pas
  // `RuntimeAdapter` parce que runtime-OSC portait sa propre copie des types du bus, restée sur
  // trois phases de transport quand Kronos en publiait quatre. Mesuré au vérificateur de types,
  // signalé, resynchronisé chez lui (leur `ac11458`, ajout purement additif de `waiting`) — la
  // conversion part avec sa cause, dans le même mouvement.
  // L'ABONNEMENT AU BUS — posé sur l'instance RÉELLE (`oscRuntime`), jamais sur un puits de test.
  // Il s'abonne, filtre `payload.output.runtime === 'osc'` et retranche sa latence à la réception ;
  // le désabonnement part avec son `dispose()`.
  //
  // ⚠️ ON S'ABONNE AVANT QUE KRONOS BASCULE, et c'est l'ordre imposé : tant qu'il appelle au lieu
  // de publier, l'abonnement ne reçoit rien et ne coûte rien. L'inverse — publier devant des
  // sorties non abonnées — publie dans le vide et coupe le son.
  if (oscRuntime && opts.events) oscRuntime.bindEvents(opts.events);

  const oscSink: TransportLike | null = opts.sinks?.osc ?? oscRuntime;

  // 3. PER-RUNTIME adapters. Each ScheduledEvent already carries its `output.runtime` route
  //    key (graven by Kairos); the scheduler selects the adapter on that key alone
  //    (`addAdapter(runtime, …)`). Kanopi reads NO actor→transport map and chooses no sink:
  //    'midi' → MidiTransport (channel = ev.output.channel), 'audio' →
  //    AudioRuntime, 'osc' → OscAdapter (device/channel ride ev.output), 'code' → the
  //    backtick sink (interpreter = ev.output.device). There is NO default adapter — an
  //    event whose runtime has no sink is surfaced by Kronos's `unknown-output-runtime`
  //    diagnostic, never silently rerouted.
  // (Plus de `warnMissing` ni de `prep`/coerce hôte : les 3 sinks sonnants — audio/midi/osc — ont
  //  migré ; chacun reçoit l'événement VERBATIM et met en forme DANS son paquet. Le seul adaptateur
  //  encore écrit ici est `codeAdapter` — pur aiguillage d'un token vers le sink backtick, sans
  //  mise en forme.)

  // AUDIO : plus de wrapper hôte. L'adaptateur uniforme de runtime-audio (audioSink) est enregistré
  // DIRECTEMENT sur Kronos (voir plus bas) et reçoit l'événement ordonnancé VERBATIM : c'est LUI qui
  // lit `content.pitch.hz`, normalise la vélocité, et rend `content.modulations` (mise en forme
  // rapatriée). Kronos appelle son `send(ev)`/`bindClock` — l'hôte ne reshape plus, ne transmet plus
  // la clock à la main. (L'ancien observateur DEV des events forwardés est retiré avec le wrapper.)

  // MIDI : plus de wrapper hôte. Frontière hôte↔runtimes (Phase 2) — l'adaptateur uniforme de
  // runtime-MIDI (`createMidiRuntime`, construit dans bpx-adapter) est enregistré DIRECTEMENT sur
  // Kronos (voir plus bas). C'est LUI qui met en forme l'événement, résout le canal
  // (`output.channel`) et normalise la vélocité — l'hôte ne calcule plus vel/127 ni le canal, ne
  // reshape plus rien (écarts #3/#4 retirés). Kronos lui passe l'événement BRUT via `send(ev)`.

  // OSC : plus de wrapper hôte. L'adaptateur uniforme de runtime-OSC (`createOscRuntime`) est
  // enregistré DIRECTEMENT sur Kronos (voir plus bas) et reçoit l'événement ordonnancé VERBATIM ;
  // son profil mappe `content`/`output` vers les adresses OSC. L'hôte ne reshape plus rien.

  // CODE: a code voice (`output.runtime==='code'`) is NOT a note — fire it through the
  // backtick sink (the same sink the legacy dispatcher used). Its interpreter rides
  // `ev.output.device` (strudel/hydra/…), already encoded in the BT token's table, so the
  // sink resolves it itself. AGNOSTIQUE AU `kind` (CONTRAT_SINK_CONTROLE §2-3/§7) : le
  // token sonnant BT (kind absent ⇒ 'note') ET un éventuel `kind:'control'` porteur de
  // token tirent le code À LEUR ONSET — même chemin, durée 0 comprise.
  // CODE : plus d'adaptateur hôte. L'adaptateur uniforme de runtime-codevoices (opts.codeVoicesRuntime)
  // est enregistré DIRECTEMENT sur 'code' (voir plus bas) : son `send(ev)` lit `content.token`, résout
  // l'interprète (sa registry interne) et tire le code à l'onset ; son `bindClock` l'abonne au bus de
  // cycle de vie de Kronos (gel/reprise/tais-toi). L'hôte ne route ni ne relaie plus rien.

  // 4. Scheduler + per-runtime adapter registration (NO default adapter — the host selects
  //    no sink; every event routes on its own `output.runtime`). A `.gr`/mono scene's
  //    default actor carries `output.runtime='audio'` from the AST, so it lands on 'audio'.
  // Enregistrement des sorties sur le HANDLE (la fabrique n'expose PAS le scheduler ; `kronos.addAdapter`
  // délègue en interne). Plus de `new Scheduler` hôte. NO default adapter (chaque event route sur output.runtime).
  // L'adaptateur uniforme de runtime-audio enregistré DIRECTEMENT (send(ev) VERBATIM + bindClock ;
  // Kronos câble l'horloge lui-même à l'enregistrement).
  if (audioSink) {
    kronos.addAdapter('audio', audioSink);
  }
  // L'adaptateur uniforme de runtime-MIDI est enregistré DIRECTEMENT (il expose send(ev)/bindClock ;
  // Kronos appelle bindClock lui-même à l'enregistrement — vue horloge + bus de cycle de vie).
  if (midiSink) kronos.addAdapter('midi', midiSink);
  // L'adaptateur uniforme de runtime-OSC est enregistré DIRECTEMENT (send(ev)/bindClock ; Kronos
  // câble l'horloge lui-même à l'enregistrement — plus de now:audioCtx hôte pour OSC).
  if (oscSink) kronos.addAdapter('osc', oscSink);
  // MIXAGE : même mise à jour que la sonde audio/midi/osc — reçu (pas construit) ici, c'est le
  // SEUL point où `startKronosAudio` touche `opts.codeVoicesRuntime`. Nul quand la scène n'a
  // aucun backtick (pas d'objet transmis).
  currentCodeVoicesGain = (opts.codeVoicesRuntime ?? null) as unknown as AudioGainControl | null;
  if (opts.codeVoicesRuntime) kronos.addAdapter('code', opts.codeVoicesRuntime);

  // The playing cursor (EX4 phase 2): the INVERSE of the time authority, not a separate
  // counter — it reads the same `clock` the scheduler does, so the drawn playhead is
  // rigorously aligned to the heard audio (no ~1-note lag) and monotone from `startScene`
  // (the only return-to-0 is the legitimate loop crossing). The timeline's single cursor.
  // Le curseur est INTERNE au handle (plus de `new Cursor` hôte) : la tête de lecture se lit via
  // `kronos.transport.position()`/`beatPosition()` (la machine replie, source unique — la garantie).

  // RE-RANDOM: Kairos owns the loop-edge pull. `applyReDerive` arms/disarms the host
  // re-derive on KAIROS (`setReDerive`) — gated by `reRandom && loop` — at construction AND
  // on every live `setReRandom`/`setLoop` toggle. The callback (`reDeriveKairos`) re-derives
  // the grammar with a fresh seed and `charger`s Kairos → generation bump → Kronos swaps the
  // new flat at the edge (and resyncs the cursor loop length itself, Kronos 4aea362).
  let loopActive = loop;
  let reRandomActive = !!opts.reRandom;
  const applyReDerive = (): void => {
    opts.kairos.setReDerive(
      reRandomActive && loopActive && opts.reDeriveKairos ? opts.reDeriveKairos : null
    );
  };
  applyReDerive();

  // STEP: audition ONE beat in place. EMISSION-bounded (not wall-clock): the
  // scheduler resumes at `step.fromSec` and bounds emission to the half-open scene
  // window `[fromSec, fromSec + durSec)` — lookahead INCLUDED, so it NEVER schedules
  // the next beat (whose onset is the window boundary). The previous wall-clock
  // `setTimeout(driver.stop)` was fundamentally racy: the lookahead (0.12 s) emitted
  // the next beat before the timer fired → 2 notes on the first step. The scene bound
  // clamps emission deterministically; a note whose duration overflows the window
  // still sounds fully (only emission is bounded). Normal Play keeps `start()`
  // (unbounded) below; a normal `start()` does not inherit the bound.
  // TRANSPORT (REBUILD) — Kronos's single execution state machine + position authority
  // (contract `kronos-transport.md`). Kanopi PROJECTS on it: it calls the commands and
  // READS state/position; it holds no FSM and no position counter. Composition over the
  // same clock/scheduler/cursor, so there is ZERO duplicated state — the position stays
  // the cursor. The host drives play/pause/stop/step/seek/setTempo/setLoop through this.
  const transport = kronos.transport;
  // Kairos drives the SOURCE of the played timeline. Bind its `StructureSource` on the
  // Transport (PULL channel): at bind the Transport swaps Kairos's projected Timeline into
  // the scheduler (replacing the empty placeholder) AND sets the cursor loop length from it
  // (Kronos 4aea362), then re-pulls at each loop edge when Kairos bumps its generation
  // (re-random = a generation bump). `bindStructureSource` installs the scheduler's
  // loop-edge hook itself (which fires `kairos.auBord` → the host `reDeriveKairos`).
  transport.bindStructureSource(opts.kairos.sourceStructure());
  // External pump (Kronos has no internal timer): the driver wakes every ~25 ms within the
  // lookahead window and ticks the TRANSPORT (which drains Kairos's control ops — tempo/mute
  // — THEN ticks the scheduler). Declared before the play branch so a BUILD-ONLY
  // construction can leave it un-started (no pump = no `send` = no sound).
  const driver = kronos.driver;

  // ÉTABLISSEMENT RÉACTIF de la sortie audio (seek-daw, décision architecte [735] + confirmation
  // Kronos [736]) : Kronos garantit que `transport.playFrom(sec)` DEPUIS L'ARRÊT (le seek de la
  // vue Structure, `ProductionViewHost.svelte` — passe-plat pur) émet EXACTEMENT le MÊME
  // événement de cycle de vie (transition stopped→running) qu'un `play()` impératif, en parité
  // stricte avec `stop()+play()`. Donc le (RÉ)ÉTABLISSEMENT du runtime audio — `reset()` du
  // graphe périmé + réveil du pompage — se fait DEPUIS CE SEUL POINT, sur la transition
  // observée, au lieu de vivre dupliqué dans chaque commande qui démarre la lecture. Toute voie
  // (play impératif initial, `replay()`, `resume()`, le `playFrom` de la vue) passe par
  // `transport.play()`/`playFrom()` → un seul chemin d'établissement (one path, Kronos only).
  // `lastTransportState` n'est PAS une 2e machine d'état : c'est un simple repère local
  // d'ARÊTE (edge-detect), jamais lu ailleurs ni utilisé pour la position/l'affichage — la seule
  // chose qu'il permet est de distinguer, au sens du contrat `RuntimeAdapter.LifecycleTransition`
  // (kronos `runtime-adapter.ts`), un REPLAY (stopped→running : re-tir depuis 0) d'un RESUME
  // (paused→running : reprise en place) — distinction que `transport.onStateChange` n'expose
  // qu'implicitement (il ne donne QUE l'état suivant, pas l'état précédent).
  let lastTransportState = transport.state;
  transport.onStateChange((next) => {
    const prev = lastTransportState;
    lastTransportState = next;
    if (next !== 'running') return;
    if (prev === 'stopped') {
      // REPLAY (re-tir depuis 0) : le graphe de rendu peut porter des nœuds PERSISTANTS
      // (filtres `ctrl::<controlId>`, report de portamento) d'une lecture précédente —
      // `stopInPlace()` arrête le transport/le pompage mais NE démonte PAS le graphe. Sans ce
      // reset, le re-play réutilise les mêmes occurrences → le dédup `posed` empêche la re-pose
      // de la courbe → 1er tour FIGÉ (bug Model C, CVA-INIT). Appelé AVANT `driver.start()` —
      // synchrone, zéro tick entre les deux — donc aucun événement n'atteint le graphe périmé.
      // Sur une toute première lecture (jamais rien joué), le graphe est déjà vide : no-op.
      // `audioRuntime` est `null` sous un `sinks.audio` de test (pas d'AudioRuntime construit,
      // cf. plus haut) — chaîné en optionnel AVANT le cast (sinon accès direct sur `null`).
      (audioRuntime as { reset?: () => void } | null)?.reset?.();
    }
    // RESUME (paused→running, reprise en place) : PAS de reset — le graphe survit intact
    // (portamento, filtres soutenus). Dans les deux cas le pompage doit tourner :
    // `driver.start()` est idempotent (no-op si déjà en marche).
    driver.start();
  });

  // BUILD-ONLY (Model C produce/load): construct the machine + timeline but DON'T play —
  // transport stays 'stopped', the driver is NOT started, so nothing is ever emitted (zero
  // sound, the audio context is not woken here). The host registers this persistent handle
  // and the first Play calls `replay()` (= 0 re-derivation). A STEP always plays its window.
  // (`buildOnly` is computed up top so the OSC socket mount is gated by it too.)
  if (buildOnly) {
    // Park the position at the start scene second (frozen, transport 'stopped'); do not arm
    // the scheduler, do not start the pump. `replay()` will `transport.play()` (the reactive
    // listener above re-establishes: reset() + `driver.start()`).
    transport.seek(startScene);
  } else {
    // Normal play from the start position (re-anchors clock + arms the scheduler). The reactive
    // listener above fires synchronously inside `transport.play()` and starts the driver.
    transport.seek(startScene);
    transport.play();
  }

  log(
    `${buildOnly ? '⏸ kronos built (stopped)' : '▶ kronos audio'} — ` +
      `${duration.toFixed(3)}s, ${derivedTempo} bpm, loop ${loop}` +
      (loop && opts.reRandom ? ', re-random ON' : '')
  );

  // RELAIS LIFECYCLE voix de code (S2) — branché APRÈS la branche play initiale : le tout
  // premier passage stopped→running est l'éval elle-même (le scheduler tire les BT à leur
  // onset), pas un replay à re-tirer. Toute transition SUIVANTE est relayée aux moteurs :
  // gel réel à la pause (quantifiée), reprise resynchronisée, tais-toi au stop. Le
  // détachement AVANT le stop() de teardown préserve la voix à la re-éval same-file.
  // (Plus de relais lifecycle hôte : runtime-codevoices s'abonne LUI-MÊME au bus de cycle de vie de
  //  Kronos à son `bindClock`. L'hôte ne fait que COMMANDER le transport ; Kronos propage.)
  let stopped = false;

  // CVA-2 (alignement latence haut-parleur) — RETIRÉ du côté hôte : il lisait `clock.musicalNow`
  // (map t_audio↔t_scène) et foldait `cursor.loopDuration`, deux primitives INTERNES à Kronos
  // désormais retirées du public. La tête de lecture = `transport.position()` directe (Kronos replie
  // en interne, source unique) ; la compensation de latence d'affichage revient à Kronos / au sink
  // via son time-view injecté (gate B). L'hôte ne folde ni ne compense plus rien = la garantie.

  return {
    // The Kronos Transport — the SINGLE state machine + position authority. The host
    // (playback store + transport UI) projects on it: calls its commands and reads
    // state/position. Kanopi keeps no FSM and no position counter.
    transport,
    // The projected meter's beats-per-bar (the cursor store reads it for onBar events).
    beatsPerBar,
    stop() {
      if (stopped) return;
      stopped = true;
      // TEARDOWN (re-éval same-file / swap de scène) : le teardown du transport ne coupe pas les
      // voix de code — leur cycle de vie est géré par runtime-codevoices via le bus (une re-éval
      // same-file garde la voix Hydra/Strudel qui sonne). L'hôte ne relaie plus rien ici.
      try {
        transport.stop();
        driver.stop();
        // OSC: full teardown — l'adaptateur uniforme ferme son socket + annule les émissions.
        (oscSink as { dispose?(): void } | null)?.dispose?.();
      } catch {
        /* already torn down */
      }
    },
    stopInPlace() {
      // Model C — STOP that KEEPS the handle. `transport.stop()` resets the position to 0
      // and disarms emission WITHOUT destroying the timeline/scheduler; `driver.stop()`
      // parks the external pump. Les voix de code sont coupées par le RELAIS lifecycle
      // (transition → 'stopped' = tais-toi immédiat, REV-F01) — plus d'appel hôte exprès.
      // NO `stopped` flag: a later `replay()` restarts this very scheduler from 0. A
      // full-teardown `stop()` already ran ⇒ no-op.
      if (stopped) return;
      try {
        transport.stop();
        driver.stop();
        // OSC: cancel scheduled-but-unsent emissions, but KEEP the socket open — a
        // later `replay()` reuses this same adapter (Model C; no reconnect churn).
        (oscSink as { stop?(): void } | null)?.stop?.();
      } catch {
        /* already torn down */
      }
    },
    replay() {
      // Model C — REPLAY the persisted scene from 0. `transport.stop()` left resume=0, so
      // `transport.play()` re-anchors clock+scheduler at 0 and re-arms emission; the WebAudio
      // transport recreates its nodes on the next `send`. No re-derivation — the SAME timeline
      // plays again. After a full-teardown `stop()` this is a no-op.
      // CVA-INIT (remise à zéro PRISTINE avant de rejouer) + `driver.start()` sont désormais
      // portés par le listener RÉACTIF sur `transport.onStateChange` (plus haut dans cette
      // fabrique) : il voit la MÊME transition stopped→running que ce `transport.play()`
      // déclenche et ré-établit la sortie audio depuis là — un seul point, plus de duplication
      // (fix seek-daw [735]/[736] : `playFrom` de la vue passe par le MÊME chemin).
      // Les voix de code repartent dans leurs slots via le relais lifecycle (stopped→running).
      if (stopped) return;
      try {
        transport.play();
      } catch {
        /* torn down */
      }
    },
    setReRandom(on: boolean) {
      reRandomActive = on;
      applyReDerive();
    },
    setLoop(on: boolean) {
      loopActive = on;
      // Toggle live via les commandes Kronos (l'hôte ne touche pas scheduler/cursor — internes).
      // `setLoop(start,end)` active la boucle pleine (V1 : les bornes sont déclaratives) ; `clearLoop`
      // la désactive. `duration` = longueur de construction (borne déclarative pour l'observabilité).
      if (on) transport.setLoop(0, duration);
      else transport.clearLoop();
      applyReDerive();
    },
    position() {
      // Tête de lecture = position Kronos, source UNIQUE (la machine replie en interne). Plus de
      // FIGEAGE STEP hôte (= fix bug 3 : la barre suit la position réelle au (re)play après un step,
      // au lieu d'être gelée à `fromSec`) ni de fold de latence hôte (le clock est retiré du public).
      // Kronos EST l'autorité de position ; l'hôte lit, ne recompute ni ne fige rien.
      return transport.position();
    },
    beatPosition() {
      // Bar·beat = lecture Kronos directe (plus de figeage step ni de fold hôte). Kronos replie,
      // source unique — l'hôte ne tient aucun compteur de beat.
      return transport.beatPosition(beatsPerBar);
    },
    seek(sceneSec: number) {
      // Re-ancre l'autorité de temps à la scène via la commande Kronos (l'hôte ne touche ni clock ni
      // scheduler — internes ; `transport.seek` re-home + ré-ancre). Play-from-position / STEP resume.
      transport.seek(sceneSec);
    },
    resume(sceneSec: number) {
      // Reprise EN PLACE (no re-eval) : ré-ancre à la borne gelée puis relance. `transport.play()`
      // relève lui-même la borne d'émission posée par `pause()` (transport.ts:158-161) et re-ancre
      // depuis la position de reprise — l'hôte ne touche ni clock ni scheduler (internes). UN seul
      // scheduler vit à travers play→pause→play (pas de 2e émetteur empilé — l'ancienne course).
      // `driver.start()` est désormais porté par le listener réactif (transition paused→running :
      // PAS de reset, le graphe survit intact) — plus d'appel exprès ici.
      if (stopped) return;
      transport.seek(sceneSec);
      transport.play();
    },
    step(n: number) {
      // STEP sur le handle PERSISTANT (Model C, RC-B) : Kronos avance d'`n` unités d'arbre (fenêtre
      // bornée + snap-to-onset → la colonne atteinte SONNE = fix bug 2 ; pose à la prochaine borne),
      // puis on pompe. Plus de re-dérivation par geste, plus de compteur %n, plus de grain
      // grille-beat : le grain EST l'unité d'arbre de Kronos (CVA-7). L'hôte transmet juste step(n).
      transport.step(n);
      driver.start();
    },
    retune(bpm: number) {
      // Live tempo goes through Kairos's single write-door (`demande`), quantified
      // `immediat` (applied at the next driver tick, before scheduling). The Transport
      // drains it and re-anchors the clock — Kanopi never re-anchors the clock itself.
      opts.kairos.demande({ type: 'tempo', bpm, quand: 'immediat' });
    },
    setActorMuted(actor: string, muted: boolean) {
      // Actor arm/disarm goes through Kairos's write-door (`demande`), quantified
      // `immediat`. The Transport drains it and applies it on the scheduler's emission
      // filter (Kronos's persistent mute state survives a re-derivation — KAI-7).
      opts.kairos.demande({ type: 'mute', acteur: actor, muet: muted, quand: 'immediat' });
    }
  };
}
