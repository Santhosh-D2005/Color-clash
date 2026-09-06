/**
 * One-shot rebrand pass: UNO Party -> COLOR CLASH.
 *
 * Kept in the repository rather than run and thrown away, because part of the
 * brief is being able to prove no branding survived. This file is the exact,
 * auditable list of what was replaced, and `npm run audit:brand` is the check
 * that it stayed replaced.
 *
 * Ordering matters: longer tokens are replaced before the shorter tokens that
 * are substrings of them.
 *
 *   node tools/rebrand.mjs [--dry]
 */
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, extname, basename } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DRY = process.argv.includes('--dry');

const SKIP_DIRS = new Set(['node_modules', '.build', 'dist', '.git', 'android', 'test-results']);
const EXTS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.css', '.html',
  '.webmanifest', '.yml', '.yaml', '.md',
]);

/** [pattern, replacement] applied in order. */
export const REPLACEMENTS = [
  /* ---- npm scope ---------------------------------------------------- */
  [/@uno\//g, '@colorclash/'],

  /* ---- signing environment ------------------------------------------ */
  [/\bUNO_KEYSTORE_PATH\b/g, 'CLASH_KEYSTORE_PATH'],
  [/\bUNO_KEYSTORE_PASSWORD\b/g, 'CLASH_KEYSTORE_PASSWORD'],
  [/\bUNO_KEY_ALIAS\b/g, 'CLASH_KEY_ALIAS'],
  [/\bUNO_KEY_PASSWORD\b/g, 'CLASH_KEY_PASSWORD'],

  /* ---- protocol events and commands --------------------------------- */
  [/\bUNO_PENDING\b/g, 'CLASH_PENDING'],
  [/\bUNO_PENALTY\b/g, 'CLASH_PENALTY'],
  [/\bUNO_CALLED\b/g, 'CLASH_CALLED'],
  [/\bCALL_UNO\b/g, 'CALL_CLASH'],

  /* ---- engine identifiers ------------------------------------------- */
  [/\bunoPenaltyCards\b/g, 'clashPenaltyCards'],
  [/\bunoGraceMs\b/g, 'clashGraceMs'],
  [/\bunoPending\b/g, 'clashPending'],
  [/\bunoCalled\b/g, 'clashCalled'],
  [/\bunoCalls\b/g, 'clashCalls'],
  [/\bcalledUno\b/g, 'calledClash'],
  [/\bapplyUnoCall\b/g, 'applyClashCall'],
  [/\benterUnoPendingIfNeeded\b/g, 'enterClashPendingIfNeeded'],
  [/\bsettleMissedUno\b/g, 'settleMissedClash'],
  [/\bunoOwner\b/g, 'clashOwner'],
  [/\bmercyThreshold\b/g, 'eliminationThreshold'],

  /* ---- the Mayhem ruleset (the one id that is a product phrase) ------ */
  [/\bSHOW_EM_NO_MERCY\b/g, 'MAYHEM'],
  [/\bNO_MERCY_SOURCE_PINNED\b/g, 'MAYHEM_SOURCE_PINNED'],
  [/\bNO_MERCY_DECK\b/g, 'MAYHEM_DECK'],
  [/\bNO_MERCY_TOTAL\b/g, 'MAYHEM_TOTAL'],
  [/\bnoMercyManifest\b/g, 'mayhemManifest'],
  [/\bnoMercy\b/g, 'mayhem'],

  /* ---- asset keys ---------------------------------------------------- */
  [/\bmode_nomercy\b/g, 'mode_mayhem'],
  [/\bmode_allwild\b/g, 'mode_wildrush'],
  [/\bmode_flex\b/g, 'mode_freestyle'],
  [/\bbtn_uno\b/g, 'btn_clash'],

  /* ---- CSS class names ----------------------------------------------- */
  [/\buno-button\b/g, 'clash-button'],
  [/\buno-reminder\b/g, 'clash-reminder'],
  [/\buno-flag\b/g, 'clash-flag'],

  /* ---- product identity ---------------------------------------------- */
  [/com\.geeksforgames\.unoparty/g, 'com.geeksforgames.colorclash'],
  [/\buno-party\b/g, 'color-clash'],
  [/\buno-platform\b/g, 'color-clash'],
  [/\buno-release\.jks\b/g, 'colorclash-release.jks'],
  [/\buno-upload\b/g, 'clash-upload'],
  [/UNO Party/g, 'Color Clash'],
  [/\bUNO\b/g, 'CLASH'],
  [/\bUno\b/g, 'Clash'],
];

/** File renames applied after content rewriting. */
export const FILE_RENAMES = [
  ['packages/game-engine/src/uno.ts', 'packages/game-engine/src/clash.ts'],
  ['packages/game-engine/test/uno.test.ts', 'packages/game-engine/test/clash.test.ts'],
  ['packages/game-engine/src/versions/noMercy.ts', 'packages/game-engine/src/versions/mayhem.ts'],
  ['packages/game-engine/test/noMercy.test.ts', 'packages/game-engine/test/mayhem.test.ts'],
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.has(extname(entry))) out.push(full);
  }
  return out;
}

let changedFiles = 0;
let changedTokens = 0;

for (const file of walk(ROOT)) {
  // The rebrand script names the old mark on purpose; skip itself.
  if (basename(file) === 'rebrand.mjs') continue;
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [pattern, replacement] of REPLACEMENTS) {
    after = after.replace(pattern, () => {
      changedTokens += 1;
      return replacement;
    });
  }
  if (after !== before) {
    changedFiles += 1;
    if (!DRY) writeFileSync(file, after);
  }
}

for (const [from, to] of FILE_RENAMES) {
  try {
    if (!DRY) renameSync(join(ROOT, from), join(ROOT, to));
  } catch {
    // Already renamed by a previous run.
  }
}

console.log(
  `${DRY ? '[dry run] ' : ''}${changedTokens} tokens rewritten across ${changedFiles} files; ` +
    `${FILE_RENAMES.length} files renamed.`,
);
