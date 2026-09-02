import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// PRIMARY vertical slice: a Bol Processor grammar (.gr) produces audible
// WebAudio output through the full chain
//   parseBP3 → createBPx → derive() → Kairos (projection) → Kronos → runtime-audio.
// The fixture derives 8 pitched terminals (C4..C5) over ~4s at tempo 120.
test('bp3 grammar evaluates and produces audio', async ({ page }) => {
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const grammar = readFileSync(join(fixturesDir, 'melody.gr'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Load the .gr as a standalone file and focus its editor.
  await page.evaluate(
    ({ contents }) => {
      const w = window as unknown as {
        __kanopi: {
          workspace: {
            openBundle: (
              f: { path: string; contents: string }[],
              focusPath?: string
            ) => string | null;
          };
        };
      };
      w.__kanopi.workspace.openBundle([{ path: 'melody.gr', contents }], 'melody.gr');
    },
    { contents: grammar }
  );
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === 'melody.gr');
  });
  await page.evaluate(() => {
    const w = window as unknown as {
      __kanopi: {
        workspace: {
          files: { id: string; path: string }[];
          openFile: (id: string) => void;
          setActive: (id: string) => void;
        };
      };
    };
    const target = w.__kanopi.workspace.files.find((f) => f.path === 'melody.gr');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Ctrl+Enter anywhere evaluates the whole grammar (extract-block bp3 case).
  await evalBlockAt(page, 1);

  // ⛔ EXCEPTION NOMMÉE, DATÉE, ET QUI EXPIRE SEULE (arbitrage de l'architecte, 2026-09-03 01:18).
  // Depuis que kairos lit `tree.metadata.librairies` (`8d8d50a`), une grammaire `.gr` — qui entre par
  // bp3-frontend, lequel ne joint aucune section — n'a plus de source de hauteur : `melody.gr` rend
  // 8 notes, hz=0, avec ou sans l'ancien sac. La décision (qui joint la section d'une grammaire
  // native) est chez Romain. `test.fail` dit que ce cas ÉCHOUE aujourd'hui pour cette cause ; le
  // jour où le son revient, il PASSE, Playwright le signale, et l'exception se retire.
  test.fail(
    true,
    'EXCEPTION 2026-09-03 — chemin .gr sans producteur de section (kairos 8d8d50a), décision attendue'
  );

  // The derivation schedules 8 notes across ~4s; sample peak RMS over 2.5s to
  // catch the oscillators while they sound.
  const rms = await audio.getMaxRMS(2500);

  // Hush (Ctrl+.) — the user is at the machine; never leave audio running. AVANT l'assertion.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);
  noErrors();
  expect(rms).toBeGreaterThan(0.001);
});
