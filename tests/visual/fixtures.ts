import { test as base, expect, type Locator, type Page } from '@playwright/test';

/** The seed every page's randomness starts from, so draws and session IDs repeat run after run. */
export const RANDOM_SEED = 0x5eed_2026;

/** The first two draws from RANDOM_SEED, with the default pool of 1–100 and 10 per draw. */
export const FIRST_DRAW: readonly number[] = [50, 30, 26, 49, 37, 45, 67, 25, 79, 85];
export const SECOND_DRAW: readonly number[] = [11, 78, 19, 53, 100, 86, 14, 88, 92, 5];

/**
 * The wall-clock time every test starts at. Its clock keeps running from there, and a test
 * ends within its 60-second timeout, so every history time reads 09:00 (the config's time
 * zone is UTC) and screenshots show it unmasked.
 */
export const CLOCK_START = new Date('2026-01-01T09:00:00Z');

/** localStorage keys the app reads its device preferences from (src/lib/welcome-preferences.ts, draw-sound.ts). */
const SKIP_WELCOME_KEY = 'whizreveal.skip-welcome';
const SOUND_ENABLED_KEY = 'whizreveal.sound-enabled';

type InitOptions = { seed: number; clockOffsetMs: number; preferences: Record<string, string> };

/**
 * Runs in every page and frame before the app's own scripts. It must stay self-contained:
 * Playwright serialises its source into the page.
 *
 * - crypto.getRandomValues, crypto.randomUUID and Math.random draw from seeded
 *   generators (mulberry32), so the preview's draws (src/lib/preview-model.ts) and
 *   session IDs (src/lib/bridge.ts) are the same in every run.
 * - Date reads the real time shifted by one offset that every page of the test shares, so
 *   it starts near CLOCK_START and runs at normal speed, and the controller and display
 *   still agree on draw deadlines (bridge.ts). Only Date moves: timers, animation frames
 *   and performance.now stay native, so the stage renders as it does for real.
 *   (Playwright's clock.install would also fake requestAnimationFrame, after which the
 *   stage's WebGL canvas reads back empty.)
 * - Device preferences start at fixed values, but only where the app has not written
 *   its own yet, so a preference the test changes survives a reload.
 */
function prepareWindow({ seed, clockOffsetMs, preferences }: InitOptions): void {
  const generator = (initial: number) => {
    let state = initial >>> 0;
    return (): number => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return (value ^ (value >>> 14)) >>> 0;
    };
  };
  const nextWord = generator(seed);
  const nextFloat = generator(seed ^ 0x9e3779b9);

  function getRandomValues<T extends ArrayBufferView | null>(array: T): T {
    if (!array) return array;
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (let index = 0; index < bytes.length; index += 4) {
      const word = nextWord();
      for (let byte = 0; byte < 4 && index + byte < bytes.length; byte += 1) bytes[index + byte] = (word >>> (byte * 8)) & 0xff;
    }
    return array;
  }

  function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
    const bytes = getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  Object.defineProperty(globalThis.crypto, 'getRandomValues', { value: getRandomValues, configurable: true });
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: randomUUID, configurable: true });
  Math.random = () => nextFloat() / 0x1_0000_0000;

  const RealDate = Date;
  const wallNow = (): number => RealDate.now() + clockOffsetMs;
  // `new Date()` and `Date()` read the shifted clock; `new Date(value)` is untouched.
  function ShiftedDate(this: unknown, ...args: unknown[]): Date | string {
    if (!new.target) return new RealDate(wallNow()).toString();
    return Reflect.construct(RealDate, args.length ? args : [wallNow()], new.target) as Date;
  }
  ShiftedDate.prototype = RealDate.prototype;
  Object.setPrototypeOf(ShiftedDate, RealDate); // Date.UTC, Date.parse
  Object.defineProperty(ShiftedDate, 'now', { value: wallNow, configurable: true, writable: true });
  globalThis.Date = ShiftedDate as unknown as DateConstructor;

  try {
    for (const [key, value] of Object.entries(preferences)) {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    }
  } catch {
    // about:blank and other opaque origins have no storage; the app's own pages do.
  }
}

