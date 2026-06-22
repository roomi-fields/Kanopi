// Transport state machine — the SINGLE source of truth for playback position.
//
// Before this, "where are we?" was answered by four disagreeing things (the
// play/pause booleans, a free-running display clock, the audio engine's own
// position, and a separate step number) reconciled by hand in every command —
// which is why step→play could jump backward and stop-after-step did nothing.
//
// Here there is ONE mode and ONE counter:
//   • mode     — stopped | playing | paused | stepped
//   • lastBeat — the index of the LAST beat the playhead committed to (-1 = before
//                the start). Step advances it; Play resumes AFTER it; Pause records
//                the live beat; Stop resets it. Everything (audio offset, the
//                structure cursor, the 4-LED beat meter) is DERIVED from this.
//
// The lower-level clock + dispatcher remain the audio primitives this machine
// drives; they no longer own the position. Transitions (count = number of beats
// in the current production):
//
//   stop()           → stopped, lastBeat = -1, hush, cursor cleared
//   step(file)       → stepped, play ONLY beat (lastBeat+1), lastBeat = that beat
//   play() [stopped] → playing, continuous from beat (lastBeat+1)
//   play() [stepped] → playing, continuous from beat (lastBeat+1)  ← never backward
//   play() [paused]  → playing, resume the suspended audio in place
//   pause()          → paused, lastBeat = the live beat it froze on
//
// Step-after-pause therefore plays B+1 (the paused beat is B = lastBeat), and
// play-after-step resumes at the next unplayed beat — forward by construction.

import { core } from '../lib/core';
import { production, beatCount } from './production.svelte';
import { setResumeBeat } from '../lib/runtimes/bpx-adapter';
import { kronosCursor } from './kronos-cursor.svelte';

type Mode = 'stopped' | 'playing' | 'paused' | 'stepped';

interface PlayableFile {
  runtime: import('../lib/core').Runtime;
  name: string;
  contents: string;
}

class Playback {
  mode = $state<Mode>('stopped');
  /** Index of the last beat the playhead committed to (-1 = before the start).
   *  The single position counter. During `playing` the live audio beat is the
   *  position; this holds where Pause/Step/Stop last left it. */
  lastBeat = $state(-1);

  /** Beats in the current production (0 when nothing is produced). */
  private beatTotal(): number {
    const cur = production.current;
    return cur ? beatCount(cur.durationSec, cur.beatDurSec) : 0;
  }

  /** The live audio beat (integer) read off the SAME playhead the user hears.
   *  In kronos mode the heard audio is driven by the Kronos clock and the cursor
   *  reads the Kronos playhead, so the position counter must read it too — else
   *  Pause records a beat off the legacy rAF clock (which the kronos audio path
   *  does NOT drive) and Step/Play inherit an off-by-one. `beatsTotal` is already
   *  loop-folded into 0..n-1. Legacy engine: keep the central clock path. */
  liveBeat(): number {
    if (kronosCursor.active) {
      return Math.max(0, Math.floor(kronosCursor.active.beatPosition().beatsTotal));
    }
    const bpb = core.clock.state.beatsPerBar || 4;
    const abs = (core.clock.state.bar - 1) * bpb + core.clock.state.beat;
    return Math.max(0, Math.floor(abs));
  }

  /** Kronos-mode pause keeps the clock RUNNING (it only bounds emission at the beat
   *  end), so resuming is NOT an in-place audio resume — it must seek forward to the
   *  frozen boundary like Step→Play. The legacy pause suspends the context in place,
   *  so it resumes in place. This flag records which kind of pause is live. */
  private kronosPaused = false;

