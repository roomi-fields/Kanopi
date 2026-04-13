/**
 * OSC Bridge — WebSocket ↔ UDP
 *
 * Micro-server that receives JSON OSC messages via WebSocket
 * and forwards them as UDP OSC packets.
 *
 * Usage: node src/bridge/osc-bridge.js [ws-port] [osc-host] [osc-port]
 * Default: ws://localhost:9000 → udp://localhost:57120 (SuperCollider)
 */

import { WebSocketServer } from 'ws';
import dgram from 'dgram';

const WS_PORT = parseInt(process.argv[2]) || 9000;
const OSC_HOST = process.argv[3] || '127.0.0.1';
const OSC_PORT = parseInt(process.argv[4]) || 57120;

const udp = dgram.createSocket('udp4');
const wss = new WebSocketServer({ port: WS_PORT });

console.log(`OSC Bridge: ws://localhost:${WS_PORT} → udp://${OSC_HOST}:${OSC_PORT}`);

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const buf = encodeOSC(msg.address, msg.args || []);
      udp.send(buf, OSC_PORT, OSC_HOST);
    } catch (e) {
      console.error('Parse error:', e.message);
    }
  });

  ws.on('close', () => console.log('Client disconnected'));
});

/**
 * Minimal OSC binary encoder.
 * Supports: string (s), int32 (i), float32 (f)
 */
function encodeOSC(address, args) {
  const parts = [];

  // Address (null-padded to 4-byte boundary)
  parts.push(oscString(address));

  // Type tag string
  let typetag = ',';
  for (const arg of args) {
    if (typeof arg === 'number') {
      typetag += Number.isInteger(arg) ? 'i' : 'f';
    } else {
      typetag += 's';
    }
  }
  parts.push(oscString(typetag));

  // Arguments
  for (const arg of args) {
    if (typeof arg === 'number') {
      const buf = Buffer.alloc(4);
      if (Number.isInteger(arg)) buf.writeInt32BE(arg);
      else buf.writeFloatBE(arg);
      parts.push(buf);
    } else {
      parts.push(oscString(String(arg)));
    }
  }

  return Buffer.concat(parts);
}

function oscString(str) {
  const buf = Buffer.from(str + '\0', 'ascii');
  const pad = 4 - (buf.length % 4);
  return pad < 4 ? Buffer.concat([buf, Buffer.alloc(pad)]) : buf;
}
