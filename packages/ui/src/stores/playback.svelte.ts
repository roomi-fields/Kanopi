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

  play() {
    const t = this.transport;
    // Resume IN PLACE on the live Transport (no re-eval): one scheduler across the whole
    // play→pause→play cycle. UNCHANGED.
    if (t && t.state === 'paused') {
      t.play();
      // Resume the sustained code voices that PAUSE cut (Strudel/Hydra restart in place).
      kronosCursor.active?.refireCodeVoices();
      return;
    }
    // Model C — Play from STOPPED with a PERSISTED handle: the derived timeline still lives
    // in Kronos (Stop only moved the playhead to 0). REPLAY it from 0 with ZERO re-derivation
    // — no new scheduler, no eval. The handle stays the same; its transport flips to
    // 'running' (the mode mirror follows). reRandom still re-rolls at the loop boundary via
    // the handle's persisted closure — that is NOT this path.
    if (t && t.state === 'stopped') {
      void core.replayActiveScene();
      return;
    }
    // From stopped with NO live handle (scene never derived, or fully torn down): EVAL once.
    // EXPLICITLY eval the active scene's armed blocks — that eval derives once and creates the
    // persistent Kronos handle (whose transport flips to 'running', so `mode` reads 'playing').
    // No host clock to start: Kronos becomes the authority the instant the handle is built.
    // Subsequent Stop/Play replay it without eval. (No host resume-offset — Kronos handles resume.)
    void openBlocks.replayArmed();
  }

  pause() {
    // Kronos freezes the position (notes ring their tail). The sustained code voices
    // (Strudel/Hydra) are host-managed, so cut them explicitly here (the scheduler's
    // stop must NOT, or a same-file re-eval would tear them down). Resume re-fires them.
    this.transport?.pause();
    kronosCursor.active?.cutCodeVoices();
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
