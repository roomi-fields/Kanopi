import { describe, it, expect } from 'vitest';
import { production, type RawTimedToken } from './production.svelte';

// Lot A plumbing: the raw BPx tokens carried alongside the production must reach
// the store UNTRANSFORMED, with times still in MILLISECONDS (the unit the
// vendored piano-roll `timeline.js` expects), distinct from the `tokens`
// readout which is converted to seconds.
describe('production store — rawTokens', () => {
  it('preserves raw tokens in milliseconds, untransformed', () => {
    const raw: RawTimedToken[] = [
      { token: 'C4', start: 0, end: 500, type: 'terminal', actor: 'lead' },
      { token: 'E4', start: 250, end: 750, type: 'terminal', actor: null }
    ];

    production.set({
      source: 'bp3',
      tokens: [{ token: 'C4', startSec: 0, durSec: 0.5 }],
      durationSec: 0.75,
      beatDurSec: 0.5,
      sections: [],
      rawTokens: raw
    });

    const stored = production.current?.rawTokens;
    expect(stored).toBeDefined();
    // Times stay in ms (500, 750), not converted to seconds.
    expect(stored).toEqual(raw);
    expect(stored?.[0].start).toBe(0);
    expect(stored?.[0].end).toBe(500);
    expect(stored?.[1].start).toBe(250);
    expect(stored?.[1].end).toBe(750);
    // Side fields survive.
    expect(stored?.[0].actor).toBe('lead');
    expect(stored?.[1].actor).toBeNull();

    production.clear();
    expect(production.current).toBeNull();
  });
});

// (Le describe `beatCount` est RETIRÉ avec la fonction — chantier transport-SM RC-B +
// verdict (b) « battement écrit » [496/499] : le pas est porté par Kronos
// (`transport.step(1)`), l'hôte ne compte plus les temps d'une production.)
