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
import { production, beatCount } from './production.svelte';
import { setResumeBeat } from '../lib/runtimes/bpx-adapter';
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
    // play→pause→play cycle.
    if (t && t.state === 'paused') {
      t.play();
      // Resume the sustained code voices that PAUSE cut (Strudel/Hydra restart in place).
      kronosCursor.active?.refireCodeVoices();
      return;
    }
    // From stopped (no live Transport): start the clock (so `handleTransport` re-evals
    // declared `.kanopi` actors + the UI reads "playing"), then EXPLICITLY eval the active
    // scene's armed blocks. That eval creates the Kronos Transport and auto-plays it;
    // position + state then come from that Transport. (Was the clock-subscriber's job;
    // it is now an explicit call here so the orchestrated `.bps` scene still sounds.)
    setResumeBeat(0);
    core.clock.play();
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
    // Hush + teardown: `silenceRuntimes` stops every voice's handle (→ `transport.stop()`,
    // which closes the sinks + resets the position) and clears `kronosCursor`. The clock
    // is the eval trigger, turned off here. No position to reset by hand.
    core.clock.stop();
    void core.silenceRuntimes();
  }

  async step(file: PlayableFile) {
    const cur = production.current;
    const n = cur ? beatCount(cur.durationSec, cur.beatDurSec) : 0;
    if (n < 2) return;
    // The beat to play next is DERIVED from the Transport's frozen position — never a
    // host counter. A stepped handle reports the beat it just PLAYED (`beatPosition` =
    // the stepped second, aligned to the heard note), so the NEXT beat is that + 1.
    // Stopped (no Transport) → start at beat 0. Each step advances one beat → monotone;
    // `play` afterwards resumes forward. The adapter seeks to this beat and plays one
    // beat window then pauses (a fresh Transport per step; the previous one is torn down
    // first, so no stacked emitter).
    const t = this.transport;
    const next = t ? (((Math.round(t.beatPosition().beatsTotal) + 1) % n) + n) % n : 0;
    await core.evaluateBlock(file.runtime, file.contents, file.name, 0, undefined, undefined, {
      index: next,
      count: n
    });
  }

  /** Beat (integer) for the LED meter, READ from the Transport; -1 when stopped. */
  activeBeat(): number {
    const t = this.transport;
    if (!t || this.mode === 'stopped') return -1;
    return Math.max(0, Math.floor(t.beatPosition().beatsTotal));
  }
}

export const playback = new Playback();
