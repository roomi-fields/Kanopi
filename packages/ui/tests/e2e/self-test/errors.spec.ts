import { test, expect } from '@playwright/test';
import { setupAudioCapture } from '../../helpers';

// Self-test layer for the error surfaces — these assertions matter when a
// user makes a mistake mid-session: they need to see a red flash (failed
// Strudel eval) and an entry in the Console panel. If any of these regress,
// live-coding flow stops being honest.
//
// The tests share the dev-only `window.__kanopi.workspace.openBundle` hatch
// (see strudel.spec.ts for the canonical example). The Strudel adapter routes
// `parse:` errors through the console store at strudel.ts:776 / :797 / :813,
// so the eval-failure paths converge on the same `level: 'error'` entry that
// ConsolePanel renders with `.level-error`.

test('Broken Strudel JS triggers a red flash on eval', async ({ page }) => {
  // `setupAudioCapture` is purely defensive here — broken JS shouldn't make
  // sound, but if a regression suddenly let it through we'd want to notice.
  await setupAudioCapture(page);

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Minimal session + intentionally broken actor body — `note("c` is an
  // unterminated string AND an unbalanced paren, which fails the
  // `new Function(stripped)` guard at strudel.ts:773-778 (parse: SyntaxError).
  const session = '@actor broken broken.strudel strudel\n';
  const broken = 'note("c, unbalanced parens\n';

  await page.evaluate(
    ({ s, b }) => {
      const w = window as unknown as {
        __kanopi?: {
          workspace: {
            openBundle: (
              f: { path: string; contents: string }[],
              focusPath?: string
            ) => string | null;
            files: { id: string; path: string }[];
            openFile: (id: string) => void;
            setActive: (id: string) => void;
          };
        };
      };
      const ws = w.__kanopi!.workspace;
      ws.openBundle(
        [
          { path: 'broken-strudel.kanopi', contents: s },
          { path: 'broken.strudel', contents: b }
        ],
        'broken-strudel.kanopi'
      );
    },
    { s: session, b: broken }
  );

  // Wait for the actor file to land in the workspace (App.svelte opens it
  // via queueMicrotask), then switch the active tab to it — Mod-Enter
  // evaluates blocks only on non-.kanopi files, mirroring strudel.spec.ts.
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string; id: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === 'broken.strudel');
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
    const target = w.__kanopi.workspace.files.find((f) => f.path === 'broken.strudel');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Click the editor to focus (also unlocks AudioContext via user gesture),
  // park the cursor at offset 0 via CM's view API, then fire Mod-Enter.
  // The task asks us to verify `.cm-flash-err` directly — `evalBlockAt`
  // races both flash kinds and waits past the 350ms detach, so we inline
  // the eval here to assert err-flash visibility before it auto-clears.
  await page.locator('.cm-content').first().click();
  await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & {
          cmTile?: {
            root?: {
              view?: {
                state: { doc: { line: (n: number) => { from: number } } };
                dispatch: (tr: { selection: { anchor: number } }) => void;
              };
            };
          };
        })
      | null;
    const view = content?.cmTile?.root?.view;
    if (!view) return;
    const lineInfo = view.state.doc.line(1);
    view.dispatch({ selection: { anchor: lineInfo.from } });
  });
  await page.keyboard.press('ControlOrMeta+Enter');

  // The err flash is attached for 350ms (eval-flash.ts:54). Playwright's
  // auto-waiting is fast enough to see it inside that window; the test
  // asks for "within 1s of eval", so a 1500ms budget keeps us inside the
  // intent while leaving margin for slow Strudel boot.
  await expect(page.locator('.cm-flash-err').first()).toBeVisible({ timeout: 1_500 });

  // Hush per feedback_hush_after_test — even a failed eval can leave the
  // scheduler in a state where a subsequent click triggers sound.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
});

test('Failed Strudel eval surfaces an error entry in the Console panel', async ({ page }) => {
  await setupAudioCapture(page);

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  const session = '@actor broken broken.strudel strudel\n';
  const broken = 'note("c, unbalanced parens\n';

  await page.evaluate(
    ({ s, b }) => {
      const w = window as unknown as {
        __kanopi?: {
          workspace: {
            openBundle: (
              f: { path: string; contents: string }[],
              focusPath?: string
            ) => string | null;
            files: { id: string; path: string }[];
            openFile: (id: string) => void;
            setActive: (id: string) => void;
          };
        };
      };
      const ws = w.__kanopi!.workspace;
      ws.openBundle(
        [
          { path: 'broken-strudel.kanopi', contents: s },
          { path: 'broken.strudel', contents: b }
        ],
        'broken-strudel.kanopi'
      );
    },
    { s: session, b: broken }
  );
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string; id: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === 'broken.strudel');
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
    const target = w.__kanopi.workspace.files.find((f) => f.path === 'broken.strudel');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Trigger the parse failure — this pushes a `level: 'error'` entry to
  // the console store (strudel.ts:776). Inlined (vs. `evalBlockAt`) so the
  // file is self-contained re: the flash-vs-store distinction made in the
  // previous test; behavioural difference: we don't wait for flash here,
  // we wait for the console row.
  await page.locator('.cm-content').first().click();
  await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & {
          cmTile?: {
            root?: {
              view?: {
                state: { doc: { line: (n: number) => { from: number } } };
                dispatch: (tr: { selection: { anchor: number } }) => void;
              };
            };
          };
        })
      | null;
    const view = content?.cmTile?.root?.view;
    if (!view) return;
    const lineInfo = view.state.doc.line(1);
    view.dispatch({ selection: { anchor: lineInfo.from } });
  });
  await page.keyboard.press('ControlOrMeta+Enter');

  // Open the Console tab. It lives in the bottom panel (BottomPanel.svelte),
  // which renders three tabs ("Structure", "Text", "Console") as `.bp-tab`
  // buttons; clicking Console swaps the panel body to <ConsolePanel> which
  // renders rows with `.row.level-<level>` (ConsolePanel.svelte:61).
  await page.locator('.bp-tab', { hasText: 'Console' }).click();

  // ConsolePanel.svelte:48 wraps everything in `.console`, and each error
  // row carries the `.level-error` class derived from the LogEntry's
  // `level` field (core-mock/types.ts:94). Wait for at least one such row.
  await expect(page.locator('.console .row.level-error').first()).toBeVisible({
    timeout: 3_000
  });
  const errorCount = await page.locator('.console .row.level-error').count();
  expect(errorCount).toBeGreaterThanOrEqual(1);

  // Hush — no audio is expected from a parse-failure, but be conservative
  // per feedback_hush_after_test.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
});
