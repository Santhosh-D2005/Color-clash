/**
 * Branding audit.
 *
 * The rebrand was a one-off pass; this is the check that it stays done. It
 * fails the build if the previous mark reappears anywhere a shipped artefact
 * could carry it — source, styles, manifests, workflows, page titles.
 *
 * It runs in CI and in `npm run verify`, because the way a trademark creeps
 * back in is not a deliberate decision, it is one copied line in one component
 * six months from now.
 *
 *   node tools/audit-brand.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, extname, basename } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

const SKIP_DIRS = new Set([
  'node_modules',
  '.build',
  'dist',
  '.git',
  'android',
  'data',
  'test-results',
  'playwright-report',
]);

const EXTS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.css', '.html',
  '.webmanifest', '.yml', '.yaml',
]);

/**
 * Files that legitimately name the old mark, and why.
 *
 * Both exist to talk *about* the rebrand. Neither ships: the rebrand script is
 * a one-shot tool, and this file is the auditor. Everything else is a finding.
 */
const ALLOWED = new Set(['rebrand.mjs', 'audit-brand.mjs']);

/** Marks that must not appear in anything shippable. */
const FORBIDDEN = [
  { pattern: /\buno\b/i, what: 'the previous game name' },
  { pattern: /\bunoparty\b/i, what: 'the previous package id' },
  { pattern: /show\s*'?em\s*no\s*mercy/i, what: 'a product-specific mode name' },
  { pattern: /\bno\s+mercy\b/i, what: 'a product-specific mode name' },
  { pattern: /\ball\s+wild\b/i, what: 'a product-specific mode name' },
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

const findings = [];

for (const file of walk(ROOT)) {
  const name = basename(file);
  if (ALLOWED.has(name)) continue;
  // Generated base64 image data produces meaningless substring hits.
  if (name === 'assets.gen.ts') continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const { pattern, what } of FORBIDDEN) {
      if (pattern.test(line)) {
        findings.push({
          file: file.slice(ROOT.length + 1),
          line: i + 1,
          what,
          text: line.trim().slice(0, 110),
        });
        return; // one finding per line is enough
      }
    }
  });
}

if (findings.length > 0) {
  console.error(`Branding audit failed — ${findings.length} occurrence(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  (${f.what})`);
    console.error(`    ${f.text}`);
  }
  console.error(
    '\nThe app ships as Color Clash. See docs/BRANDING.md for what each name became.',
  );
  process.exit(1);
}

console.log('Branding audit passed — no prior marks in any shippable file.');
