import { MockConsole, MockActors } from '../core-mock/mock-runtime';
import type { Actor, CoreApi, LogEntry, Runtime } from '../core-mock/types';
import { getAdapter, listRuntimes } from '../runtimes/registry';
import {
  setTempoSink,
  setActorsSink,
  setOrchestratedActorMuted,
  isOrchestratedActor,
  pousserEvenementEntree,
  type PublishedActor
} from '../runtimes/bpx-adapter';
import { inputBindings } from '../../stores/input-bindings.svelte';
import { kronosCursor } from '../../stores/kronos-cursor.svelte';
// KAN-UX3 — la couche mute MIXER (intention performeur, persistante) : consultée en
// garde des chemins d'armement pour qu'un arm/replay/publish ne ré-arme jamais un
// acteur que le mixer tient muet (module pur, importable sans cycle).
import { EMPREINTE } from '@kairos/core';
import { mixerMutedFor } from '../mixer/mixer-intent';
import { applyMixerGains } from '../mixer/mixer-gain';
// VOIE B (chantier voix-code-transport [523]) : le transport Kronos partagé des voix de code
// AUTONOMES — plus aucune voix hors transport. L'éval enregistre la voix (registerCodeVoice),
// le cœur relaie Stop/Play/hush au handle (le relais lifecycle coupe/gèle/reprend les moteurs).
import {
  registerCodeVoice,
  stopCodeVoiceTransportInPlace,
  replayCodeVoiceTransport,
  disposeCodeVoiceTransport,
  codeVoiceTransport
} from '../runtimes/kronos-codevoice';
import { createCodeVoicesRuntime, type CodeVoicesRuntime } from 'runtime-codevoices';
import type { LogPush } from '../runtimes/adapter';
import { installConsoleBridge } from '../runtimes/console-bridge';
import { ensureCsoundSoundfiles } from '../runtimes/csound-soundfiles';
import { warmUp } from '../runtimes/code-voice-warmup';
// Les périphériques d'ENTRÉE appartiennent à `runtime-in` (décision Romain 2026-07-27, contrat
// `hub/contrats/hote-runtime-in.md`). L'hôte n'écrit aucun pilote : `midi/midi-input.ts` est
// SUPPRIMÉ dans le même mouvement que cette arrivée — pas de voie parallèle, pas de « le temps de
// migrer ». `periphériques()` rend les instances GELÉES du paquet (voir `enableMidiInput`).
import { periphériques, type PortInfo } from 'runtime-in';
import { createEventBus } from '../events/bus';
import { initAdapters } from '../runtimes/registry';
import type { EventBus } from '../events/types';
import { production } from '../../stores/production.svelte';

// LE runtime des voix de code AUTONOMES (partagé, lazy). Il ÉVALUE les voix autonomes (capture
// §3.1 — résout l'interprète, tire le moteur) et, une fois enregistré sur le transport autonome,
// s'abonne au bus de cycle de vie. Backticks vides (une voix autonome n'a pas de scène .bps ;
// l'interprète voyage en argument d'`evaluate`). fileId par voix = via `src`.
let _autonomousCV: CodeVoicesRuntime | null = null;
function autonomousCodeVoices(log: LogPush): CodeVoicesRuntime {
  if (!_autonomousCV) {
    _autonomousCV = createCodeVoicesRuntime({ backticks: {}, fileId: 'autonomous', log });
  }
  return _autonomousCV;
}

class RealActors extends MockActors {
  // We override toggle to delegate to the real-core orchestration via a callback.
  private onToggle?: (a: Actor, willBeActive: boolean) => void;

  setOnToggle(fn: (a: Actor, willBeActive: boolean) => void) {
    this.onToggle = fn;
  }

  toggle(name: string) {
    const before = this.list().find((a) => a.name === name);
    super.toggle(name);
    const after = this.list().find((a) => a.name === name);
    if (before && after && this.onToggle) {
      this.onToggle(after, after.active);
    }
  }
}

class RealCore implements CoreApi {
  actors = new RealActors();
  console = new MockConsole();
  events: EventBus = createEventBus();

