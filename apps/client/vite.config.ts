import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { FILE_ASSETS_ALIAS, WORKSPACE_ALIASES } from './vite.aliases';

/**
 * Client build. The engine packages are consumed as TypeScript source through
 * the workspace aliases, so a rule change is picked up by HMR with no build step.
 *
 * This is now the only bundler in the project: `vite.single.config.ts` is the
 * same thing with everything folded into one document. See docs/DEVELOPMENT.md.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { ...WORKSPACE_ALIASES, ...FILE_ASSETS_ALIAS } },
  server: { port: 5173, proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
  build: {
    outDir: 'dist',
    target: 'es2022',
    // Small icons still inline (one request saved, no cache benefit at that
    // size); anything larger is emitted as a hashed file.
    assetsInlineLimit: 4096,
    sourcemap: false,
  },
});
