import { drawOnce, expect, expectNumbers, FIRST_DRAW, openController, SECOND_DRAW, settle, storedDraws, test } from './fixtures';

test.describe('welcome', () => {
  test.use({ skipWelcome: false });

  test('welcome screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.welcome-enter-silent')).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot('welcome.png');
  });
});

test.describe('controller', () => {
  test('idle', async ({ page }) => {
    await openController(page);
    await expect(page.locator('.stage-welcome h1')).toHaveText('Ready to reveal.');
    await expect(page).toHaveScreenshot('controller-idle.png');
  });

  test('after a draw', async ({ page }) => {
    await openController(page);
    await drawOnce(page);
    expect(await storedDraws(page)).toEqual([FIRST_DRAW]);
    // What the operator sees: the stage tiles, the Session history chips and the pool stats.
    await expectNumbers(page.locator('.draw-workspace'), FIRST_DRAW);
    await expect(page.locator('.history-entry .history-chips span')).toHaveText(FIRST_DRAW.map(String));
    await expect(page.locator('.session-stats .stat-value')).toHaveText(['100', '10', '90']);
    await expect(page).toHaveScreenshot('controller-after-draw.png');
  });

  test('full history after two draws', async ({ page }) => {
    await openController(page);
    await drawOnce(page);
    await drawOnce(page);
    expect(await storedDraws(page)).toEqual([FIRST_DRAW, SECOND_DRAW]);
    await page.getByRole('button', { name: 'Full history' }).click();
    const history = page.locator('.preview-canvas.history-canvas');
    await expect(history.locator('.history-draw')).toHaveCount(2);
    // Newest first.
    await expectNumbers(history, [...SECOND_DRAW, ...FIRST_DRAW]);
    await settle(page);
    await expect(page).toHaveScreenshot('controller-full-history.png');
  });

  test('guide dialog', async ({ page }) => {
    await openController(page);
    await page.locator('.manual-guide-trigger').click();
    const dialog = page.locator('.manual-guide-dialog[open]');
    await expect(dialog).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot('guide-languages.png');
    await dialog.getByRole('button', { name: /English/ }).click();
    await expect(dialog).toHaveClass(/manual-guide-reading/);
    await settle(page);
    await expect(page).toHaveScreenshot('guide-english.png');
  });

  test('reset dialog', async ({ page }) => {
    await openController(page);
    await drawOnce(page);
    await page.locator('.footer-actions').getByRole('button', { name: 'New session' }).click();
    await expect(page.locator('.reset-dialog[open]')).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot('reset-dialog.png');
  });

  test('150% text size', async ({ page }) => {
    await openController(page);
    await drawOnce(page);
    const increase = page.getByRole('button', { name: 'Increase controller text size' });
    for (let step = 0; step < 5; step += 1) await increase.click();
    await expect(page.locator('.controller-text-reset output')).toHaveText('150%');
    await expect(increase).toBeDisabled();
    await settle(page);
    await expect(page).toHaveScreenshot('controller-text-150.png');
  });
});

test.describe('narrow window', () => {
  test.use({ viewport: { width: 860, height: 620 } });

  test('controller at 860×620', async ({ page }) => {
    await openController(page);
    await drawOnce(page);
    await expectNumbers(page.locator('.draw-workspace'), FIRST_DRAW);
    await expect(page).toHaveScreenshot('controller-narrow.png', { fullPage: true });
  });
});
