/**
 * Builds the client into one self-contained HTML file.
 *
 * `dist/color-clash.html` is a complete, offline-capable game in a single
 * document: React, every script, every style and all 41 images are inside it,
 * and it needs nothing from the network but the web font, which has a full
 * system fallback.
 *
 * ## Why this file is now short
 *
 * It used to compile the whole project with `tsc --module system --outFile`
 * and run the result through a hand-written module loader, with React pulled
 * from a CDN and a second script (`build-offline.mjs`) that swapped the CDN
 * copy for a local one. That worked, but `--outFile` with `--module system` is
 * deprecated and was only still compiling because of `ignoreDeprecations` —
 * so the day TypeScript drops it, the Android build breaks and the web build
 * does not. A time bomb under exactly the target with the slowest feedback.
 *
 * Vite already builds this app for the web. It now builds this target too:
 * `apps/client/vite.single.config.ts` is the same configuration with the
 * inlined asset registry and everything folded into one chunk, and all this
 * script does is put that chunk inside the document.
 *
 * Run: npx tsx tools/build-single-file.ts
 * Out: dist/color-clash.html, dist/color-clash.fragment.html
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** How Vite writes the two references, given the names the config pins. */
// <script type="module" crossorigin src="/app.js"></script>
export const SCRIPT_TAG = /<script\b[^>]*\bsrc="[^"]*app\.js"[^>]*><\/script>/;
// <link rel="stylesheet" crossorigin href="/app.css">
export const STYLE_TAG = /<link\b[^>]*\bhref="[^"]*app\.css"[^>]*>/;

/**
 * `</script>` inside a string literal would close the tag early. Escaping the
 * sequence is invisible to JavaScript and the only thing standing between a
 * bundle and a truncated document.
 */
export function safeScript(js: string): string {
  return js.split('</script').join('<\\/script');
}

export class BuildError extends Error {}

/**
 * Folds the emitted chunk and stylesheet into the emitted document.
 *
 * Pure, and separated from the file handling on purpose: this is the part that
 * can be wrong in a way nobody notices until a player opens a blank page, and
 * `build-single-file.test.ts` pins it. The build around it needs the project's
 * dependencies installed; this does not.
 */
export function inlineDocument(html: string, js: string, css: string): string {
  for (const [what, pattern] of [
    ['script', SCRIPT_TAG],
    ['stylesheet', STYLE_TAG],
  ] as const) {
    if (!pattern.test(html)) {
      throw new BuildError(
        `No ${what} tag to inline in the emitted index.html. ` +
          'Either the build produced nothing, or Vite changed how it writes the tag.',
      );
    }
  }

  const inlined = html
    .replace(SCRIPT_TAG, `<script type="module">\n${safeScript(js)}\n</script>`)
    .replace(STYLE_TAG, `<style>\n${css}\n</style>`);

  // A surviving tag means a reference left behind, and a document that is not
  // actually self-contained.
  for (const [what, pattern] of [
    ['script', SCRIPT_TAG],
    ['stylesheet', STYLE_TAG],
  ] as const) {
    if (pattern.test(inlined)) {
      throw new BuildError(
        `A ${what} reference survived inlining — the document is not self-contained.`,
      );
    }
  }
  return inlined;
}

/**
 * The same page without the document skeleton, for hosts that supply their own
 * `<!doctype>`/`<head>`/`<body>` and take only the content.
 */
export function toFragment(document: string): string {
  const head = /<head>([\s\S]*?)<\/head>/.exec(document)?.[1] ?? '';
  const body = /<body>([\s\S]*?)<\/body>/.exec(document)?.[1] ?? document;
  return `${head.trim()}\n${body.trim()}\n`;
}

export function main(root = resolve(import.meta.dirname, '..')): void {
  const client = join(root, 'apps/client');
  const built = join(root, '.build/single');
  const outDir = join(root, 'dist');

  /* 1. One bundler, same as the web build */
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    execFileSync(npm, ['run', 'build:onefile'], { cwd: client, stdio: 'inherit' });
  } catch {
    console.error(
      '\nThe one-document build needs the project dependencies installed.\n' +
        'Run `npm install` first — this target is Vite, same as `npm run build:web`.',
    );
    process.exit(1);
  }

  /* 2. Fold the emitted chunk into the document */
  const required = (file: string): string => {
    const path = join(built, file);
    if (!existsSync(path)) {
      console.error(
        `Expected ${path} and it is not there.\n` +
          'vite.single.config.ts pins the output names; if that changed, this did not.',
      );
      process.exit(1);
    }
    return readFileSync(path, 'utf8');
  };

  let document: string;
  try {
    document = inlineDocument(required('index.html'), required('app.js'), required('app.css'));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'color-clash.html');
  writeFileSync(outFile, document);
  const fragFile = join(outDir, 'color-clash.fragment.html');
  writeFileSync(fragFile, toFragment(document));

  const mb = (Buffer.byteLength(document) / 1024 / 1024).toFixed(2);
  console.log(
    `\nBuilt ${outFile} — ${mb} MB, self-contained\n` +
      `Built ${fragFile} — skeleton-free variant`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
