import { defineConfig } from '@playwright/test';

/**
 * Visual regression suite for the browser preview (README, "Checks").
 * Baselines are rendered by headless Chromium with SwiftShader, its CPU WebGL
 * renderer, on Windows: they live in tests/visual/__screenshots__ with a -win32
 * suffix, and other platforms render text and WebGL differently.
 */
// The suite owns this port for the whole run (reuseExistingServer is off). VISUAL_PORT moves
// it, so a second checkout can run its suite at the same time.
const PORT = Number(process.env.VISUAL_PORT ?? 4321);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'tests/visual',
  // One folder per spec file, one PNG per screenshot name, without the project name.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}-{platform}{ext}',
  outputDir: 'test-results',
  forbidOnly: !!process.env.CI,
  // No retries: a screenshot that only passes on a second attempt is a flake to fix, not to hide.
  retries: 0,
  // SwiftShader renders WebGL on the CPU, so workers compete for it: six at once on a
  // 12-thread machine starved pages past their timeouts. Locally, one worker per four CPU
  // threads; CI runs one test at a time to keep a margin on its smaller runners.
  workers: process.env.CI ? 1 : '25%',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      // CSS animations and transitions are finished or cancelled before each capture.
      animations: 'disabled',
      caret: 'hide',
      // An absolute budget, not a share of the page: repeated runs on one machine match to the
      // pixel, and a changed label or a hidden button moves hundreds. One changed digit in a
      // small chip can move fewer than ten, so the specs also assert the drawn numbers and the
      // session stats as text.
      maxDiffPixels: 50,
    },
  },
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    // Decorative motion off: the stage renders one still frame and number tiles skip their spring.
    reducedMotion: 'reduce',
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          // WebGL2 through SwiftShader, so the stage renders headless and without a GPU.
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
        },
      },
    },
  ],
  webServer: {
    // Never the desktop app's port 1420, so a running `npm run dev` or `npm run desktop` is left alone.
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
