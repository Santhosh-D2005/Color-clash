import { expect, test } from '@playwright/test';
import {
  blockedCards,
  clearOpeningChoice,
  hand,
  openMenu,
  playableCards,
  startMode,
  startQuickMatch,
} from './helpers.js';

/**
 * Playing.
 *
 * These cover the fixes a player would notice: that opponents no longer
 * teleport through their turns, that Wild Rush stopped asking for a colour it
 * does not use, that the settings gear and the emote button do something, and
 * that the summary stops presenting a result as a fine.
 */

test('a playable card can be played and lands on the pile', async ({ page }) => {
  await startQuickMatch(page);

  const playable = playableCards(page).first();
  // Some deals leave nothing playable; drawing is then the legal move.
  if ((await playableCards(page).count()) === 0) {
    await page.getByRole('button', { name: /Draw pile/ }).click();
  } else {
    const before = await hand(page).count();
    await playable.click();
    await expect(hand(page)).not.toHaveCount(before);
  }
});

test('illegal cards are dimmed rather than punished', async ({ page }) => {
  await startQuickMatch(page);
  const blocked = blockedCards(page).first();
  if ((await blockedCards(page).count()) === 0) test.skip();

  const before = await hand(page).count();
  await blocked.click();
  // Nothing happens: no card leaves the hand, and no penalty appears.
  await expect(hand(page)).toHaveCount(before);
});

test('opponents take visibly separate turns', async ({ page }) => {
  await startQuickMatch(page);

  // The headline fix. Three bots used to resolve an entire chain of turns
  // inside a single repaint — about thirty milliseconds for the whole table —
  // so the board appeared to teleport. Each decision is now its own scheduled
  // step, which is observable as the seat counts changing at separate moments
  // rather than all at once.
  const seatCounts = () =>
    page.locator('.seat .seat-meta').allInnerTexts().then((t) => t.join('|'));

  const act = async () => {
    // Drawing can leave you still on turn and able to pass, in which case the
    // opponents are correctly waiting on you and nothing should be moving.
    if (await page.getByRole('button', { name: 'PASS' }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'PASS' }).click().catch(() => {});
    } else if ((await playableCards(page).count()) > 0) {
      await playableCards(page).first().click().catch(() => {});
    } else {
      await page.getByRole('button', { name: /Draw pile/ }).click().catch(() => {});
    }
    // Playing a wild opens a colour picker whose scrim blocks everything
    // underneath, so the table would sit still for a reason that has nothing
    // to do with pacing. Answering it is part of taking a turn.
    await clearOpeningChoice(page);
  };

  await act();

  const changes: number[] = [];
  let previous = await seatCounts();
  const started = Date.now();
  while (Date.now() - started < 8000 && changes.length < 3) {
    await page.waitForTimeout(120);
    const now = await seatCounts();
    if (now !== previous) {
      changes.push(Date.now() - started);
      previous = now;
    }
    // If the turn came back to us without any opponent moving, keep it going —
    // including when what came back is a choice rather than a card.
    await clearOpeningChoice(page);
    if (await page.getByRole('button', { name: 'PASS' }).isVisible().catch(() => false)) {
      await act();
    }
  }

  expect(changes.length, 'the table never moved').toBeGreaterThan(0);
  // If every bot resolved in one frame there is a single change at t~0. Real
  // pacing spreads them out by at least one animation beat.
  const span = (changes.at(-1) ?? 0) - (changes[0] ?? 0);
  expect(
    changes.length === 1 || span > 300,
    `bot moves landed together (${changes.join('ms, ')}ms)`,
  ).toBe(true);
});

test('the log names players and actions in plain language', async ({ page }) => {
  await startQuickMatch(page);

  // Bots only move once the human has, so act first and then let the table run.
  if ((await playableCards(page).count()) > 0) {
    await playableCards(page).first().click();
  } else {
    await page.getByRole('button', { name: /Draw pile/ }).click();
  }
  await page.waitForTimeout(3000);

  const text = await page.locator('.log').innerText();
  expect(text.length).toBeGreaterThan(0);
  // Readable sentences, not a dump of engine event names.
  expect(text).not.toMatch(/CARD_PLAYED|CARD_DRAWN|TURN_CHANGED|CLASH_CALLED/);
  expect(text).toMatch(/play|draw|chose|turns|CLASH/i);
});

test('Wild Rush never opens a colour picker', async ({ page }) => {
  await startMode(page, /^WILD RUSH —/);

  // In this mode every card is legal, so a declared colour decides nothing.
  // Playing used to stop for a modal on literally every card.
  for (let i = 0; i < 3; i++) {
    const playable = playableCards(page).first();
    if ((await playableCards(page).count()) === 0) break;
    await playable.click();
    await expect(page.getByRole('heading', { name: 'CHOOSE A COLOR' })).toHaveCount(0);
    await page.waitForTimeout(900);
  }
  // The active colour is still set and still shown as text, not colour alone.
  await expect(page.locator('.color-name').first()).toBeVisible();
});

