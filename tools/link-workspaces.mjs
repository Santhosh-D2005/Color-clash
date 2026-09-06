/**
 * Creates the `node_modules/@colorclash/*` links by hand.
 *
 * `npm install` normally does this. This script exists because it does not
 * always: npm's workspace resolution has behaved differently across major
 * versions and platforms, and a failure there blocks the whole toolchain even
 * though the packages are sitting right there on disk.
 *
 * Running this is enough to make everything except the Vite dev server work —
 * the tests, the type checker, the match server and the single-file build all
 * resolve `@colorclash/*` through these links.
 *
 * On Windows it creates directory junctions rather than symlinks, so it does
 * not need Developer Mode or an elevated prompt.
 *
 *   node tools/link-workspaces.mjs
 */
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGES = {
  shared: 'packages/shared',
  'game-content': 'packages/game-content',
  'game-engine': 'packages/game-engine',
  ai: 'packages/ai',
  'test-fixtures': 'packages/test-fixtures',
  client: 'apps/client',
  server: 'apps/server',
};

const scope = join(ROOT, 'node_modules', '@colorclash');
mkdirSync(scope, { recursive: true });

// Windows needs 'junction' for directories; it works without elevated rights.
const linkType = process.platform === 'win32' ? 'junction' : 'dir';

let created = 0;
for (const [name, location] of Object.entries(PACKAGES)) {
  const target = join(ROOT, location);
  if (!existsSync(target)) {
    console.warn(`skipped @colorclash/${name} — ${location} not found`);
    continue;
  }
  const link = join(scope, name);

  // Replace whatever is there: a stale link, or a real directory npm copied.
  if (existsSync(link) || isBrokenLink(link)) {
    rmSync(link, { recursive: true, force: true });
  }

  // Junctions need an absolute target; symlinks are nicer as relative ones so
  // the checkout stays portable.
  symlinkSync(linkType === 'junction' ? target : relative(scope, target), link, linkType);
  created += 1;
}

function isBrokenLink(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

console.log(`Linked ${created} workspace packages into node_modules/@colorclash`);
console.log('You can now run: npm test · npm run build · npm run dev:server');
