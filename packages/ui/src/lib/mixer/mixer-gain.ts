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
  codeVoicesGainControl,
  type AudioGainControl
} from '../runtimes/kronos-audio';

/** Every currently-live gain control (audio/midi/osc/codevoices — dmx awaiting upstream, per the
 *  same contract). The codevoices control is a SINGLE object diffusing internally to all 7 voice
 *  adapters; only strudel/tidal/csound actually react (see `codeVoiceReachesGainBus`). */
function liveGainControls(): AudioGainControl[] {
  return [audioGainControl(), midiGainControl(), oscGainControl(), codeVoicesGainControl()].filter(
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
// a custom @devices name not yet confirmed) has NOTHING wired to a slider move. Absent/undeclared
// transport = the AST's implicit default, 'audio' (the webaudio bus) — reaches, not gated. A code
// voice does NOT go through this check — see `codeVoiceReachesGainBus` below, gated in the
// components by `isCodeVoiceRuntime(a.runtime)` before either predicate applies.
export function reachesGainBus(outputTransport: string | undefined): boolean {
  return (
    outputTransport === undefined ||
    outputTransport === 'audio' ||
    outputTransport === 'webaudio' ||
    outputTransport === 'midi' ||
    outputTransport === 'osc'
  );
}

/** Mirror of `reachesGainBus`, for CODE-VOICE runtimes. Only strudel/tidal/csound actually
 *  implement `setActorGain`/`setMasterGain`/`setMasterMuted` on their individual adapter (the
 *  runtime-codevoices package diffuses with `adapter.setActorGain?.(...)` — hydra/p5/mercury/js
 *  have no such method, so the call is a silent no-op for them: no API, not a "not confirmed yet"
 *  gap like dmx). */
export function codeVoiceReachesGainBus(runtime: string): boolean {
  return runtime === 'strudel' || runtime === 'tidal' || runtime === 'csound';
}

/** One message, parameterized by what the actor is instead routed to — covers both the
 *  code-voice case ('voix de code') and a native actor on dmx/a custom @devices name
 *  identically. */
export function mixerSliderDisabledTitle(kind: string): string {
  return `acteur routé ${kind} — pas de contrôle de volume depuis Kanopi (en attente d'une API d'entrée côté runtime)`;
}

/** Title for an ACTIVE (non-disabled) slider. csound's gain lands on a control channel
 *  (`gain_<acteur>`/`gain_master`) the AUTHOR's orchestra must read via `chnget` — without that
 *  read, moving the slider has no audible effect, so its title says so explicitly. Every other
 *  runtime (including strudel/tidal, whose gain reaches a real bus) gets the generic label. */
export function mixerSliderActiveTitle(name: string, runtime: string): string {
  if (runtime === 'csound') {
    return `volume ${name} — effectif seulement si l'orchestre lit le canal gain_${name} (chnget)`;
  }
  return `volume ${name}`;
}
