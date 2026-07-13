import { test, expect } from '@playwright/test';

// The dedicated full-width library space (brief lot 2): opening the Library
// activity icon swaps the editor for a category rail + filter bar + scene grid.
// Filtering by category and by search narrows the grid.
test('library space filters scenes by category and search', async ({ page }) => {
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Open the dedicated library space.
  await page.locator('.ab-btn[title="Factory"]').click();
  await expect(page.locator('.space')).toBeVisible({ timeout: 5_000 });

  // Every bundled scene shows under "All".
  const cards = page.locator('.card');
  const total = await cards.count();
  expect(total).toBeGreaterThan(6);

  // The BP3 category narrows to the bundled `.gr` grammars (21 after the corpus
  // restructure — 6 original + 15 Bernard Bel grammars imported, commit f7d3f27).
  await page.locator('.cat', { hasText: 'BP3' }).click();
  await expect(cards).toHaveCount(21);
  await expect(page.locator('.result-count')).toHaveText('21 scenes');

  // Search narrows further, within the active category.
  await page.locator('.search').fill('ames');
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator('.name')).toContainText('Ames');
});
