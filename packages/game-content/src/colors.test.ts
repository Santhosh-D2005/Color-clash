import { describe, expect, it } from '@colorclash/test-fixtures';
import { COLOR_HEX, COLOR_INK, COLOR_LABEL } from './colors.js';

/**
 * The colour name shown under the discard is the affordance that exists so
 * colour is never the only cue. It was drawn in the colour it names, at 11px,
 * measured at 2.93:1 against the felt — the one piece of text on the table
 * that failed contrast, and the one that most needed to pass.
 *
 * The fix pairs each swatch with an ink. "White on the brand colour" would not
 * have worked: white on YELLOW is 2.03:1, worse than the defect. These tests
 * pin the pairing so a colour cannot be added with an unreadable ink.
 */

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('colour swatch and ink pairing', () => {
  it('agrees with itself: every colour has a hex, a label and an ink', () => {
    for (const key of Object.keys(COLOR_HEX)) {
      expect(typeof COLOR_INK[key as keyof typeof COLOR_INK]).toBe('string');
      expect(typeof COLOR_LABEL[key as keyof typeof COLOR_LABEL]).toBe('string');
    }
    expect(Object.keys(COLOR_INK).length).toBe(Object.keys(COLOR_HEX).length);
  });

  it('clears WCAG AA for normal text on every colour in the palette', () => {
    for (const [key, swatch] of Object.entries(COLOR_HEX)) {
      const ink = COLOR_INK[key as keyof typeof COLOR_INK]!;
      expect(contrast(swatch, ink)).toBeGreaterThan(4.5);
    }
  });

  it('picks the better of the two inks rather than a fixed one', () => {
    // The whole point: a single ink cannot serve the palette. If some colour
    // would read better with the other ink, the table is wrong.
    for (const [key, swatch] of Object.entries(COLOR_HEX)) {
      const ink = COLOR_INK[key as keyof typeof COLOR_INK]!;
      const other = ink === '#ffffff' ? '#10151f' : '#ffffff';
      expect(contrast(swatch, ink)).toBeGreaterThan(contrast(swatch, other));
    }
  });

  it('proves a single ink would have failed, which is why this table exists', () => {
    // White on yellow is worse than the 2.93:1 defect being fixed.
    expect(contrast(COLOR_HEX.YELLOW!, '#ffffff')).toBeLessThan(2.93);
  });
});
