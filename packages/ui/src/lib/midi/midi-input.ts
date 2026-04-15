import type { Mapping } from '../core-mock';

export interface MidiEvent {
  kind: 'cv' | 'note'; // protocol-level: CC or note message
  index: number; // CC number, or note number
  value: number; // 0..127 (vel for notes, value for CC)
  ch: number; // 1..16
}

export type MidiHandler = (e: MidiEvent) => void;

let access: MIDIAccess | undefined;
let handler: MidiHandler | undefined;
const portNames: string[] = [];

function parse(msg: Uint8Array, ch: number): MidiEvent | null {
  const status = msg[0] & 0xf0;
  if (status === 0xb0) {
    return { kind: 'cv', index: msg[1], value: msg[2], ch };
  }
  if (status === 0x90) {
    // Note-on with velocity 0 is treated as note-off by convention.
    return { kind: 'note', index: msg[1], value: msg[2], ch };
  }
  if (status === 0x80) {
    return { kind: 'note', index: msg[1], value: 0, ch };
  }
  return null;
}

function bindPorts() {
  if (!access) return;
  portNames.length = 0;
  for (const input of access.inputs.values()) {
    portNames.push(input.name ?? 'unnamed');
    input.onmidimessage = (ev) => {
      const data = ev.data;
      if (!data || data.length < 2) return;
      const ch = (data[0] & 0x0f) + 1;
      const e = parse(data, ch);
      if (e) handler?.(e);
    };
  }
}

export async function enableMidi(h: MidiHandler): Promise<{ ok: true; ports: string[] } | { ok: false; reason: string }> {
  handler = h;
  if (!('requestMIDIAccess' in navigator)) {
    return { ok: false, reason: 'WebMIDI not supported in this browser' };
  }
  try {
    access = await (navigator as Navigator & { requestMIDIAccess(): Promise<MIDIAccess> }).requestMIDIAccess();
    bindPorts();
    access.onstatechange = () => bindPorts();
    return { ok: true, ports: [...portNames] };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

export function listPorts(): string[] {
  return [...portNames];
}

/**
 * Map source semantics (BPscript convention):
 *   cv   = continuous value (CC)
 *   gate = note on/off (fires on press AND release)
 *   trig = note-on with vel > 0 (fires on press only, ignores release)
 * Channel filter: if mapping has no `ch`, match any channel.
 */
export function matchMapping(m: Mapping, e: MidiEvent): boolean {
  if (m.source.ch !== undefined && m.source.ch !== e.ch) return false;
  if (m.source.index !== e.index) return false;
  if (m.source.kind === 'cv') return e.kind === 'cv';
  if (m.source.kind === 'gate') return e.kind === 'note';
  if (m.source.kind === 'trig') return e.kind === 'note' && e.value > 0;
  return false;
}
