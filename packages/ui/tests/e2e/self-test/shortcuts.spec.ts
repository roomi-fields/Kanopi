import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../../helpers';

// Keyboard shortcuts self-test layer. Covers the five user-facing bindings
// the IDE shell promises across CMEditor.svelte (Prec.highest keymap) and
// lib/keybindings/bindings.ts (window-level capture-phase handler):
//
//   1. Ctrl/Cmd+K        toggle command palette
//   2. Ctrl/Cmd+. (dot)  hush every runtime
//   3. Alt+1..9          activate scene N
//   4. Shift+Enter       evaluate the current line only (not the whole block)
//   5. Tab               accept completion when the popup is active
//
// Selectors come straight from the components, not guesses:
//   - CommandPalette.svelte:78 — `.palette[role="dialog"]`, with the input
//     auto-focused once `ui.paletteOpen` flips to true.
//   - ScenesPanel.svelte:31-34 — `.card` per scene, `.active` class when
//     `s.active` is true. The Scenes tab is `.rp-tab` with text "Scenes"
//     (cf session-scenes.spec.ts:56).
//   - `.cm-content` — CodeMirror's contenteditable host.
//   - `.cm-flash-ok` / `.cm-flash-err` — eval-flash decorations
//     (eval-flash.ts:12-13).
//   - `.cm-tooltip-autocomplete` — CM6's autocomplete popup
//     (node_modules/@codemirror/autocomplete/dist/index.cjs:525).
//
// Bundled session 03-scenes-A-B.kanopi is shipped via packages/library/bundled;
// for parity with sessions/session-scenes.spec.ts we read the files off disk
// and inject through the dev-only `window.__kanopi.workspace.loadFiles`
// hatch (main.ts:25-35) — avoids walking through the Library panel UI a
// second time when our concern here is keystrokes, not load-flow.

const BUNDLED = fileURLToPath(new URL('../../../../library/bundled', import.meta.url));

test('Ctrl/Cmd+K opens the command palette; Escape closes it', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  const palette = page.locator('.palette[role="dialog"]');
  await expect(palette).toHaveCount(0);

  // Mod+K is wired both globally (bindings.ts:19-23) and inside the editor
  // keymap (CMEditor.svelte:103-112). With no file open, no editor is
  // mounted, so the global handler is what we exercise here.
  await page.keyboard.press('ControlOrMeta+KeyK');
  await expect(palette).toBeVisible({ timeout: 2_000 });
  // The input inside the palette auto-focuses via tick().then(inputEl?.focus)
  // (CommandPalette.svelte:14-20). Escape on that focused input runs the
  // palette's own onKey handler (CommandPalette.svelte:53-55), which calls
  // close() → flips `ui.paletteOpen` to false → the overlay unmounts.
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0, { timeout: 2_000 });

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});

