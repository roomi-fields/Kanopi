import { describe, it, expect } from 'vitest';
import { resolveDevice, isCompatible } from '../devices/registry';
import { strudelAdapter, hydraAdapter } from 'runtime-codevoices';
import { bpscriptAdapter } from './bpx-adapter';

// Integration of the voice↔device compat GATE (ADAPTER_SPEC §1bis b,
// DEVICES_SPEC §3): the gate resolves an actor's `out.<name>` to a device
// and checks the voice's `outputType` against the device's accepted set. This
// proves the exact accept/reject decisions the orchestrator gate makes, using
// the REAL adapter `outputType` fields + the REAL device library (no AudioContext
// needed — the decision is pure).

// Mirror of bp3.ts `voiceOutputType`: a code voice's output type is its
// interpreter adapter's `outputType`; a native notes voice produces `notes`.
const OUTPUT: Record<string, string> = {
  strudel: strudelAdapter.outputType,
  hydra: hydraAdapter.outputType,
  '': bpscriptAdapter.outputType // notes voice (no eval)
};

function gate(evalInterp: string, transportKey: string): { ok: boolean; reason?: string } {
  const device = resolveDevice(transportKey);
  if (!device) return { ok: false, reason: `appareil inconnu : ${transportKey}` };
  const outputType = OUTPUT[evalInterp];
  if (!isCompatible(outputType as never, device.type)) {
    return {
      ok: false,
      reason: `${outputType} incompatible avec ${transportKey} (${device.type})`
    };
  }
  return { ok: true };
}

describe('voice↔device compat gate (orchestrator .bps)', () => {
  it('a strudel voice → out.audio PASSES (notes ∈ {notes,signal})', () => {
    expect(strudelAdapter.outputType).toBe('notes');
    expect(gate('strudel', 'audio')).toEqual({ ok: true });
  });

  it('a strudel voice → out.audio PASSES — no alias, audio is direct', () => {
    expect(gate('strudel', 'audio')).toEqual({ ok: true });
  });

  // `transport.video` a ete RETIRE (decision 2026-07-14) : un visuel embarque est un
  // PRODUCTEUR, il ne sort par aucun transport. Le gate ne connait donc plus ce nom —
  // ce qui verrouillait la voie morte verrouille desormais son absence.
  it('transport.video n existe plus — le nom est refuse pour toute voix', () => {
    expect(gate('strudel', 'video').ok).toBe(false);
    expect(gate('hydra', 'video').ok).toBe(false);
  });

  it('hydra produit bien du visuel, sans transport', () => {
    expect(hydraAdapter.outputType).toBe('visual');
  });

  it('a hydra (visual) voice → out.audio is REJECTED', () => {
    expect(gate('hydra', 'audio').ok).toBe(false);
  });

  it('an unknown appliance is REJECTED with "appareil inconnu"', () => {
    const r = gate('strudel', 'lumieres');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('appareil inconnu');
  });

  it('a native notes voice (no eval) → out.midi PASSES', () => {
    expect(bpscriptAdapter.outputType).toBe('notes');
    expect(gate('', 'midi')).toEqual({ ok: true });
  });
});
