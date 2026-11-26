import { drawOnce, expect, expectNumbers, FIRST_DRAW, openController, openDisplay, SECOND_DRAW, settle, test } from './fixtures';

test('display: current draw and full history', async ({ page }) => {
  await openController(page);
  // Opened first, as Launch display would be: both draws reach it over the preview's sync channel.
  const display = await openDisplay(page);
  await expect(display.locator('.cinematic-stage.stage-idle')).toBeVisible();

  await drawOnce(page);
  await drawOnce(page);
  // The audience sees the winners the controller drew, not just ten filled tiles.
  await expectNumbers(display.locator('.presentation-canvas:not(.history-canvas)'), SECOND_DRAW);
  await settle(display);
  await expect(display).toHaveScreenshot('display-current.png');

  await page.getByRole('button', { name: 'Full history' }).click();
  const history = display.locator('.presentation-canvas.history-canvas');
  await expect(history.locator('.history-draw')).toHaveCount(2);
  // Newest first.
  await expectNumbers(history, [...SECOND_DRAW, ...FIRST_DRAW]);
  await settle(display);
  await expect(display).toHaveScreenshot('display-history.png');
});
