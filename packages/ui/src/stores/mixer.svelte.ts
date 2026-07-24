// KAN-UX3 — Reactive projection of the mixer intent (master + per-actor
// volume/mute) + LIVE application through the EXISTING primitives.
//
// The AUTHORITY is `lib/mixer/mixer-intent.ts` (user input, persisted); this
// store only mirrors its snapshots for the UI (same pattern as ActorsStore over
// `core.actors`). Per-actor MUTE routes through `setOrchestratedActorMuted` →
// `kronosAudio.setActorMuted` → Kronos's own state machine, uniformly for notes
// AND code voices ([673]); VOLUMES and the MASTER mute route through
// runtime-audio's gain API (contract [651], via `applyMixerGains`) — the host
// mutes/levels at the intent level, it touches no audio node itself.
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
import { applyMixerGains } from '../lib/mixer/mixer-gain';
import { setOrchestratedActorMuted, isOrchestratedActor } from '../lib/runtimes/bpx-adapter';
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

  /** Actor VOLUME (0..1, linear) — distinct from the mute: gain 0 keeps the
   *  voice armed (inaudible), a mute removes the voice (contract [651]). */
  setActorVolume(name: string, volume: number) {
    mixerIntent.setActorVolume(name, volume);
    applyMixerGains();
  }

  toggleMasterMuted() {
    this.setMasterMuted(!this.master.muted);
  }

  /** MASTER mute = geste de CONSOLE, UN SEUL canal (arbitrage architecte 2026-07-24, [896]) :
   *  `applyMixerGains` → `setMasterMuted` sur CHAQUE sortie vivante (mixer-gain.ts:45), l'API
   *  d'intention de mixage du contrat hote-runtimes-sortie.md:51 — réglage de console qui
   *  SURVIT au stop→play et à `reset()`.
   *
   *  L'essaimage par acteur (`#apply` en boucle) est SUPPRIMÉ : il écrivait un mute de
   *  TRANSPORT (file Kairos → Kronos résout) pour un geste de console, ce qui faisait perdre
   *  au mute maître sa propriété gravée de réglage survivant au transport et désynchronisait
   *  les deux états dès qu'on touchait un acteur après avoir coupé le maître. Le canal console
   *  couvre déjà les quatre sorties, chacune implémentant la méthode (runtime-audio
   *  adapter.js:905, runtime-MIDI midi-runtime.js:212, runtime-OSC adapter.js:286,
   *  runtime-codevoices code-voices-runtime.ts:746) ; et il agit PAR SORTIE, donc une scène
   *  mono sans acteur publié est couverte par construction. */
  setMasterMuted(muted: boolean) {
    mixerIntent.setMasterMuted(muted);
    applyMixerGains();
  }

  /** Master VOLUME (0..1, linear, multiplies every actor). Sent raw — the
   *  anti-click ramp is the runtime's job, no host smoothing. */
  setMasterVolume(volume: number) {
    mixerIntent.setMasterVolume(volume);
    applyMixerGains();
  }

  /** Route the composed intent through Kronos's own mute state. Mixer says muted
   *  → mute. Mixer clear → un-mute ONLY if the arming layer (actor store) allows it. */
  #apply(name: string) {
    if (!isOrchestratedActor(name)) return;
    if (mixerMutedFor(name)) {
      setOrchestratedActorMuted(name, true);
      return;
    }
    const a = actors.list.find((x) => x.name === name);
    if (a && a.active) setOrchestratedActorMuted(name, false);
  }
}

export const mixer = new MixerStore();
