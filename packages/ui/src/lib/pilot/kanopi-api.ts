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
// UN GESTE À DEUX EFFETS NE SE LAISSE PAS À MOITIÉ DANS UN COMPOSANT. Deux commandes le
// prouvaient : TEMPO warpait sans reporter la valeur dans la directive de la scène ([927]), et
// PRODUCE sautait le prélude de bascule qui coupe la scène sortante ([929]). Dans les deux cas
// un banc mené par l'API mesurait un comportement que l'utilisateur ne produit PAS. Les deux
// gestes sont désormais EXTRAITS (`lib/commands/tempo`, `lib/commands/produce`) et l'UI comme la
// façade y délèguent — extraction, jamais duplication.
// Une commande qui ne délègue pas le geste COMPLET viole la règle dure ci-dessus, même quand la
// moitié manquante vit « ailleurs par construction » : un commentaire qui EXPLIQUE un écart le
// fait survivre, il ne le légitime pas. Reste en composant (candidat même traitement) : la
// résolution du bloc-sous-curseur du Ctrl+Enter.

import { setTempo as setTempoCommand } from '../commands/tempo';
import { produceActiveScene } from '../commands/produce';
import { playback } from '../../stores/playback.svelte';
import { transport } from '../../stores/transport.svelte';
import { openBlocks } from '../../stores/blocks.svelte';
import { workspace } from '../../stores/workspace.svelte';
import { isNonProgramFile } from '../workspace/types';
import { declaredInputsForScene } from '../runtimes/bpx-adapter';
import { productionFeed } from '../../stores/production-feed.svelte';
import { kronosCursor } from '../../stores/kronos-cursor.svelte';
import { pilotAudioMeter, pilotCodeVoicesRuntime } from '../runtimes/kronos-audio';
import { lastViewInput } from './view-input-observer';
import { startFrameMonitor, readFrameStats } from './frame-stats';
import { startInputObserver, readInputs } from './input-observer';
import { profileMainThread } from './stack-profiler';
import { core } from '../core';

// v15 — le lot des ENTRÉES : `inspect.declaredInputs()` (les rôles que la scène déclare),
// `inspect.inputs()` (les événements d'entrée vus sur le bus). Surface ADDITIVE : rien de retiré,
// les consommateurs de v14 continuent de marcher.
// v16 — [334] `inspect.audio.enableEventLog/eventLog/disableEventLog` : trois PASSE-PLATS vers le
// journal des envois reçus que runtime-audio a ouvert à sa propre frontière (46cb4e3). Additif lui
// aussi, et volontairement mince : l'hôte allume, lit, éteint — il n'interpose rien.
// v17 — [1015] `setPlayFocus` est RETIRÉ. Le focus de jeu n'est plus commandé : il est LU sur le
// verrou des majuscules, à chaque geste. Une commande qui le poserait serait une seconde autorité
// sur le même état — exactement la voie parallèle que le passage au modèle Bitwig supprime. Un banc
// arme le focus comme un utilisateur : en envoyant un événement qui PORTE le drapeau du verrou
// (`new KeyboardEvent('keydown', { modifierCapsLock: true })`), mesuré conforme dans le navigateur.
const API_VERSION = 17;

// (L'observateur des events audio forwardés + l'inspection `modulations()` sont RETIRÉS avec le
//  wrapper audio hôte — frontière Phase 2 audio : l'hôte ne forwarde plus d'events audio shapés,
//  runtime-audio reçoit l'événement VERBATIM. Une inspection des modulations se re-crée via une
//  affordance lecture-seule de runtime-audio, coordonnée avec le peer, si le besoin revient.)