  constructor() {
    // LE BUS SE REMET À LA CONSTRUCTION, AVANT TOUT AUTRE APPEL — contrat
    // `hote-runtimes-sortie.md`, amendement du 2026-08-10 point 5. Les six voix de code
    // publient DIRECTEMENT dessus ; il n'y a plus de canal montant, plus de pont.
    //
    // ⚠️ CE QUI VIVAIT ICI ET QUI EST SUPPRIMÉ : une boucle qui abonnait `a.events.onAny(…)` sur
    // chaque adaptateur et republiait sur ce bus. Deux bus et un pont — la forme même que §5.7
    // refuse pour les entrées, et pour la même raison : deux copies d'une union à tenir
    // assignables, et une divergence qui ne se voit pas aux noms. Elle est RETIRÉE, pas
    // désactivée : le paquet a sorti son tableau exporté dans le même mouvement, donc la fabrique
    // est le seul chemin et rien ne peut la contourner.
    initAdapters(this.events);

    // The per-frame playhead sample + the beat/bar UI events (p5/hydra `onBeat`/`onBar`)
    // are derived by the kronos-cursor store directly off Kronos's Transport position
    // (the single authority) — it owns the rAF that used to live in the clock. Wire it
    // the same event bus the visuals listen on, plus the displayed tempo for the events'
    // informational `bpm` field. The events only fire while running, when a handle exists,
    // so the live Transport's tempo is the authoritative value (0 when no scene is live).
    kronosCursor.setEventBus(this.events, () => kronosCursor.active?.transport.tempo ?? 0);
    this.console.push({ runtime: 'system', level: 'info', msg: 'kanopi runtime online' });
    // JE NOMME CE QUE J'EXÉCUTE (empreinte Kairos, arbitrage Romain 2026-08-13). Kairos vit hors
    // du suivi de version chez moi : une construction lancée à la main le republie EN SILENCE, et
    // rien ne disait laquelle je faisais tourner. Son empreinte répond dans les DEUX régimes et dit
    // lequel — mesuré : ma production prend son `dist` (28 fichiers entrés dans mon paquet), mon
    // dev et mon portillon prennent sa source par la condition `development`. Une empreinte qui
    // n'aurait parlé que du paquet aurait été muette là où je passe le plus de temps.
    // `propre: false` = paquet bâti sur un arbre que son commit ne décrit pas → on le CRIE, c'est
    // la même chose que mon refus de construire, vue depuis l'autre bout.
    this.console.push(
      EMPREINTE.regime === 'source-vive'
        ? { runtime: 'system', level: 'info', msg: 'kairos — SOURCE VIVE (aucun paquet)' }
        : {
            runtime: 'system',
            level: EMPREINTE.propre ? 'info' : 'error',
            msg:
              `kairos — paquet ${EMPREINTE.abrege}, bâti le ${EMPREINTE.construitLe}` +
              (EMPREINTE.propre ? '' : ' ⛔ ARBRE MODIFIÉ : ce paquet ne sort d’aucun commit')
          }
    );
    installConsoleBridge((e) => this.console.push(e));
    this.actors.setOnToggle((a, willBeActive) => {
      void this.handleActorToggle(a, willBeActive);
    });
    // A grammar that declares `@mm` derives at that tempo; route it to the tempo store so the
    // displayed BPM and every runtime (live retune) adopt the same tempo the derivation used
    // (transport ⇄ derivation coherence). This is the SCENE tempo channel — `setSceneTempo`
    // fans the live retune out WITHOUT clamping it or recording it as user input (a scene's
    // projected tempo must never seed the next no-`@mm` scene). Lazy import avoids the module
    // cycle (store → core → real-core).
    setTempoSink((bpm) => {
      void import('../../stores/clock.svelte').then((m) => m.clock.setSceneTempo(bpm));
    });
    // (Le mètre de scène — DeriveResult.meter, autorité BPx — n'est plus POUSSÉ dans le clock : le
    //  readout DÉRIVE `kronosCursor.active.beatsPerBar` en direct (KAN-C09, [562]). Plus de setMeterSink.)
    // An orchestrator `.bps` publishes its `@actor` list here so the Actors panel
    // shows every voice (groove + viz, …). The actors are armed by default (a
    // freshly-evaluated orchestrator sounds every voice); the per-actor arm/disarm
    // then routes through the orchestrated path (see handleActorToggle). The active
    // state of an actor that survives a re-eval is preserved.
    setActorsSink((published: PublishedActor[]) => {
      // A NON-orchestrated `.bps`/`.gr` publishes an EMPTY list: it replaces the
      // previous program's orchestrator voices (groove/viz) with nothing.
      if (published.length === 0) {
        this.actors.setActors([]);
        // KAN-UX3 — a mono `.gr`/`.bps` publishes no actors but DID rebuild the
        // AudioRuntime: re-project the persisted gains (master volume/mute) too.
        applyMixerGains();
        return;
      }
      // A PRODUCE/scene-load arms EVERY actor (they all sound — Kronos plays the whole
      // scene). The LED reflects "this actor is sounding", so all light up together;
      // a previous Stop set them `active:false`, and the old `before.get(name) ?? true`
      // re-inherited that false → only the evaluated block's actor re-lit (the « un seul
      // acteur armé alors que les deux jouent » bug). Live arm/disarm still toggles one
      // actor at a time through `handleActorToggle`, not this publish.
      this.actors.setActors(
        published.map((p) => ({
          name: p.name,
          runtime: p.runtime,
          file: p.file,
          active: true,
          outputTransport: p.outputTransport,
          error: p.error
        }))
      );
      // KAN-UX3 — a fresh publish re-registered the voices fully armed; re-apply the
      // PERSISTENT mixer mutes (performer intent, keyed by actor name) so they survive
      // re-evals and scene loads. The arming re-sync at replay is handled separately
      // (`replayActiveScene`).
      for (const p of published) {
        if (mixerMutedFor(p.name)) setOrchestratedActorMuted(p.name, true);
      }
      // KAN-UX3 — the eval rebuilt the AudioRuntime: re-project the persisted
      // VOLUME intent (master gain/mute + per-actor gains) onto the fresh
      // instance, same hook as the mixer-mute re-application just above.
      applyMixerGains();
    });
    // Relay beat/bar events from the clock to any adapter that opts in.
    // Symmetric with `setBpm` above; lets adapters whose language exposes a
    // visual clock (Hydra `beat` / `bar` globals) stay in sync without each
    // re-subscribing to core.events.
    this.events.on('beat', (e) => {
      for (const id of listRuntimes()) {
        const adapter = getAdapter(id);
        adapter?.onBeat?.(e.count, this.log);
      }
    });
    this.events.on('bar', (e) => {
      for (const id of listRuntimes()) {
        const adapter = getAdapter(id);
        adapter?.onBar?.(e.count, this.log);
      }
    });
    // [1497] LE FIL D'ENTRÉE — du bus vers le routeur de runtime-in, VERBATIM.
    //
    // C'est le fil du bus (l'autre bout de la boîte de branchement — la session BPx qui dit les
    // pièces et la porte de Kairos qui reçoit les demandes — est posé avec l'arbre :
    // `bpx-adapter.brancherAttente`). Ici on ne lit rien du signal : `device`/`sourceId`/`signal`
    // traversent tels quels vers `pousserEvenementEntree`, qui les remet au routeur. C'est LUI qui
    // sait quel point d'attente une touche lève ; l'hôte ne compare aucune adresse et ne connaît
    // aucune touche.
    //
    // L'ASSOCIATION rôle→appareil part avec, en donnée : elle vit hors de la scène, l'hôte la
    // porte. Le routeur l'ignore quand un canal n'a qu'un rôle (le cas ordinaire).
    //
    // UN ÉCHEC SE CRIE. La chaîne lève quand l'assemblage est faux (arbre non dérivé, signal
    // illisible, porte qui refuse) : ces cris-là disent un défaut de câblage, jamais un geste de
    // l'utilisateur. Les avaler rendrait « la pièce ne repart pas » indiscernable de « la touche
    // ne visait rien » — exactement le silence qu'on vient de payer une journée.
    this.events.on('input', (e) => {
      try {
        pousserEvenementEntree(
          { device: e.device, sourceId: e.sourceId, signal: e.signal },
          inputBindings.pourRoutage()
        );
      } catch (err) {
        this.log({ runtime: 'system', level: 'error', msg: `entrée: ${String(err)}` });
      }
    });
  }