test('Ctrl/Cmd+. (hush) silences a running Strudel pattern within 1s', async ({ page }) => {
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  // Inject session 01 (single Strudel actor) — minimal, predictable RMS.
  const sessionContents = readFileSync(join(BUNDLED, '01-strudel-solo.kanopi'), 'utf8');
  const drumsContents = readFileSync(join(BUNDLED, '01-drums.strudel'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate(
    ({ session, drums }) => {
      const w = window as unknown as {
        __kanopi?: {
          workspace: {
            loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
          };
        };
      };
      w.__kanopi!.workspace.loadFiles(
        [
          { path: '01-strudel-solo.kanopi', contents: session },
          { path: '01-drums.strudel', contents: drums }
        ],
        '01-strudel-solo.kanopi'
      );
    },
    { session: sessionContents, drums: drumsContents }
  );

  // Switch to the actor body so the editor is on a strudel file (CMEditor
  // routes Mod-Enter through the runtime extractor for non-.kanopi files).
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === '01-drums.strudel');
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
    const target = w.__kanopi.workspace.files.find((f) => f.path === '01-drums.strudel');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Line 4 of 01-drums.strudel is the note(...) block (lines 1-3 are
  // comments) — same pattern as library.spec.ts.
  await evalBlockAt(page, 4);

  // Wait for the pattern to actually produce sound. Strudel schedules its
  // first event one cycle ahead of the audio clock, so peak RMS over a 2.5s
  // window lands well above the floor.
  const rmsBefore = await audio.getMaxRMS(2500);
  expect(rmsBefore, 'audio must be running before we test hush').toBeGreaterThan(0.001);

  // Global Ctrl+. — bindings.ts:30-34. CMEditor's keymap also binds Mod-.,
  // but the global handler runs in capture phase so either path silences
  // every runtime. We press once and watch RMS drop to near zero.
  await page.keyboard.press('ControlOrMeta+Period');

  // Sample peak RMS over the 1s window AFTER hush. A scheduled note already
  // in flight may finish its envelope decay, so we tolerate a small floor
  // (0.005) rather than asserting strict zero.
  const rmsAfter = await audio.getMaxRMS(1000);
  expect(
    rmsAfter,
    `RMS must drop after hush, got before=${rmsBefore} after=${rmsAfter}`
  ).toBeLessThan(0.01);

  await page.waitForTimeout(300);
  noErrors();
});

test('Alt+1 / Alt+2 activate scenes 1 and 2 in a multi-scene session', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);

  const sessionContents = readFileSync(join(BUNDLED, '03-scenes-A-B.kanopi'), 'utf8');
  const drumsContents = readFileSync(join(BUNDLED, '03-drums.strudel'), 'utf8');
  const leadContents = readFileSync(join(BUNDLED, '03-lead.strudel'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate(
    ({ session, drums, lead }) => {
      const w = window as unknown as {
        __kanopi?: {
          workspace: {
            loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
          };
        };
      };
      w.__kanopi!.workspace.loadFiles(
        [
          { path: '03-scenes-A-B.kanopi', contents: session },
          { path: '03-drums.strudel', contents: drums },
          { path: '03-lead.strudel', contents: lead }
        ],
        '03-scenes-A-B.kanopi'
      );
    },
    { session: sessionContents, drums: drumsContents, lead: leadContents }
  );

  // Switch the right panel to the Scenes tab so the cards mount
  // (RightPanel.svelte:34 — ScenesPanel only renders when rightPanelTab ===
  // 'scenes'). The `.active` class is on the rendered card itself.
  await page.locator('.rp-tab', { hasText: 'Scenes' }).click();
  await expect(page.locator('.scenes')).toBeVisible({ timeout: 2_000 });

  const calmCard = page.locator('.scenes .card', {
    has: page.locator('.name', { hasText: 'calm' })
  });
  const fullCard = page.locator('.scenes .card', {
    has: page.locator('.name', { hasText: 'full' })
  });
  await expect(calmCard).toBeVisible();
  await expect(fullCard).toBeVisible();

  // Click the panel container (not a card, not the editor) so the keyboard
  // focus is on document.body and the global Alt handler in bindings.ts:58-67
  // receives the keystroke. The handler runs in capture phase regardless,
  // but a clean focus state keeps the test deterministic on cross-browser.
  await page.locator('.scenes').click({ position: { x: 5, y: 5 } });

  // Alt+1 → first scene (calm). bindings.ts maps Alt+digit straight to
  // `core.scenes.activate(target.name)`; the panel reactively flips its
  // `.active` class to follow `scenes.list[i].active`.
  await page.keyboard.press('Alt+Digit1');
  await expect(calmCard).toHaveClass(/active/, { timeout: 3_000 });
  await expect(fullCard).not.toHaveClass(/active/);

  // Alt+2 → second scene (full).
  await page.keyboard.press('Alt+Digit2');
  await expect(fullCard).toHaveClass(/active/, { timeout: 3_000 });
  await expect(calmCard).not.toHaveClass(/active/);

  // Strudel may have started scheduling on scene activation (the scene's
  // first actor's slot is armed). Hush before yielding.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});

test('Shift+Enter evaluates the current line only — a comment line does not throw', async ({
  page
}) => {
  // setupAudioCapture installs page.addInitScript() patches — must run BEFORE
  // page.goto() or the AudioContext constructor wrap never takes hold and
  // __getKanopiRMS() reads zero forever (helpers.ts:18-21).
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const sessionContents = readFileSync(join(BUNDLED, '01-strudel-solo.kanopi'), 'utf8');
  const drumsContents = readFileSync(join(BUNDLED, '01-drums.strudel'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate(
    ({ session, drums }) => {
      const w = window as unknown as {
        __kanopi?: {
          workspace: {
            loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
          };
        };
      };
      w.__kanopi!.workspace.loadFiles(
        [
          { path: '01-strudel-solo.kanopi', contents: session },
          { path: '01-drums.strudel', contents: drums }
        ],
        '01-strudel-solo.kanopi'
      );
    },
    { session: sessionContents, drums: drumsContents }
  );

  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === '01-drums.strudel');
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
    const target = w.__kanopi.workspace.files.find((f) => f.path === '01-drums.strudel');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // 01-drums.strudel:1-3 are `//` comments. Place the cursor at the start of
  // line 1 via CM's view API (helpers.ts:155-171 use the same trick). If
  // Shift+Enter were grabbing the whole paragraph, it would pull in the
  // note(...) block on line 4 too and audio would start. We assert audio
  // stays silent through the eval.
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

  // Fire Shift+Enter — CMEditor.svelte:176-187 takes the trimmed text of the
  // line under the cursor and runs it through onEval. For Strudel this means
  // the slot's body is `// Drums - the kick of the whole composition`,
  // wrapped by buildComposite into `return (\n// ... \n)`. The leading-paren
  // trick (strudel.ts:634-637 / commit b2def23) keeps ASI from collapsing
  // return + comment into `return; // comment`, so the IIFE evaluates to
  // `undefined` instead of throwing. The flash should be ok.
  await page.keyboard.press('Shift+Enter');

  // Green flash confirms the line evaluated without throwing. Don't wait on
  // attach (the 350ms timeout in eval-flash.ts may detach faster than we
  // observe under polling); poll for either ok-or-err to appear, then
  // assert it was the OK variant.
  try {
    await page
      .locator('.cm-flash-ok, .cm-flash-err')
      .first()
      .waitFor({ state: 'attached', timeout: 3_000 });
  } catch {
    /* flash already gone — still ok */
  }
  const errFlashCount = await page.locator('.cm-flash-err').count();
  expect(errFlashCount, 'Shift+Enter on a comment line must not produce an error flash').toBe(0);

  // Sanity: no audio should have leaked out. If Shift+Enter accidentally
  // pulled the whole paragraph (the Mod-Enter behaviour), the note(...)
  // block on line 4 would have evaluated and RMS would climb. We allow a
  // generous 1s window — well below Strudel's first-cycle delay (~2s at
  // default cps) so even an accidental whole-paragraph eval wouldn't sneak
  // sound in before this assertion, but enough to catch synchronous output.
  const rms = await audio.getMaxRMS(1000);
  expect(rms, `Shift+Enter on a comment must not produce audio, got rms=${rms}`).toBeLessThan(0.01);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});

test('Tab accepts the highlighted suggestion when the autocomplete popup is open', async ({
  page
}) => {
  const noErrors = expectNoConsoleErrors(page);

  // Strudel-style autocomplete is wired by strudel-extras.ts:24-36 — the
  // `isAutoCompletionEnabled(true)` toggle attaches `autocompletion({...})`
  // with strudel's function dictionary. CMEditor.svelte:189-191 binds Tab
  // to `acceptCompletion` ONLY when `completionStatus(state) === 'active'`,
  // falling through to indentation otherwise. We need a strudel file open
  // so the override completion source is loaded.
  const sessionContents = readFileSync(join(BUNDLED, '01-strudel-solo.kanopi'), 'utf8');
  const drumsContents = readFileSync(join(BUNDLED, '01-drums.strudel'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate(
    ({ session, drums }) => {
      const w = window as unknown as {
        __kanopi?: {
          workspace: {
            loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
          };
        };
      };
      w.__kanopi!.workspace.loadFiles(
        [
          { path: '01-strudel-solo.kanopi', contents: session },
          { path: '01-drums.strudel', contents: drums }
        ],
        '01-strudel-solo.kanopi'
      );
    },
    { session: sessionContents, drums: drumsContents }
  );

  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === '01-drums.strudel');
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
    const target = w.__kanopi.workspace.files.find((f) => f.path === '01-drums.strudel');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // strudel-extras.install is async — give the Compartment reconfigure a
  // beat to land before we type. Without this, the editor mounts with an
  // empty Compartment and our first few keystrokes fire before autocomplete
  // is even installed.
  await page.waitForTimeout(500);

  // Position the cursor at the very end of the document, on a fresh line.
  // We need a context where the function-name completer (ht in
  // node_modules/@strudel/codemirror/dist/index.mjs:270) matches — that is,
  // a word boundary followed by partial typing.
  await page.locator('.cm-content').first().click();
  await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & {
          cmTile?: {
            root?: {
              view?: {
                state: { doc: { length: number } };
                dispatch: (tr: {
                  selection?: { anchor: number };
                  changes?: { from: number; insert: string };
                }) => void;
              };
            };
          };
        })
      | null;
    const view = content?.cmTile?.root?.view;
    if (!view) return;
    const end = view.state.doc.length;
    view.dispatch({
      changes: { from: end, insert: '\n' },
      selection: { anchor: end + 1 }
    });
  });

  // Trigger autocomplete explicitly via Ctrl-Space — the autocompletion()
  // extension's default keymap binds startCompletion to that chord
  // (node_modules/@codemirror/autocomplete/dist/index.cjs:2061). Type a
  // 3-letter prefix first so the completer has a partial word to filter on.
  await page.keyboard.type('not');
  await page.keyboard.press('Control+Space');

  // The popup is the CM6 standard tooltip — class `cm-tooltip-autocomplete`
  // (autocomplete/dist/index.cjs:525). Wait for it to attach, then capture
  // the document text length so we can prove Tab inserted something beyond
  // the literal 3 chars we typed.
  await expect(page.locator('.cm-tooltip-autocomplete').first()).toBeVisible({ timeout: 3_000 });

  const lenBefore = await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & { cmTile?: { root?: { view?: { state: { doc: { length: number } } } } } })
      | null;
    return content?.cmTile?.root?.view?.state.doc.length ?? -1;
  });

  await page.keyboard.press('Tab');

  // Two signals together prove `acceptCompletion` ran: the popup closes
  // and the document grew past the literal 3-char prefix (the accepted
  // option, e.g. `note`, is at least 4 chars). Either alone is suggestive;
  // both together rule out a stray Tab-as-indent.
  await expect(page.locator('.cm-tooltip-autocomplete').first()).toBeHidden({ timeout: 2_000 });
  const lenAfter = await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & { cmTile?: { root?: { view?: { state: { doc: { length: number } } } } } })
      | null;
    return content?.cmTile?.root?.view?.state.doc.length ?? -1;
  });
  expect(
    lenAfter,
    `Tab must extend the doc beyond the typed prefix; before=${lenBefore} after=${lenAfter}`
  ).toBeGreaterThan(lenBefore);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});
