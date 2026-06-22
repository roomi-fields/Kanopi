// The ACTIVE Kronos transport, surfaced from the audio runtime to the UI.
//
// Kronos owns the transport: its `Transport` is the SINGLE execution state machine
// AND the position authority (contract `kronos-transport.md`). Kanopi PROJECTS on it —
// it calls the commands and READS the state/position. This store is the bridge: it holds
// the active handle (whose `.transport` is the live Transport) and a REACTIVE MIRROR of
// `transport.state` (updated via `onStateChange`, display only — never an authority).
//
// The drawn position is sampled per-frame from `transport.position()`/`beatPosition()`
// (the cursor in running, the frozen position when paused) — never a host counter.

import type { Transport, TransportState } from '@kronos/core';
import type { KronosCursorBeat } from '../lib/runtimes/kronos-audio';

/** What the UI needs off the active Kronos handle. */
export interface KronosCursorView {
  /** The live Transport — commands (play/pause/stop/step/seek/…) + observable state. */
  transport: Transport;
  /** Scene seconds of the playhead (frozen-aware): the cursor in running, the frozen
   *  position when paused. Read per-frame by the timeline. */
  position(): number;
  /** Beat/bar readout (frozen-aware), for the transport display. */
  beatPosition(): KronosCursorBeat;
}

class KronosCursorStore {
  /** The currently-active Kronos handle, or null when no kronos scene is live. */
  active = $state<KronosCursorView | null>(null);
  /** REACTIVE PROJECTION of `transport.state` (`stopped|running|paused`). Mirrored from
   *  Kronos via `onStateChange` — the host reads this for the UI; it is never an
   *  authority (the truth is `active.transport.state`). */
  state = $state<TransportState>('stopped');
  #unsub: (() => void) | null = null;

  set(handle: KronosCursorView | null) {
    this.#unsub?.();
    this.#unsub = null;
    this.active = handle;
    if (handle?.transport) {
      // Capture the current state (the init `transport.play()` already fired before this
      // subscription), then mirror every later transition.
      this.state = handle.transport.state;
      this.#unsub = handle.transport.onStateChange((s) => {
        this.state = s;
      });
    } else {
      this.state = 'stopped';
    }
  }
}

export const kronosCursor = new KronosCursorStore();
