// Transport — PURE PROJECTION on Kronos's Transport.
//
// Kanopi holds NO transport state machine and NO position counter (contract
// `kronos-transport.md`). Kronos's `Transport` (exposed as `kronosCursor.active.transport`)
// is the single execution state machine + position authority. This store only:
//   • maps button gestures → Transport commands (play/pause/stop/step), and
//   • PROJECTS `mode` from `kronosCursor.state` (a reactive mirror of `transport.state`).
//
// The old parallel authorities are GONE: the `lastBeat` counter, the second mode FSM,
// and the `kronosPaused`/resume bookkeeping. Position + beat are read per-frame from the
// Transport by the UI, never reconstructed here.

import { core } from '../lib/core';
import { kronosCursor } from './kronos-cursor.svelte';
import { openBlocks } from './blocks.svelte';
import { workspace } from './workspace.svelte';
import { isNonProgramFile } from '../lib/workspace/types';

type Mode = 'stopped' | 'playing' | 'paused';

interface PlayableFile {
  runtime: import('../lib/core').Runtime;
  name: string;
  contents: string;
}

class Playback {
  /** PROJECTION of Kronos's Transport state (reactive via `kronosCursor.state`). Kanopi
   *  keeps no FSM. `running`→`playing`; `step` lands on `paused` (no separate `stepped`). */
  get mode(): Mode {
    // PURE projection on Kronos: a live scene → PROJECT the Transport's state (the single
    // authority). EVERY playable scene routes through bpx-adapter → startKronosAudio →
    // kronosCursor.set(handle), so `kronosCursor.active` is non-null the instant any scene
    // plays — code-only Strudel/Hydra backticks included (their backticks are BT tokens
    // scheduled by Kronos). No live scene (empty/idle workspace) → 'stopped'. The old host
    // fallback `clock.state.playing` is GONE: the host invents no transport state.
    if (kronosCursor.active) {
      switch (kronosCursor.state) {
        case 'running':
          return 'playing';
        case 'paused':
          return 'paused';
        default:
          return 'stopped';
      }
    }
    return 'stopped';
  }

  /** The live Kronos Transport, or null when no scene is loaded/playing. */
  private get transport() {
    return kronosCursor.active?.transport ?? null;
  }

  /** Play = "make the ACTIVE tab the one live scene", never several at once.
   *
   * Two cases:
   *  - The active tab IS already the routed-live scene (`openBlocks.liveFileId`)
   *    and a Transport exists for it → resume/replay IN PLACE, the untouched
   *    Model C paths below (B7/B8/B10 in TRANSPORT_BEHAVIOR.md).
   *  - Anything else (a different tab, or nothing live yet) → BASCULE: cut the
   *    outgoing scene (`core.silenceRuntimes()`, which tears down the Kronos
   *    handle) and arm+play the active tab fresh. Only one scene ever sounds. */
  async play() {
    const active = workspace.activeTabId;
    // No active tab, or the active tab is a library/data file: nothing to play
    // (the Play button is disabled in this state too — this is the safety net).
    if (!active) return;
    const activeFile = workspace.fileById(active);
    if (!activeFile || isNonProgramFile(activeFile.path)) return;

    if (active === openBlocks.liveFileId && this.transport) {
      const t = this.transport;
      // Resume IN PLACE on the live Transport (no re-eval): one scheduler across the whole
      // play→pause→play cycle. UNCHANGED.
      if (t.state === 'paused') {
        // Les voix de code reprennent via le relais lifecycle (paused→running = reprise
        // resynchronisée à la position transport, option (b)) — plus d'appel hôte exprès.
        t.play();
        return;
      }
      // Model C — Play from STOPPED with a PERSISTED handle: the derived timeline still lives
      // in Kronos (Stop only moved the playhead to 0). REPLAY it from 0 with ZERO re-derivation
      // — no new scheduler, no eval. The handle stays the same; its transport flips to
      // 'running' (the mode mirror follows). reRandom still re-rolls at the loop boundary via
      // the handle's persisted closure — that is NOT this path.
      if (t.state === 'stopped') {
        void core.replayActiveScene();
        return;
      }
      // 'running' — already playing, nothing to do.
      return;
    }

    // BASCULE: the active tab is a DIFFERENT scene than whatever is currently live
    // (or nothing is live at all). Cut the outgoing scene first — never two scenes
    // sounding at once — then arm+play the active tab, which sets `liveFileId`.
    await core.silenceRuntimes();
    openBlocks.disarmAll();
    await openBlocks.armAndPlayFile(active);
  }

  pause() {
    // Kronos freezes the position (pause QUANTIFIÉE au bord d'unité). Les voix de code
    // gèlent via le relais lifecycle à l'instant RÉEL du gel (running→paused), au même
    // moment que les notes — l'hôte ne coupe plus rien lui-même (option (b) 2026-07-03).
    this.transport?.pause();
  }

  stop() {
    // Model C — STOP IN PLACE: return the playhead to 0 and cut the sound + code voices, but
    // KEEP the derived timeline persisted in Kronos (the handle is NOT discarded). A following
    // Play replays the SAME timeline with no re-derivation. `transport.stop()` (inside the
    // handle) sets resume=0, so replay restarts from 0. The kronos cursor / handle persist;
    // its transport.state flips to 'stopped' so `mode` reads 'stopped'. No host clock to stop.
    void core.stopInPlace();
  }

  async step(file: PlayableFile) {
    // STEP (RC-B fix) — UNE unité d'arbre sur le handle PERSISTANT (Model C). Plus de re-dérivation
    // par geste, plus de compteur de beat hôte (`beatCount`/`(round+1)%n`), plus de grain grille-beat :
    // `transport.step(1)` (via `handle.step`) est l'AUTORITÉ. Kronos joue la fenêtre bornée + snap-to-onset
    // (la colonne atteinte SONNE = fix bug 2) et pose à la prochaine borne d'unité. L'hôte transmet le
    // geste — il ne calcule ni l'index, ni le grain, et ne re-dérive pas la scène.
    let handle = kronosCursor.active;
    if (!handle) {
      // Aucune machine construite (step avant tout produce/play) → PRODUIRE le handle persistant
      // sans jouer (`produceOnly`), puis stepper dessus.
      await core.evaluateBlock(
        file.runtime,
        file.contents,
        file.name,
        0,
        undefined,
        undefined,
        true
      );
      handle = kronosCursor.active;
    }
    handle?.step(1);
  }

  /** Beat (integer) for the LED meter, READ from the Transport; -1 when stopped. */
  activeBeat(): number {
    const t = this.transport;
    if (!t || this.mode === 'stopped') return -1;
    return Math.max(0, Math.floor(t.beatPosition().beatsTotal));
  }
}

export const playback = new Playback();
