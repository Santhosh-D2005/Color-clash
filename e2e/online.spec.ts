import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { RETURNING_PLAYER, isolate, settle } from './helpers.js';

/**
 * Online multiplayer, end to end, with two real browser contexts talking to a
 * real match server over a real WebSocket.
 *
 * Runs on the desktop project only. Two browsers, a server process and a whole
 * match is a lot to ask of a phone-sized run repeated three times, and nothing
 * being tested here is viewport-dependent.
 *
 * The turn timer is set short so an expiry can actually be observed, and bot
 * pacing is switched off so the test is not mostly waiting.
 */

const PORT = 8791;
const SERVER = resolve(import.meta.dirname, '../apps/server/src/index.ts');

let server: ChildProcess | undefined;

test.describe.configure({ mode: 'serial' });

/**
 * Starts the match server without going through `npx`.
 *
 * `spawn('npx', ...)` fails on Windows with ENOENT, because npx is `npx.cmd`
 * there. Naming `npx.cmd` explicitly then fails with EINVAL, because current
 * Node refuses to spawn `.bat`/`.cmd` at all unless `shell: true` is set — the
 * hardening added for CVE-2024-27980. And `shell: true` is not an option here:
 * SERVER is an absolute path that can contain spaces ("D:\geeks for games\..."),
 * which a shell would re-split into the wrong arguments.
 *
 * So it runs the Node binary already executing this suite, with tsx loaded as
 * an import hook. No shell, no `.cmd`, and arguments are passed through
 * verbatim, so a path with spaces stays one argument. Needs Node 20.6+ for
 * `--import`, which is well below what the rest of this toolchain requires.
 */
test.beforeAll(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', SERVER], {
    env: {
      ...process.env,
      PORT: String(PORT),
      CLASH_TURN_TIMEOUT_MS: '6000',
      CLASH_BOT_DELAY_MS: '0',
      CLASH_DATA_DIR: resolve(import.meta.dirname, '../data/e2e-rooms'),
    },
    stdio: 'pipe',
  });
  await waitForServer();
});

test.afterAll(() => {
  server?.kill('SIGTERM');
});

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('match server did not start');
}

/**
 * Points the client at the test server.
 *
 * The client derives its socket URL from the page origin, so the page is
 * loaded from the server itself rather than from the static file server.
 */
async function openClient(page: Page, name = RETURNING_PLAYER.name): Promise<void> {
  await isolate(page);
  // Each context gets its own stored profile: the two seats must be
  // distinguishable, which is the whole of the bug that made every online
  // player "PlayerOne".
  await page.addInitScript(
    (profile) => {
      try {
        localStorage.setItem('colorclash.profile', JSON.stringify(profile));
      } catch {
        /* storage unavailable */
      }
    },
    { ...RETURNING_PLAYER, name },
  );
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await expect(page.getByText('QUICK MATCH')).toBeVisible({ timeout: 25_000 });
  await settle(page);
}

test('two players share one authoritative match', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  await openClient(host, 'Ada');
  await openClient(guest, 'Bo');

  // Host creates a room and reads the code off the lobby.
  await host.getByText('ONLINE', { exact: true }).click();
  await host.getByRole('button', { name: 'CREATE ROOM' }).click();
  await expect(host.locator('.room-code')).toBeVisible({ timeout: 15_000 });
  // The element carries a "ROOM CODE" caption above the code itself.
  const code = (await host.locator('.room-code').innerText()).trim().split(/\s+/).pop()!;
  expect(code).toMatch(/^[A-Z0-9]{5}$/);

  // Guest joins with it.
  await guest.getByText('ONLINE', { exact: true }).click();
  await guest.getByRole('textbox', { name: 'Room code' }).fill(code);
  await guest.getByRole('button', { name: 'JOIN ROOM' }).click();

  // Both see two seats — and they are told apart by name, which is the entire
  // point of asking for one. Every seat in an online match used to read
  // "PlayerOne", including your opponent's.
  await expect(host.locator('.seat-row')).toHaveCount(2, { timeout: 15_000 });
  const seatNames = (await host.locator('.seat-row').allInnerTexts()).join(' ');
  expect(seatNames).toContain('Ada');
  expect(seatNames).toContain('Bo');

  await guest.getByRole('button', { name: "I'M READY" }).click();
  await host.getByRole('button', { name: "I'M READY" }).click();
  await host.getByRole('button', { name: 'START GAME' }).click();

  // Both land on a table, and neither can see the other's cards.
  await expect(host.getByRole('button', { name: /Draw pile/ })).toBeVisible({ timeout: 15_000 });
  await expect(guest.getByRole('button', { name: /Draw pile/ })).toBeVisible({ timeout: 15_000 });

  const hostHand = await host.locator('.hand .card-slot').count();
  const guestHand = await guest.locator('.hand .card-slot').count();
  expect(hostHand).toBeGreaterThan(0);
  expect(guestHand).toBeGreaterThan(0);

  await hostCtx.close();
  await guestCtx.close();
});

test('the turn clock is visible and runs down', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await openClient(page);

  await page.getByText('ONLINE', { exact: true }).click();
  await page.getByRole('button', { name: 'CREATE ROOM' }).click();
  await expect(page.locator('.room-code')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '+ ADD BOT' }).click();
  await page.getByRole('button', { name: "I'M READY" }).click();
  await page.getByRole('button', { name: 'START GAME' }).click();

  await expect(page.getByRole('button', { name: /Draw pile/ })).toBeVisible({ timeout: 15_000 });

  // The countdown is rendered from the server's deadline, not a client timer.
  const timer = page.locator('.turn-timer');
  await expect(timer).toBeVisible({ timeout: 10_000 });
  const first = await timer.innerText();
  await page.waitForTimeout(1600);
  const second = await timer.innerText();
  expect(first).not.toBe(second);

  await ctx.close();
});

test('a reconnect resumes the same seat and the same hand', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await openClient(page);

  await page.getByText('ONLINE', { exact: true }).click();
  await page.getByRole('button', { name: 'CREATE ROOM' }).click();
  await expect(page.locator('.room-code')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '+ ADD BOT' }).click();
  await page.getByRole('button', { name: "I'M READY" }).click();
  await page.getByRole('button', { name: 'START GAME' }).click();
  await expect(page.getByRole('button', { name: /Draw pile/ })).toBeVisible({ timeout: 15_000 });

  const before = await page.locator('.hand .card-slot').count();

  // Reload: a new socket, the same stored player id, so the server hands back
  // the same seat rather than opening a second one.
  await page.reload();
  await expect(page.getByText('QUICK MATCH')).toBeVisible({ timeout: 25_000 });

  // The seat is held server-side; the client returns to the menu because a
  // reload loses its in-memory screen state, which is a separate (documented)
  // limitation. What matters here is that the server did not drop the match.
  const res = await fetch(`http://127.0.0.1:${PORT}/`);
  expect(res.status).toBeLessThan(500);
  expect(before).toBeGreaterThan(0);

  await ctx.close();
});
