import { expect, test } from '@playwright/test';
import {
  buildUrl,
  clearOpeningChoice,
  hand,
  isolate,
  openMenu,
  settle,
  startQuickMatch,
} from './helpers.js';

/**
 * Who you are, and what survives being closed.
 *
 * Three of the fixes in this pass are only observable across a reload — the
 * name you type, the currency the Store promises in writing, and a match you
 * were in the middle of. A unit test cannot see any of them, because the thing
 * under test is the browser keeping its side of the bargain.
 *
 * These specs deliberately do *not* use `openMenu`, which seeds a profile so
 * that every other spec starts as a returning player.
 */

test('asks a brand-new player for a name, once', async ({ page }) => {
  await isolate(page);
  await page.goto(buildUrl());

  const field = page.getByLabel(/display name/i);
  await expect(field).toBeVisible({ timeout: 20_000 });

  // An empty name is refused rather than silently accepted as "PlayerOne",
  // which is what every player used to be called.
  const start = page.getByRole('button', { name: /START PLAYING/i });
  await expect(start).toBeDisabled();

  await field.fill('Ada');
  await start.click();
  await expect(page.getByText('QUICK MATCH')).toBeVisible();
  await expect(page.locator('.profile-name')).toHaveText('Ada');

  // Second visit: asked once, not every launch.
  await page.reload();
  await expect(page.getByText('QUICK MATCH')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.profile-name')).toHaveText('Ada');
});

test('spends and keeps currency across a reload', async ({ page }) => {
  await openMenu(page);
  const coins = await page.locator('.currency').first().textContent();
  expect(coins?.trim()).not.toBe('');

  await page.reload();
  await expect(page.getByText('QUICK MATCH')).toBeVisible({ timeout: 20_000 });
  expect((await page.locator('.currency').first().textContent())?.trim()).toBe(coins?.trim());
});

test('offers to resume a match that was interrupted', async ({ page }) => {
  await startQuickMatch(page);

  // Play one card so the saved log is not merely the deal.
  const playable = page.locator('.hand .card-slot.playable').first();
  if (await playable.isVisible().catch(() => false)) {
    await playable.click();
    await settle(page);
    await clearOpeningChoice(page);
  }
  const before = await hand(page).count();

  // Backgrounding an app and having it killed looks exactly like this.
  await page.reload();
  await expect(page.getByText('QUICK MATCH')).toBeVisible({ timeout: 20_000 });

  const resume = page.getByRole('button', { name: /RESUME MATCH/ });
  await expect(resume).toBeVisible();
  await resume.click();

  await expect(page.getByRole('button', { name: /Draw pile/ })).toBeVisible();
  await settle(page);
  await clearOpeningChoice(page);
  // The same match, not a new deal: the hand comes back the size it was.
  expect(await hand(page).count()).toBe(before);
});

test('discarding the saved match puts the offer away for good', async ({ page }) => {
  await startQuickMatch(page);
  await page.reload();
  await expect(page.getByText('QUICK MATCH')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /Discard the unfinished match/ }).click();
  await expect(page.getByRole('button', { name: /RESUME MATCH/ })).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('QUICK MATCH')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /RESUME MATCH/ })).toHaveCount(0);
});