  private log = (e: { runtime: Runtime; level: LogEntry['level']; msg: string }) =>
    this.console.push(e);

  private async handleActorToggle(a: Actor, willBeActive: boolean) {
    // Orchestrator `.bps` actor: arm/disarm sets ONLY the "ready" intent (the LED
    // + the voice's mute flag) for this actor — it NEVER starts the transport
    // (Romain 2026-07-14: arm ≠ play; the old "arm = play" self-start, beta issue
    // 5, is retired). `setOrchestratedActorMuted` is safe to call regardless of
    // transport state: Kronos gates emission on its OWN running state, so
    // unmuting an actor while stopped routes no sound (confirmed
    // orchestrator-actors.test.ts "unmute on a STOPPED transport ... does not
    // fire sound"). The Play button (`playback.play()` → `replayActiveScene` /
    // `replayArmed`) is the sole gesture that starts Kronos, and re-projects this
    // same arm/mute intent onto the freshly-(re)built scene.
    if (isOrchestratedActor(a.name)) {
      if (willBeActive) {
        // An actor armed while mixer-muted stays silent — the mixer layer wins (KAN-UX3).
        if (!mixerMutedFor(a.name)) setOrchestratedActorMuted(a.name, false);
        this.log({ runtime: a.runtime, level: 'info', msg: `arm [${a.name}]` });
      } else {
        setOrchestratedActorMuted(a.name, true);
        this.log({ runtime: a.runtime, level: 'info', msg: `disarm [${a.name}]` });
      }
      return;
    }

    // Non-orchestrated actor: no file binding exists, so a toggle is visual only.
    this.log({ runtime: a.runtime, level: 'warn', msg: `actor "${a.name}" has no live voice` });
  }

