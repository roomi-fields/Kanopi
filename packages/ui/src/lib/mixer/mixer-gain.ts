// KAN-UX3 / KAN-UX3-B — mixer-gain: the ONE application path of the mixer VOLUME intent onto
// every LIVE output runtime that exposes the ratified gain API (contract
// hote-runtimes-sortie.md:51, amendement 2026-07-09: setMasterGain/setMasterMuted/
// setActorGain — linear 0..1, effective = actor x master — IDENTICAL on runtime-audio,
// runtime-midi and runtime-osc, confirmed by all three teams [661]-[665]).
//
// The host sends the RAW persisted intent and owns no output node (architecture law: Kanopi
// renders nothing). Each runtime is rebuilt on every eval/play, so `real-core` re-projects the
// snapshot at the SAME hook points as the mixer mute (actors publish + replay); the store calls
// it on every live slider move. Runtime-side, levels + master mute survive `stop()`/`reset()`
// (module-level for runtime-midi, re-applied at rebuild for runtime-audio/runtime-osc) —
// re-applying is idempotent either way.
//
// Per-actor gain is sent to EVERY live control for EVERY actor in the snapshot, not scoped to
// "the runtime that owns this actor": each runtime keeps its OWN gain map keyed by actor name,
// so a name it never routes an event for is simply inert dead state — no cross-talk, and no
// need to duplicate the actor->transport mapping (already the UI's job for the disabled-slider
// predicate below) in here.
import { mixerIntent } from './mixer-intent';
import {
  audioGainControl,
  midiGainControl,
  oscGainControl,
  type AudioGainControl
} from '../runtimes/kronos-audio';

/** Every currently-live gain control (audio/midi/osc — codevoices out of scope, dmx awaiting
 *  upstream, per the same contract). */
function liveGainControls(): AudioGainControl[] {
  return [audioGainControl(), midiGainControl(), oscGainControl()].filter(
    (g): g is AudioGainControl => g !== null
  );
}

/** Project the persisted mixer intent (master volume/mute + per-actor volumes) onto every
 *  live output runtime. No-op when none is live (stopped, headless, or test sinks override). */
export function applyMixerGains(): void {
  const controls = liveGainControls();
  if (controls.length === 0) return;
  const snap = mixerIntent.snapshot();
  for (const gain of controls) {
    gain.setMasterGain(snap.master.volume);
    gain.setMasterMuted(snap.master.muted);
    for (const [name, ch] of Object.entries(snap.actors)) {
      gain.setActorGain(name, ch.volume);
    }
  }
}

// KAN-UX3-B — `applyMixerGains` now reaches audio/midi/osc. An actor whose declared output
// transport (`Actor.outputTransport`, read off BPx's `output.runtime`) is anything else (dmx or
// a custom @devices name not yet confirmed) has NOTHING wired to a slider move; same story for
// a code voice, which renders through its own graph and never registers on any of these gain
// buses at all (its `outputTransport` is irrelevant — `isCodeVoiceRuntime(a.runtime)` gates it
// upstream of this check, in the components). Absent/undeclared transport = the AST's implicit
// default, 'audio' (the webaudio bus) — reaches, not gated.
export function reachesGainBus(outputTransport: string | undefined): boolean {
  return (
    outputTransport === undefined ||
    outputTransport === 'audio' ||
    outputTransport === 'webaudio' ||
    outputTransport === 'midi' ||
    outputTransport === 'osc'
  );
}

/** One message, parameterized by what the actor is instead routed to — covers both the
 *  code-voice case ('voix de code') and a native actor on dmx/a custom @devices name
 *  identically. */
export function mixerSliderDisabledTitle(kind: string): string {
  return `acteur routé ${kind} — pas de contrôle de volume depuis Kanopi (en attente d'une API d'entrée côté runtime)`;
}
