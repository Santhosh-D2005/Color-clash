/**
 * Zero-dependency test runner.
 *
 * Discovers every *.test.ts file under packages/ and apps/, imports it (which
 * registers its describe/it blocks) and runs the suite. Exits non-zero on the
 * first failing assertion so CI and `npm run verify` fail loudly.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runAll } from '@colorclash/test-fixtures';

const ROOT = resolve(import.meta.dirname, '..');
// Directories the walker must not descend into.
//
// `color-clash-fixed-sources` earns its place here the hard way: it is a stale
// duplicate of apps/ and packages/ left in the tree, and it carries two of its
// own *.test.ts files. The runner was finding them and running 31 tests against
// code that is never built, never imported and has already drifted from the
// real files — a suite reporting 301 passing tests when 270 of them were the
// ones that actually mattered. Passing tests over dead code are worse than no
// tests: they read as coverage.
const SKIP = new Set([
  'node_modules',
  'dist',
  '.git',
  'build',
  '.build',
  'color-clash-fixed-sources',
  'scratch',
  'test-results',
  'playwright-report',
]);

function findTests(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findTests(full, out);
    else if (entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const filter = process.argv[2];
const files = findTests(ROOT)
  .filter((f) => !filter || f.includes(filter))
  .sort();

if (files.length === 0) {
  console.error('No test files found.');
  process.exit(1);
}

for (const file of files) {
  await import(pathToFileURL(file).href);
}

const report = await runAll();

console.log(
  `\n${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped ` +
    `(${files.length} files)`,
);

if (report.failed > 0) {
  console.log('\nFailures:');
  for (const f of report.failures) console.log(`  ${f.suite} › ${f.name}\n    ${f.error}`);
  process.exit(1);
}
