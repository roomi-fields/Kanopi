import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalBlockAt, expectNoConsoleErrors } from '../helpers';

// Text-mode routing (decision routage-texte-midi): a grammar of bols/words is
// classified `text` by the front-end and routed — whole-grammar — to the
// symbolic console instead of audio. Evaluating it streams its terminals into
// the right-panel "Text" tab, timestamped, with NO audio.
test('text grammar streams symbols into the Text panel', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const grammar = readFileSync(join(fixturesDir, 'bols.gr'), 'utf8');

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
      w.__kanopi.workspace.loadFiles([{ path: 'bols.gr', contents }], 'bols.gr');
    },
    { contents: grammar }
  );
  await page.waitForFunction(() => {
    const w = window as unknown as { __kanopi?: { workspace: { files: { path: string }[] } } };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === 'bols.gr');
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
    const target = w.__kanopi.workspace.files.find((f) => f.path === 'bols.gr');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  await evalBlockAt(page, 1);

  // Open the Text tab. It lives in the bottom panel (BottomPanel.svelte,
  // `.bp-tab` buttons) alongside Structure + Console. The four bols stream in
  // over the cycle (~2s at tempo 128, each ~500ms) as the lookahead scheduler
  // reaches them — poll until all four have arrived rather than reading a
  // half-filled panel.
  await page.locator('.bp-tab', { hasText: 'Text' }).click();
  const symbols = page.locator('.textstream .sym');
  await expect(symbols.first()).toBeVisible({ timeout: 5_000 });
  await expect
    .poll(async () => [...new Set(await symbols.allTextContents())].sort(), { timeout: 8_000 })
    .toEqual(['dha', 'dhin', 'na', 'tigida']);

  noErrors();
});
