/**
 * Generates the two asset registries the client picks between.
 *
 *   assets.gen.ts    every image inlined as a data URI
 *   assets.files.ts  every image imported as a file, for the bundler to emit
 *
 * Both export the same `AssetName` union and the same `ASSETS` shape, so
 * `assets/index.ts` imports one name and the build decides which file backs it.
 * Vite aliases the specifier to the file-based registry; the single-file,
 * offline and Android builds keep the inlined one.
 *
 * Why two: inlining is what makes a self-contained HTML document and an APK
 * with no asset host possible, and it costs about a third extra in size because
 * base64 is 4 bytes per 3. That trade is right for a build that must work with
 * no network and wrong for the web, where the browser should be allowed to
 * cache each image and fetch them in parallel.
 *
 * The images themselves come from `tools/gen-brand.ts`, which draws them from
 * vector sources this project owns.
 *
 * Run: npx tsx tools/gen-assets.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, basename, extname } from 'node:path';

const DIR = resolve(import.meta.dirname, '../apps/client/src/assets');
const files = readdirSync(DIR)
  .filter((f) => extname(f) === '.png')
  .sort();

const names = files.map((f) => basename(f, '.png'));
const union = names.map((n) => `  | ${JSON.stringify(n)}`).join('\n');

const HEADER = (kind: string) => `/* eslint-disable */
// GENERATED FILE — do not edit by hand.
// Produced by tools/gen-assets.ts. ${kind}
// Regenerate the images themselves with: npm run brand

`;

/* ---- 1. inlined, for the offline and Android builds ---- */

const inlined = files.map((f) => {
  const name = basename(f, '.png');
  const b64 = Buffer.from(readFileSync(join(DIR, f))).toString('base64');
  return `  ${JSON.stringify(name)}: 'data:image/png;base64,${b64}',`;
});

// The union is declared explicitly rather than inferred with `as const`: the
// inlined data URIs are far too long for the compiler to serialise as literal
// types, and the union is the only part callers need to be precise.
writeFileSync(
  join(DIR, 'assets.gen.ts'),
  `${HEADER(`${files.length} images, inlined as data URIs.`)}export type AssetName =
${union};

export const ASSETS: Record<AssetName, string> = {
${inlined.join('\n')}
};
`,
);

/* ---- 2. real files, for the web build ---- */

const imports = names.map((n) => `import ${ident(n)} from './${n}.png';`).join('\n');
const entries = names.map((n) => `  ${JSON.stringify(n)}: ${ident(n)},`).join('\n');

writeFileSync(
  join(DIR, 'assets.files.ts'),
  `${HEADER(`${files.length} images, imported as files so the bundler emits and hashes them.`)}${imports}

export type AssetName =
${union};

export const ASSETS: Record<AssetName, string> = {
${entries}
};
`,
);

function ident(name: string): string {
  return `img_${name.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

console.log(
  `Wrote assets.gen.ts (inlined) and assets.files.ts (bundled) with ${files.length} images`,
);