  async evaluateBlock(
    runtime: Runtime,
    code: string,
    sourceId: string,
    docOffset: number = 0,
    actorId?: string,
    flags?: Record<string, number>,
    produceOnly: boolean = false
  ): Promise<void> {
    const adapter = getAdapter(runtime);
    if (!adapter) {
      this.log({ runtime, level: 'warn', msg: `no adapter for runtime "${runtime}"` });
      throw new Error(`no adapter for runtime "${runtime}"`);
    }
    if (!code.trim()) {
      this.log({ runtime, level: 'warn', msg: 'empty block' });
      return;
    }

    // FULL-production readout is meaningful only for the symbolic (bp3/bpscript)
    // languages that derive note tokens. A backtick-only voice (Strudel, Hydra,
    // …) produces no derived symbols, so clear the production store before its
    // eval — the Text panel then degrades to its empty "no symbolic production"
    // state instead of showing a stale derivation. bp3/bpscript repopulate it
    // synchronously inside their own `evaluate`.
    if (runtime !== 'bp3' && runtime !== 'bpscript') production.clear();

    // Resolution order for the slot key:
    //   explicit actorId (block-level, e.g. `melody.$0`) >
    //   raw source id (back-compat: whole-file slot).
    // Multiple blocks in the same file must land in DIFFERENT slots, otherwise
    // Strudel composite overwrites block 1 when block 2 is evaluated.
    const slotId = actorId ?? sourceId;

    // Eval first — if it throws, we leave transport+LED alone so a broken
    // block doesn't falsely mark the scene as playing.
    // Voix de code AUTONOME : évaluée À TRAVERS l'adaptateur uniforme de runtime-codevoices
    // (capture §3.1 — il résout l'interprète et tire le moteur), pas via la registry hôte. Les
    // natifs bp3/bpscript passent par leur adaptateur BPx. (Une voix de code n'a pas de produceOnly.)
    if (runtime !== 'bp3' && runtime !== 'bpscript') {
      // [764](e) — un CSD lit ses soundfiles depuis le FS virtuel Csound ; l'hôte les fournit AVANT
      // l'éval (fetch depuis le store auto-hébergé -> writeCsoundFile). Best-effort, ne throw jamais.
      // Mémoïsé par nom (csound-soundfiles.ts) : no-op si `preload-on-open` les a déjà chargés.
      if (runtime === 'csound') await ensureCsoundSoundfiles(code, this.log);
      // [786] — préchauffage GATÉ (plus fire-and-forget) : si l'ouverture a déjà lancé/fini le
      // warmup de cet interprète, cette attente est immédiate (promesse mémoïsée déjà résolue) ;
      // sinon on le lance+attend ICI (best-effort, ne throw jamais, ne bloque donc jamais le play
      // au-delà du temps réel de warmup — même patron que le produce, bpx-adapter.ts:1530).
      await warmUp([runtime]);
      await autonomousCodeVoices(this.log).evaluate(
        code,
        { actorId: slotId, fileId: sourceId, docOffset, flags },
        runtime
      );
    } else {
      await adapter.evaluate(
        code,
        { actorId: slotId, fileId: sourceId, docOffset, flags, produceOnly },
        this.log
      );
    }

    // PRODUCE-only (scene opened, not played): the adapter derived + published the
    // structure, but we must NOT touch the transport or light the actor LED — the
    // scene is ready, not playing. Play sounds it later.
    if (produceOnly) return;

    // Surgical: a manual Ctrl+Enter (re)sounds ONLY this block — the block just evaluated
    // above is already live. A bp3/bpscript/.gr eval builds a Kronos handle (transport →
    // running, so the readout follows the single authority). VOIE B [523] : une voix de
    // code AUTONOME (Strudel/Hydra/… évaluée seule) passe elle AUSSI sous un transport
    // Kronos — le transport partagé des voix autonomes : l'éval (qui vient de tirer le
    // code) enregistre la voix dessus et le curseur le lit → l'afficheur dit PLAYING au
    // BPM porté (REV-F02) et Stop/Pause gouvernent la voix via le relais lifecycle
    // (REV-F01). Toujours AUCUN état inventé : l'état affiché EST celui du transport.
    if (runtime !== 'bp3' && runtime !== 'bpscript') {
      // Tempo de session (D10) — import DYNAMIQUE du store (même règle anti-cycle que
      // blocks.svelte plus haut : store → core → real-core).
      const { clock } = await import('../../stores/clock.svelte');
      // On met la voix (déjà tirée) SOUS le transport autonome, en y ENREGISTRANT l'adaptateur
      // uniforme de runtime-codevoices : Kronos l'abonne au bus de cycle de vie (le re-tir /
      // gel / reprise / tais-toi passent par le bus, plus par un refire hôte).
      const handle = registerCodeVoice({
        runtime: autonomousCodeVoices(this.log),
        bpm: clock.state.bpm
      });
      kronosCursor.set(handle);
    }
  }

