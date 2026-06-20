// Transport loop controls — session-global toggles read by the bp3 adapter at
// playback start. These mirror the old dispatcher's `loop` / `_reDerive` knobs:
//
//   - loop: ON  → the scene repeats at each end-of-cycle boundary (default,
//                 the historic behaviour); OFF → it plays once then the
//                 transport stops at the end of the derivation.
//   - reRandom: when looping, ON → the grammar is RE-DERIVED at each cycle
//                 boundary (weighted/random rules re-roll, so the motif varies
//                 tour to tour); OFF (default) → the SAME derivation replays
//                 each cycle (deterministic).
//
// Kept as a tiny standalone store so the toggles persist for the session and
// are read fresh at every eval/start — the adapter snapshots them when it calls
// `dispatcher.start(...)`.
class TransportStore {
  loop = $state(true);
  reRandom = $state(false);

  // Sinks the bpx adapter wires so a toggle reaches the PLAYING dispatchers live
  // (effective next cycle) — no need to re-evaluate to pick up the new setting.
  private loopSink?: (on: boolean) => void;
  private reRandomSink?: (on: boolean) => void;
  setLoopSink(fn: (on: boolean) => void) {
    this.loopSink = fn;
  }
  setReRandomSink(fn: (on: boolean) => void) {
    this.reRandomSink = fn;
  }

  toggleLoop() {
    this.loop = !this.loop;
    this.loopSink?.(this.loop);
  }
  toggleReRandom() {
    this.reRandom = !this.reRandom;
    this.reRandomSink?.(this.reRandom);
  }
}

export const transport = new TransportStore();
