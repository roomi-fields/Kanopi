// CHANTIER voix-code-transport (S2, [523]) — relais lifecycle transport → moteurs de voix de code.
//
// Une voix de code (Strudel/Hydra/…) est un sink SOUTENU (kronos CONTRAT_SINK_CONTROLE §6) :
// tirée à son onset, elle joue jusqu'à ordre contraire — sa vie est GOUVERNÉE par le transport.
// Ce module écoute `transport.onStateChange` (l'état RÉEL de Kronos : la pause y est QUANTIFIÉE
// au bord d'unité, transport.ts #finalizePause — le gel des voix arrive donc au même instant que
// celui des notes) et relaie aux adaptateurs de voix, sémantique option (b) pour TOUS les moteurs
// (décision `hub/decisions/2026-07-03-pause-voix-de-code-option-b.md`, forme arbitrée [524]) :
//
//   running → paused  : `adapter.pause()` GLOBAL — gel réel (silence immédiat + motif figé) ;
//   paused  → running : `adapter.resume(atSec)` GLOBAL — reprise EXACTEMENT où gelé,
//                       resynchronisée sur la position transport (lue de Kronos, jamais
//                       recalculée ici) ;
//   stopped → running : re-tir des voix dans leurs slots (replay depuis 0, Model C) ;
//   *       → stopped : `adapter.stop(src)` par slot — tais-toi immédiat.
//
// L'hôte ne décide RIEN du temps : il lit l'état + la position de Kronos et TRANSMET. Moteur pas
// encore migré (pause/resume absents) : dégradation TRANSITOIRE et BRUYANTE — stop à la pause,
// re-tir à la reprise, loggés — jamais silencieuse (pas de dégradé caché vers l'option (a)).
//
// `detach()` DOIT être appelé AVANT le stop() de TEARDOWN d'une re-éval same-file : la voix
// survit à la re-éval (règle existante du chemin backtick) ; seul le Stop TRANSPORT la coupe.

import type { Runtime } from '../core-mock';
import type { LogPush } from './adapter';

/** Une voix de code vivante sous ce transport : son moteur + son slot d'éval. */
export interface CodeVoiceSlot {
  runtime: Runtime;
  actorId: string;
  fileId: string;
  /** Re-tire la voix dans son slot (replay depuis 0 ; fallback transitoire de reprise).
   *  Doit respecter l'armement (une voix désarmée ne se re-tire pas). */
  refire?: () => void;
}

/** Vue MINIMALE du Transport Kronos utilisée par le relais (état + position, lecture seule). */
export interface TransportStateView {
  readonly state: 'stopped' | 'running' | 'paused';
  onStateChange(cb: (s: 'stopped' | 'running' | 'paused') => void): () => void;
  position(): number;
}

/** HORS périmètre du gel/reprise (décision 2026-07-03, addendum) : mercury (non vérifié).
 *  csound N'est PAS exclu — Romain a tranché « pause = stop propre, assumé et documenté »,
 *  réalisé par le `pause()` de SON adaptateur (côté runtime-codevoices), que ce relais
 *  appelle comme les autres. Le stop (tais-toi) reste câblé pour tous. */
const LIFECYCLE_EXCLUDED: ReadonlySet<string> = new Set(['mercury']);

/**
 * Branche le relais lifecycle sur un Transport Kronos. `slots` est LAZY (rappelée à chaque
 * transition) : le chemin orchestré enregistre ses voix APRÈS la construction du handle, et
 * l'armement/le fichier peuvent changer entre deux transitions. Retourne `detach`.
 */
