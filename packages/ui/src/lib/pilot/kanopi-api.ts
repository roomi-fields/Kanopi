// window.kanopi — FAÇADE DE PILOTAGE (« second front »), à côté de l'UI.
//
// RÈGLE DURE (contrat phase 1, validé archi 2026-07-01 [430]) : chaque commande DÉLÈGUE au MÊME
// point d'entrée que le bouton UI correspondant. AUCUNE logique métier ici, AUCUN état propre.
// Conséquences garanties par construction : aucun composant bypassé, et l'UI reflète tout effet
// (mêmes instances singletons réactives). Déléguer, JAMAIS réimplémenter.
//
// API PUBLIQUE : installée dans TOUS les builds (prod incluse — décision Romain 2026-07-02),
// PAS droppée du bundle. Surface VERSIONNÉE et ADDITIVE : ajouter une capacité = ajouter un
// délégué, sans casser l'existant (`version` = contrat de compat pour les consommateurs).
// Remplace aussi les bidouilles de test ad-hoc (wraps globaux d'AudioContext, imports
// dynamiques de stores — piège d'instance DUPLIQUÉE —, surfaces jetables `window.__osc/__an`).
//
// Phase 1 = commandes + inspection au niveau STORE (zéro extraction). Les actions logées dans un
// composant Svelte (`produce`, `writeTempoToScene`, résolution du bloc-sous-curseur) sont des
// candidates PHASE 2 (extraction pure en service partagé UI+API) — PAS ici. La sonde audio
// (AnalyserNode lecture-seule sur la sortie) arrive dans un pas suivant de phase 1.

import { clock } from '../../stores/clock.svelte';
import { playback } from '../../stores/playback.svelte';
import { transport } from '../../stores/transport.svelte';
import { openBlocks } from '../../stores/blocks.svelte';
import { workspace } from '../../stores/workspace.svelte';
import { productionFeed } from '../../stores/production-feed.svelte';
import { kronosCursor } from '../../stores/kronos-cursor.svelte';
import { setAudioForwardObserver, pilotAudioMeter } from '../runtimes/kronos-audio';
import { lastViewInput } from './view-input-observer';
import { core } from '../core';

const API_VERSION = 7;

// Tampon d'OBSERVATION (tooling de test, PAS de l'état d'app) : les derniers events audio
// FORWARDÉS au sink, capturés VERBATIM par l'observateur lecture-seule de kronos-audio. Remplace
// le tap `AudioRuntime.send` ad-hoc. Borné (anti-fuite mémoire).
const OBSERVED_MAX = 512;
const observedForwards: unknown[] = [];

/** Un binding de modulation, extrait tel quel du content forwardé (lecture seule). */
interface ObservedBinding {
  token: unknown;
  onset: unknown;
  occurrence: unknown;
  input: unknown;
  clock: string;
  busRef: unknown;
  windowStartScene: unknown;
  windowEndScene: unknown;
  ringId: unknown;
  seam: unknown;
}

