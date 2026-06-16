// Device library (@devices) — resolution + voice↔device compatibility.
//
// A voice (`@actor`) declares WHERE it outputs via `transport.<name>`. The name
// points at a TYPED device in this library (DEVICES_SPEC.md). Kanopi resolves
// the name (bpscript carries it opaque) and verifies, BEFORE routing, that the
// voice's output type is accepted by the device's type (§3). An incompatible
// voice is refused at eval — never a silent skip.
//
// Glue: the bundled library is shipped as raw JSON (same `?raw` pattern as the
// `-se` aux files in bp3-aux.ts) and parsed here.

import type { VoiceOutputType } from '../runtimes/adapter';
import bundledDevicesRaw from '../../../../library/devices.json?raw';

// DEVICES_SPEC §1 — a device is name + type + connection params.
export type DeviceType = 'midi' | 'audio' | 'osc' | 'dmx' | 'video' | 'text';

export interface Device {
  /** unique name referenced by `transport.<name>` (kebab/lower) */
  name: string;
  /** device class — fixes the compatible voice output types (§3) */
  type: DeviceType;
  /** connection params, type-dependent (§2). Optional = type defaults. */
  params?: Record<string, unknown>;
  /** human-readable UI label (else = name) */
  label?: string;
}

// DEVICES_SPEC §3 — device type → accepted voice output types. The table is
// authoritative: a voice whose outputType ∉ the device's set is refused.
const ACCEPTED: Record<DeviceType, ReadonlySet<VoiceOutputType>> = {
  midi: new Set<VoiceOutputType>(['notes']),
  audio: new Set<VoiceOutputType>(['notes', 'signal']),
  osc: new Set<VoiceOutputType>(['control', 'notes']),
  dmx: new Set<VoiceOutputType>(['light']),
  video: new Set<VoiceOutputType>(['visual']),
  // text is the readable-fallback sink: it accepts `text` AND everything else
  // (any voice can be dumped to the symbolic console). DEVICES_SPEC §3.
  text: new Set<VoiceOutputType>(['text', 'notes', 'signal', 'visual', 'control', 'light'])
};

/** The §3 accept set for a device type. */
export function acceptedOutputTypes(type: DeviceType): ReadonlySet<VoiceOutputType> {
  return ACCEPTED[type];
}

// The `midi` device ALWAYS exists by default (DEVICES_SPEC §4): a voice without
// an explicit transport, or `transport.midi`, targets it. Guaranteed even if the
// bundled JSON or a user overlay omits it.
const DEFAULT_MIDI: Device = { name: 'midi', type: 'midi', label: 'MIDI (default)' };

// `webaudio` is the retro-compat synonym of the default `audio` device (§5): old
// `.bps`/sessions written `transport.webaudio` resolve to the same audio device.
const ALIASES: Record<string, string> = { webaudio: 'audio' };

function parseBundled(raw: string): Device[] {
  try {
    const json = JSON.parse(raw) as { devices?: Device[] };
    return Array.isArray(json.devices) ? json.devices : [];
  } catch {
    return [];
  }
}

const bundled: Device[] = parseBundled(bundledDevicesRaw);

// User overlay (DEVICES_SPEC §4): persisted devices (localStorage / workspace
// config), merged OVER the bundled set (same `name` → user wins). The merge
// POINT is implemented; the persistence source is a TODO stub for beta — the
// settings UI (Hardware panel) is post-beta (§6). Wire a real source here when
// that panel ships; the rest of the module needs no change.
// TODO(post-beta §6): replace with the persisted user-device source.
function userOverlay(): Device[] {
  return [];
}

/**
 * The resolved device library: user overlay merged over bundled, keyed by name,
 * with the default `midi` guaranteed. Recomputed lazily; cheap enough that the
 * overlay can change without a cache-invalidation dance for beta.
 */
function deviceMap(): Map<string, Device> {
  const map = new Map<string, Device>();
  map.set(DEFAULT_MIDI.name, DEFAULT_MIDI);
  for (const d of bundled) map.set(d.name, d);
  for (const d of userOverlay()) map.set(d.name, d); // user wins on same name
  return map;
}

/**
 * Resolve `transport.<name>` → the typed device, applying the `webaudio`→`audio`
 * alias and guaranteeing the default `midi`. Unknown name → `undefined`; the
 * caller throws a clear error (DEVICES_SPEC §4: "appareil inconnu : <name>",
 * NEVER a silent skip).
 */
export function resolveDevice(name: string): Device | undefined {
  const map = deviceMap();
  const direct = map.get(name);
  if (direct) return direct;
  const aliased = ALIASES[name];
  return aliased ? map.get(aliased) : undefined;
}

/** Whether a voice of `outputType` is accepted by a device of `type` (§3). */
export function isCompatible(outputType: VoiceOutputType, type: DeviceType): boolean {
  return acceptedOutputTypes(type).has(outputType);
}

/** The full resolved device library (default midi + bundled + overlay). Read-only
 * browse for the Resources view; order is map insertion order. */
export function listDevices(): Device[] {
  return [...deviceMap().values()];
}
