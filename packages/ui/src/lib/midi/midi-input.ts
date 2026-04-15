import type { Mapping } from '../core-mock';

export interface MidiEvent {
  kind: 'cc' | 'note' | 'pad';
  index: number; // CC number, or note number
  value: number; // 0..127
  ch: number; // 1..16
}

export type MidiHandler = (e: MidiEvent) => void;

let access: MIDIAccess | undefined;
let handler: MidiHandler | undefined;
const portNames: string[] = [];

function parse(msg: Uint8Array, ch: number): MidiEvent | null {
  const status = msg[0] & 0xf0;
  if (status === 0xb0) {
    return { kind: 'cc', index: msg[1], value: msg[2], ch };
  }
  if (status === 0x90) {
    // Note-on with velocity 0 == note-off; we surface velocity as value.
    // For pads vs notes we cannot tell from MIDI alone, so we emit BOTH and the
    // matcher decides (see matchMapping).
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
 * A mapping matches an incoming MIDI event when source kind/index agree.
 * Channel filter: if mapping has no `ch`, match any channel.
 * `pad` source matches a Note-On with velocity > 0 (drum-pad convention).
 */
export function matchMapping(m: Mapping, e: MidiEvent): boolean {
  if (m.source.kind === 'cc') {
    if (e.kind !== 'cc' || m.source.index !== e.index) return false;
    if (m.source.ch !== undefined && m.source.ch !== e.ch) return false;
    return true;
  }
  if (m.source.kind === 'note') {
    if (e.kind !== 'note' || m.source.index !== e.index) return false;
    if (m.source.ch !== undefined && m.source.ch !== e.ch) return false;
    return true;
  }
  if (m.source.kind === 'pad') {
    if (e.kind !== 'note' || m.source.index !== e.index) return false;
    if (e.value === 0) return false;
    return true;
  }
  return false;
}
