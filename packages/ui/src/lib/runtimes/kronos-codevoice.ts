// CHANTIER voix-code-transport (S2, [523]) — VOIE B (KR-13) : le transport Kronos des voix
// de code AUTONOMES (.strudel/.hydra/.tidal/.p5/.js — fichiers évalués seuls, sans scène BPx).
//
// AVANT : une voix autonome sonnait SANS handle Kronos → Stop/Pause inertes (REV-F01) et
// transport affiché « STOPPED » pendant que ça sonne (REV-F02). PLUS AUCUNE VOIX HORS
// TRANSPORT : ce module tient UN transport Kronos partagé (« la tête de lecture des voix
// autonomes »), créé à la première éval, sous lequel chaque voix s'enregistre comme slot.
//
// Le transport est un handle `createTransport` à timeline VIDE (aucune partition : le code a
// déjà été tiré par l'éval — sémantique live-coding) ; il n'est PAS une 2e autorité : c'est
// KRONOS, l'autorité du temps (contrat kronos-transport.md), instancié par l'hôte (branchement,
// périmètre Kanopi). Position/état/tempo se LISENT dessus ; le relais lifecycle
// (code-voice-lifecycle.ts) relaie ses transitions aux moteurs : gel réel à la pause
// (quantifiée), reprise resynchronisée, tais-toi immédiat au stop (option (b) 2026-07-03).
//
// Tempo affiché = tempo de session (D10, `clock.bpm`) : le seul tempo légitime côté hôte
// (saisie utilisateur) ; les moteurs le reçoivent déjà par le fan-out `setBpm` — le transport
// le porte pour que l'afficheur BPM dise ce que les moteurs entendent (REV-F02).

import { createTransport, type KronosTransport, type Transport } from '@kronos/core';
import { attachCodeVoiceLifecycle, type CodeVoiceSlot } from './code-voice-lifecycle';
import type { LogPush } from './adapter';
import type { Runtime } from '../core-mock';
import { DEFAULT_BEATS_PER_BAR } from './meter';
import type { KronosCursorBeat } from './kronos-audio';

/** Handle exposé au reste de l'hôte — même forme que la vue curseur d'un handle de scène
 *  (`KronosCursorView`) + le cycle Model C (stopInPlace/replay) que le cœur pilote. */
export interface CodeVoiceTransportHandle {
  transport: Transport;
  beatsPerBar: number;
  position(): number;
  beatPosition(): KronosCursorBeat;
  step(n: number): void;
  /** Stop transport (bouton Stop) : tête à 0, voix coupées PAR LE RELAIS (tais-toi immédiat,
   *  REV-F01). Le handle reste vivant : un Play suivant rejoue (replay). */
  stopInPlace(): void;
  /** Play-depuis-stop : les voix repartent dans leurs slots via le relais (stopped→running). */
  replay(): void;
  /** Warp du tempo affiché/battu (le fan-out `setBpm` porte déjà le tempo aux moteurs). */
  retune(bpm: number): void;
  /** Teardown complet (hush) : relais détaché puis machine arrêtée — le handle est mort. */
  dispose(): void;
}

interface Slot extends CodeVoiceSlot {
  refire: () => void;
}

// LE transport partagé des voix autonomes (0 ou 1 par session) + ses slots vivants.
let live: { kronos: KronosTransport; handle: CodeVoiceTransportHandle; detach: () => void } | null =
  null;
const slots = new Map<string, Slot>(); // clé = actorId (slot d'éval)

/** Le handle courant, ou null si aucune voix autonome n'est sous transport. */
export function codeVoiceTransport(): CodeVoiceTransportHandle | null {
  return live?.handle ?? null;
}

/**
 * Enregistre (ou ré-enregistre — re-éval same-file) une voix autonome sous le transport
 * partagé, en le créant au besoin. L'éval a DÉJÀ tiré le code (le moteur sonne) ; ici on
 * met la voix SOUS le transport : état lisible (REV-F02), lifecycle câblé (REV-F01).
 * Retourne le handle (l'appelant le pose sur le curseur — dernier éval gagne, comme .bps).
 */
