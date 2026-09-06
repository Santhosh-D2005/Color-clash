/**
 * Minimal ambient declarations for the one sharp call this repository makes.
 *
 * `tools/gen-brand.ts` rasterises the generated SVG sources to PNG, and that is
 * the entire surface used:
 *
 *     sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path)
 *
 * Same arrangement as `node-minimal.d.ts` and `react-minimal.d.ts`: the offline
 * `tsconfig.json` sets `types: []` and includes `types/**` instead, so nothing
 * here competes with a real package. The installed typecheck
 * (`tsconfig.installed.json`) does not include this folder and uses sharp's own
 * types, which is why sharp is also a devDependency.
 *
 * Without this file `npm run typecheck` fails on any machine that does not
 * happen to have sharp lying around in node_modules — which is exactly how it
 * reached CI unnoticed.
 */

declare module 'sharp' {
  interface SharpInstance {
    /** Encode as PNG. `compressionLevel` is zlib's 0-9. */
    png(options?: { compressionLevel?: number }): SharpInstance;
    /** Write the encoded image out, resolving once it is on disk. */
    toFile(path: string): Promise<{ width: number; height: number; size: number }>;
  }

  /** Accepts an encoded image buffer — here, SVG source. */
  export default function sharp(input: Uint8Array): SharpInstance;
}
