// CHANTIER voix-code-transport (S2, [523]) — VOIE B (KR-13) : le transport Kronos des voix
// de code AUTONOMES (.strudel/.hydra/.tidal/.p5/.js — fichiers évalués seuls, sans scène BPx).
//
// PLUS AUCUNE VOIX HORS TRANSPORT : ce module tient UN transport Kronos partagé (« la tête de
// lecture des voix autonomes »), créé à la première éval, sur lequel l'adaptateur uniforme de
// runtime-codevoices est ENREGISTRÉ. Position/état/tempo se LISENT dessus ; le cycle de vie
// (gel réel à la pause quantifiée, reprise resynchronisée, tais-toi au stop) est propagé par le
// BUS de Kronos — runtime-codevoices s'y abonne à son `bindClock` (frontière Phase 2 : le relais
// lifecycle a DESCENDU dans le paquet, plus de relais hôte).
//
// Le transport est un handle `createTransport` à timeline VIDE (le code a déjà été tiré par
// l'éval — sémantique live-coding) ; ce n'est PAS une 2e autorité : c'est KRONOS (contrat
// kronos-transport.md), instancié par l'hôte (branchement). Tempo affiché = tempo de session (D10).

import { createTransport, type KronosTransport, type Transport } from '@kronos/core';
import type { CodeVoicesRuntime } from 'runtime-codevoices';
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
  /** Stop transport (bouton Stop) : tête à 0, voix coupées PAR LE BUS (tais-toi immédiat). */
  stopInPlace(): void;
  /** Play-depuis-stop : les voix repartent via le bus (stopped→running). */
  replay(): void;
  /** Warp du tempo affiché/battu (le fan-out `setBpm` porte déjà le tempo aux moteurs). */
  retune(bpm: number): void;
  /** Teardown complet (hush) : le runtime est disposé puis la machine arrêtée. */
  dispose(): void;
}

// LE transport partagé des voix autonomes (0 ou 1 par session) + le runtime qui y est enregistré.
let live: {
  kronos: KronosTransport;
  handle: CodeVoiceTransportHandle;
  runtime: CodeVoicesRuntime;
} | null = null;

/** Le handle courant, ou null si aucune voix autonome n'est sous transport. */
export function codeVoiceTransport(): CodeVoiceTransportHandle | null {
  return live?.handle ?? null;
}

/**
 * Met une voix autonome (déjà tirée par `runtime.evaluate` côté cœur) SOUS le transport partagé,
 * en le créant au besoin et en y ENREGISTRANT l'adaptateur uniforme de runtime-codevoices (Kronos
 * l'abonne au bus de cycle de vie à `bindClock`). Retourne le handle (l'appelant le pose sur le
 * curseur — dernier éval gagne, comme .bps).
 */
export function registerCodeVoice(opts: {
  /** L'adaptateur uniforme de runtime-codevoices (celui à travers lequel la voix a été évaluée). */
  runtime: CodeVoicesRuntime;
  /** Tempo de session (D10) au moment de l'éval — porté par le transport pour l'afficheur. */
  bpm: number | null;
}): CodeVoiceTransportHandle {
  if (!live) {
    // Première voix autonome → créer LA tête de lecture. Timeline VIDE (le transport ne rejoue
    // aucune partition — les moteurs bouclent eux-mêmes) ; hors boucle, la position est monotone.
    // Source de temps : horloge monotone en secondes (aucun ordonnancement audio ici).
    const kronos = createTransport({
      now: () => performance.now() / 1000,
      ...(opts.bpm != null && opts.bpm > 0 ? { derivedTempo: opts.bpm } : {}),
      durationSec: 0,
      loop: false
    });
    const transport = kronos.transport;
    const driver = kronos.driver;
    // ENREGISTREMENT du runtime : Kronos appelle `bindClock` → le runtime s'abonne au bus de
    // cycle de vie (gel/reprise/tais-toi). L'hôte ne relaie plus rien.
    kronos.addAdapter('code', opts.runtime as unknown as Parameters<typeof kronos.addAdapter>[1]);
    transport.play();
    driver.start();
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
        transport.step(n);
        driver.start();
      },
      stopInPlace() {
        // Tête à 0 + le bus coupe toutes les voix sur la transition 'stopped'.
        transport.stop();
        driver.stop();
      },
      replay() {
        // stopped→running : le bus re-tire les voix.
        transport.play();
        driver.start();
      },
      retune(bpm: number) {
        transport.setTempo(bpm);
      },
      dispose() {
        void live?.runtime.dispose();
        kronos.dispose();
        live = null;
      }
    };
    live = { kronos, handle, runtime: opts.runtime };
  } else {
    // Transport déjà vivant : re-éval / nouvelle voix. Évaluer = jouer (live-coding) — la reprise
    // des AUTRES voix passe par le bus ; la voix évaluée vient d'être tirée par `runtime.evaluate`.
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

/** Teardown complet (hush) — démonte la tête de lecture (le runtime se dispose) pour que
 *  l'afficheur retombe à « stopped » sans mentir. */
export function disposeCodeVoiceTransport(): void {
  live?.handle.dispose();
}

/** Warp le tempo affiché quand l'utilisateur change le BPM de session (D10). */
export function retuneCodeVoiceTransport(bpm: number): void {
  live?.handle.retune(bpm);
}
