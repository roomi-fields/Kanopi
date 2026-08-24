// Device library (@devices) — resolution + voice↔device compatibility.
//
// A voice (`@actor`) declares WHERE it outputs via `out.<name>`. The name
// points at a TYPED device in this library (DEVICES_SPEC.md). Kanopi resolves
// the name (bpscript carries it opaque) and verifies, BEFORE routing, that the
// voice's output type is accepted by the device's type (§3). An incompatible
// voice is refused at eval — never a silent skip.
//
// Glue: the bundled library is shipped as raw JSON (same `?raw` pattern as the
// `-se` aux files in bp3-aux.ts) and parsed here.

import { LIBS } from 'bpscript/src/transpiler/libs-data.js';
import type { VoiceOutputType } from '../runtimes/adapter';
import bundledDevicesRaw from '../../../../library/devices.json?raw';
// The channel catalog is bpscript's, imported AS-IS (same pattern as
// bpx-adapter.ts:22's `LIBS.alphabets`) — directions (`in`/`out`) and default
// connection `params` are amont data, not a second copy kept here.
const coreJson = LIBS.core;

const CANAUX = coreJson.schema.channels;

// DEVICES_SPEC §1 — a device is name + type + connection params.
// `video` A ETE RETIRE (decision 2026-07-14-modele-producteur-canal-eval-transport.md:32 :
// « Il n'y a PAS de transport.video / transport.visual »). Les visuels embarques (hydra/p5)
// ne sortent par AUCUN transport : ce sont des producteurs, pas des destinations.
export type DeviceType = keyof typeof CANAUX;

export interface Device {
  /** unique name referenced by `out.<name>` (kebab/lower) */
  name: string;
  /** device class — fixes the compatible voice output types (§3) */
  type: DeviceType;
  /** connection params, type-dependent (§2). Optional = type defaults. */
  params?: Record<string, unknown>;
  /** human-readable UI label (else = name) */
  label?: string;
}

// DEVICES_SPEC §3 — device type → accepted voice output types. The table is
// authoritative: a voice whose outputType ∉ the device's set is refused. NOT
// derived from the amont catalog: its vocabulary (notes/signal/control/light/
// visual/text) exists only here — an host rule, not a duplicated authority
// (arbitrage architecte, message de tour [1100] du 2026-08-04). `keyboard` is in
// the catalog (an INPUT channel) but is not an output device — no entry here,
// and `acceptedOutputTypes` below returns an empty set for any absent key.
const ACCEPTED: Partial<Record<DeviceType, ReadonlySet<VoiceOutputType>>> = {
  midi: new Set<VoiceOutputType>(['notes']),
  audio: new Set<VoiceOutputType>(['notes', 'signal']),
  osc: new Set<VoiceOutputType>(['control', 'notes']),
  dmx: new Set<VoiceOutputType>(['light']),
  // text is the readable-fallback sink: it accepts `text` AND everything else
  // (any voice can be dumped to the symbolic console). DEVICES_SPEC §3.
  text: new Set<VoiceOutputType>(['text', 'notes', 'signal', 'visual', 'control', 'light'])
};

const EMPTY_ACCEPT: ReadonlySet<VoiceOutputType> = new Set();

/** The §3 accept set for a device type. Empty (never refuses everything by
 * accident, but accepts nothing) for a channel with no compat-table entry. */
export function acceptedOutputTypes(type: DeviceType): ReadonlySet<VoiceOutputType> {
  return ACCEPTED[type] ?? EMPTY_ACCEPT;
}

// No device-name aliases: `audio` is the sole canonical transport name (§5 purge,
// decision 2026-07-16) — `webaudio`/`browser` are rejected fail-loud by the parser
// upstream and never reach this resolver.
const ALIASES: Record<string, string> = {};

/** Bundled UI labels — the ONLY thing left in packages/library/devices.json;
 * direction and default params now come from the amont channel catalog. */
type BundledLabel = { name: string; label?: string };

function parseBundled(raw: string): BundledLabel[] {
  try {
    const json = JSON.parse(raw) as { devices?: BundledLabel[] };
    return Array.isArray(json.devices) ? json.devices : [];
  } catch {
    return [];
  }
}

const bundledLabels: BundledLabel[] = parseBundled(bundledDevicesRaw);
const labelByName = new Map(bundledLabels.map((d) => [d.name, d.label]));

/** A channel from the amont catalog is an output-capable channel iff `out === true`. */
function isOutChannel(canal: unknown): canal is { out: true; params?: Record<string, unknown> } {
  return (
    typeof canal === 'object' &&
    canal !== null &&
    'out' in canal &&
    (canal as { out: unknown }).out === true
  );
}

/** Output devices computed from the amont catalog (§ TRAVAIL 2 b): name = type =
 * the channel key, params = the channel's own params (if any), label = ours. */
const bundled: Device[] = (Object.keys(CANAUX) as DeviceType[])
  .filter((name) => isOutChannel(CANAUX[name]))
  .map((name) => {
    const canal = CANAUX[name] as { out: true; params?: Record<string, unknown> };
    const label = labelByName.get(name) ?? name;
    const device: Device = { name, type: name, label };
    if (canal.params) device.params = canal.params;
    return device;
  });

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
 * The resolved device library: user overlay merged over bundled (computed from
 * the amont channel catalog), keyed by name. `midi` is guaranteed by the amont
 * catalog itself (it carries `out:true`) — no local fallback (catalogue-source-
 * unique.test.ts locks this). Recomputed lazily; cheap enough that the overlay
 * can change without a cache-invalidation dance for beta.
 */
function deviceMap(): Map<string, Device> {
  const map = new Map<string, Device>();
  for (const d of bundled) map.set(d.name, d);
  for (const d of userOverlay()) map.set(d.name, d); // user wins on same name
  return map;
}

/**
 * Resolve `out.<name>` → the typed device. Unknown name → `undefined`; the
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

/** The full resolved device library (amont catalog + overlay). Read-only
 * browse for the Resources view; order is map insertion order. */
export function listDevices(): Device[] {
  return [...deviceMap().values()];
}
