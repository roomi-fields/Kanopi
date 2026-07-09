// KAN-UX3 — Reactive projection of the mixer intent (master + per-actor
// volume/mute) + LIVE application of the mute through the EXISTING primitives.
//
// The AUTHORITY is `lib/mixer/mixer-intent.ts` (user input, persisted); this
// store only mirrors its snapshots for the UI (same pattern as ActorsStore over
// `core.actors`). Application routes through `arm/disarmOrchestratedActor`
// (Kronos scheduler gate via `setNoteMuted` + code-voice stop/eval) — the host
// mutes at the intent level, it touches no audio node itself.
//
// Layering: the mixer mute is a PERSISTENT performer layer on top of the arming
// layer (actor store `active`/`muted`). Un-muting the mixer never re-arms an
// actor the arming layer holds silent; conversely `real-core` guards its arm
// paths with `mixerMutedFor` so an arming change never overrides the mixer.

import {
  mixerIntent,
  mixerMutedFor,
  type ChannelIntent,
  type MixerSnapshot
} from '../lib/mixer/mixer-intent';
import {
  armOrchestratedActor,
  disarmOrchestratedActor,
  isOrchestratedActor
} from '../lib/runtimes/bpx-adapter';
import { actors } from './actors.svelte';

const DEFAULT_CHANNEL: ChannelIntent = { volume: 1, muted: false };

class MixerStore {
  master = $state<ChannelIntent>({ ...DEFAULT_CHANNEL });
  #actors = $state<Record<string, ChannelIntent>>({});

  constructor() {
    // Fires immediately with the persisted snapshot, then on every change.
    mixerIntent.subscribe((s: MixerSnapshot) => {
      this.master = s.master;
      this.#actors = s.actors;
    });
  }

  actorEntry(name: string): ChannelIntent {
    return this.#actors[name] ?? DEFAULT_CHANNEL;
  }

  isActorMuted(name: string): boolean {
    return !!this.#actors[name]?.muted;
  }

  toggleActorMuted(name: string) {
    this.setActorMuted(name, !this.isActorMuted(name));
  }

  setActorMuted(name: string, muted: boolean) {
    mixerIntent.setActorMuted(name, muted);
    this.#apply(name);
  }

  toggleMasterMuted() {
    this.setMasterMuted(!this.master.muted);
  }

  setMasterMuted(muted: boolean) {
    mixerIntent.setMasterMuted(muted);
    // Fan the master mute out over the live actors through the SAME per-actor
    // primitive (there is no upstream master-mute API — reported gap; a mono
    // scene without actors is therefore not covered by the master mute yet).
    for (const a of actors.list) this.#apply(a.name);
  }

  /** Route the composed intent to the live voice. Mixer says muted → disarm.
   *  Mixer clear → re-arm ONLY if the arming layer (actor store) allows it. */
  #apply(name: string) {
    if (!isOrchestratedActor(name)) return;
    if (mixerMutedFor(name)) {
      disarmOrchestratedActor(name);
      return;
    }
    const a = actors.list.find((x) => x.name === name);
    if (a && a.active && !a.muted) armOrchestratedActor(name);
  }
}

export const mixer = new MixerStore();
