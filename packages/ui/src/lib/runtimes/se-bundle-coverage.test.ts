// Garde de COUVERTURE -se (backlog SE-BUNDLE, point 7).
//
// Un `.gr` référence son timing moteur BP3 dans un fichier `-se.<name>` frère. Si le nom
// référencé n'est PAS dans `BUNDLED_SE`, `resolveSeSettings` retombe à un beat 1000 ms
// (×4/3 hors tempo natif) — historiquement EN SILENCE. Le runtime avertit désormais bruyamment
// (`warnSeOnce`), et ce garde attrape le trou AU BUILD : chaque `-se` référencé par une scène
// bundle DOIT être présent dans `BUNDLED_SE`. Ajouter un `.gr` qui pointe un `-se` non bundlé
// fait ÉCHOUER la CI, pas jouer une scène muettement dégradée.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { BUNDLED_SE } from './bp3-aux';
import { resolveSeSettings } from './bpx-adapter';

// Les grammaires natives bundlées, en brut (même profondeur de glob que demos.ts).
const GR = import.meta.glob('../../../../library/bundled/*.gr', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

/** Extrait les noms de `-se` référencés dans un texte `.gr` (`-se.<name>`). */
function referencedSe(gr: string): string[] {
  return [...gr.matchAll(/-se\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
}

describe('couverture -se — chaque -se référencé par une scène bundle est bundlé', () => {
  const files = Object.keys(GR);

  it('a trouvé les grammaires bundlées', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('tout -se référencé existe dans BUNDLED_SE (sinon timing ×4/3 muet)', () => {
    const missing: string[] = [];
    for (const path of files) {
      const base = path.split('/').pop();
      for (const name of referencedSe(GR[path])) {
        if (!(name in BUNDLED_SE)) missing.push(`${base} → -se.${name} ABSENT de BUNDLED_SE`);
      }
    }
    expect(missing, `-se référencés mais non bundlés :\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('le détecteur mord (non-vacuité) : un -se fictif non bundlé est vu manquant', () => {
    const fakeGr = '// grammaire\n-se.__pas_bundle__\ngram#1[1] S --> A';
    const refs = referencedSe(fakeGr);
    expect(refs).toContain('__pas_bundle__');
    expect('__pas_bundle__' in BUNDLED_SE).toBe(false);
  });
});

describe("resolveSeSettings n'échoue plus EN SILENCE (avertit bruyamment)", () => {
  afterEach(() => vi.restoreAllMocks());

  it('un -se RÉFÉRENCÉ mais absent → console.warn (+ undefined, dégradation gracieuse)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = resolveSeSettings([{ prefix: 'se', name: '__conf_test_absent__' }] as never);
    expect(out).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/__conf_test_absent__.*ABSENT/);
  });

  it('AUCUN -se référencé → undefined SANS warn (défaut moteur légitime)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = resolveSeSettings([{ prefix: 'al', name: 'x' }] as never);
    expect(out).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});
