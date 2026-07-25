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
// Phase 1 = commandes + inspection au niveau STORE. Les actions restées logées dans un composant
// Svelte (`produce`, résolution du bloc-sous-curseur) sont des candidates PHASE 2 (extraction
// pure en service partagé UI+API) — PAS ici. Le geste TEMPO, lui, EST extrait
// (`lib/commands/tempo`) : le laisser à moitié dans le composant faisait diverger l'API du champ
// BPM, et un banc mené par l'API mesurait alors un comportement que l'utilisateur ne produit pas
// (mesuré et corrigé 2026-07-25, [927]). Une commande qui ne délègue pas le geste COMPLET viole
// la règle dure ci-dessus, même quand la moitié manquante vit « ailleurs par construction ».

import { setTempo as setTempoCommand } from '../commands/tempo';
import { playback } from '../../stores/playback.svelte';
import { transport } from '../../stores/transport.svelte';
import { openBlocks } from '../../stores/blocks.svelte';
import { workspace } from '../../stores/workspace.svelte';
import { isNonProgramFile } from '../workspace/types';
import { productionFeed } from '../../stores/production-feed.svelte';
import { kronosCursor } from '../../stores/kronos-cursor.svelte';
import { pilotAudioMeter, pilotCodeVoicesRuntime } from '../runtimes/kronos-audio';
import { lastViewInput } from './view-input-observer';
import { startFrameMonitor, readFrameStats } from './frame-stats';
import { profileMainThread } from './stack-profiler';
import { core } from '../core';

const API_VERSION = 11;

// (L'observateur des events audio forwardés + l'inspection `modulations()` sont RETIRÉS avec le
//  wrapper audio hôte — frontière Phase 2 audio : l'hôte ne forwarde plus d'events audio shapés,
//  runtime-audio reçoit l'événement VERBATIM. Une inspection des modulations se re-crée via une
//  affordance lecture-seule de runtime-audio, coordonnée avec le peer, si le besoin revient.)

/** Installe `window.kanopi` (API publique). Appelée inconditionnellement depuis main.ts. */
export function installKanopiApi(): void {
  // Sonde de fluidité (inspect.frameStats) — démarrée ici pour capter AVANT toute repro.
  startFrameMonitor();

  const api = {
    version: API_VERSION,

    // ————— COMMANDES (effet ⇒ délèguent au point d'entrée de l'UI) —————

    /** Pose le TEXTE du fichier actif (délègue à `workspace.updateContents`) — l'éval lit ce
     *  contenu. Rend un banc de repro AUTO-CONTENU (injecter une scène exacte sans la
     *  bibliothèque). Retourne false s'il n'y a pas de fichier actif. */
    setSceneText(text: string): boolean {
      const id = workspace.activeTabId;
      if (!id) return false;
      // NE JAMAIS écraser un fichier de DONNÉES (une lib `libraries/…` ou une entrée de
      // catalogue `resources/…`) avec du texte de scène — ça corrompt la lib (bug de banc
      // 2026-07-13 : setSceneText écrivait dans l'onglet FOCUS, quel qu'il soit). L'appelant
      // doit d'abord donner le focus à un onglet de SCÈNE ; sinon on refuse.
      const f = workspace.fileById(id);
      if (f && isNonProgramFile(f.path)) return false;
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
    /** Règle le tempo comme le champ BPM : MÊME point d'entrée (`commands/tempo`), donc le même
     *  geste COMPLET — warp des runtimes ET report de la valeur dans la directive `@tempo`/`@mm`
     *  de la scène active. Retourne la valeur APPLIQUÉE (bornée).
     *
     *  Avant [927] cette commande n'appelait que `clock.setBpm` : elle warpait sans réécrire le
     *  texte, un re-eval faisait retomber le tempo, et un banc mené par l'API mesurait un
     *  comportement que le champ BPM ne produit pas. C'est le raccourci que la règle dure
     *  ci-dessus interdit — l'API ne doit rien tenir de son côté. */
    setTempo(bpm: number): number {
      return setTempoCommand(bpm);
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
        },
        /** Canal (B) chantier transport-SM : le sink audio a-t-il reçu la vue horloge de
         *  KRONOS (`bindClock` appelé à l'enregistrement du sink) ? Preuve du câblage, lecture
         *  seule — lit l'instance RÉELLE du module (un import URL externe duplique le singleton). */
        clockBound(): boolean {
          return (pilotAudioMeter() as { clock?: unknown } | null)?.clock != null;
        }
      },
      /** v9 — sonde de FLUIDITÉ du fil principal, pour mesurer les gels DANS la session
       *  réelle (frappes / coller / molette pendant lecture) : photographie des ~15
       *  dernières secondes — percentiles de frames, gels rAF > 100 ms et long tasks
       *  > 50 ms, horodatés (agoMs). Lecture seule ; le moniteur tourne en continu. */
      frameStats() {
        return readFrameStats();
      },
      /** v10 — sonde de PILE CHAUDE : profile le fil principal pendant `ms` (défaut 8 s,
       *  JS Self-Profiling API) et NOMME les fonctions qui le tiennent (self-time trié).
       *  Protocole : lancer, puis reproduire le geste (scroll/saisie) PENDANT la fenêtre.
       *  Exige l'en-tête `Document-Policy: js-profiling` (posé par vite.config — un serveur
       *  démarré avant ce changement doit être redémarré ; la sonde l'explique si absent). */
      profileScroll(ms = 8000) {
        return profileMainThread(ms);
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
      },
      /** v11 — horloge PROPRE d'une voix de code (introspection lecture seule, runtime-codevoices
       *  d8c3162). Délègue à `pilotCodeVoicesRuntime().peekClock(runtime)` : Hydra rend `synth.time`
       *  (secondes de scène, posée par le seek fin) ; les moteurs sans horloge posable (Strudel…) ⇒
       *  `undefined`. Sert le banc seek-fin : PROUVER `hydraClock('hydra') == sceneTime` après un
       *  drag. `null` si pas de voix de code vivante. Kronos reste seul gardien du temps. */
      hydraClock(runtime = 'hydra'): number | null {
        return pilotCodeVoicesRuntime()?.peekClock?.(runtime) ?? null;
      }
    }
  };

  (window as unknown as { kanopi: typeof api }).kanopi = api;
}