  /** Broadcast one transport SENTINEL, then set the actors' LEDs. Per-runtime by id,
   *  best-effort — `listRuntimes()` returns unique Map keys, so no dedup is needed.
   *  The sentinel rides `stop()`'s `{actorId, fileId}`.
   *
   *  PORTÉE (chantier voix-code-transport [523]) : `__hush__` (panique) va à TOUS les
   *  runtimes — c'est LE mot que chaque adaptateur voix-de-code documente comme hush
   *  total. Les sentinelles Model C (`__stop_in_place__`/`__replay__`) sont le protocole
   *  des adaptateurs BPX (elles pilotent leur handle Kronos) : les envoyer à un
   *  adaptateur voix-de-code lui faisait SUPPRIMER un slot fantôme puis RE-FLUSHER son
   *  composite — la voix se RE-TIRAIT après le stop propre (mécanisme REV-F01, vu à
   *  l'écran). Les voix de code sont gouvernées par le RELAIS lifecycle de leur
   *  transport (orchestré : handle de scène ; autonome : transport voie B), jamais par
   *  ces sentinelles → on ne les leur envoie plus. */
  async #broadcast(sentinel: string, ledsActive: boolean): Promise<void> {
    const bpxOnly = sentinel === '__stop_in_place__' || sentinel === '__replay__';
    for (const id of listRuntimes()) {
      if (bpxOnly && id !== 'bp3' && id !== 'bpscript') continue;
      const adapter = getAdapter(id);
      if (!adapter) continue;
      try {
        await adapter.stop({ actorId: sentinel, fileId: sentinel }, this.log);
      } catch {
        /* swallow — transport broadcast must be best-effort */
      }
    }
    const next = this.actors.list().map((a) => ({ ...a, active: ledsActive }));
    this.actors.setActors(next);
  }

  async silenceRuntimes(): Promise<void> {
    // Full hush: silence every runtime + LEDs off. Le transport des voix autonomes est
    // DÉMONTÉ (les voix sont déjà tues par `__hush__` ; sans teardown, l'afficheur
    // continuerait de dire « playing » sur une session muette). Même règle que les handles
    // de scène au hush : le curseur ne pointe pas un handle mort.
    await this.#broadcast('__hush__', false);
    const wasCursor = kronosCursor.active === (codeVoiceTransport() as unknown);
    disposeCodeVoiceTransport();
    if (wasCursor) kronosCursor.set(null);
  }

  async stopInPlace(): Promise<void> {
    // Model C STOP: each bpx adapter returns its live scene's playhead to 0 and cuts
    // its sound WITHOUT discarding the derived timeline (the handle / kronos cursor stay
    // live so a Play replays the same timeline). LEDs off (the scene is stopped).
    // Voix AUTONOMES (voie B) : leur transport passe à 'stopped' — le relais lifecycle
    // coupe chaque voix (tais-toi immédiat, REV-F01) ; le handle persiste pour un replay.
    await this.#broadcast('__stop_in_place__', false);
    stopCodeVoiceTransportInPlace();
  }

  async replayActiveScene(): Promise<void> {
    // Model C PLAY-from-stopped: each bpx adapter restarts its persisted (stopped)
    // handle from 0 with NO re-derivation. LEDs back on (the scene is sounding again).
    // Voix AUTONOMES (voie B) : leur transport repart aussi — stopped→running, le relais
    // re-tire chaque voix dans son slot (même performance, même armement).
    await this.#broadcast('__replay__', true);
    replayCodeVoiceTransport();
    // CVA-INIT — the replay's `reset()` cleared the audio arming (`_muted`) for a pristine
    // 1st loop; RE-APPLY the composed arming from the actor store (the AUTHORITY) so a
    // stop→play REPRODUCES the same performance: an orchestrated actor muted/disarmed before
    // Stop must stay silent on replay (else stop→play would silently change the arming →
    // non-deterministic, décision archi [448]). Armed actors need nothing (reset already
    // re-armed them). No-op in mono (no orchestrated actors); `setOrchestratedActorMuted`
    // is itself a no-op for a name with no live voice. Kronos is separately adding its
    // OWN mute re-affirmation across a replay ([673] NB) — this host loop stays as belt
    // over that until confirmed redundant, same pattern as the runtime-audio gain guarantee below.
    for (const a of this.actors.list()) {
      // `mixerMutedFor`: the PERSISTENT mixer layer (KAN-UX3) is re-applied here too —
      // the replay `reset()` must never un-mute a mixer-muted actor.
      if (isOrchestratedActor(a.name) && (!a.active || mixerMutedFor(a.name)))
        setOrchestratedActorMuted(a.name, true);
    }
    // KAN-UX3 — belt over the runtime guarantee: levels + master mute survive
    // `reset()` runtime-side (contract [651]), but re-projecting the persisted
    // intent here keeps replay deterministic from the SAME source of truth.
    applyMixerGains();
  }

  async hushAll(): Promise<void> {
    // Panic stop: silence every runtime + reset visual state (LEDs off). The per-runtime
    // `__hush__` fully discards each Kronos handle (kronosCursor → null), so the transport
    // readout PROJECTS 'stopped' — no host clock to stop.
    await this.silenceRuntimes();
    this.log({ runtime: 'system', level: 'warn', msg: 'hush all' });
  }

  /** LE GESTE DE CONNEXION — et RIEN de plus (contrat `hote-runtime-in.md` § « Ce qui reste chez
   *  l'hôte »). Ce corps ne connaît ni autorisation, ni port, ni octet : il donne au périphérique
   *  son PUITS (le bus) et sa BASE DE TEMPS, puis l'ouvre. Toute la logique vit dans `runtime-in`.
   *
   *  POURQUOI CETTE MÉTHODE SURVIT au retrait du pilote (avertissement de l'architecte, [960]) :
   *  Web MIDI n'accorde l'autorisation que DANS LA CHAÎNE DU GESTE UTILISATEUR. Lire « supprime le
   *  pilote et ses appelants » jusqu'à retirer la méthode de `CoreApi` aurait supprimé le geste
   *  lui-même — l'autorisation n'aurait plus jamais été accordée, et aucun garde ne l'aurait vu
   *  (celui de runtime-in compte les chemins matériels, pas les gestes manquants).
   *
   *  UNE SEULE INSTANCE, TENUE (avertissement runtime-in [969], et ce n'est pas du confort) : un
   *  périphérique TIENT l'autorisation accordée, ses écouteurs et son ancre d'horloge. En fabriquer
   *  un par geste redemanderait l'autorisation et poserait les écouteurs sur un objet que plus
   *  personne ne tient — le périphérique se tairait SANS UNE SEULE ERREUR. Ce n'est pas une
   *  hypothèse : c'est l'incident [96] du côté SORTIE (`runtime-MIDI/src/transports/midi.js`, en-tête « Access Web MIDI SINGLETON de module »,
   *  « root cause du silence : l'hôte créait un MidiRuntime FRAIS »). `periphériques()` gèle ses
   *  instances : deux appels rendent les MÊMES objets. */
  async enableMidiInput(portId?: string): Promise<readonly PortInfo[]> {
    const device = periphériques().find((d) => d.device === 'midi');
    if (!device) {
      // Le paquet ne rend pas de périphérique MIDI : ça se crie, ça ne se devine pas.
      this.log({ runtime: 'system', level: 'error', msg: 'midi: aucun périphérique MIDI fourni' });
      return [];
    }
    // Le puits : le bus UNIQUE de l'hôte, et sa base de temps. `now()` EST la base du bus
    // (`KanopiEventBase.t` = temps mural via `performance.now()`) — le périphérique convertit son
    // estampille native dessus et ne lit jamais d'horloge lui-même. Un `now()` différent du bus
    // rendrait une note MIDI et un message OSC incomparables, en silence.
    device.bindSink({
      emit: (e) => this.events.emit(e),
      now: () => performance.now()
    });
    // ÉCHEC BRUYANT (contrat, garde 5) : `open()` REJETTE — Web MIDI absent, autorisation refusée,
    // port introuvable. On laisse remonter après l'avoir journalisé ; l'ancien `enableMidi` rendait
    // un `{ ok:false, reason }` que l'appelant pouvait ignorer, c'est fini avec lui.
    //
    // LE PORT CHOISI, QUAND IL Y EN A UN (association du panneau des entrées). Sans choix, on
    // ouvre TOUT ce qui est branché — c'est ce que le périphérique fait d'un `open({})`, et c'est
    // la vérité de l'état « rien n'est encore associé », pas un défaut fabriqué.
    try {
      await device.open(portId !== undefined ? { portId } : {});
    } catch (err) {
      this.log({ runtime: 'system', level: 'error', msg: `midi: ${String(err)}` });
      throw err;
    }
    // Les ports ne s'énumèrent QU'APRÈS l'autorisation — avant, la liste est vide par protocole,
    // pas par manque.
    const ports = await device.ports();
    this.log({
      runtime: 'system',
      level: 'info',
      msg: `midi enabled: ${ports.length ? ports.map((p) => p.name).join(', ') : 'no input port detected'}`
    });
    return ports;
  }

  /** LE CLAVIER DE JEU S'OUVRE QUAND LE JEU PREND LA MAIN — et se ferme quand il la rend.
   *
   *  C'est TOUT le protocole de focus que le périphérique connaît, et il est écrit de son côté :
   *  « ce périphérique ne consulte aucun focus : l'hôte l'ouvre quand le jeu a la main et le ferme
   *  quand il la perd » (`runtime-in/src/devices/keyboard.js`, en-tête « CE QU’IL NE DÉCIDE PAS : le focus »). L'hôte ne pose donc AUCUN
   *  écouteur clavier de jeu — les écouteurs, le code physique de la touche et la table vivent
   *  entièrement dans `runtime-in` (contrat `hote-runtime-in.md`, garde 4).
   *
   *  AUCUNE TABLE N'EST REMISE ICI, et c'est délibéré : la bibliothèque des tables est VIDE tant
   *  que Romain n'en a pas donné une (arbitrage 2026-07-27). Sans table, le périphérique émet le
   *  code physique tel quel — l'adresse nue, forme explicitement autorisée. En fabriquer une
   *  d'office poserait une identité implicite que la décision refuse.
   *
   *  L'INSTANCE EST TENUE par `periphériques()` : ouvrir et fermer parlent au MÊME objet, celui
   *  qui tient ses écouteurs. */
  async openPlayKeyboard(): Promise<void> {
    const device = periphériques().find((d) => d.device === 'keyboard');
    if (!device) {
      this.log({ runtime: 'system', level: 'error', msg: 'clavier: aucun périphérique fourni' });
      throw new Error('runtime-in ne fournit aucun périphérique clavier');
    }
    // Le MÊME puits et la MÊME base de temps que le MIDI : un bus unique, une seule règle de
    // conversion — c'est elle, et elle seule, qui rend une note MIDI et une touche comparables.
    device.bindSink({
      emit: (e) => this.events.emit(e),
      now: () => performance.now()
    });
    try {
      await device.open({});
    } catch (err) {
      // ÉCHEC BRUYANT (contrat, garde 5) : un focus de jeu qui ne peut pas écouter ne se tait pas,
      // il le dit — et l'appelant relâche le focus plutôt que de le laisser mentir.
      this.log({ runtime: 'system', level: 'error', msg: `clavier: ${String(err)}` });
      throw err;
    }
    this.log({ runtime: 'system', level: 'info', msg: 'clavier de jeu ouvert' });
  }

  /** LE GESTE DE CONNEXION D'UNE ENTRÉE OSC — l'endroit d'écoute, et rien de plus.
   *
   *  Dans un navigateur c'est un RELAIS `ws://…` (une socket UDP n'y existe pas ; `runtime-in`
   *  choisit l'un ou l'autre sur la seule forme de l'adresse — `devices/osc.js:243`). L'adresse
   *  vient de l'utilisateur : elle nomme SA machine, donc elle n'entre jamais dans une scène. */
  async openOscInput(address: string): Promise<void> {
    const device = periphériques().find((d) => d.device === 'osc');
    if (!device) {
      this.log({ runtime: 'system', level: 'error', msg: 'osc: aucun périphérique fourni' });
      throw new Error('runtime-in ne fournit aucun périphérique OSC');
    }
    device.bindSink({
      emit: (e) => this.events.emit(e),
      now: () => performance.now()
    });
    try {
      await device.open({ address });
    } catch (err) {
      this.log({ runtime: 'system', level: 'error', msg: `osc: ${String(err)}` });
      throw err;
    }
    this.log({ runtime: 'system', level: 'info', msg: `osc input: écoute ${address}` });
  }

  /** Rend le clavier : le périphérique retire ses deux écouteurs. Idempotent de son côté. */
  async closePlayKeyboard(): Promise<void> {
    const device = periphériques().find((d) => d.device === 'keyboard');
    if (!device) return;
    await device.close();
    this.log({ runtime: 'system', level: 'info', msg: 'clavier de jeu fermé' });
  }
}

export function createRealCore(): CoreApi {
  return new RealCore();
}
