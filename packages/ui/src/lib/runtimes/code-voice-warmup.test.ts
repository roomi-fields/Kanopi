import { describe, it, expect, vi, beforeEach } from 'vitest';

// [786] — non-régression du tracker de warmup GATÉ : un 2e appel pour le MÊME interprète doit
// rendre la MÊME promesse (pas de 2e `preload`), et un interprète en échec ne doit jamais bloquer
// (ni rejeter) l'appelant — mêmes garanties best-effort que `preload` lui-même.

const { preload } = vi.hoisted(() => ({ preload: vi.fn() }));

vi.mock('runtime-codevoices', () => ({ preload }));

import { warmUp, hasWarmupStarted } from './code-voice-warmup';

// Le tracker mémoïse dans une Map module-level (jamais réinitialisée — même contrat que le paquet
// `preload`, qui reste chaud pour toute la session). Chaque test utilise des noms d'interprète
// dédiés pour rester isolé, plutôt que de dépendre d'un reset qui n'existe pas côté production.

describe('warmUp — mémoïsation par interprète', () => {
  beforeEach(() => {
    preload.mockReset();
  });

  it('un 2e appel pour le même interprète ne relance pas `preload` — même promesse', async () => {
    preload.mockResolvedValue(undefined);

    const p1 = warmUp(['strudel-t1']);
    const p2 = warmUp(['strudel-t1']);

    expect(p1).toBe(p2);
    await Promise.all([p1, p2]);
    expect(preload).toHaveBeenCalledTimes(1);
    expect(preload).toHaveBeenCalledWith(['strudel-t1']);
  });

  it('groupe les NOUVEAUX interprètes en un seul appel `preload`, ignore les déjà lancés', async () => {
    preload.mockResolvedValue(undefined);

    await warmUp(['a-t2']);
    await warmUp(['a-t2', 'b-t2', 'c-t2']);

    expect(preload).toHaveBeenCalledTimes(2);
    expect(preload).toHaveBeenNthCalledWith(1, ['a-t2']);
    expect(preload).toHaveBeenNthCalledWith(2, ['b-t2', 'c-t2']);
  });

  it('un interprète en échec (preload rejette) ne bloque/rejette jamais l’appelant', async () => {
    preload.mockRejectedValue(new Error('engine boot failed'));

    await expect(warmUp(['broken'])).resolves.toBeUndefined();
    // Un 2e appel pour ce même interprète réutilise la promesse mémoïsée (déjà réglée en succès
    // côté appelant) — toujours pas de 2e `preload`.
    await warmUp(['broken']);
    expect(preload).toHaveBeenCalledTimes(1);
  });

  it('liste vide / interps vides → résout immédiatement sans appeler `preload`', async () => {
    await expect(warmUp([])).resolves.toBeUndefined();
    await expect(warmUp(['', ''])).resolves.toBeUndefined();
    expect(preload).not.toHaveBeenCalled();
  });

  it('hasWarmupStarted reflète les interprètes déjà lancés', async () => {
    expect(hasWarmupStarted('mercury')).toBe(false);
    preload.mockResolvedValue(undefined);
    await warmUp(['mercury']);
    expect(hasWarmupStarted('mercury')).toBe(true);
  });
});
