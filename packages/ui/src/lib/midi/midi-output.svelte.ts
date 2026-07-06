/**
 * MIDI output device selector — DISPLAY-ONLY reactive store.
 *
 * Contract: hub/contrats/kanopi-runtime-midi.md §3 (2bcbdc9). This module NEVER opens its
 * own Web MIDI access — it delegates entirely to a `MidiRuntime` instance (the SAME factory
 * `bpx-adapter.ts` uses per scene). runtime-midi owns a module-level SINGLETON access, so
 * this panel's instance and a scene's play-time instance share the same access + the same
 * selected device (persisted by runtime-midi, not here). Selecting an ID here is picked up
 * by the next play's `status()` gate — the host retains nothing.
 */
import { createMidiRuntime } from 'runtime-midi';

const midi = createMidiRuntime({});

let outputs: { id: string; name: string }[] = $state([]);
let selectedId: string | null = $state(null);
let accessGranted: boolean | null = $state(null);
let busy = $state(false);
let unbindDevicesChanged: (() => void) | null = null;

export const midiOutput = {
  get outputs() {
    return outputs;
  },
  get selectedId() {
    return selectedId;
  },
  get accessGranted() {
    return accessGranted;
  },
  get busy() {
    return busy;
  },

  /** Opens (or reuses) runtime-midi's shared access and lists outputs. Call from a user
   *  gesture. Returns runtime-midi's own `{ok, reason}` — display-only, no host access. */
  async requestAccess(): Promise<{
    ok: boolean;
    reason: null | 'no-webmidi' | 'no-output' | 'denied';
  }> {
    busy = true;
    try {
      const res = await midi.init();
      accessGranted = res.ok;
      outputs = midi.listOutputs();
      unbindDevicesChanged?.();
      unbindDevicesChanged = midi.onDevicesChanged((next) => {
        outputs = next;
      });
      return res;
    } finally {
      busy = false;
    }
  },

  /** Select a MIDI output by ID (or null to clear). Persists in runtime-midi's session
   *  singleton — a scene's next play resolves it via its own `status()`. */
  select(id: string | null) {
    midi.setOutput(id);
    selectedId = id;
  }
};
