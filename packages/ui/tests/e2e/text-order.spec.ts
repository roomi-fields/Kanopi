import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { evalBlockAt, expectNoConsoleErrors } from '../helpers';

// The Text tab shows the derived production BY ORDER (not by time): symbols /
// rests / structure, names resolved from the grammar symbol table, sequence cut
// by bpscript's shared `tokenizeOrder` (delimiters `{ } ,` dropped). A polymetric
// `{ a, b } c` therefore reads `a b c` in derivation order.
async function loadOpenEval(page: Page, path: string, contents: string, line: number) {
  await page.evaluate(
    ({ p, c }) => {
      const w = window as unknown as {
        __kanopi: {
          workspace: {
            loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
            files: { id: string; path: string }[];
            openFile: (id: string) => void;
            setActive: (id: string) => void;
          };
        };
      };
      w.__kanopi.workspace.loadFiles([{ path: p, contents: c }], p);
      const t = w.__kanopi.workspace.files.find((f) => f.path === p);
      if (t) {
        w.__kanopi.workspace.openFile(t.id);
        w.__kanopi.workspace.setActive(t.id);
      }
    },
    { p: path, c: contents }
  );
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  await evalBlockAt(page, line);
}

test('Text tab shows the production by order with resolved names', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Polymetric group whose layers also carry a rest — exercises the symbol-table
  // name resolution (rests carry symbolId -1 and must NOT break the table).
  await loadOpenEval(page, 'ord.bps', `@mm:90\nS -> {5, a c b, f f f - f}`, 2);

  // Switch to the Text tab.
  await page.evaluate(() => {
    (
      window as unknown as { __kanopi: { ui: { bottomPanelTab: string } } }
    ).__kanopi.ui.bottomPanelTab = 'text';
  });

  const body = page.locator('.bp-body');
  await expect(body).toContainText('by order');
  // Names are resolved (a/c/b/f), NOT `#<symbolId>` placeholders.
  const text = (await body.textContent()) ?? '';
  expect(text).toContain('a');
  expect(text).toContain('c');
  expect(text).toContain('b');
  expect(text).toContain('f');
  expect(text).not.toMatch(/#\d/);

  noErrors();
});
