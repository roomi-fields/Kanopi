import { describe, it, expect, vi, beforeEach } from 'vitest';

// [786] — non-régression mémoïsation : `ensureCsoundSoundfiles` ne doit fetch+écrire un soundfile
// qu'UNE fois par nom, même appelée plusieurs fois (ouverture puis play) ou en concurrence. Un échec
// (HTTP non-ok ou write KO) ne doit PAS être mémoïsé : un appel ultérieur doit pouvoir retenter.
//
// `ASSET_PATHS`/`writeCsoundFile` viennent du paquet cross-repo `runtime-codevoices` (opaque, mocké
// ici) ; `fetch` est un mock global (jsdom ne fournit pas de réseau réel dans vitest).

const { writeCsoundFile } = vi.hoisted(() => ({
  writeCsoundFile: vi.fn()
}));

vi.mock('runtime-codevoices', () => ({
  ASSET_PATHS: { csoundSamples: () => 'https://vps.example/csound-samples' },
  writeCsoundFile
}));

import { ensureCsoundSoundfiles } from './csound-soundfiles';

const log = vi.fn();
const csd = (name: string) => `instr 1\n  a1 diskin2 "${name}", 1\nendin`;

describe('ensureCsoundSoundfiles — memo par nom de fichier', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    log.mockClear();
    writeCsoundFile.mockReset();
    writeCsoundFile.mockResolvedValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4)
      }))
    );
  });

  it('ne fetch/écrit un soundfile qu’une seule fois sur 2 appels successifs', async () => {
    const code = csd('beats.wav');
    await ensureCsoundSoundfiles(code, log);
    await ensureCsoundSoundfiles(code, log);

    expect(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    expect(writeCsoundFile).toHaveBeenCalledTimes(1);
    expect(writeCsoundFile).toHaveBeenCalledWith('beats.wav', expect.any(Uint8Array), log);
  });

  it('déduplique les appels CONCURRENTS pour le même nom (un seul fetch en vol)', async () => {
    const code = csd('kit.wav');
    await Promise.all([ensureCsoundSoundfiles(code, log), ensureCsoundSoundfiles(code, log)]);

    expect(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    expect(writeCsoundFile).toHaveBeenCalledTimes(1);
  });

  it('ne mémoïse PAS un échec HTTP — un appel ultérieur retente', async () => {
    const code = csd('missing.wav');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }))
    );

    await ensureCsoundSoundfiles(code, log);
    await ensureCsoundSoundfiles(code, log);

    expect(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
    expect(writeCsoundFile).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warn', msg: expect.stringContaining('404') })
    );
  });

  it('ne mémoïse PAS un échec d’écriture (writeCsoundFile → false) — retry possible', async () => {
    const code = csd('badwrite.wav');
    writeCsoundFile.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await ensureCsoundSoundfiles(code, log);
    await ensureCsoundSoundfiles(code, log);

    expect(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
    expect(writeCsoundFile).toHaveBeenCalledTimes(2);
  });

  it('un rejet de fetch (exception réseau) est loggé, jamais jeté, et n’est pas mémoïsé', async () => {
    const code = csd('flaky.wav');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );

    await expect(ensureCsoundSoundfiles(code, log)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warn', msg: expect.stringContaining('network down') })
    );
  });
});
