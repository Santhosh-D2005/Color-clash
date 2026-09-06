import { expect, test } from '@playwright/test';
import { hand, openMenu, startMode, startQuickMatch, watchErrors } from './helpers.js';

/**
 * Startup, navigation and layout.
 *
 * Every layout bug this game shipped was size-dependent, which is why the suite
 * runs the same specs at phone-portrait, phone-landscape and desktop rather
 * than picking one viewport and hoping.
 */

test('boots to the main menu with no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openMenu(page);

  await expect(page.getByText('GAME MODES')).toBeVisible();
  await expect(page.getByText('ONLINE')).toBeVisible();
  expect(errors).toEqual([]);
});

test('shows all five modes with their own names and rules links', async ({ page }) => {
  await openMenu(page);
  await page.getByText('GAME MODES').click();

  for (const name of ['CLASSIC CLASH', 'FLIPSTORM', 'MAYHEM', 'WILD RUSH', 'FREESTYLE']) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /How to play/ })).toHaveCount(5);
});

test('the page never scrolls sideways', async ({ page }) => {
  await openMenu(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('a match table fits the viewport with the hand reachable', async ({ page }) => {
  await startQuickMatch(page);

  const box = await page.locator('.hand-bar').boundingBox();
  const size = page.viewportSize()!;
  expect(box).not.toBeNull();
  // The hand bar has to be on screen: a hand you cannot reach is not a game.
  expect(box!.y).toBeLessThan(size.height);
  expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 2);

  // And the player must actually hold cards.
  expect(await hand(page).count()).toBeGreaterThan(0);
});

test('opponent seats do not overlap the piles', async ({ page }) => {
  await startQuickMatch(page);

  const pile = await page.locator('.pile-row').boundingBox();
  const seats = page.locator('.seat');
  const count = await seats.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const seat = await seats.nth(i).boundingBox();
    if (!seat || !pile) continue;
    const overlaps =
      seat.x < pile.x + pile.width &&
      seat.x + seat.width > pile.x &&
      seat.y < pile.y + pile.height &&
      seat.y + seat.height > pile.y;
    expect(overlaps, `seat ${i} overlaps the piles`).toBe(false);
  }
});

test('the header number is the deck, and it is labelled as the deck', async ({ page }) => {
  await startQuickMatch(page);

  /*
   * This slot has now been wrong twice, which is why it is pinned.
   *
   * First it held a clock wearing the coin icon from the currency HUD, so it
   * read as a score. Then it held a clock that read correctly and still meant
   * nothing, because the game has no time pressure to measure. It now holds
   * the one number the table could not otherwise answer — how much draw pile
   * is left — and the assertion below is that it says so out loud rather than
   * being another bare figure to guess at.
   */
  await expect(page.locator('.timer')).toHaveCount(0);

  /*
   * The count lives on the draw pile and nowhere else. It was briefly mirrored
   * into the header too, which put the same number on screen twice in two
   * sizes; the header copy is gone and this pins that it stays gone.
   */
  await expect(page.locator('.deck-count')).toHaveCount(0);

  const pile = page.locator('button.draw-pile');
  await expect(pile).toBeVisible();
  await expect(pile).toHaveAttribute('aria-label', /^Draw pile, \d+ cards remaining$/);

  // The visible figure and the spoken one are the same figure.
  const label = await pile.getAttribute('aria-label');
  const spoken = /(\d+)/.exec(label ?? '')?.[1];
  await expect(page.locator('.pile-count')).toHaveText(String(spoken));
});

test('play direction is readable at every viewport', async ({ page }) => {
  // In landscape the felt ring that used to be the only direction cue is
  // hidden, which left "who plays after me" unanswerable on a phone held
  // sideways.
  await startQuickMatch(page);
  const dir = page.locator('.turn-dir');
  await expect(dir).toBeVisible();
  await expect(dir).toHaveAttribute('aria-label', /Play order: (clockwise|anticlockwise)/);
});

test('every mode starts and deals a hand', async ({ page }) => {
  // Each iteration reloads via startMode rather than clicking out of the
  // match: an opening wild leaves a colour prompt over the table, and fighting
  // a modal to leave would be testing the test, not the game.
  for (const mode of [
    /^CLASSIC CLASH —/,
    /^FLIPSTORM —/,
    /^MAYHEM —/,
    /^WILD RUSH —/,
    /^FREESTYLE —/,
  ]) {
    await startMode(page, mode);
    expect(await hand(page).count(), `${mode} dealt no cards`).toBeGreaterThan(0);
  }
});
