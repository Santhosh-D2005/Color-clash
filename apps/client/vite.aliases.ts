/**
 * Module aliases shared by the two build configurations.
 *
 * Kept in their own file rather than imported from `vite.config.ts` so that
 * loading one configuration does not evaluate the other's plugins, and so the
 * two cannot drift apart.
 */

import { fileURLToPath } from 'node:url';

/**
 * Convert file paths to Vite-compatible format: absolute, forward-slash normalized.
 * Vite expects forward slashes even on Windows.
 */
function viteResolve(url: URL): string {
  return fileURLToPath(url).replaceAll('\\', '/');
}

/** Workspace source, consumed as TypeScript by every build. */
export const WORKSPACE_ALIASES: Record<string, string> = {
  '@colorclash/shared': viteResolve(new URL('../../packages/shared/src/index.ts', import.meta.url)),
  '@colorclash/game-content': viteResolve(new URL('../../packages/game-content/src/index.ts', import.meta.url)),
  '@colorclash/game-engine': viteResolve(new URL('../../packages/game-engine/src/index.ts', import.meta.url)),
  '@colorclash/ai/driver': viteResolve(new URL('../../packages/ai/src/driver.ts', import.meta.url)),
  '@colorclash/ai': viteResolve(new URL('../../packages/ai/src/index.ts', import.meta.url)),
};

/**
 * Web and PWA builds get real image files; the one-document build gets the
 * inlined registry. Same exports either way, so nothing above the registry
 * knows which one it is talking to.
 *
 * This is what lets the browser cache each image separately and fetch them in
 * parallel, instead of paying for 1.4 MB of base64 inside the document on every
 * load — which is also why this is the build the Android wrapper ships.
 */
export const FILE_ASSETS_ALIAS: Record<string, string> = {
  './assets.gen.js': viteResolve(new URL('./src/assets/assets.files.ts', import.meta.url)),
};
