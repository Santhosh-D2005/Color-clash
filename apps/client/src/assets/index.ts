import { ASSETS, type AssetName } from './assets.gen.js';

/**
 * Art registry.
 *
 * Every image here is generated from the vector sources in `tools/gen-brand.ts`
 * and owned by this project. Regenerate the whole set with `npm run brand`.
 * Card faces are drawn in CSS rather than shipped as bitmaps (see `CardFace`),
 * so they carry no image assets at all.
 *
 * See docs/RULE_FLAGS.md RF-014 for the licensing record.
 */
export { ASSETS };
export type { AssetName };

export function asset(name: AssetName): string {
  return ASSETS[name];
}

/** Background image shorthand for inline styles. */
export function bg(name: AssetName): string {
  return `url(${ASSETS[name]})`;
}

export const AVATARS: AssetName[] = [
  'avatar_player',
  'avatar_sunny',
  'avatar_moonlight',
  'avatar_tigerx',
];

/** Deterministic avatar assignment so a given seat always looks the same. */
export function avatarFor(seatIndex: number): string {
  return ASSETS[AVATARS[seatIndex % AVATARS.length]!];
}