type Options = {
  /** Start past the welcome screen, as a returning user who chose "Skip welcome next time". */
  skipWelcome: boolean;
};

type Fixtures = {
  /** Console errors and uncaught exceptions from every page of the test; any one fails it. */
  consoleErrors: string[];
};

export const test = base.extend<Options & Fixtures>({
  skipWelcome: [true, { option: true }],

  // Each test already gets a fresh context, so localStorage starts empty every time.
  context: async ({ context, skipWelcome }, use) => {
    await context.addInitScript(prepareWindow, {
      seed: RANDOM_SEED,
      // Computed once per test, so a page opened later reads the same clock as the first.
      clockOffsetMs: CLOCK_START.getTime() - Date.now(),
      // Sound stays off: the suite never depends on audio output or autoplay permission.
      preferences: { [SKIP_WELCOME_KEY]: String(skipWelcome), [SOUND_ENABLED_KEY]: 'false' },
    } satisfies InitOptions);
    await use(context);
  },

  consoleErrors: [async ({ context }, use) => {
    const errors: string[] = [];
    const watch = (page: Page) => {
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`${page.url()} console.error: ${message.text()}`);
      });
      page.on('pageerror', (error) => errors.push(`${page.url()} uncaught: ${error.message}`));
    };
    context.pages().forEach(watch);
    context.on('page', watch);
    await use(errors);
    expect(errors, 'console errors on any page').toEqual([]);
  }, { auto: true }],
});

export { expect };

/**
 * Waits for what a screenshot depends on: the bundled fonts, and a stage whose WebGL
 * sculpture has replaced the CSS fallback and painted. Then parks the pointer outside
 * every control, so no hover state reaches the capture.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => { await document.fonts.ready; });
  const stages = page.locator('.stage-sculpture');
  await expect(stages.first()).toBeAttached();
  await expect(page.locator('.stage-sculpture:not(.sculpture-ready)')).toHaveCount(0);
  for (const stage of await stages.all()) await expect(stage).toHaveAttribute('data-scene-source', 'shader');
  await page.mouse.move(1, 1);
  // Two frames: one for the renderer's last draw, one for the compositor to show it.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/** Opens the controller and waits until it has faded in with the session loaded. */
export async function openController(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.draw-button')).toBeEnabled();
  await expect(page.locator('.controller-shell-wrap')).toHaveCSS('opacity', '1');
  await settle(page);
}

/** Opens the audience display in its own page of the same context, as Launch display does. */
export async function openDisplay(page: Page): Promise<Page> {
  const display = await page.context().newPage();
  await display.goto('/?window=display');
  await expect(display.locator('.display-shell')).toBeVisible();
  await settle(display);
  return display;
}

/** Draws once from the controller and waits for the reveal to finish. */
export async function drawOnce(page: Page): Promise<void> {
  const completed = Number(await page.locator('.count-badge').textContent());
  await page.locator('.draw-button').click();
  // Session history counts a draw only once its reveal has finished.
  await expect(page.locator('.count-badge')).toHaveText(String(completed + 1));
  await expect(page.locator('.cinematic-stage.stage-drawing')).toHaveCount(0);
  await expect(page.locator('.draw-button')).toBeEnabled();
  // The fixed clock (CLOCK_START) is what lets screenshots show history times unmasked.
  await expect(page.locator('.history-entry-meta time').first()).toHaveText('09:00');
  await settle(page);
}

/**
 * Asserts the numbers shown inside `scope`, in reading order, as text. A wrong winner can
 * differ from its baseline by only a few pixels, so the screenshots do not stand in for this.
 */
export async function expectNumbers(scope: Locator, numbers: readonly number[]): Promise<void> {
  await expect(scope.locator('.number-value')).toHaveText(numbers.map(String));
}

/** The winners of every draw in the stored preview session, oldest first. */
export async function storedDraws(page: Page): Promise<number[][]> {
  return page.evaluate(() => {
    const session = JSON.parse(window.localStorage.getItem('whizreveal.preview.v1') ?? '{"history":[]}') as { history: { numbers: number[] }[] };
    return session.history.map((draw) => draw.numbers).reverse();
  });
}
