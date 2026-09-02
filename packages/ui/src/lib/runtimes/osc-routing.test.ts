import { describe, it, expect } from 'vitest';
// Browser entry (browser-safe surface), same as `kronos-audio` consumes it —
// avoids the default barrel's Node-only `DeviceLibrary`/`UdpTransport`.
import { OscAdapter, OscBridgeProfile } from 'runtime-osc/browser';
import { sceneQuiPasse } from '../library/scene-de-banc';
import { createSession } from 'bpx';
import { Kairos } from '@kairos/core';
import type { TimelineEvent } from '@kronos/core';
import { contexteDeProjection } from './bpx-adapter';

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
  it('OscBridgeProfile resolves a named control to /<device>/<param> on the channel from event.output', async () => {
    const profile = new OscBridgeProfile();
    // KAI-9 contract: device surfaces are pre-loaded at setup (`prepareSurfaces`,
    // here the literal fallback — no device library), and the per-event address
    // (device + channel) rides `event.output`, NOT a host actor binding.
    await profile.prepareSurfaces(['bridge1']);

    const emissions = profile.map({
      onset: 0,
      duration: 0.5,
      output: { runtime: 'osc', device: 'bridge1', channel: 5 },
      kind: 'control',
      content: { token: '', controls: { cutoff: 64 } }
    });

    const cutoff = emissions.find((e) => e.address === '/bridge1/cutoff');
    expect(cutoff, 'a /bridge1/cutoff emission').toBeTruthy();
    expect(cutoff!.args).toEqual([64, 5]); // value + channel from event.output
  });

  // LE BANC NOURRIT L ADAPTATEUR PAR LE BUS, comme la production depuis le 2026-08-10 : `send` a été
  // retirée des quatre sorties, l'événement ordonnancé arrive par abonnement. Le sujet du banc — le
  // ROUTAGE, l'adresse résolue et la garde de destination — ne change pas ; seul le chemin par lequel
  // l'événement entre change, et il devient le VRAI.
  function publierSur(
    adapter: {
      bindEvents: (b: { on: (t: 'output', cb: (e: unknown) => void) => () => void }) => unknown;
    },
    ev: unknown
  ) {
    const recus: Array<(e: unknown) => void> = [];
    adapter.bindEvents({
      on: (_t, cb) => {
        recus.push(cb);
        return () => {};
      }
    });
    for (const cb of recus) {
      cb({ schemaVersion: 1, type: 'output', t: 0, runtime: 'clock', payload: ev });
    }
  }

  it('OscAdapter emits the resolved address through its transport at the onset', async () => {
    const transport = captureTransport();
    const adapter = new OscAdapter({
      transport,
      profile: new OscBridgeProfile(),
      now: () => 0
    });
    // prepareSurfaces pre-loads the enumerated device surfaces (async, setup path);
    // the per-event device/channel come from `event.output` (KAI-9 routing).
    await adapter.prepareSurfaces(['sh_4d']);

    publierSur(adapter, {
      onset: 0,
      duration: 0.25,
      output: { runtime: 'osc', device: 'sh_4d', channel: 2 },
      kind: 'control',
      content: { token: '', controls: { cutoff: 100 } }
    });

    expect(transport.frames.length).toBeGreaterThan(0);
    const addresses = transport.frames.map(addressOf);
    expect(addresses.some((a) => a === '/sh_4d/cutoff')).toBe(true);
  });

  it('an event addressed to another runtime emits nothing (KAI-9 runtime guard)', () => {
    const transport = captureTransport();
    const adapter = new OscAdapter({ transport, profile: new OscBridgeProfile(), now: () => 0 });
    // The graven address designates MIDI, not OSC → the OSC adapter does nothing.
    publierSur(adapter, {
      onset: 0,
      duration: 0.25,
      output: { runtime: 'midi', device: 'x', channel: 0 },
      kind: 'control',
      content: { token: '', controls: { cutoff: 100 } }
    });
    expect(transport.frames.length).toBe(0);
  });
});

describe('OSC address-in-the-tree (consumed bpscript/bpx copies — stale-dep guard)', () => {
  // The whole OSC path is dead if the consumed `bpscript`/`bpx` copies lack the KAI-9
  // address-in-the-tree (the stale `file:`-dep trap that left OSC inert until the copy was
  // rsynced). The address now travels via `out.osc(device:…, ch:…)` →
  // `metadata.actors` → per-event `event.output`, NOT via the old host-read `.binding`. This
  // derives a real OSC scene and asserts BOTH layers — so a future stale copy fails loudly.
  const osc = `core\nactor bass out.osc(device:bridge1, ch:5)\n-----\nS -> bass.C4 bass.E4`;

  it('the actor→output table carries `{runtime:osc, params:{device, ch}}` (OSC enumeration)', () => {
    const ast = sceneQuiPasse(osc, { tempo: 120 });
    const tree = createSession(ast!, { seed: 1 }).derive().tree as {
      metadata?: { actors?: Record<string, unknown> };
    };
    // `toMatchObject` (pas `toEqual`) : le ROUTAGE OSC est `runtime:'osc'` + `params{device,ch}` —
    // c'est ce que ce test (et sa garde stale-dep) vérifie. La cascade @diapason amont (Kairos)
    // grave EN PLUS un `values:{diapason:…}` sur chaque acteur (défaut résolu), champ ADDITIF
    // orthogonal au routage : on le tolère au lieu de coupler ce test au diapason par défaut.
    expect(tree.metadata?.actors?.bass).toMatchObject({
      runtime: 'osc',
      params: { device: 'bridge1', ch: 5 }
    });
  });

  it('every OSC event carries `output={runtime:osc, device, channel}` (per-event routing)', () => {
    const ast = sceneQuiPasse(osc, { tempo: 120 });
    const session = createSession(ast!, { seed: 1 });
    const tree = session.derive().tree;
    // PAR LA FABRIQUE DE PRODUCTION, jamais un contexte recopié : ce banc tendait le contexte NU de
    // BPx, sans `digitalLib`. Depuis que Kairos lit la section de l'arbre (`8d8d50a`, 2026-09-03), il
    // branche la hauteur dès qu'elle est là et exige la lib de fonctions — un câblage partiel qui
    // crie enfin.
    const kairos = new Kairos();
    kairos.charger(
      tree as unknown as Parameters<Kairos['charger']>[0],
      contexteDeProjection(session.buildProjectionContext())
    );
    const tl = kairos.arbreCourant();
    const notes = [...tl.query(0, tl.duration + 1)].filter(
      (e: TimelineEvent) => (e.kind ?? 'note') === 'note'
    );
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((e) => e.output?.runtime === 'osc')).toBe(true);
    expect(notes.every((e) => e.output?.device === 'bridge1' && e.output?.channel === 5)).toBe(
      true
    );
  });
});
