import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalBlockAt, expectNoConsoleErrors } from '../helpers';

// Text-mode routing (decision routage-texte-midi): a grammar of bols/words is
// classified `text` by the front-end and routed — whole-grammar — to the
// symbolic console instead of audio. Evaluating it publishes the FULL derived
// production at once; the "Text" tab shows it BY ORDER (derivation order, names
// resolved from the grammar symbol table), not streamed over time.
test('text grammar shows its full production in the Text panel', async ({ page }) => {
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
  // `.bp-tab` buttons) alongside Structure + Console. The full derivation is
  // published at eval, so every distinct bol is present immediately — no waiting
  // for the lookahead scheduler to reach each one over the cycle.
  await page.locator('.bp-tab', { hasText: 'Text' }).click();
  const toks = page.locator('.textorder .tok');
  await expect(toks.first()).toBeVisible({ timeout: 5_000 });
  // The by-order view lists tokens with repeats/rests; the DISTINCT bols
  // (rests `-`/`_` excluded) are exactly the grammar's four, names resolved
  // (no `#<id>` placeholders).
  await expect
    .poll(
      async () =>
        [...new Set(await toks.allTextContents())].filter((t) => t !== '-' && t !== '_').sort(),
      { timeout: 5_000 }
    )
    .toEqual(['dha', 'dhin', 'na', 'tigida']);

  noErrors();
});
