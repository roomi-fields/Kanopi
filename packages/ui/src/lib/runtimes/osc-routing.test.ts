import { describe, it, expect } from 'vitest';
// Browser entry (browser-safe surface), same as `kronos-audio` consumes it —
// avoids the default barrel's Node-only `DeviceLibrary`/`UdpTransport`.
import { OscAdapter, OscBridgeProfile } from 'runtime-osc/browser';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';

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

describe('OSC binding parse (consumed bpscript copy — stale-dep guard)', () => {
  // The whole OSC path is dead if the consumed `bpscript` copy lacks the OSC-L1
  // `device:`/`ch:` → `binding` parse (the stale `file:`-dep trap that left OSC-5b
  // inert until the copy was rsynced). This compiles a real OSC scene and asserts
  // the binding reaches the AST — so a future stale copy fails the gate here, loudly.
  it('compiles `@actor … transport.osc device:<n> ch:<n>` to an actor binding', () => {
    const r = compileToBPxAST('@actor bass transport.osc device:bridge1 ch:5\nS -> C4 E4') as {
      ast?: { actors?: Array<{ name: string; binding?: unknown }> };
    };
    const bass = r.ast?.actors?.find((a) => a.name === 'bass');
    expect(bass, 'actor "bass" in the compiled AST').toBeTruthy();
    expect(bass!.binding).toEqual({ device: 'bridge1', channel: 5 });
  });
});
