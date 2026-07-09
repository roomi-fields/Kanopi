// KAN-UX3 — the ONE application path of the mixer VOLUME intent onto the live
// AudioRuntime (runtime-audio gain API, contract [651]: setMasterGain/
// setMasterMuted/setActorGain — linear 0..1, effective = actor × master, the
// anti-click ramp lives IN the runtime).
//
// The host sends the RAW persisted intent and owns no audio node (architecture
// law: Kanopi renders nothing). The AudioRuntime is rebuilt on every eval, so
// `real-core` re-projects the snapshot at the SAME hook points as the mixer
// mute (actors publish + replay); the store calls it on every live slider move.
// Runtime-side, levels + master mute survive `stop()`/`reset()` (adapter.js
// docstring) — re-applying is idempotent.

import { mixerIntent } from './mixer-intent';
import { audioGainControl } from '../runtimes/kronos-audio';

/** Project the persisted mixer intent (master volume/mute + per-actor volumes)
 *  onto the CURRENT AudioRuntime. No-op when no runtime is live (stopped,
 *  headless, or a test sink overrode the audio output). */
export function applyMixerGains(): void {
  const gain = audioGainControl();
  if (!gain) return;
  const snap = mixerIntent.snapshot();
  gain.setMasterGain(snap.master.volume);
  gain.setMasterMuted(snap.master.muted);
  for (const [name, ch] of Object.entries(snap.actors)) {
    gain.setActorGain(name, ch.volume);
  }
}
