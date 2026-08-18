import type { Runtime } from '../core-mock';
import type { EventBus } from '../events/types';

export type EvalSource = {
  actorId?: string;
  fileId: string;
  /**
   * Offset of the evaluated code inside the source document. 0 when the
   * whole file is evaluated (actor toggle). Non-zero when Ctrl+Enter
   * evaluates a partial block — without this, visualizer `locations`
   * would point to the start of the doc instead of the eval'd block.
   */
  docOffset?: number;
  /**
   * Initial flag values applied to the BPx engine before `derive()` (A5 named
   * scenes). For a `.bps` whose rules are guarded by a named flag (`flag section(calm:1,
   * full:2)` → `[section==calm] …`), selecting a scene = re-evaluating with
   * `flags: { section: <int> }`, which makes a different guarded rule derive.
   * Ignored by adapters that don't carry flags (everything but bp3/bpscript).
   */
  flags?: Record<string, number>;
  /**
   * STEP playback (A5): play only one section of the derivation once, instead
   * of looping the whole thing. `index` is the head-rule RHS sequence element to
   * play, `count` the total number of sections; the adapter slices the derived
   * timeline into `count` equal windows and plays window `index` non-looping.
   * Ignored by adapters that have no timeline (everything but bp3/bpscript).
   */
  section?: { index: number; count: number };
  /**
   * PRODUCE-only: derive the scene and publish its production (structure view +
   * tempo + actor list) WITHOUT scheduling or sounding it. Opening a scene
   * produces it (the structure shows, the transport stays put); Play then runs a
   * full evaluate that creates the dispatcher and sounds it. Ignored by adapters
   * with no derivation (everything but bp3/bpscript).
   */
  produceOnly?: boolean;
};

export type LogPush = (e: {
  runtime: Runtime;
  level: 'info' | 'warn' | 'error';
  msg: string;
}) => void;

/**
 * What a voice PRODUCES (≠ DeviceType, what a device ACCEPTS — see
 * DEVICES_SPEC.md). The dispatcher checks voice.outputType against the target
 * device's accepted set before routing; an incompatible voice is refused at
 * eval, never silently dropped (ADAPTER_SPEC §1bis (b)).
 */
export type VoiceOutputType =
  | 'notes' // pitched events (→ midi / audio)
  | 'signal' // raw audio signal, no discrete pitch (→ audio)
  | 'visual' // pixels / canvas — producteur embarque, routé par AUCUN transport (2026-07-14)
  | 'control' // CC / control messages (→ osc)
  | 'light' // intensities / colours (→ dmx)
  | 'text'; // symbols to read (→ text / console)

export interface RuntimeAdapter {
  readonly id: Runtime;
  /**
   * Type of output this voice produces — drives voice↔device compatibility
   * checking (ADAPTER_SPEC §1bis (b)). OBLIGATOIRE.
   */
  readonly outputType: VoiceOutputType;
  /**
   * File extensions owned by this adapter, with the leading dot (`.hydra`,
   * `.p5`). The FilesView `+ New file` dialog, `runtimeFromExt`, and any
   * future dispatcher that needs to map an extension to a runtime derive
   * from these lists. Adding a new language is therefore entirely
   * self-contained in its adapter — no separate mapping table to keep
   * in sync.
   */
  readonly extensions: readonly string[];
  /** Resolves when the code evaluated cleanly; throws on any eval error. */
  evaluate(code: string, src: EvalSource, log: LogPush): Promise<void>;
  /**
   * Stop a specific source (actor or block). For runtimes that don't support
   * per-source stop (Strudel global hush), implementations may stop everything.
   */
  stop(src: EvalSource, log: LogPush): Promise<void>;
  /** Propagate global tempo change. Optional. */
  setBpm?(bpm: number, log: LogPush): void;
  /**
   * PAUSE transport — GEL RÉEL, GLOBAL (toutes les voix de ce moteur) : silence
   * immédiat + le motif se fige à sa position ; jamais « muet pendant que l'horloge
   * moteur continue ». Portée globale par contrat (CONTRAT_SINK_CONTROLE §6 : la
   * pause transport gèle TOUT ; l'acteur isolé reste `stop`/arm-désarm). Décision
   * option (b) pour tous les moteurs : `hub/decisions/2026-07-03-pause-voix-de-code-
   * option-b.md`, forme convergée arbitrée [524]. Optionnel le temps de la migration
   * des moteurs — absent, l'hôte dégrade BRUYAMMENT (stop loggé), jamais en silence.
   */
  pause?(): Promise<void>;
  /**
   * REPRISE après pause — GLOBALE : le motif repart EXACTEMENT où il s'était gelé,
   * resynchronisé sur `atSec` = la position transport (SECONDES de scène, lue de
   * Kronos à l'instant de la reprise ; cas normal `atSec` = position gelée →
   * identité, mais pause→seek→resume doit recaler). Le tempo continue d'arriver par
   * `setBpm`. Un moteur qui ne sait pas se repositionner à `atSec` ≠ position gelée :
   * best-effort DOCUMENTÉ ou escalade — pas de silence ([524]).
   */
  resume?(atSec: number): Promise<void>;
  /**
   * Notifications de battement du clock central. `count` est l'indice
   * monotonic (absBeat/absBar) depuis start. Permet à un adapter dont
   * le langage s'appuie sur une horloge visuelle (ex: Hydra `.rotate(beat)`)
   * de rester calé sur le transport Kanopi. Optionnels.
   */
  onBeat?(count: number, log: LogPush): void;
  onBar?(count: number, log: LogPush): void;
  /**
   * PRÉCHAUFFAGE au CHARGEMENT de scène (produce/load), dans la chaîne du geste utilisateur
   * (clic library / Ctrl+Enter). Idempotent : pré-initialise le moteur + réveille (resume) le
   * contexte audio EN AMONT du 1er play → démarrage propre, sans glitch. Optionnel : un adaptateur
   * qui ne l'implémente pas est un no-op (le réveil se fera au play). Amendement ratifié archi [589].
   */
  warmup?(): Promise<void>;
  /**
   * Optional per-adapter event bus. If present, the core relays `onAny` into
   * `core.events` at init so visualizers consume a single unified stream.
   */
  readonly events?: EventBus;
  dispose(): Promise<void>;
}