/** Installe `window.kanopi` (API publique). Appelée inconditionnellement depuis main.ts. */
export function installKanopiApi(): void {
  // Sonde de fluidité (inspect.frameStats) — démarrée ici pour capter AVANT toute repro.
  startFrameMonitor();
  // Sonde d'entrée (inspect.inputs) — branchée sur le bus AVANT tout geste, pour qu'aucune
  // première frappe ne passe avant l'écoute.
  startInputObserver((fn) => core.events.onAny(fn));

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
    /** PRODUCE : (re)génère la scène active, transport au repos — MÊME point d'entrée que le
     *  bouton PROD (`commands/produce`), BASCULE COMPRISE. C'est tout l'intérêt : produire un
     *  autre onglet que la scène vivante coupe d'abord la sortante, re-produire la vivante
     *  l'arrête en place. Un banc qui appelait `openBlocks.produceLoadedProgram` directement
     *  sautait ce prélude et mesurait un enchaînement que l'utilisateur ne produit jamais
     *  (deux scènes superposées, ou une re-dérivation par-dessus un transport vivant) — même
     *  classe de piège que `setTempo` avant [927]. */
    async produce(): Promise<void> {
      await produceActiveScene();
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
    /** SUPPRIME un fichier de l'espace de travail par son CHEMIN — même point d'entrée que la
     *  corbeille de l'arbre (`workspace.removeFile`), donc mêmes effets : l'onglet se ferme,
     *  l'extraction de blocs est relâchée, et rien d'autre n'est touché (ni disque, ni
     *  bibliothèque, ni nuage — un document du nuage projeté ici reste dans l'espace perso).
     *  Par CHEMIN et non par identifiant : un banc connaît le chemin qu'il a écrit, pas
     *  l'identifiant minté à l'ouverture. Rend `false` si aucun fichier ne porte ce chemin — une
     *  suppression qui ne trouve rien le DIT, elle ne se tait pas.
     *  LA CONFIRMATION N'EST PAS ICI : elle vit dans l'interface, où vit le geste humain. Une
     *  façade de pilotage qui redemanderait confirmation à un banc serait un dialogue avec
     *  personne — mais c'est bien le MÊME effet qui part, pas un chemin parallèle. */
    removeFile(path: string): boolean {
      const cible = workspace.files.find((f) => f.path === path);
      return cible ? workspace.removeFile(cible.id) : false;
    },

    // ————— INSPECTION (lecture seule, AUCUN effet) —————

    inspect: {
      /** La structure projetée de la production courante (facette Kairos). */
      structure() {
        return productionFeed.structure();
      },
      /** LES RÔLES D'ENTRÉE que la scène active DÉCLARE (`@var <rôle> in.<canal>`), lus sur
       *  l'AST amont — la même lecture que le panneau des entrées et que le badge de focus, jamais
       *  une seconde analyse du texte. Liste vide si la scène n'en déclare aucun ou ne compile pas. */
      declaredInputs() {
        const id = workspace.activeTabId;
        return declaredInputsForScene(id ? (workspace.fileById(id)?.contents ?? '') : '');
      },
      /** LES ÉVÉNEMENTS D'ENTRÉE vus sur le bus, VERBATIM (device + signal opaque), du plus ancien
       *  au plus récent. Prouve qu'une pédale ou une touche arrive vraiment — sans passer par la
       *  lucarne de développement, et sans interpréter la charge. */
      inputs() {
        return readInputs();
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
        /** [334] LE JOURNAL DES ENVOIS REÇUS — jumeau du compteur, livré par runtime-audio à SA
         *  frontière (46cb4e3). Trois passe-plats, rien d'autre : l'hôte ALLUME, LIT, ÉTEINT.
         *
         *  POURQUOI IL EST CHEZ EUX ET PAS ICI, et c'est le point : Kronos demandait de capturer ce
         *  que l'adaptateur reçoit à la reprise d'un point d'attente. Le faire côté hôte voulait dire
         *  envelopper son `send` — nommément une violation du portillon (« §Garde 1 — Adaptateur/mise
         *  en forme écrits côté hôte (wrapper `send`) », attendu 0). L'instrument a donc été ouvert
         *  chez le propriétaire de la frontière, sur le patron exact de son compteur. Ici : zéro
         *  interposition sur le chemin du son.
         *
         *  Chaque entrée porte l'instant et la durée REÇUS, plus `lateBy` — de combien l'instant
         *  demandé est DÉJÀ dans le passé de l'horloge audio quand l'envoi arrive. */
        enableEventLog(cap = 512): void {
          pilotAudioMeter()?.enableEventLog?.({ cap });
        },
        disableEventLog(): void {
          pilotAudioMeter()?.disableEventLog?.();
        },
        /** Les envois tracés, du plus ancien au plus récent. `null` si le journal est éteint. */
        eventLog(): ReadonlyArray<Record<string, unknown>> | null {
          return pilotAudioMeter()?.getEventLog?.() ?? null;
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
