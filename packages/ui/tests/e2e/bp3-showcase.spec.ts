import { test, expect } from '@playwright/test';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// Bol Processor showcase: each authentic .gr grammar from Bernard Bel's corpus
// is loaded through the SAME UI flow a user walks — Library panel → click the
// card's `load` → confirm — then evaluated. We assert the keystone chain
//   parseBP3 → createBPx → derive → Dispatcher → WebAudioTransport
// actually makes sound (peak RMS over a window) with no console errors, and
// always hush (Ctrl+.) at the end (audio rule).
//
// One card per STARTERS bp3 entry; `cardName` is the visible card title and
// `grFile` is the actor tab that opens after load.
const SHOWCASE = [
  { cardName: 'BP — Rotate scales', grFile: 'bp-rotate-scales.gr' },
  { cardName: 'BP — NotReich', grFile: 'bp-not-reich.gr' },
  { cardName: 'BP — Ames', grFile: 'bp-ames.gr' },
  { cardName: 'BP — Visser5', grFile: 'bp-visser5.gr' }
];

for (const { cardName, grFile } of SHOWCASE) {
  test(`bp3 showcase: "${cardName}" loads via Library and produces audio`, async ({ page }) => {
    // Prod adds network latency over dev; bp3 derivation of the larger
    // grammars (Visser5 ~1300 tokens) is fast but the full load chain plus
    // the audio window needs headroom.
    test.setTimeout(60_000);

    const audio = await setupAudioCapture(page);
    const noErrors = expectNoConsoleErrors(page);

    // LibraryView.load() uses window.confirm() — auto-accept it.
    page.on('dialog', (dialog) => {
      void dialog.accept();
    });

    await page.goto('');
    await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

    await page.locator('button[title="Library"]').click();

    const card = page.locator('.card', { has: page.getByText(cardName, { exact: true }) }).first();
    await expect(card).toBeVisible({ timeout: 5_000 });
    await card.getByRole('button', { name: 'load' }).click();

    // The actor tab for the grammar opens via App.svelte's queueMicrotask.
    const actorTab = page.locator('.tab', { has: page.locator('.name', { hasText: grFile }) });
    await expect(actorTab).toBeVisible({ timeout: 10_000 });
    await actorTab.click();
    await expect(actorTab).toHaveClass(/active/, { timeout: 5_000 });

    await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

    // Ctrl+Enter anywhere derives the whole grammar (bp3 extract = whole file).
    // The first non-comment line of every showcase .gr is well below line 30.
    await evalBlockAt(page, 1);

    // The derivation schedules notes across the grammar's full span. Sample a
    // window wide enough to cover the opening bars and catch the loudest moment.
    const rms = await audio.getMaxRMS(7000);
    expect(rms).toBeGreaterThan(0.001);

    // Hush (Ctrl+.) — never leave audio running for the user at the machine.
    await page.keyboard.press('ControlOrMeta+Period');
    await page.waitForTimeout(300);
    noErrors();
  });
}
