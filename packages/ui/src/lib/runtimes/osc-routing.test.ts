import { describe, it, expect } from 'vitest';
// Deep imports of the browser-safe modules (NOT the barrel, which pulls Node-only
// `DeviceLibrary`/`UdpTransport`) — same as `kronos-audio` consumes them.
import { OscAdapter } from 'runtime-osc/src/adapter.js';
import { OscBridgeProfile } from 'runtime-osc/src/profiles/osc-bridge.js';

/**
 * OSC-5b — proves Kanopi's OSC branchement emits the resolved address on the right
 * channel, the way `kronos-audio` builds and feeds the adapter (OscBridgeProfile +
 * a clock-injected OscAdapter, the RAW ScheduledEvent shape). The hardware round-
 * trip is proven upstream (runtime-OSC OSC-5a); here we verify the EMISSION at the
 * Kanopi-consumed boundary, with no live relay (a capture transport records bytes).
 *
 * No device-surface library is supplied (literal fallback), so `device:bridge1`
 * resolves to the `/bridge1` osc_prefix — exactly the proof the architect asked for
 * (`/<osc_prefix>/cutoff` on the bound channel).
 */

function captureTransport() {
  const frames: Uint8Array[] = [];
  return {
    frames,
    send(bytes: unknown) {
      frames.push(bytes as Uint8Array);
    },
    close() {}
  };
}

/** Decode the leading OSC address string (null-terminated) from a raw frame. */
function addressOf(frame: Uint8Array): string {
  const nul = frame.indexOf(0);
  return new TextDecoder().decode(frame.subarray(0, nul < 0 ? frame.length : nul));
}

describe('OSC branchement (OSC-5b)', () => {
  it('OscBridgeProfile resolves a named control to /<device>/<param> on the bound channel', async () => {
    const profile = new OscBridgeProfile();
    await profile.setBindings({ bass: { device: 'bridge1', channel: 5 } });

    // The RAW ScheduledEvent shape `kronos-audio` feeds the OSC transport.
    const emissions = profile.map({
      onset: 0,
      duration: 0.5,
      actor: 'bass',
      kind: 'control',
      content: { token: '', controls: { cutoff: 64 } }
    });

    const cutoff = emissions.find((e) => e.address === '/bridge1/cutoff');
    expect(cutoff, 'a /bridge1/cutoff emission').toBeTruthy();
    expect(cutoff!.args).toEqual([64, 5]);
  });

  it('OscAdapter emits the resolved address through its transport at the onset', async () => {
    const transport = captureTransport();
    const adapter = new OscAdapter({
      transport,
      profile: new OscBridgeProfile(),
      now: () => 0
    });
    // setBindings pre-resolves device surfaces (async); await it before sending —
    // in the live flow it resolves on a microtask, well before the driver's
    // setTimeout-scheduled emission fires.
    await adapter.setBindings({ lead: { device: 'sh_4d', channel: 2 } });

    adapter.send({
      onset: 0,
      duration: 0.25,
      actor: 'lead',
      kind: 'control',
      content: { token: '', controls: { cutoff: 100 } }
    });

    expect(transport.frames.length).toBeGreaterThan(0);
    const addresses = transport.frames.map(addressOf);
    expect(addresses.some((a) => a === '/sh_4d/cutoff')).toBe(true);
  });

  it('an unbound actor emits nothing (no spurious OSC)', () => {
    const transport = captureTransport();
    const adapter = new OscAdapter({ transport, profile: new OscBridgeProfile(), now: () => 0 });
    adapter.send({
      onset: 0,
      duration: 0.25,
      actor: 'ghost',
      kind: 'control',
      content: { token: '', controls: { cutoff: 100 } }
    });
    expect(transport.frames.length).toBe(0);
  });
});