export function attachCodeVoiceLifecycle(
  transport: TransportStateView,
  slots: () => readonly CodeVoiceSlot[],
  log: LogPush
): () => void {
  // L'état PRÉCÉDENT est tracké pour distinguer reprise-de-pause (resume resynchronisé)
  // et play-depuis-stop (re-tir depuis 0) — le Transport n'émet que l'état d'arrivée.
  let prev = transport.state;

  /** Les moteurs DISTINCTS des slots courants (pause/resume sont GLOBAUX par moteur, [524]). */
  const liveRuntimes = (): Runtime[] => {
    const seen = new Set<Runtime>();
    for (const s of slots()) seen.add(s.runtime);
    return [...seen];
  };

  // Le registre est atteint en import DYNAMIQUE, UNE fois par transition (même règle
  // anti-cycle que le sink backtick : registry → bpx-adapter → kronos-audio → ce module,
  // un import statique bouclerait). Un import PAR SLOT dans la même rafale synchrone est
  // aussi un piège vitest (imports mockés répétés : seuls les premiers .then résolvent).
  type Registry = typeof import('./registry');
  const withRegistry = (fn: (getAdapter: Registry['getAdapter']) => void): void => {
    void import('./registry').then(({ getAdapter }) => fn(getAdapter));
  };

  const detach = transport.onStateChange((next) => {
    const was = prev;
    prev = next;
    if (next === was) return;

    if (next === 'paused' && was === 'running') {
      // GEL réel, global par moteur — à l'instant réel de la pause quantifiée.
      withRegistry((getAdapter) => {
        for (const runtime of liveRuntimes()) {
          if (LIFECYCLE_EXCLUDED.has(runtime)) continue;
          const adapter = getAdapter(runtime);
          if (!adapter) continue;
          if (adapter.pause) {
            adapter.pause().catch((err) => {
              log({ runtime, level: 'error', msg: `pause (gel) a échoué : ${String(err)}` });
            });
          } else {
            // TRANSITOIRE (moteur pas encore migré) : on garantit le silence — stop par
            // slot — et on le DIT (jamais un dégradé silencieux vers l'option (a)).
            log({
              runtime,
              level: 'warn',
              msg: 'gel non supporté par ce moteur (pause absente du contrat implémenté) — voix coupée (transitoire)'
            });
            for (const s of slots()) {
              if (s.runtime !== runtime) continue;
              void adapter.stop({ actorId: s.actorId, fileId: s.fileId }, log).catch(() => {});
            }
          }
        }
      });
      return;
    }

    if (next === 'running' && was === 'paused') {
      // REPRISE resynchronisée : atSec = la position transport LUE MAINTENANT (Kronos,
      // l'autorité — couvre pause→seek→resume). Identité dans le cas normal.
      const atSec = transport.position();
      withRegistry((getAdapter) => {
        for (const runtime of liveRuntimes()) {
          if (LIFECYCLE_EXCLUDED.has(runtime)) continue;
          const adapter = getAdapter(runtime);
          if (!adapter) continue;
          if (adapter.resume) {
            adapter.resume(atSec).catch((err) => {
              log({ runtime, level: 'error', msg: `resume (reprise) a échoué : ${String(err)}` });
            });
          } else {
            log({
              runtime,
              level: 'warn',
              msg: 'reprise resynchronisée non supportée par ce moteur (resume absent) — re-tir du motif depuis son début (transitoire)'
            });
            for (const s of slots()) {
              if (s.runtime === runtime) s.refire?.();
            }
          }
        }
      });
      return;
    }

    if (next === 'running' && was === 'stopped') {
      // REPLAY depuis 0 (Model C) : re-tir des voix dans leurs slots. Le scheduler re-tire
      // aussi les tokens BT à leur onset — même code, même slot, l'éval remplace (parité
      // avec l'ancien `refireCodeVoices`).
      for (const s of slots()) s.refire?.();
      return;
    }

    if (next === 'stopped') {
      // STOP transport = tais-toi immédiat, TOUTES les voix (REV-F01) — y compris les
      // moteurs hors périmètre gel/reprise (le stop est le contrat existant, inchangé).
      withRegistry((getAdapter) => {
        for (const s of slots()) {
          void getAdapter(s.runtime)
            ?.stop({ actorId: s.actorId, fileId: s.fileId }, log)
            .catch(() => {});
        }
      });
      return;
    }
  });

  return detach;
}