  play() {
    if (this.mode === 'paused') {
      if (this.kronosPaused) {
        // Resume IN PLACE on the SAME Kronos scheduler — NO re-eval. The old path
        // (`setResumeBeat` + `clock.play()` → `handleTransport` re-evaluates the
        // scene) raced the teardown of the previous scheduler against the freshly
        // started one, intermittently DOUBLING the audio and leaving a voice ringing
        // through the next pause. Now the one live scheduler re-anchors at the frozen
        // boundary `(lastBeat+1)·beat` and restarts its pump; `startSilently` marks
        // the clock "playing" for the UI WITHOUT re-evaluating the armed set or
        // replaying blocks (it sets the `silentStart` flag both consult).
        this.kronosPaused = false;
        const beatDurSec = production.current?.beatDurSec ?? 0;
        kronosCursor.active?.resume((this.lastBeat + 1) * beatDurSec);
        core.clock.startSilently();
        this.mode = 'playing';
        return;
      }
      // Legacy pause suspended the context in place → resume it in place (no re-eval).
      core.clock.play();
      this.mode = 'playing';
      return;
    }
    // From stopped or stepped: continuous playback from the next unplayed beat.
    // lastBeat = -1 (stopped) → start at 0; lastBeat = X (stepped) → start at X+1.
    setResumeBeat(this.lastBeat + 1);
    core.clock.play();
    this.mode = 'playing';
  }

  pause() {
    if (this.mode !== 'playing') return;
    const n = this.beatTotal();
    const handle = kronosCursor.active;
    const beatDurSec = production.current?.beatDurSec ?? 0;
    // KRONOS — pause at the END of the current beat (B7), NOT instant. Bound emission
    // so beat B finishes ringing and beat B+1 never starts; do NOT suspend the
    // context (that would cut B's tails). The handle reports the completed beat
    // (loop-folded into 0..n-1). We flip to `paused` immediately (the button/state
    // must respond at once); the cursor follows the heard audio through beat B then
    // parks at the boundary `(lastBeat+1)·beat` once paused (B13). The clock is put
    // in a QUIET paused state (no context suspend, and `play` afterwards takes the
    // forward-resume branch) via `enterStep()` — which only flips the playing/paused
    // flags, no hush, no suspend.
    if (handle && beatDurSec > 0) {
      this.kronosPaused = true;
      this.lastBeat = handle.pauseAtBeatEnd(
        beatDurSec,
        () => {
          // Boundary reached: nothing more to do for the audio (emission already
          // bounded). State is already `paused`; the completed beat was recorded
          // synchronously below from the return value.
        },
        n > 0 ? n : undefined
      );
      core.clock.enterStep();
      this.mode = 'paused';
      return;
    }
    // LEGACY (or no kronos handle) — instant suspend in place (unchanged). Freeze on
    // the beat currently heard, brought back INTO the production's range (the loop
    // counter grows across cycles; the position counter must stay in 0..n-1).
    this.kronosPaused = false;
    const live = this.liveBeat();
    this.lastBeat = n > 0 ? ((live % n) + n) % n : live;
    core.clock.pause();
    this.mode = 'paused';
  }

  stop() {
    // Works from EVERY mode, including `stepped` (where the clock's own stop is a
    // near-noop because nothing reads as "playing"): hush the audio, reset the
    // clock display, and zero the position.
    this.kronosPaused = false;
    core.clock.stop();
    void core.silenceRuntimes();
    this.lastBeat = -1;
    this.mode = 'stopped';
  }

  async step(file: PlayableFile) {
    const n = this.beatTotal();
    if (n < 2) return;
    this.kronosPaused = false;
    const next = (((this.lastBeat + 1) % n) + n) % n;
    // Discrete advance: clear the playing/paused flags WITHOUT zeroing, hush any
    // in-flight audio for a clean slate, then play exactly this one beat.
    core.clock.enterStep();
    await core.silenceRuntimes();
    await core.evaluateBlock(file.runtime, file.contents, file.name, 0, undefined, undefined, {
      index: next,
      count: n
    });
    this.lastBeat = next;
    this.mode = 'stepped';
  }

  /** The beat the meter/cursor should highlight, or -1 when nothing is active.
   *  Playing → the live audio beat; paused/stepped → the committed beat. */
  activeBeat(): number {
    if (this.mode === 'playing') return this.liveBeat();
    if (this.mode === 'paused' || this.mode === 'stepped') return Math.max(0, this.lastBeat);
    return -1;
  }
}

export const playback = new Playback();