/** Installe `window.kanopi` (API publique). Appelée inconditionnellement depuis main.ts. */
export function installKanopiApi(): void {
  // Observateur lecture-seule des events audio forwardés (kronos-audio setAudioForwardObserver) :
  // accumule VERBATIM dans le tampon borné. Ne mute rien ; le forward réel n'en dépend pas.
  setAudioForwardObserver((e) => {
    observedForwards.push(e);
    if (observedForwards.length > OBSERVED_MAX) observedForwards.shift();
  });

  const api = {
    version: API_VERSION,

    // ————— COMMANDES (effet ⇒ délèguent au point d'entrée de l'UI) —————

    /** Pose le TEXTE du fichier actif (délègue à `workspace.updateContents`) — l'éval lit ce
     *  contenu. Rend un banc de repro AUTO-CONTENU (injecter une scène exacte sans la
     *  bibliothèque). Retourne false s'il n'y a pas de fichier actif. */
    setSceneText(text: string): boolean {
      const id = workspace.activeTabId;
      if (!id) return false;
      workspace.updateContents(id, text);
      return true;
    },
    /** Éval de la session : délègue à `openBlocks.evalOne` pour chaque bloc ouvert — le même
     *  chemin que le Ctrl+Enter de l'éditeur (au niveau bloc). */
    async eval(): Promise<void> {
      for (const b of openBlocks.list) await openBlocks.evalOne(b);
    },
    play(): unknown {
      return playback.play();
    },
    pause(): unknown {
      return playback.pause();
    },
    stop(): unknown {
      return playback.stop();
    },
    /** Règle le tempo comme le champ BPM ; retourne la valeur APPLIQUÉE (clampée). */
    setTempo(bpm: number): number {
      return clock.setBpm(bpm);
    },
    toggleLoop(): void {
      transport.toggleLoop();
    },
    toggleReRandom(): void {
      transport.toggleReRandom();
    },
    /** Coupe tout (panic) — même chemin que Ctrl+. */
    async hush(): Promise<void> {
      await core.hushAll();
    },

    // ————— INSPECTION (lecture seule, AUCUN effet) —————

    inspect: {
      /** La structure projetée de la production courante (facette Kairos). */
      structure() {
        return productionFeed.structure();
      },
      /** La vue « flat » Kairos (`productionFeed.plat()` = `arbreCourant()` de Kairos) :
       *  durée + données d'affichage de l'arbre courant. Lecture seule.
       *  NOTE : ce N'EST PAS les bindings de modulation par-event (clock/busRef/fenêtres) —
       *  ceux-ci vivent sur les events que Kronos tire de Kairos ; une inspection dédiée
       *  `modulations()` demande un hook de lecture (décision archi, escaladée). */
      flat() {
        return productionFeed.plat();
      },
      /** Les bindings de modulation OBSERVÉS sur les events audio forwardés (clock, busRef,
       *  fenêtres), extraits VERBATIM du content transporté — remplace le tap `AudioRuntime.send`.
       *  Filtre optionnel par `input` (ex. 'cutoff'). Lecture seule. */
      modulations(input?: string): ObservedBinding[] {
        const out: ObservedBinding[] = [];
        for (const e of observedForwards) {
          const ev = e as {
            onset?: unknown;
            occurrence?: unknown;
            content?: { token?: unknown; modulations?: Array<Record<string, unknown>> };
          };
          for (const b of ev.content?.modulations ?? []) {
            if (input !== undefined && b.input !== input) continue;
            const clk = b.clock;
            const clock =
              typeof clk === 'string'
                ? clk
                : clk && typeof clk === 'object' && 'terminal' in clk
                  ? `note:${(clk as { terminal: unknown }).terminal}`
                  : 'obj';
            out.push({
              token: ev.content?.token,
              onset: ev.onset,
              occurrence: ev.occurrence,
              input: b.input,
              clock,
              busRef: b.busRef ?? null,
              windowStartScene: b.windowStartScene ?? null,
              windowEndScene: b.windowEndScene ?? null,
              ringId: b.ringId ?? null,
              seam: b.seam ?? null
            });
          }
        }
        return out;
      },
      /** Vide le tampon d'observation (avant une nouvelle capture). */
      clearObserved(): void {
        observedForwards.length = 0;
      },
      /** Mesure de la SORTIE audio réelle — délègue à l'affordance lecture-seule de runtime-audio
       *  (Kanopi ne tient AUCUN nœud audio, il lit des NOMBRES). Le compteur est recréé à chaque
       *  eval (nouveau AudioRuntime) → on l'active à la volée (idempotent). */
      audio: {
        enableMeter(fftSize = 2048): void {
          pilotAudioMeter()?.enableMeter({ fftSize });
        },
        disableMeter(): void {
          pilotAudioMeter()?.disableMeter();
        },
        /** { rms, spectralCentroid(Hz) } | null. Active le compteur au besoin. */
        measure(): { rms: number; spectralCentroid: number } | null {
          const m = pilotAudioMeter();
          if (!m) return null;
          m.enableMeter({ fftSize: 2048 });
          return m.getMeasurement();
        }
      },
      /** Compteur de génération (incrémenté à chaque re-charge / swap re-random). */
      generation(): number {
        return productionFeed.generation;
      },
      /** État transport lu de Kronos (autorité), pas un miroir hôte. */
      transportState(): string | null {
        return kronosCursor.active?.transport?.state ?? null;
      },
      /** Position de lecture (en beats) lue de Kronos — pour mapper une mesure temporelle aux
       *  scènes. `null` si pas de handle actif. Lecture seule. */
      position(): number | null {
        const t = kronosCursor.active?.transport as { position?: () => number } | undefined;
        return t?.position?.() ?? null;
      },
      /** État transport MIROIR réactif (`kronosCursor.state`) — à comparer à `transportState()`
       *  (l'autorité directe) pour diagnostiquer une désynchro du miroir vs le transport réel. */
      cursorState(): string {
        return kronosCursor.state;
      },
      /** Beat/bar RENDU du curseur (`kronosCursor.beat`), échantillonné par la boucle rAF du
       *  rendu. `null` si arrêté / pas de scène. Sonde le redémarrage du rendu au (re)play. */
      cursorBeat(): unknown {
        return kronosCursor.beat;
      },
      /** Le DERNIER `ProductionInput` poussé par l'hôte à chaque vue (mode/cursor/durationSec) —
       *  prouve ce que la couche RENDU reçoit (diag curseur re-play). Filtre optionnel par viewId. */
      lastViewInput(viewId?: string): unknown {
        return lastViewInput(viewId);
      },
      /** Tempo EFFECTIF entendu (miroir réactif de Kronos). */
      effectiveTempo(): number {
        return kronosCursor.tempo;
      },
      loop(): boolean {
        return transport.loop;
      },
      reRandom(): boolean {
        return transport.reRandom;
      }
    }
  };

  (window as unknown as { kanopi: typeof api }).kanopi = api;
}
