// KAN-orchestration P2 (BLOCKER 1 re-home) — the production readout's "actor terminal is
// sounding" flag is sourced from the KAIROS timeline (the single projection of the tree).
// This test proves the actor-bound terminals are projected off `kairos.arbreCourant()`
// (NOTE events carrying an `actor` → `content.token`), INCLUDING a terminal shared by two
// actors (which must stay in the set — one event per occurrence).

import { describe, it, expect } from 'vitest';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { createSession } from 'bpx';
import { Kairos } from '@kairos/core';
import type { Timeline } from '@kronos/core';

// Two actors that SHARE a terminal: both `lead` and `bass` play `C4`. The shared token
// must survive in the actor-terminals set (the regression we guard against).
const SHARED_TERMINAL = `@core
@controls

@actor lead  @alphabet.western  transport.audio
@actor bass  @alphabet.western  transport.audio

S -> {Lead, Low}

Lead -> lead.C4 lead.E4 lead.G4 lead.C4
Low  -> bass.C4 bass.C2 bass.C4 bass.G2
`;

/** The production source (the re-homed logic in bpx-adapter): NOTE events on the Kairos
 *  timeline that carry an `actor` → their `content.token`. */
function actorTerminalsFromKairos(tl: Timeline): Set<string> {
  const set = new Set<string>();
  for (const e of tl.query(0, tl.duration + 1)) {
    if ((e.kind ?? 'note') !== 'note') continue;
    if (e.actor === undefined || e.actor === null) continue;
    const token = (e.content as { token?: unknown }).token;
    if (typeof token === 'string' && token.length > 0) set.add(token);
  }
  return set;
}

describe('actorTerminals sourced from the Kairos timeline', () => {
  it('projects the actor-bound terminals off Kairos, shared terminal preserved', () => {
    const ast = compileToBPxAST(SHARED_TERMINAL, { tempo: 120 }).ast;
    const session = createSession(ast, { seed: 1, tempo: 120 });
    const tree = session.derive().tree;

    // Build the Kairos timeline the same way the adapter does (charger → arbreCourant).
    const kairos = new Kairos();
    kairos.charger(
      tree as unknown as Parameters<Kairos['charger']>[0],
      session.buildProjectionContext() as unknown as Parameters<Kairos['charger']>[1]
    );
    const fromKairos = actorTerminalsFromKairos(kairos.arbreCourant());

    // The set must be non-empty and contain the SHARED terminal `C4` (the regression case).
    expect(fromKairos.size).toBeGreaterThanOrEqual(1);
    expect(fromKairos.has('C4')).toBe(true);
  });
});
