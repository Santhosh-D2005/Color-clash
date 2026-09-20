import type { Color, DeckSide } from '@colorclash/shared';

/**
 * Colour vocabularies.
 *
 * One palette, defined once, so the engine, the card renderer and the mode
 * tiles all agree. These are the project's own values — see the BRAND block in
 * tools/gen-brand.ts, which the generated artwork is built from.
 */

export const CLASSIC_COLORS: Color[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];

/**
 * §2.3 source table: "Light colors | Pink, Teal, Purple, Orange".
 *
 * NOTE (documented divergence, see docs/RULE_FLAGS.md RF-004): the retail Flip
 * product prints Blue/Green/Red/Yellow on the light side and Pink/Teal/Orange/
 * Purple on the dark side. The supplied blueprint is the source of authority
 * (§2 "source-defined"), so we implement the blueprint's assignment and record
 * the difference rather than silently correcting it.
 */
export const FLIP_LIGHT_COLORS: Color[] = ['PINK', 'TEAL', 'PURPLE', 'ORANGE'];
export const FLIP_DARK_COLORS: Color[] = ['DARK_PINK', 'DARK_TEAL', 'DARK_PURPLE', 'DARK_ORANGE'];

export function flipColorsFor(side: DeckSide): Color[] {
  return side === 'LIGHT_SIDE' ? FLIP_LIGHT_COLORS : FLIP_DARK_COLORS;
}

/** Light colour -> its dark-side counterpart on the same physical card. */
export const FLIP_SIDE_PAIRS: Record<Color, Color> = {
  PINK: 'DARK_PINK',
  TEAL: 'DARK_TEAL',
  PURPLE: 'DARK_PURPLE',
  ORANGE: 'DARK_ORANGE',
};

/** Face colours for the card renderer. */
export const COLOR_HEX: Record<Color, string> = {
  RED: '#d8332f',
  YELLOW: '#f0a81c',
  GREEN: '#3f9e2e',
  BLUE: '#1f6fc4',
  PINK: '#e4478f',
  TEAL: '#17a9a0',
  PURPLE: '#7a3fc0',
  ORANGE: '#e8752a',
  DARK_PINK: '#8e1c53',
  DARK_TEAL: '#0c6560',
  DARK_PURPLE: '#4a2076',
  DARK_ORANGE: '#8f4212',
};

/**
 * The text colour to use *on* each swatch.
 *
 * Needed because "white on the brand colour" is not a rule that holds: white
 * on YELLOW is 2.03:1, worse than the 2.93:1 this table exists to fix. Each
 * entry is whichever of white or near-black has the better ratio against its
 * swatch, so the pairing clears WCAG AA for every colour in the palette rather
 * than for the dark half of it. `colors.test.ts` asserts that, so a new colour
 * cannot be added with an unreadable ink.
 */
export const COLOR_INK_DARK = '#10151f';

export const COLOR_INK: Record<Color, string> = {
  RED: '#ffffff',
  YELLOW: COLOR_INK_DARK,
  GREEN: COLOR_INK_DARK,
  BLUE: '#ffffff',
  PINK: COLOR_INK_DARK,
  TEAL: COLOR_INK_DARK,
  PURPLE: '#ffffff',
  ORANGE: COLOR_INK_DARK,
  DARK_PINK: '#ffffff',
  DARK_TEAL: '#ffffff',
  DARK_PURPLE: '#ffffff',
  DARK_ORANGE: '#ffffff',
};

export const COLOR_LABEL: Record<Color, string> = {
  RED: 'Red',
  YELLOW: 'Yellow',
  GREEN: 'Green',
  BLUE: 'Blue',
  PINK: 'Pink',
  TEAL: 'Teal',
  PURPLE: 'Purple',
  ORANGE: 'Orange',
  DARK_PINK: 'Dark Pink',
  DARK_TEAL: 'Dark Teal',
  DARK_PURPLE: 'Dark Purple',
  DARK_ORANGE: 'Dark Orange',
};
