import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { WORKSPACE_ALIASES } from './vite.aliases';

/**
 * The one-document build.
 *
 * This target used to be produced by `tsc --module system --outFile` with a
 * hand-written module loader, React pulled from a CDN and a second script to
 * inline React for offline use. It worked, but `--outFile` with `--module
 * system` is deprecated and was only surviving behind `ignoreDeprecations` —
 * which meant the day TypeScript removed it, the Android build would break and
 * the web build would not. One bundler now produces every output.
 *
 * The differences from the web config are exactly three, and all of them are
 * "put it in the document instead of next to it":
 *
 *  - the inlined asset registry rather than the file one, so there are no
 *    images to fetch;
 *  - no inline limit and no CSS code split, so nothing is emitted separately;
 *  - one chunk, so there is a single script to fold in.
 *
 * `tools/build-single-file.ts` runs this and folds the result into one file.
 */
export default defineConfig({
  plugins: [react()],
  // Note the absence of FILE_ASSETS_ALIAS: this build wants `assets.gen.ts`,
  // the base64 registry, so the document carries its own artwork.
  resolve: { alias: { ...WORKSPACE_ALIASES } },
  // The output lands outside the client folder, so Vite requires the intent to
  // clear it to be stated rather than inferred.
  build: {
    outDir: '../../.build/single',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    // Everything in the document: no separate image, font or CSS request.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app[extname]',
      },
    },
  },
});
