// Tempo + transport READOUT — a PROJECTION/ROUTER, never a host clock.
//
// Kanopi holds NO authoritative clock (contract `kronos-transport.md`). This store keeps
// the public shape the UI + snapshot already use (`state.{bpm,beatsPerBar,playing,paused}`,
// `setBpm`/`setTimeSignature`/`tap`/`play`/`stop`/`toggle`) but owns NO transport state
// machine and NO clock object:
//   • bpm = the live tempo when a Kronos handle exists (`transport.tempo`, the authority),
//     else the user's LOCAL typed/tapped tempo if any, else `null` (nothing live + no input
//     → no tempo to show; the readout displays « — », it does NOT invent a host default like
//     the former 128). `setBpm` records the user's local value AND fans out to the runtimes
//     (which retune the live handle), so the shown value and the heard tempo never drift.
//   • beatsPerBar = a persisted SESSION VALUE (Kronos has no time signature).
//   • playing/paused = DERIVED from Kronos's Transport state (`kronosCursor.state`). No host
//     flag, no second FSM.
//   • play/stop/toggle = ROUTE to `playback` (the transport projection on Kronos). No host
//     clock is started/stopped here.

import type { ClockState } from '../lib/core';
import { kronosCursor } from './kronos-cursor.svelte';
import { getAdapter, listRuntimes } from '../lib/runtimes/registry';
import { core } from '../lib/core';
import { playback } from './playback.svelte';

const DEFAULT_BEATS_PER_BAR = 4;

// Garde-fou de SAISIE utilisateur (D10) — borne le tempo qu'on TAPE/RÈGLE à la main à une
// plage musicalement sensée. Ce n'est PAS une autorité de scène ni une valeur sourcée amont :
// le tempo d'une scène vient de BPx (`@mm` déclaré ou défaut moteur, projeté sur `tree.metadata.tempo`).
// Ce clamp ne s'applique QU'à l'entrée locale (`setBpm`/`tap`), jamais au tempo projeté d'une scène.
function clampBpm(n: number): number {
  return Math.max(20, Math.min(300, Math.round(n * 10) / 10));
}

class ClockStore {
  /** User's LOCAL typed/tapped tempo (D10 — the only legitimate host-owned tempo: input
   *  before/without a scene). `null` until the user sets one; a live scene's tempo always
   *  supersedes it in the readout. Never a fabricated default — no host « 128 ». */
  #tempo = $state<number | null>(null);
  /** Persisted SESSION time signature numerator (Kronos has no signature → kept here). */
  #beatsPerBar = $state(DEFAULT_BEATS_PER_BAR);
  #tapTimes: number[] = [];

  /** READOUT, derived — never a host authority. bpm: the live handle's tempo when a scene is
   *  loaded (the authority), else the user's local typed/tapped value, else `null` (nothing to
   *  show — the UI renders « — »). playing/paused: PROJECTED from Kronos's Transport state. */
  state = $derived<ClockState>({
    bpm: kronosCursor.active ? kronosCursor.tempo : this.#tempo,
    beatsPerBar: this.#beatsPerBar,
    playing: kronosCursor.active != null && kronosCursor.state === 'running',
    paused: kronosCursor.active != null && kronosCursor.state === 'paused'
  });

  play() {
    playback.play();
  }
  stop() {
    playback.stop();
  }
  toggle() {
    if (this.state.playing) playback.stop();
    else playback.play();
  }

  /** Set the tempo: persist the session value AND retune every runtime live (the live Kronos
   *  handle warps in place via its adapter's `setBpm`, so display + heard tempo stay coherent).
   *  A no-op on an unchanged tempo so a `.bps` that re-applies its own `@mm` on every replay
   *  doesn't churn the runtimes for nothing. */
  setBpm(n: number) {
    const bpm = clampBpm(n);
    if (this.#tempo === bpm) return;
    this.#tempo = bpm;
    for (const id of listRuntimes()) {
      getAdapter(id)?.setBpm?.(bpm, (e) => core.console.push(e));
    }
  }

  setTimeSignature(beatsPerBar: number) {
    const n = Math.max(1, Math.min(32, Math.round(beatsPerBar)));
    if (this.#beatsPerBar === n) return;
    this.#beatsPerBar = n;
  }

  tap() {
    const now = performance.now();
    this.#tapTimes.push(now);
    this.#tapTimes = this.#tapTimes.filter((t) => now - t < 2500);
    if (this.#tapTimes.length >= 2) {
      const deltas: number[] = [];
      for (let i = 1; i < this.#tapTimes.length; i++) {
        deltas.push(this.#tapTimes[i] - this.#tapTimes[i - 1]);
      }
      const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      this.setBpm(60000 / avg);
    }
  }
}

export const clock = new ClockStore();