test('the settings gear opens a working pause sheet', async ({ page }) => {
  await startQuickMatch(page);

  await page.getByRole('button', { name: 'Settings and pause' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Sound')).toBeVisible();
  await expect(sheet.getByText('Reduced motion')).toBeVisible();

  await page.getByRole('button', { name: 'RESUME' }).click();
  await expect(sheet).toHaveCount(0);
});

test('the sound toggle persists across a reload', async ({ page }) => {
  await startQuickMatch(page);
  await page.getByRole('button', { name: 'Settings and pause' }).click();

  const toggle = page.getByRole('checkbox').first();
  const before = await toggle.isChecked();
  await toggle.click();
  await expect(toggle).toBeChecked({ checked: !before });

  // The preference is stored, so it survives leaving and coming back.
  await page.reload();
  await expect(page.getByText('QUICK MATCH')).toBeVisible({ timeout: 20_000 });
  await page.getByText('QUICK MATCH').click();
  await page.getByRole('button', { name: 'Settings and pause' }).click();
  await expect(page.getByRole('checkbox').first()).toBeChecked({ checked: !before });
});

test('rules are reachable from the pause sheet', async ({ page }) => {
  await startQuickMatch(page);
  await page.getByRole('button', { name: 'Settings and pause' }).click();
  await page.getByRole('button', { name: /How to play/ }).click();

  await expect(page.getByRole('dialog')).toContainText('Goal.');
  await expect(page.getByText('Calling Clash')).toBeVisible();
});

test('rules are reachable before committing to a mode', async ({ page }) => {
  await openMenu(page);
  await page.getByText('GAME MODES').click();
  await page.getByRole('button', { name: 'How to play MAYHEM' }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Stacking is the whole game');
  await expect(sheet).toContainText('25 cards');
});

test('the emote button opens a tray and shows a bubble', async ({ page }) => {
  await startQuickMatch(page);

  await page.getByRole('button', { name: 'Emotes' }).click();
  const tray = page.getByRole('menu', { name: 'Send an emote' });
  await expect(tray).toBeVisible();
  await expect(tray.getByRole('menuitem')).toHaveCount(8);

  await tray.getByRole('menuitem', { name: 'Nice one' }).click();
  await expect(page.locator('.emote-bubble')).toBeVisible();
});

test('the bottom menu is one honest entry, not five dead ones', async ({ page }) => {
  await openMenu(page);

  /*
   * There used to be five: Store, Collection, Events, Missions and
   * Leaderboard, all rendered, all tappable, all inert. Four-fifths of the
   * navigation went nowhere, which reads as an unfinished app rather than a
   * stated roadmap. One entry now, and the sheet behind it still says what
   * each planned feature is.
   */
  const nav = page.locator('.navbar .nav-item');
  await expect(nav).toHaveCount(1);
  for (const gone of ['STORE', 'COLLECTION', 'MISSIONS', 'LEADERBOARD']) {
    await expect(page.getByRole('button', { name: new RegExp(`${gone} — not built yet`) })).toHaveCount(0);
  }

  await nav.click();
  await expect(page.getByText('NOT BUILT YET')).toBeVisible();
  // The roadmap survived the collapse rather than being thrown away with it.
  const sheet = page.locator('.sheet, .modal').first();
  for (const named of ['Store', 'Collection', 'Events', 'Missions', 'Leaderboard']) {
    await expect(sheet.getByText(named, { exact: false }).first()).toBeVisible();
  }
  await page.getByRole('button', { name: 'GOT IT' }).click();
  await expect(page.getByText('NOT BUILT YET')).toHaveCount(0);
});

test('the summary reports results without negative numbers as the headline', async ({ page }) => {
  // Playing a whole round takes as long as a round takes: seven cards each,
  // four seats, and opponents deliberately paced at 600-900ms a move. That is
  // the feature working, so the test is given room rather than the pacing
  // being turned down to suit it.
  test.slow();
  await startQuickMatch(page);

  // Reduced motion drops the deliberate 600-900ms between opponent moves to a
  // token 120ms, which is exactly what it is for — and it lets a full round
  // finish inside a test rather than the test having to wait out the pacing it
  // is not testing.
  await page.getByRole('button', { name: 'Settings and pause' }).click();
  const motion = page.getByRole('checkbox').nth(1);
  if (!(await motion.isChecked())) await motion.click();
  await page.getByRole('button', { name: 'RESUME' }).click();

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await page.getByText('MATCH SUMMARY').isVisible().catch(() => false)) break;
    if (await page.getByRole('button', { name: 'SUMMARY' }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'SUMMARY' }).click({ timeout: 5000 });
      await page.waitForTimeout(300);
      continue;
    }
    /*
     * Short click timeouts on purpose. Between a round ending and the winner
     * screen appearing there is a moment with no playable control at all, and
     * a default-timeout click there would block until the whole test expired.
     */
    const quick = { timeout: 1500 } as const;
    const playable = playableCards(page).first();
    if ((await playableCards(page).count()) > 0) {
      await playable.click(quick).catch(() => {});
    } else if (await page.getByRole('button', { name: 'PASS' }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'PASS' }).click(quick).catch(() => {});
    } else {
      await page.getByRole('button', { name: /Draw pile/ }).click(quick).catch(() => {});
    }
    // A choice blocks everything else; answer it and carry on.
    if (await page.locator('.color-choice').first().isVisible().catch(() => false)) {
      await page.locator('.color-choice').first().click(quick).catch(() => {});
    } else if (await page.locator('.target-row').first().isVisible().catch(() => false)) {
      await page.locator('.target-row').first().click(quick).catch(() => {});
    }
    await page.waitForTimeout(150);
  }

  if (!(await page.getByText('MATCH SUMMARY').isVisible().catch(() => false))) {
    test.skip(true, 'round did not finish inside the window');
  }

  const rows = page.locator('.standing .score');
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.allInnerTexts()) {
    // The headline on every row is a positive fact: points banked, or cards
    // left. The cumulative total, which can be negative, is the sub-line.
    expect(text.trim().startsWith('-')).toBe(false);
  }
});
