import type { CardKind } from '@colorclash/shared';

/**
 * Deck composition tables.
 *
 * Every count here is either quoted from the supplied blueprint (marked
 * SOURCE) or is an explicit, named default filling a gap the blueprint leaves
 * open (marked RF-xxx and documented in docs/RULE_FLAGS.md). Per §18.1 rule 8
 * no gap is filled silently inside code.
 */

export type NumberSpec = {
  /** How many copies of the 0 card per colour. */
  zero: number;
  /** How many copies of each of 1..9 per colour. */
  oneToNine: number;
};

export type ColoredActionSpec = Partial<Record<CardKind, number>>;
export type WildSpec = Partial<Record<CardKind, number>>;

export type DeckComposition = {
  /** Per-colour number distribution. */
  numbers: NumberSpec;
  /** Per-colour counts of coloured action cards. */
  coloredActions: ColoredActionSpec;
  /** Absolute counts of colourless wild cards. */
  wilds: WildSpec;
  /** Asserted total — the engine throws at build time if generation disagrees. */
  expectedTotal: number;
};

/* ------------------------------------------------------------------ */
/* CLASSIC — fully source-defined (§2.2 / Appendix A Table 3)          */
/* 108 = 76 numbered + 24 action + 8 wild                              */
/* ------------------------------------------------------------------ */
export const CLASSIC_DECK: DeckComposition = {
  numbers: { zero: 1, oneToNine: 2 }, // SOURCE: "one 0 and two each of 1-9"
  coloredActions: {
    SKIP: 2, // SOURCE: "two Skips"
    REVERSE: 2, // SOURCE: "two Reverses"
    DRAW_TWO: 2, // SOURCE: "two Draw Twos"
  },
  wilds: {
    WILD: 4, // SOURCE: "4 Wild"
    WILD_DRAW_FOUR: 4, // SOURCE: "4 Wild Draw Four"
  },
  expectedTotal: 108, // SOURCE
};

/* ------------------------------------------------------------------ */
/* FLIP — actions source-defined (§2.3), numbers RF-001                */
/* 112 = 72 numbered + 40 action                                       */
/* ------------------------------------------------------------------ */
/**
 * SOURCE pins the action counts exactly: "8 Skips, 8 Reverses, 8 Draw Ones,
 * 8 Flips, 4 Wilds, 4 Wild Draw Twos" = 40 cards. It does not state the number
 * distribution and Table 18 leaves the Flip deck size as "source-defined dual
 * side composition".
 *
 * RF-001: default is "no zero, two each of 1-9 per colour" (18 x 4 = 72), which
 * makes the deck total 112 and is consistent with the printed Flip contents.
 * Swap `FLIP_NUMBERS` to change it; the deck test asserts against
 * `expectedTotal`, so an alternative distribution fails loudly rather than
 * silently shifting the deck.
 */
export const FLIP_NUMBERS: NumberSpec = { zero: 0, oneToNine: 2 };

export const FLIP_DECK: DeckComposition = {
  numbers: FLIP_NUMBERS,
  coloredActions: {
    SKIP: 2, // SOURCE: 8 total / 4 colours
    REVERSE: 2, // SOURCE: 8 total
    DRAW_ONE: 2, // SOURCE: 8 Draw Ones (light face)
    FLIP: 2, // SOURCE: 8 Flips
  },
  wilds: {
    WILD: 4, // SOURCE
    WILD_DRAW_TWO: 4, // SOURCE: 4 Wild Draw Twos (light face)
  },
  expectedTotal: 112,
};

/**
 * Dark-side face mapping for the same 112 physical cards (§2.3).
 * SOURCE: "8 Skips, 8 Reverses, 8 Draw Fives, 8 Flips, 4 Wilds,
 * 4 Wild Draw Everyones" — the last of which the source's rule row names
 * "Wild Draw Color". We keep the source's rule-row label internally (§2.3 note).
 */
export const FLIP_DARK_FACE: Record<CardKind, CardKind> = {
  NUMBER: 'NUMBER',
  SKIP: 'SKIP',
  REVERSE: 'REVERSE',
  DRAW_ONE: 'DRAW_FIVE', // SOURCE: Draw One (light) <-> Draw Five (dark)
  FLIP: 'FLIP',
  WILD: 'WILD',
  WILD_DRAW_TWO: 'WILD_DRAW_COLOR', // SOURCE
} as Record<CardKind, CardKind>;

/**
 * RF-005: the source lists 8 dark "Skips" and separately defines
 * "Dark Skip Everyone". We map the dark face of a light Skip to SKIP_EVERYONE,
 * matching the source's Dark rule row ("Clear turn queue; play control returns
 * instantly to card player") and the printed product. Set
 * `FLIP_DARK_SKIP_IS_SKIP_EVERYONE = false` to treat dark Skips as plain Skips.
 */
