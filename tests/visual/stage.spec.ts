import type { Page } from '@playwright/test';
import { expect, expectNumbers, FIRST_DRAW, openController, openDisplay, test } from './fixtures';

// Behaviour, not pixels: with decorative motion on, the stage animates continuously.
test.use({ reducedMotion: 'no-preference' });

/**
 * Copies the stage's WebGL canvas into a 2D canvas over a few animation frames and
 * returns the largest share of pixels that are not fully transparent. The renderer
 * clears to transparent (src/lib/stage-renderer.ts), so only what it drew counts.
 */
function paintedShare(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const source = document.querySelector<HTMLCanvasElement>('.sculpture-webgl canvas');
    if (!source || !source.width || !source.height) return 0;
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    const context = copy.getContext('2d', { willReadFrequently: true });
    if (!context) return 0;
    let best = 0;
    for (let frame = 0; frame < 8; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      context.clearRect(0, 0, copy.width, copy.height);
      context.drawImage(source, 0, 0);
      const { data } = context.getImageData(0, 0, copy.width, copy.height);
      let painted = 0;
      for (let index = 3; index < data.length; index += 4) if (data[index] > 0) painted += 1;
      best = Math.max(best, painted / (copy.width * copy.height));
    }
    return best;
  });
}

test('the WebGL stage paints and hides the CSS fallback', async ({ page }) => {
  await openController(page);
  await expect(page.locator('.stage-sculpture')).toHaveClass(/sculpture-ready/);
  await expect(page.locator('.stage-sculpture')).toHaveAttribute('data-scene-source', 'shader');
  await expect(page.locator('.sculpture-webgl canvas')).toHaveCount(1);
  await expect(page.locator('.sculpture-fallback')).toBeHidden();
  // The sculpture, its light pool and the dust cover well over a few percent of the preview.
  const share = await paintedShare(page);
  expect(share).toBeGreaterThan(0.05);
});

test('both stages are drawing only while a draw runs', async ({ page }) => {
  // Two SwiftShader pages share a small CI runner's CPU; give the whole sequence room.
  test.setTimeout(120_000);
  await openController(page);
  const display = await openDisplay(page);
  // Ten seconds: on a 2-vCPU runner the display's main thread can be starved for seconds,
  // and a 3 s draw could start and finish inside one batch there, never rendering as drawing.
  await page.locator('#draw-duration').selectOption('10000');
  await expect(page.locator('#draw-duration')).toHaveValue('10000');
  await expect(page.locator('.cinematic-stage.stage-drawing')).toHaveCount(0);

  await page.locator('.draw-button').click();
  await expect(page.locator('.cinematic-stage.stage-drawing')).toHaveCount(1);
  await expect(display.locator('.cinematic-stage.stage-drawing')).toHaveCount(1);
  await expect(page.locator('.draw-button')).toHaveText('Drawing');

  // The draw lasts ten seconds, longer than the default expect timeout.
  await expect(page.locator('.cinematic-stage.stage-drawing')).toHaveCount(0, { timeout: 30_000 });
  await expect(display.locator('.cinematic-stage.stage-drawing')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('.cinematic-stage')).toHaveClass(/stage-occupied/);
  await expect(page.locator('.count-badge')).toHaveText('1');
  await expectNumbers(display.locator('.presentation-canvas'), FIRST_DRAW);
});
