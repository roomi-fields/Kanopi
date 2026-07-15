import { describe, it, expect } from 'vitest';
import { resourceStatus } from './resource-status.svelte';

describe('resourceStatus — signal 2 of the health voyant (decision 2026-07-15)', () => {
  it('for() returns null before any report', () => {
    expect(resourceStatus.for('never-reported.bps', 'anything')).toBeNull();
  });

  it('report/for round-trips ok=true with no errors', () => {
    resourceStatus.report('f1', 'content-v1', true, []);
    const o = resourceStatus.for('f1', 'content-v1');
    expect(o).not.toBeNull();
    expect(o?.ok).toBe(true);
    expect(o?.errors).toEqual([]);
  });

  it('report/for round-trips ok=false with the unresolved-bank message', () => {
    resourceStatus.report('f2', 'content-v1', false, [
      { message: 'banque inconnue: zzz-nonexistent' }
    ]);
    const o = resourceStatus.for('f2', 'content-v1');
    expect(o?.ok).toBe(false);
    expect(o?.errors).toEqual([{ message: 'banque inconnue: zzz-nonexistent' }]);
  });

  it('staleness guard: for() returns null once the content no longer matches the recorded report', () => {
    resourceStatus.report('f3', 'content-v1', false, [{ message: 'banque inconnue: zzz' }]);
    expect(resourceStatus.for('f3', 'content-v1')?.ok).toBe(false);
    // The user edited the file — content-v2 no longer matches what was checked.
    expect(resourceStatus.for('f3', 'content-v2')).toBeNull();
  });

  it('a fresh report for the SAME file overwrites the previous outcome (green after a fix)', () => {
    resourceStatus.report('f4', 'broken', false, [{ message: 'banque inconnue: zzz' }]);
    expect(resourceStatus.for('f4', 'broken')?.ok).toBe(false);
    resourceStatus.report('f4', 'fixed', true, []);
    expect(resourceStatus.for('f4', 'fixed')?.ok).toBe(true);
    // The stale broken-content entry is gone too (single outcome per file).
    expect(resourceStatus.for('f4', 'broken')).toBeNull();
  });
});
