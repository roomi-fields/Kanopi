// The ACTIVE Kronos playing cursor, surfaced from the audio runtime to the UI.
//
// When `audio-engine=kronos`, the Kronos audio runtime (kronos-audio.ts) drives
// the real sound AND owns the playhead. The timeline cursor must read THAT
// playhead — not the central rAF clock — so the drawn position is aligned to the
// heard audio (no ~1-note lag) and monotone from 0 (no backward jump at launch).
//
// The runtime sets this handle when it starts a kronos scene and clears it when
// playback stops. The timeline reads `position()` once per rAF tick. Only the
// HANDLE reference is reactive (set/clear re-runs readers); the position itself
// is sampled imperatively each frame, driven by the central clock's tick — the
// same coalescing the timeline already uses.

import type { KronosCursorBeat } from '../lib/runtimes/kronos-audio';

/** What the timeline needs off the active Kronos cursor. */
export interface KronosCursorView {
  /** Scene seconds (loop-folded) at the SCHEDULED instant (`currentTime`). */
  position(): number;
  /** Scene seconds (loop-folded) aligned to the HEARD audio (latency-compensated):
   *  what the drawn cursor must use so it sits on the note being heard, not the one
   *  being scheduled ~one output buffer ahead. */
  displayPosition(): number;
  /** Beat/bar readout (loop-folded). */
  beatPosition(): KronosCursorBeat;
}

class KronosCursorStore {
  /** The currently-playing Kronos cursor, or null when no kronos scene plays. */
  active = $state<KronosCursorView | null>(null);

  set(handle: KronosCursorView | null) {
    this.active = handle;
  }
}

export const kronosCursor = new KronosCursorStore();