export const FLIP_DARK_SKIP_IS_SKIP_EVERYONE = true;

/* ------------------------------------------------------------------ */
/* MAYHEM — §2.4 / Appendix A Table 5                       */
/* ------------------------------------------------------------------ */
/**
 * SOURCE pins: total 168, and the additions
 *   "8 Draw Four, 8 Discard All, 4 Wild Draw Six, 4 Wild Draw Ten,
 *    4 Wild Reverse Skip".
 * It does not restate the base distribution, and 108 + 28 = 136 != 168, so 32
 * cards are unaccounted for by the source text alone.
 *
 * RF-002: default composition below honours every source-pinned count exactly
 * and fills the remaining 32 slots as 1 extra Skip/Reverse/Draw Two per colour
 * (+12), 3 Skip Everyone per colour (+12) and 4 extra Wild + 4 extra Wild Draw
 * Four (+8). The five source-pinned counts are asserted separately in
 * `deck.test.ts` so a future edit cannot quietly break them.
 */
export const MAYHEM_DECK: DeckComposition = {
  numbers: { zero: 1, oneToNine: 2 }, // 76 — as Classic
  coloredActions: {
    SKIP: 3, // RF-002 (12 total)
    REVERSE: 3, // RF-002 (12 total)
    DRAW_TWO: 3, // RF-002 (12 total)
    DRAW_FOUR: 2, // SOURCE: 8 Draw Four
    DISCARD_ALL: 2, // SOURCE: 8 Discard All
    SKIP_EVERYONE: 3, // RF-002 (12 total)
  },
  wilds: {
    WILD: 8, // RF-002
    WILD_DRAW_FOUR: 8, // RF-002
    WILD_DRAW_SIX: 4, // SOURCE
    WILD_DRAW_TEN: 4, // SOURCE
    WILD_REVERSE_SKIP: 4, // SOURCE
  },
  expectedTotal: 168, // SOURCE
};

/** Counts the source states verbatim; asserted by tests. */
export const MAYHEM_SOURCE_PINNED: Partial<Record<CardKind, number>> = {
  DRAW_FOUR: 8,
  DISCARD_ALL: 8,
  WILD_DRAW_SIX: 4,
  WILD_DRAW_TEN: 4,
  WILD_REVERSE_SKIP: 4,
};

/** Draw amounts that feed the stacking vector (§2.4). */
export const PENALTY_VALUE: Partial<Record<CardKind, number>> = {
  DRAW_ONE: 1,
  DRAW_TWO: 2,
  WILD_DRAW_TWO: 2,
  WILD_TARGET_DRAW_TWO: 2,
  DRAW_FOUR: 4,
  WILD_DRAW_FOUR: 4,
  DRAW_FIVE: 5,
  WILD_DRAW_SIX: 6,
  WILD_DRAW_TEN: 10,
};

/* ------------------------------------------------------------------ */
/* WILD RUSH — fully source-defined (§2.5 / Appendix A Table 6)         */
/* 112 = 48 + 24 + 16 + 12 + 8 + 4                                     */
/* ------------------------------------------------------------------ */
export const ALL_WILD_DECK: WildSpec = {
  WILD: 48, // SOURCE: "48 Standard Wilds"
  WILD_TARGET_DRAW_TWO: 24, // SOURCE
  WILD_SKIP: 16, // SOURCE
  WILD_REVERSE: 12, // SOURCE
  WILD_DOUBLE_SKIP: 8, // SOURCE
  WILD_DRAW_FOUR: 4, // SOURCE
};
export const ALL_WILD_TOTAL = 112; // SOURCE

/* ------------------------------------------------------------------ */
/* FLEX — §2.6 / Appendix A Table 7                                    */
/* ------------------------------------------------------------------ */
/**
 * SOURCE defines the flex *mechanic* (primary symbol plus a secondary triangle
 * matrix, a public power token, Flex Number / Flex Draw Two / Flex Skip) but
 * gives no deck size — Table 18 says "source-defined flex matrix".
 *
 * RF-003: default is the Classic 108-card structure with every card also
 * carrying a secondary colour/action, which is the smallest deck that exercises
 * every rule the source does define.
 */
export const FLEX_DECK: DeckComposition = {
  numbers: { zero: 1, oneToNine: 2 },
  coloredActions: { SKIP: 2, REVERSE: 2, DRAW_TWO: 2 },
  wilds: { WILD: 4, WILD_DRAW_FOUR: 4 },
  expectedTotal: 108,
};

/** Standard CLASH card point values, used by the summary screen (RF-006). */
export function cardPoints(kind: CardKind, value?: number): number {
  if (kind === 'NUMBER') return value ?? 0;
  if (kind.startsWith('WILD')) return 50;
  return 20;
}
