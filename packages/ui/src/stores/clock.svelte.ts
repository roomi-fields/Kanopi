// Tempo + transport READOUT — a PROJECTION/ROUTER, never a host clock.
//
// Kanopi holds NO authoritative clock (contract `kronos-transport.md`). This store keeps
// the public shape the UI + snapshot already use (`state.{bpm,beatsPerBar,playing,paused}`,
// `setBpm`/`tap`) but owns NO transport state machine and NO clock object:
//   • bpm = the live tempo when a Kronos handle exists (`transport.tempo`, the authority),
//     else the user's LOCAL typed/tapped tempo if any, else `null` (nothing live + no input
//     → no tempo to show; the readout displays « — », it does NOT invent a host default like
//     the former 128). `setBpm` records the user's local value AND fans out to the runtimes
//     (which retune the live handle), so the shown value and the heard tempo never drift.
//   • beatsPerBar = DERIVED from the live scene's meter (`kronosCursor.active.beatsPerBar` =
//     `DeriveResult.meter`, BPx authority). The host holds NO copy (KAN-C09) — reads it live;
//     no scene → default 4. No `setTimeSignature` (dead input), no pushed `setMeterSink` copy.
//   • playing/paused = DERIVED from `playback.mode` (the SINGLE projection of Kronos's
//     Transport state). No host flag, no second FSM, no parallel re-mapping of the authority.
// Transport COMMANDS (play/stop/toggle) are NOT relayed here — the palette + keybindings
// route straight to `playback` (the transport projection on Kronos).

