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

  toggleLoop() {
    this.loop = !this.loop;
  }
  toggleReRandom() {
    this.reRandom = !this.reRandom;
  }
}

export const transport = new TransportStore();
