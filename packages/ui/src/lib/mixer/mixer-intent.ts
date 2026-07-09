/**
 * KAN-UX3 — Mixer intent: the performer's mix (master + per-actor volume/mute).
 *
 * This is USER INPUT — the one category of local mutable state the host may own
 * (contract `kanopi-architecture.md`: everything else is a projection). It is a
 * PERSISTENT layer ON TOP of the arming layer (actor store `active`/`muted`,
 * cf. KAN-MUTE): never cleared by the replay `reset()` nor the arming re-sync,
 * keyed by actor NAME so it survives re-evals and scene reloads (localStorage).
 *
 * Pure module, zero project imports — `real-core` consults it synchronously
 * (replay re-sync, arm guards) without a module cycle. The reactive projection
 * for the UI lives in `stores/mixer.svelte.ts`, which also routes the intent
 * through the EXISTING live primitives (arm/disarm orchestrated voice). The
 * host renders nothing and touches no audio node.
 *
 * VOLUME (and the master mute) is applied through runtime-audio's gain API
 * (contract [651]: setMasterGain/setMasterMuted/setActorGain, linear 0..1,
 * effective = actor × master) — see `mixer-gain.ts`, the ONE application path.
 */

export interface ChannelIntent {
  /** Linear 0..1, applied via runtime-audio's gain API (effective = actor × master). */
  volume: number;
  muted: boolean;
}

export interface MixerSnapshot {
  master: ChannelIntent;
  actors: Record<string, ChannelIntent>;
}

export type MixerIntent = ReturnType<typeof createMixerIntent>;

type Listener = (snap: MixerSnapshot) => void;
type Unsubscribe = () => void;

const STORAGE_KEY = 'kanopi.mixer.v1';
const DEFAULT_CHANNEL: ChannelIntent = { volume: 1, muted: false };

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(1, Math.max(0, v));
}

function sanitizeChannel(raw: unknown): ChannelIntent {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CHANNEL };
  const r = raw as Partial<ChannelIntent>;
  return {
    volume: clamp01(typeof r.volume === 'number' ? r.volume : 1),
    muted: r.muted === true
  };
}

export function createMixerIntent(storageKey: string = STORAGE_KEY) {
  let master: ChannelIntent = { ...DEFAULT_CHANNEL };
  let actors: Record<string, ChannelIntent> = {};

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MixerSnapshot>;
      master = sanitizeChannel(parsed?.master);
      if (parsed?.actors && typeof parsed.actors === 'object') {
        for (const [name, ch] of Object.entries(parsed.actors)) {
          actors[name] = sanitizeChannel(ch);
        }
      }
    }
  } catch {
    /* localStorage unavailable (tests, private mode) or corrupt — defaults */
  }

  const listeners = new Set<Listener>();

  function snapshot(): MixerSnapshot {
    const copy: Record<string, ChannelIntent> = {};
    for (const [name, ch] of Object.entries(actors)) copy[name] = { ...ch };
    return { master: { ...master }, actors: copy };
  }

  function emit() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(snapshot()));
    } catch {
      /* best-effort persistence only */
    }
    const s = snapshot();
    for (const cb of listeners) cb(s);
  }

  function entry(name: string): ChannelIntent {
    return actors[name] ?? DEFAULT_CHANNEL;
  }

  return {
    snapshot,
    subscribe(cb: Listener): Unsubscribe {
      cb(snapshot());
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    masterMuted(): boolean {
      return master.muted;
    },
    /** Effective mixer mute for an actor: master mute OR its own strip mute. */
    mutedFor(name: string): boolean {
      return master.muted || !!actors[name]?.muted;
    },
    actorEntry(name: string): ChannelIntent {
      return { ...entry(name) };
    },
    setMasterMuted(muted: boolean) {
      if (master.muted === muted) return;
      master = { ...master, muted };
      emit();
    },
    setMasterVolume(volume: number) {
      const v = clamp01(volume);
      if (master.volume === v) return;
      master = { ...master, volume: v };
      emit();
    },
    setActorMuted(name: string, muted: boolean) {
      if (entry(name).muted === muted) return;
      actors = { ...actors, [name]: { ...entry(name), muted } };
      emit();
    },
    setActorVolume(name: string, volume: number) {
      const v = clamp01(volume);
      if (entry(name).volume === v) return;
      actors = { ...actors, [name]: { ...entry(name), volume: v } };
      emit();
    }
  };
}

/** The app-wide mixer intent (persisted under `kanopi.mixer.v1`). */
export const mixerIntent = createMixerIntent();

/** Effective mixer mute for an actor (master OR its strip) — the sync guard
 *  `real-core` consults at arm/replay/publish so the mixer layer always wins. */
export function mixerMutedFor(name: string): boolean {
  return mixerIntent.mutedFor(name);
}
