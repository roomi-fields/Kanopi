import { test, expect } from '@playwright/test';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// Bol Processor showcase: each authentic .gr grammar from Bernard Bel's corpus
// is loaded through the SAME UI flow a user walks — Library panel → click the
// card's `load` → confirm — then evaluated, asserting the keystone chain
//   parseBP3 → createBPx → derive → Kairos (projection) → Kronos → runtime-audio
// runs with no console errors. Always hush (Ctrl+.) at the end (audio rule).
//
// `audibleHeadless: false` marks the two low-register grammars (Acceleration,
// octave 2; Transposition, octave 1 — roughly 41–123 Hz). They derive and play
// in a REAL browser (where Bernard hears them), but headless Chromium's audio
// path doesn't surface a measurable RMS for such low frequencies (see
// docs/plan/BACKLOG.md BP-1). For those we assert the grammar loads + derives +
// evaluates cleanly; the other four additionally assert peak RMS audio.
// Rotate scales / Transposition / Visser5 left the showcase with the
// iso-proven-only ruling [827] (not on the iso-100 scoreboard); their `.gr`
// live on in library/unpublished/bp3. Phase B [826] additions are covered by
// bp3-bel-phase-b.test.ts (derivation) — the audible ones keep the RMS proof here.
const SHOWCASE = [
  { cardName: 'BP — NotReich', grFile: 'bp-not-reich.gr', audibleHeadless: true },
  { cardName: 'BP — Acceleration', grFile: 'bp-acceleration.gr', audibleHeadless: false },
  { cardName: 'BP — Ames', grFile: 'bp-ames.gr', audibleHeadless: true },
  { cardName: 'BP — Graphics', grFile: 'bp-graphics.gr', audibleHeadless: true },
  { cardName: 'BP — Harmony', grFile: 'bp-harmony.gr', audibleHeadless: true }
];

for (const { cardName, grFile, audibleHeadless } of SHOWCASE) {
  const what = audibleHeadless ? 'produces audio' : 'derives cleanly (low register)';
  test(`bp3 showcase: "${cardName}" loads via Library and ${what}`, async ({ page }) => {
    // Prod adds network latency over dev; bp3 derivation of the larger grammars
    // (Visser5 ~1300 tokens) is fast but the full load chain plus the audio
    // window needs headroom.
    test.setTimeout(60_000);

    const audio = await setupAudioCapture(page);
    const noErrors = expectNoConsoleErrors(page);

    // LibraryView.load() uses window.confirm() — auto-accept it.
    page.on('dialog', (dialog) => {
      void dialog.accept();
    });

    await page.goto('');
    await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

    await page.locator('button[title="Factory"]').click();

    const card = page.locator('.card', { has: page.getByText(cardName, { exact: true }) }).first();
    await expect(card).toBeVisible({ timeout: 5_000 });
    await card.getByRole('button', { name: 'load' }).click();

    // The `.gr` opens DIRECTLY as the focused tab (loadFiles focusPath) — no
    // `.kanopi` session wrapper; the grammar IS the session.
    const actorTab = page.locator('.tab', { has: page.locator('.name', { hasText: grFile }) });
    await expect(actorTab).toBeVisible({ timeout: 10_000 });
    await actorTab.click();
    await expect(actorTab).toHaveClass(/active/, { timeout: 5_000 });

    await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

    // Ctrl+Enter anywhere derives the whole grammar (bp3 extract = whole file).
    // A parse/derivation failure would throw in the adapter → red flash + a
    // console error caught by noErrors() below; reaching the end cleanly proves
    // the grammar bundled, parsed, derived, and scheduled.
    await evalBlockAt(page, 1);

    if (audibleHeadless) {
      // Sample a window wide enough to cover the opening bars, catch the peak.
      const rms = await audio.getMaxRMS(7000);
      expect(rms).toBeGreaterThan(0.001);
    }

    // Hush (Ctrl+.) — never leave audio running for the user at the machine.
    await page.keyboard.press('ControlOrMeta+Period');
    await page.waitForTimeout(300);
    noErrors();
  });
}
