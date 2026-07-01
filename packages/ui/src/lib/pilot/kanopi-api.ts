// window.kanopi — FAÇADE DE PILOTAGE (« second front »), à côté de l'UI.
//
// RÈGLE DURE (contrat phase 1, validé archi 2026-07-01 [430]) : chaque commande DÉLÈGUE au MÊME
// point d'entrée que le bouton UI correspondant. AUCUNE logique métier ici, AUCUN état propre.
// Conséquences garanties par construction : aucun composant bypassé, et l'UI reflète tout effet
// (mêmes instances singletons réactives). Déléguer, JAMAIS réimplémenter.
//
// DEV-only (installée sous `import.meta.env.DEV`, droppée du bundle prod). Surface VERSIONNÉE et
// ADDITIVE : ajouter une capacité = ajouter un délégué, sans casser l'existant. Remplace les
// bidouilles de test ad-hoc (wraps globaux d'AudioContext, imports dynamiques de stores — piège
// d'instance DUPLIQUÉE —, surfaces jetables `window.__osc/__an/__bind`).
//
// Phase 1 = commandes + inspection au niveau STORE (zéro extraction). Les actions logées dans un
// composant Svelte (`produce`, `writeTempoToScene`, résolution du bloc-sous-curseur) sont des
// candidates PHASE 2 (extraction pure en service partagé UI+API) — PAS ici. La sonde audio
// (AnalyserNode lecture-seule sur la sortie) arrive dans un pas suivant de phase 1.

import { clock } from '../../stores/clock.svelte';
import { playback } from '../../stores/playback.svelte';
import { transport } from '../../stores/transport.svelte';
import { openBlocks } from '../../stores/blocks.svelte';
import { productionFeed } from '../../stores/production-feed.svelte';
import { kronosCursor } from '../../stores/kronos-cursor.svelte';
import { setAudioForwardObserver } from '../runtimes/kronos-audio';
import { core } from '../core';

const API_VERSION = 2;

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
}

/** Installe `window.kanopi`. Appelée UNIQUEMENT en DEV depuis main.ts. */
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
      /** La VUE flat Kairos (`productionFeed.plat()` = `arbreCourant()` cast en `FlatView`) :
       *  durée + données d'affichage lues par les vues Texte/Timeline. Lecture seule.
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
              windowEndScene: b.windowEndScene ?? null
            });
          }
        }
        return out;
      },
      /** Vide le tampon d'observation (avant une nouvelle capture). */
      clearObserved(): void {
        observedForwards.length = 0;
      },
      /** Compteur de génération (incrémenté à chaque re-charge / swap re-random). */
      generation(): number {
        return productionFeed.generation;
      },
      /** État transport lu de Kronos (autorité), pas un miroir hôte. */
      transportState(): string | null {
        return kronosCursor.active?.transport?.state ?? null;
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