export function registerCodeVoice(opts: {
  runtime: Runtime;
  /** Slot d'éval de la voix (actorId ?? fileId — même clé que l'éval). */
  slotId: string;
  fileId: string;
  /** Re-tire la voix dans son slot (replay / fallback transitoire de reprise). */
  refire: () => void;
  /** Tempo de session (D10) au moment de l'éval — porté par le transport pour l'afficheur. */
  bpm: number | null;
  log: LogPush;
}): CodeVoiceTransportHandle {
  slots.set(opts.slotId, {
    runtime: opts.runtime,
    actorId: opts.slotId,
    fileId: opts.fileId,
    refire: opts.refire
  });

  if (!live) {
    // Première voix autonome → créer LA tête de lecture. Timeline VIDE (le transport ne
    // rejoue aucune partition — les moteurs bouclent eux-mêmes) ; hors boucle, la position
    // est monotone (foldScene identité). Source de temps : horloge murale en secondes —
    // aucun ordonnancement audio ne se fait ici (timeline vide), seule la position compte.
    const kronos = createTransport({
      now: () => performance.now() / 1000,
      ...(opts.bpm != null && opts.bpm > 0 ? { derivedTempo: opts.bpm } : {}),
      durationSec: 0,
      loop: false
    });
    const transport = kronos.transport;
    const driver = kronos.driver;
    // Relais lifecycle AVANT le play initial ? Non — même règle que le chemin scène : le
    // premier stopped→running est l'éval elle-même (la voix vient d'être tirée), pas un
    // replay à re-tirer. On joue d'abord, on branche ensuite.
    transport.play();
    driver.start();
    const detach = attachCodeVoiceLifecycle(transport, () => [...slots.values()], opts.log);
    const handle: CodeVoiceTransportHandle = {
      transport,
      beatsPerBar: DEFAULT_BEATS_PER_BAR,
      position() {
        return transport.position();
      },
      beatPosition() {
        return transport.beatPosition(DEFAULT_BEATS_PER_BAR);
      },
      step(n: number) {
        // STEP sur une timeline vide : la tête avance d'une unité (rien à sonner) — le
        // geste reste honnête (position bouge, aucun son fabriqué).
        transport.step(n);
        driver.start();
      },
      stopInPlace() {
        // Tête à 0 + le relais (attaché) coupe toutes les voix sur la transition 'stopped'.
        transport.stop();
        driver.stop();
      },
      replay() {
        // stopped→running : le relais re-tire les voix dans leurs slots.
        transport.play();
        driver.start();
      },
      retune(bpm: number) {
        transport.setTempo(bpm);
      },
      dispose() {
        // Teardown (hush) : détacher d'ABORD — les voix sont déjà coupées par le hush
        // global (`__hush__`), le relais n'a pas à re-stopper sur la transition.
        detach();
        kronos.dispose();
        slots.clear();
        live = null;
      }
    };
    live = { kronos, handle, detach };
  } else {
    // Transport déjà vivant : re-éval / nouvelle voix. S'il était en pause ou stoppé,
    // l'éval RELANCE la lecture (sémantique live-coding : évaluer = jouer) — la reprise
    // des AUTRES voix passe par le relais (paused→running = resync ; stopped→running =
    // re-tir), la voix évaluée vient d'être tirée par l'éval elle-même.
    live.kronos.transport.play();
    live.kronos.driver.start();
  }
  return live.handle;
}

/** Stop transport des voix autonomes (bouton Stop) — no-op sans transport vivant. */
export function stopCodeVoiceTransportInPlace(): void {
  live?.handle.stopInPlace();
}

/** Play-depuis-stop des voix autonomes (bouton Play) — no-op sans transport vivant. */
export function replayCodeVoiceTransport(): void {
  live?.handle.replay();
}

/** Teardown complet (hush) — les voix sont coupées par le `__hush__` global ; ici on
 *  démonte la tête de lecture pour que l'afficheur retombe à « stopped » sans mentir. */
export function disposeCodeVoiceTransport(): void {
  live?.handle.dispose();
}

/** Warp le tempo affiché quand l'utilisateur change le BPM de session (D10) — les moteurs
 *  reçoivent le leur par le fan-out `setBpm` existant ; l'afficheur doit suivre. */
export function retuneCodeVoiceTransport(bpm: number): void {
  live?.handle.retune(bpm);
}
