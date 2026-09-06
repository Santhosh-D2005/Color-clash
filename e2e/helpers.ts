import { expect, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Shared setup for the browser suite.
 *
 * The build under test is `dist/pwa`, served over http by
 * `tools/serve-dist.mjs` — see the note in playwright.config.ts for why. If it
 * is missing the failure says how to make it, rather than leaving someone to
 * decode a blank page.
 */
export const BUILD = resolve(import.meta.dirname, '../dist/pwa/index.html');

export function buildUrl(): string {
  if (!existsSync(BUILD)) {
    throw new Error(`Missing ${BUILD}.\nRun: npm run build:pwa`);
  }
  return '/';
}

/**
 * Blocks every off-machine request.
 *
 * The build links a web font. Letting the suite fetch it makes each run depend
 * on a CDN being reachable and fast, which is the classic way a test suite
 * becomes "flaky" for reasons that have nothing to do with the code. The game
 * has a full system-font fallback, so blocking it changes nothing under test.
 */
export async function isolate(page: Page): Promise<void> {
  // Fulfilled empty rather than aborted: an aborted request logs a console
  // error, and one spec asserts the boot is clean. Serving nothing is the
  // honest simulation of "the font did not load".
  // Only off-machine hosts: the local static server serving the build under
  // test obviously has to be left alone.
  await page.route(
    (url) => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost',
    (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
}

/** The stored profile a returning player has. */
export const RETURNING_PLAYER = {
  name: 'Ada',
  level: 25,
  coins: 12450,
  gems: 860,
};

/**
 * Presents the app with a profile before it boots.
 *
 * The game asks a brand-new player for a display name exactly once, which is
 * correct and is covered by its own spec. Every *other* spec is about what
 * happens afterwards, so they start as a returning player rather than each
 * typing a name first.
 */
export async function asReturningPlayer(page: Page): Promise<void> {
  await page.addInitScript((profile) => {
    try {
      localStorage.setItem('colorclash.profile', JSON.stringify(profile));
    } catch {
      /* storage unavailable; the name prompt spec covers that path */
    }
  }, RETURNING_PLAYER);
}

/** Loads the app and waits for the splash to hand over to the menu. */
export async function openMenu(page: Page): Promise<void> {
  await isolate(page);
  await asReturningPlayer(page);
  await page.goto(buildUrl());
  await expect(page.getByText('QUICK MATCH')).toBeVisible({ timeout: 20_000 });
  await settle(page);
}

/**
 * Waits for the screen-entry animation to finish.
 *
 * Screens slide in with a 420ms transform. Measuring a bounding box while that
 * is still running reports a position several pixels off, which is how a layout
 * spec ends up failing for a reason that has nothing to do with the layout.
 */
export async function settle(page: Page): Promise<void> {
  await page
    .locator('.screen')
    .first()
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))))
    .catch(() => {});
}

/**
 * Clears a choice the deal itself opened.
 *
 * An opening wild leaves a colour prompt over the table before anyone has
 * played, and its scrim intercepts every tap underneath. That is correct
 * behaviour, but it is setup noise for a spec about something else, so specs
 * that need a playable table clear it here rather than each working around it.
 */
export async function clearOpeningChoice(page: Page): Promise<void> {
  const picker = page.locator('.color-choice').first();
  if (await picker.isVisible().catch(() => false)) {
    await picker.click();
    await settle(page);
    return;
  }
  const target = page.locator('.target-row').first();
  if (await target.isVisible().catch(() => false)) {
    await target.click();
    await settle(page);
  }
}

/** Starts a quick local match and waits for a playable table. */
export async function startQuickMatch(page: Page): Promise<void> {
  await openMenu(page);
  await page.getByText('QUICK MATCH').click();
  await expect(page.getByRole('button', { name: /Draw pile/ })).toBeVisible();
  await settle(page);
  await clearOpeningChoice(page);
}

/** Opens mode select and starts the named mode through the lobby. */
export async function startMode(page: Page, mode: RegExp): Promise<void> {
  await openMenu(page);
  await page.getByText('GAME MODES').click();
  await page.getByRole('button', { name: mode }).click();
  await page.getByRole('button', { name: /^START/i }).first().click();
  await expect(page.getByRole('button', { name: /Draw pile/ })).toBeVisible();
  await settle(page);
  await clearOpeningChoice(page);
}

/** Collects console errors, so a spec can assert the run was clean. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** The player's own hand, as card slots. */
export function hand(page: Page) {
  return page.locator('.hand .card-slot');
}

/**
 * Cards the engine currently accepts, and cards it does not.
 *
 * The class is on the slot itself, not on a child — an earlier version of these
 * helpers looked for a descendant, which silently matched nothing and made
 * every spec quietly take its "nothing is playable" branch.
 */
export function playableCards(page: Page) {
  return page.locator('.hand .card-slot.playable');
}

export function blockedCards(page: Page) {
  return page.locator('.hand .card-slot.blocked');
}
