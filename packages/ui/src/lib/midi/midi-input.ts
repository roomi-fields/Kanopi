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
    if (msg.length < 3) return null; // malformed CC (no value byte) → drop, not NaN
    return { kind: 'cv', index: msg[1], value: msg[2], ch };
  }
  if (status === 0x90) {
    if (msg.length < 3) return null; // malformed note-on (no velocity byte) → drop
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

export async function enableMidi(
  h: MidiHandler
): Promise<{ ok: true; ports: string[] } | { ok: false; reason: string }> {
  handler = h;
  if (!('requestMIDIAccess' in navigator)) {
    return { ok: false, reason: 'WebMIDI not supported in this browser' };
  }
  try {
    access = await (
      navigator as Navigator & { requestMIDIAccess(): Promise<MIDIAccess> }
    ).requestMIDIAccess();
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