import type { ClockState } from '../lib/core';
import { kronosCursor } from './kronos-cursor.svelte';
import { playback } from './playback.svelte';
import { getAdapter, listRuntimes } from '../lib/runtimes/registry';
import { setUserTempo } from '../lib/runtimes/bpx-adapter';
import { retuneCodeVoiceTransport } from '../lib/runtimes/kronos-codevoice';
import { core } from '../lib/core';

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
  #tapTimes: number[] = [];

  /** READOUT, derived — never a host authority. bpm: the live handle's tempo when a scene is
   *  loaded (the authority), else the user's local typed/tapped value, else `null` (nothing to
   *  show — the UI renders « — »). playing/paused: derived from `playback.mode` (the single
   *  projection of Kronos's Transport state) — NOT a 2nd parallel mapping of the authority (F29). */
  state = $derived<ClockState>({
    // `|| this.#tempo` : un transport SANS tempo (voie B, voix autonome sans tempo de
    // session — Kronos `derivedTempo 0` = « temps de scène pur ») expose tempo 0 ; il n'y a
    // alors RIEN d'honnête à afficher → repli sur la saisie utilisateur, sinon « — ».
    // JAMAIS un « 0.0 BPM » fabriqué : 0 n'est pas un tempo entendu.
    bpm: kronosCursor.active ? kronosCursor.tempo || this.#tempo : this.#tempo,
    // Le mètre AFFICHÉ DÉRIVE du mètre de la scène vivante (kronosCursor = DeriveResult.meter,
    // autorité BPx) — l'hôte LIT, il ne tient plus de COPIE poussée (KAN-C09, [562]). Aucune
    // scène → défaut 4. Plus de setTimeSignature (input mort) ni de setMeterSink→clock.
    beatsPerBar: kronosCursor.active?.beatsPerBar ?? DEFAULT_BEATS_PER_BAR,
    playing: playback.mode === 'playing',
    paused: playback.mode === 'paused'
  });

  /** Set the tempo: persist the session value AND retune every runtime live (the live Kronos
   *  handle warps in place via its adapter's `setBpm`, so display + heard tempo stay coherent).
   *  A no-op on an unchanged tempo so a `.bps` that re-applies its own `@mm` on every replay
   *  doesn't churn the runtimes for nothing. */
  setBpm(n: number): number {
    const bpm = clampBpm(n);
    // RETURN the applied (clamped) value even on a no-op: the caller writes it into the
    // scene's `@tempo` directive (TransportCluster), and MUST use this value — NOT the
    // readout `state.bpm`, which while a scene plays mirrors `kronosCursor.tempo` (the live
    // handle) that has not warped yet at this synchronous point → it would write the tempo
    // of the PREVIOUS change (one-change lag). Returning the applied value keeps UI ⇄ text
    // in lockstep (Model 1 « warp lisse + synchro texte », décision Romain 2026-07-01).
    //
    // No-op guard on the tempo actually HEARD (the live Kronos handle when a scene plays, else
    // the session value) — NOT the session `#tempo` alone. `#tempo` persists ACROSS scenes
    // (D10), so a value left over from a previous scene could equal `bpm` while the current
    // scene plays a DIFFERENT tempo → the guard would skip the warp, leaving the audio + UI
    // unchanged while the text got rewritten (bug rapporté Romain 2026-07-01). Keying on the
    // heard tempo makes the warp fire whenever what's heard differs from what's requested.
    const heard = kronosCursor.active ? kronosCursor.tempo : this.#tempo;
    this.#tempo = bpm;
    // USER input is the only legitimate host-owned tempo (D10): record it (and `userTempo`)
    // ALWAYS, even when the runtime fan is skipped below — the session value must reflect what
    // the user typed. The SCENE tempo channel (`setSceneTempo`) NEVER routes here → `userTempo`
    // is set on real type/tap ONLY.
    setUserTempo(bpm);
    // Skip the runtime fan (warp) ONLY when what's HEARD is already `bpm` — no churn. When the
    // heard tempo differs (incl. a stale-`#tempo` mismatch), the warp fires.
    if (heard === bpm) return bpm;
    for (const id of listRuntimes()) {
      getAdapter(id)?.setBpm?.(bpm, (e) => core.console.push(e));
    }
    // Voix AUTONOMES (voie B) : leur transport porte le tempo de session pour l'afficheur —
    // il doit suivre le warp (les moteurs, eux, viennent d'être retunés par le fan-out).
    retuneCodeVoiceTransport(bpm);
    return bpm;
  }

  /** SCENE tempo channel — the EFFECTIVE tempo the derivation ran at (BPx authority),
   *  routed here at eval. Distinct from user input: NO clamp (a scene may declare any
   *  tempo — the [20,300] guard is for typed/tapped input only), NO write to `#tempo`
   *  (the readout already reads the live Kronos handle's tempo while a scene plays), and
   *  it must NEVER seed `userTempo` (that would leak this scene's tempo into the next
   *  no-`@mm` scene). It only fans the live retune out to the runtimes, like `setBpm`. */
  setSceneTempo(bpm: number) {
    for (const id of listRuntimes()) {
      getAdapter(id)?.setBpm?.(bpm, (e) => core.console.push(e));
    }
  }

  /** Returns the applied BPM once ≥2 taps establish a tempo, else `null` (first tap). The
   *  caller mirrors it into the scene `@tempo` — same reason as `setBpm`: it must use the
   *  applied value, not the lagging readout. */
  tap(): number | null {
    const now = performance.now();
    this.#tapTimes.push(now);
    this.#tapTimes = this.#tapTimes.filter((t) => now - t < 2500);
    if (this.#tapTimes.length >= 2) {
      // Keep only POSITIVE intervals (F27). `performance.now()` is clamped for cross-origin
      // isolation, so two quick taps can collapse onto the SAME timestamp → a 0 (or, if the
      // clock ran backwards, negative) delta. Averaging those gave `60000/0 = Infinity`, which
      // `clampBpm` pinned to 300 → the tap became a silent jump to the max tempo. Dropping the
      // degenerate deltas averages only the real intervals; if none survive (every retained tap
      // shares a timestamp), the gesture carries no tempo → keep the current one (return null).
      const deltas: number[] = [];
      for (let i = 1; i < this.#tapTimes.length; i++) {
        const d = this.#tapTimes[i] - this.#tapTimes[i - 1];
        if (d > 0) deltas.push(d);
      }
      if (deltas.length === 0) return null;
      const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      return this.setBpm(60000 / avg);
    }
    return null;
  }
}

export const clock = new ClockStore();
