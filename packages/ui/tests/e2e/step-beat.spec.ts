import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// STEP-by-beat (Romain: "les steps doivent être des steps de bits [beats], pas
// de règles de tête"). `melody.gr` derives 8 bare notes — its head rule has NO
// macro sections (notes are control terminals, filtered out), so under the old
// section-driven STEP the button never appeared. Now STEP is driven by the
// produced BEAT grid (duration / one-beat), so an 8-beat melody enables STEP
// and the Structure piano-roll shows a beat cursor that advances per click.
test('STEP appears for a section-less multi-beat grammar and advances by beat', async ({
  page
}) => {
  // Patch AudioContext so STEP's beat playback has a tap (and so hush has a
  // context to silence) — we don't assert RMS here, this is a UI/structure test.
  await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const grammar = readFileSync(join(fixturesDir, 'melody.gr'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate(
    ({ contents }) => {
      const w = window as unknown as {
        __kanopi: {
          workspace: {
            loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
          };
        };
      };
      w.__kanopi.workspace.loadFiles([{ path: 'melody.gr', contents }], 'melody.gr');
    },
    { contents: grammar }
  );
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

  await evalBlockAt(page, 1);

  // GATE: a multi-beat production enables STEP even with no head-rule sections.
  const stepBtn = page.locator('.step-btn');
  await expect(stepBtn).toBeVisible({ timeout: 5_000 });

  // The Structure piano-roll renders the full production; no beat cursor yet.
  const structure = page.locator('.structure svg').first();
  await expect(structure).toBeVisible();
  await expect(page.locator('.beat-cursor')).toHaveCount(0);

  const shotDir = fileURLToPath(new URL('../../.playwright-artifacts', import.meta.url));
  mkdirSync(shotDir, { recursive: true });
  await page.locator('.structure').screenshot({ path: join(shotDir, 'step-beat-before.png') });

  // STEP once → beat 0 plays, cursor lands on the first beat window.
  await stepBtn.click();
  await expect(page.locator('.beat-cursor')).toBeVisible({ timeout: 5_000 });
  const x0 = await page.locator('.beat-cursor').getAttribute('x');

  // STEP again → cursor advances to the next beat (different x).
  await stepBtn.click();
  await page.waitForTimeout(150);
  const x1 = await page.locator('.beat-cursor').getAttribute('x');
  expect(Number(x1)).toBeGreaterThan(Number(x0));

  await page.locator('.structure').screenshot({ path: join(shotDir, 'step-beat-after.png') });

  // Hush — STEP plays a beat's notes; never leave audio running.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);

  noErrors();
});
