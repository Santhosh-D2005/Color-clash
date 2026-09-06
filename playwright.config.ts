import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests.
 *
 * The review's fair criticism was that the browser testing existed but lived in
 * a throwaway script outside the repository, so none of it protected against
 * regression. These specs are that work, committed.
 *
 * They run against the built **PWA** — the same folder Capacitor copies into
 * the APK — served over http by a dependency-free static server. Not the dev
 * server, because the point is to test what ships; and not `file://`, because a
 * file page has an opaque origin where `localStorage` does not exist, which
 * would make a spec like "the sound preference persists" impossible to write.
 *
 * Two projects, because the layout bugs this game had were all size-dependent:
 * a phone in portrait, and the same phone rotated.
 */
export default defineConfig({
  testDir: './e2e',
  // A card game is full of timed transitions; a short default just produces
  // flakes that get "fixed" by adding sleeps.
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: {
    command: 'node tools/serve-dist.mjs 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },

  projects: [
    {
      // Layout and gameplay at the two orientations a phone actually has.
      name: 'phone-portrait',
      use: { ...devices['Pixel 7'] },
      testIgnore: /online\.spec\.ts/,
    },
    {
      name: 'phone-landscape',
      use: { ...devices['Pixel 7 landscape'] },
      testIgnore: /online\.spec\.ts/,
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
