/**
 * PRESERVATION CONTRACT — the mechanism lock for the v2.0 rebuild.
 *
 * `docs/PRESERVATION.md` states the rule this file enforces: the rebuild
 * changes the product around the game, never the game. Every value below is
 * either source-defined by the CLASH blueprint or a recorded RF-xxx decision.
 * None of them is an implementation detail that a refactor is free to move.
 *
 * This is deliberately NOT a snapshot of file hashes. Hashes break on a
 * reformat and pass on a rewrite that happens to be the same length; they
 * measure the wrong thing. These assertions measure behaviour and constants,
 * so the engine can be refactored, re-typed, moved between packages or ported
 * to a new monorepo layout and this file still tells the truth.
 *
 * If a test here fails, the correct response is almost never to update the
 * expected value. It is to ask which phase of the rebuild changed a rule it
 * had no mandate to change. The only legitimate way to change a number in this
 * file is a new RF entry in `docs/RULE_FLAGS.md`, recorded in the same commit.
 */
import {
  ALL_WILD_DECK,
  ALL_WILD_TOTAL,
  CLASSIC_COLORS,
  CLASSIC_DECK,
  COLOR_INK,
  COLOR_HEX,
  DEFAULT_CONFIG,
  FLEX_DECK,
  FLIP_DARK_COLORS,
  FLIP_DARK_FACE,
  FLIP_DARK_SKIP_IS_SKIP_EVERYONE,
  FLIP_DECK,
  FLIP_LIGHT_COLORS,
  FLIP_NUMBERS,
  MAYHEM_DECK,
  MAYHEM_SOURCE_PINNED,
  PENALTY_VALUE,
  RULE_PLAYER_LIMIT,
  SEAT_LIMIT,
  VERSION_CONFIG_DEFAULTS,
  VERSION_ORDER,
  cardPoints,
  configFor,
} from '@colorclash/game-content';
import { createRng } from '@colorclash/shared';
import type { GameVersion } from '@colorclash/shared';
import { describe, expect, it } from '@colorclash/test-fixtures';

import { createMatch } from '../src/setup.js';
import { getManifest } from '../src/registry.js';
import { ALL_WILD_COLOR_MODE } from '../src/versions/allWild.js';
import { FLEX_RESET } from '../src/versions/flex.js';
import { FLIP_DARK_NUMBERS, FLIP_SIDE_PAIRING } from '../src/versions/flip.js';

/* ------------------------------------------------------------------ */
/* Deck composition — SOURCE §2.2-§2.6, RF-001, RF-002, RF-003          */
/* ------------------------------------------------------------------ */

const EXPECTED_DECK_SIZE: Record<GameVersion, number> = {
  CLASSIC: 108,
  FLIP: 112,
  MAYHEM: 168,
  ALL_WILD: 112,
  FLEX: 108,
};

describe('PRESERVATION — deck composition', () => {
  it('registers exactly the five source-defined rulesets, in order', () => {
    expect(VERSION_ORDER).toEqual(['CLASSIC', 'FLIP', 'MAYHEM', 'ALL_WILD', 'FLEX']);
  });

  for (const version of VERSION_ORDER) {
    it(`${version} generates exactly ${EXPECTED_DECK_SIZE[version]} cards`, () => {
      const deck = getManifest(version).createDeck(createRng('preservation'));
      expect(deck.length).toBe(EXPECTED_DECK_SIZE[version]);
    });

    it(`${version} deals a deck with no duplicate card ids`, () => {
      const deck = getManifest(version).createDeck(createRng('preservation'));
      expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length);
    });
  }

  it('declared compositions still agree with their expected totals', () => {
    expect(CLASSIC_DECK.expectedTotal).toBe(108);
    expect(FLIP_DECK.expectedTotal).toBe(112);
    expect(MAYHEM_DECK.expectedTotal).toBe(168);
    expect(FLEX_DECK.expectedTotal).toBe(108);
    expect(ALL_WILD_TOTAL).toBe(112);
  });

  it('CLASSIC keeps the source distribution: one 0 and two each 1-9 per colour', () => {
    expect(CLASSIC_DECK.numbers.zero).toBe(1);
    expect(CLASSIC_DECK.numbers.oneToNine).toBe(2);
    expect(CLASSIC_DECK.coloredActions.SKIP).toBe(2);
    expect(CLASSIC_DECK.coloredActions.REVERSE).toBe(2);
    expect(CLASSIC_DECK.coloredActions.DRAW_TWO).toBe(2);
    expect(CLASSIC_DECK.wilds.WILD).toBe(4);
    expect(CLASSIC_DECK.wilds.WILD_DRAW_FOUR).toBe(4);
  });

  it('MAYHEM honours every count the source pins verbatim (RF-002)', () => {
    expect(MAYHEM_SOURCE_PINNED.DRAW_FOUR).toBe(8);
    expect(MAYHEM_SOURCE_PINNED.DISCARD_ALL).toBe(8);
    expect(MAYHEM_SOURCE_PINNED.WILD_DRAW_SIX).toBe(4);
    expect(MAYHEM_SOURCE_PINNED.WILD_DRAW_TEN).toBe(4);
    expect(MAYHEM_SOURCE_PINNED.WILD_REVERSE_SKIP).toBe(4);
  });

  it('WILD RUSH keeps the source composition exactly (§2.5)', () => {
    expect(ALL_WILD_DECK.WILD).toBe(48);
    expect(ALL_WILD_DECK.WILD_TARGET_DRAW_TWO).toBe(24);
    expect(ALL_WILD_DECK.WILD_SKIP).toBe(16);
    expect(ALL_WILD_DECK.WILD_REVERSE).toBe(12);
    expect(ALL_WILD_DECK.WILD_DOUBLE_SKIP).toBe(8);
    expect(ALL_WILD_DECK.WILD_DRAW_FOUR).toBe(4);
  });

  it('FLIPSTORM number distribution stays as RF-001 decided', () => {
    expect(FLIP_NUMBERS.zero).toBe(0);
    expect(FLIP_NUMBERS.oneToNine).toBe(2);
  });

  it('FLIPSTORM dark-face mapping is unchanged (RF-005)', () => {
    expect(FLIP_DARK_SKIP_IS_SKIP_EVERYONE).toBe(true);
    expect(FLIP_DARK_FACE.DRAW_ONE).toBe('DRAW_FIVE');
    expect(FLIP_DARK_FACE.WILD_DRAW_TWO).toBe('WILD_DRAW_COLOR');
    expect(FLIP_DARK_FACE.NUMBER).toBe('NUMBER');
    expect(FLIP_DARK_FACE.REVERSE).toBe('REVERSE');
    expect(FLIP_DARK_FACE.FLIP).toBe('FLIP');
    expect(FLIP_DARK_FACE.WILD).toBe('WILD');
  });
});

/* ------------------------------------------------------------------ */
/* Penalty vector and scoring — SOURCE §2.4, RF-006, RF-013            */
/* ------------------------------------------------------------------ */

describe('PRESERVATION — penalties and scoring', () => {
  it('the stacking vector is exactly the source penalty table', () => {
    expect(PENALTY_VALUE.DRAW_ONE).toBe(1);
    expect(PENALTY_VALUE.DRAW_TWO).toBe(2);
    expect(PENALTY_VALUE.WILD_DRAW_TWO).toBe(2);
    expect(PENALTY_VALUE.WILD_TARGET_DRAW_TWO).toBe(2);
    expect(PENALTY_VALUE.DRAW_FOUR).toBe(4);
    expect(PENALTY_VALUE.WILD_DRAW_FOUR).toBe(4);
    expect(PENALTY_VALUE.DRAW_FIVE).toBe(5);
    expect(PENALTY_VALUE.WILD_DRAW_SIX).toBe(6);
    expect(PENALTY_VALUE.WILD_DRAW_TEN).toBe(10);
  });

  it('a card that carries no penalty cannot answer a stack', () => {
    expect(PENALTY_VALUE.NUMBER).toBeUndefined();
    expect(PENALTY_VALUE.SKIP).toBeUndefined();
    expect(PENALTY_VALUE.REVERSE).toBeUndefined();
    expect(PENALTY_VALUE.WILD).toBeUndefined();
  });

  it('scoring stays at face value / 20 / 50 (RF-006)', () => {
    expect(cardPoints('NUMBER', 0)).toBe(0);
    expect(cardPoints('NUMBER', 7)).toBe(7);
    expect(cardPoints('NUMBER', 9)).toBe(9);
    expect(cardPoints('SKIP')).toBe(20);
    expect(cardPoints('REVERSE')).toBe(20);
    expect(cardPoints('DRAW_TWO')).toBe(20);
    expect(cardPoints('DISCARD_ALL')).toBe(20);
    expect(cardPoints('SKIP_EVERYONE')).toBe(20);
    expect(cardPoints('WILD')).toBe(50);
    expect(cardPoints('WILD_DRAW_FOUR')).toBe(50);
    expect(cardPoints('WILD_DRAW_TEN')).toBe(50);
  });
});

/* ------------------------------------------------------------------ */
/* Match configuration — SOURCE §2.1, §2.4                              */
/* ------------------------------------------------------------------ */

describe('PRESERVATION — match configuration', () => {
  it('the source-defined defaults are unchanged', () => {
    expect(DEFAULT_CONFIG.clashPenaltyCards).toBe(2); // SOURCE §2.1
    expect(DEFAULT_CONFIG.eliminationThreshold).toBe(25); // SOURCE §2.4
    expect(DEFAULT_CONFIG.winCondition).toBe('ONE_ROUND');
    expect(DEFAULT_CONFIG.drawRule).toBe('DRAW_ONE');
    expect(DEFAULT_CONFIG.scoringMode).toBe('STANDARD');
    expect(DEFAULT_CONFIG.clashGraceMs).toBe(4000);
  });

  it('the Wild Draw Four challenge stays off — the source defines no outcome (RF-009)', () => {
    expect(DEFAULT_CONFIG.challengeWildDrawFour).toBe(false);
  });

  it('stacking is on for Mayhem and off everywhere else', () => {
    expect(VERSION_CONFIG_DEFAULTS.MAYHEM?.stacking).toBe(true);
    expect(configFor('MAYHEM').stacking).toBe(true);
    expect(configFor('CLASSIC').stacking).toBe(false);
    expect(configFor('FLIP').stacking).toBe(false);
    expect(configFor('ALL_WILD').stacking).toBe(false);
    expect(configFor('FLEX').stacking).toBe(false);
  });

  it('there are two player limits and both keep their values', () => {
    expect(RULE_PLAYER_LIMIT).toEqual({ min: 2, max: 10 }); // SOURCE §2.1
    expect(SEAT_LIMIT).toEqual({ min: 2, max: 6 }); // product limit
  });
});

/* ------------------------------------------------------------------ */
/* Rule flags — docs/RULE_FLAGS.md                                      */
/* ------------------------------------------------------------------ */

describe('PRESERVATION — the RF ledger defaults', () => {
  it('RF-010: Flipstorm pairs a card with its own colour family and number', () => {
    expect(FLIP_SIDE_PAIRING).toBe('IDENTITY');
    expect(FLIP_DARK_NUMBERS).toBe('MIRROR');
  });

  it('RF-011: Wild Rush assigns the active colour rather than prompting', () => {
    expect(ALL_WILD_COLOR_MODE).toBe('AUTO');
  });

  it('RF-012: the Freestyle token resets at the start of each round', () => {
    expect(FLEX_RESET).toBe('ROUND_START');
  });

  it('RF-004: Flipstorm light colours are the blueprint set, not the retail set', () => {
    expect(FLIP_LIGHT_COLORS).toEqual(['PINK', 'TEAL', 'PURPLE', 'ORANGE']);
    expect(FLIP_DARK_COLORS).toEqual(['DARK_PINK', 'DARK_TEAL', 'DARK_PURPLE', 'DARK_ORANGE']);
  });

  it('the classic palette is unchanged', () => {
    expect(CLASSIC_COLORS).toEqual(['RED', 'YELLOW', 'GREEN', 'BLUE']);
  });
});

/* ------------------------------------------------------------------ */
/* Accessibility — every colour keeps a readable ink                    */
/* ------------------------------------------------------------------ */

function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('PRESERVATION — colour contrast (PRD A11Y-03)', () => {
  it('every palette colour has an ink that clears WCAG AA for large text', () => {
    for (const [name, hex] of Object.entries(COLOR_HEX)) {
      const ink = COLOR_INK[name];
      expect(ink).toBeDefined();
      const ratio = contrast(hex, ink!);
      if (ratio < 3) {
        throw new Error(`${name} (${hex}) on ${ink} is ${ratio.toFixed(2)}:1, below 3:1`);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Setup — SOURCE §2.1 / §7.1                                           */
/* ------------------------------------------------------------------ */

describe('PRESERVATION — setup', () => {
  for (const version of VERSION_ORDER) {
    it(`${version} deals exactly 7 cards to every player`, () => {
      const { state, events } = createMatch(
        {
          gameId: `pres-${version}`,
          version,
          seed: 'preservation',
          players: [
            { id: 'P1', name: 'One', isBot: false },
            { id: 'P2', name: 'Two', isBot: true },
            { id: 'P3', name: 'Three', isBot: true },
          ],
        },
        createRng('preservation'),
      );

      // Assert the DEAL, not the hand sizes. A hand can legitimately be larger
      // than 7 the moment setup finishes, because an opening action card
      // resolves against the dealer seat (RF-007) — an opening Draw Two really
      // does leave seat 0 holding nine cards before anyone has acted. Asserting
      // `hand.length === 7` here would be asserting that RF-007 does not happen,
      // which is the opposite of preserving it.
      const dealt = events.filter((e) => e.type === 'CARD_DEALT');
      expect(dealt.length).toBe(3);
      for (const e of dealt) expect((e as { count: number }).count).toBe(7);

      expect(state.discardPile.length).toBeGreaterThanOrEqual(1);
      expect(state.status).toBe('PLAYING');
    });
  }

  it('RF-007: an opening action card resolves against the dealer seat', () => {
    // This seed is chosen because it turns up a coloured Draw Two as the
    // opening discard in Mayhem. Seat 0 draws two and loses the turn, exactly
    // as it would at a physical table where the card lands on the player to
    // the dealer's left.
    const { state, events } = createMatch(
      {
        gameId: 'rf007',
        version: 'MAYHEM',
        seed: 'preservation',
        players: [
          { id: 'P1', name: 'One', isBot: false },
          { id: 'P2', name: 'Two', isBot: true },
          { id: 'P3', name: 'Three', isBot: true },
        ],
      },
      createRng('preservation'),
    );

    const top = state.cards[state.discardPile[state.discardPile.length - 1]!]!;
    expect(top.kind).toBe('DRAW_TWO');

    const drawn = events.find((e) => e.type === 'CARD_DRAWN') as
      { playerId: string; count: number } | undefined;
    expect(drawn?.playerId).toBe('P1');
    expect(drawn?.count).toBe(2);

    expect(state.players[0]!.hand.length).toBe(9);
    // ...and the turn has moved past them.
    expect(state.activePlayerIndex).toBe(1);
  });

  it('every card exists in exactly one zone after setup, in every ruleset', () => {
    for (const version of VERSION_ORDER) {
      const { state } = createMatch(
        {
          gameId: `zones-${version}`,
          version,
          seed: 'zones',
          players: [
            { id: 'P1', name: 'One', isBot: false },
            { id: 'P2', name: 'Two', isBot: true },
          ],
        },
        createRng('zones'),
      );
      const seen = [
        ...state.drawPile,
        ...state.discardPile,
        ...state.players.flatMap((p) => p.hand),
      ];
      const total = Object.keys(state.cards).length;
      if (seen.length !== total) {
        throw new Error(`${version}: ${seen.length} placed, ${total} in the card table`);
      }
      if (new Set(seen).size !== total) {
        throw new Error(`${version}: a card id appears in more than one zone`);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* The engine contract — TRD §4                                         */
/* ------------------------------------------------------------------ */

describe('PRESERVATION — the version manifest contract', () => {
  const REQUIRED = [
    'id',
    'displayName',
    'playerLimit',
    'colors',
    'createDeck',
    'getStartingState',
    'isPlayable',
    'resolveCard',
    'isActionCard',
  ] as const;

  for (const version of VERSION_ORDER) {
    it(`${version} still implements every member of VersionManifest`, () => {
      const manifest = getManifest(version) as unknown as Record<string, unknown>;
      for (const key of REQUIRED) {
        if (manifest[key] === undefined) {
          throw new Error(`${version} manifest is missing ${key}`);
        }
      }
      expect(manifest.id).toBe(version);
    });
  }

  it('the engine is deterministic: the same seed produces the same deal', () => {
    for (const version of VERSION_ORDER) {
      const build = () =>
        createMatch(
          {
            gameId: 'det',
            version,
            seed: 'fixed-seed',
            players: [
              { id: 'P1', name: 'One', isBot: false },
              { id: 'P2', name: 'Two', isBot: true },
            ],
          },
          createRng('fixed-seed'),
        ).state;
      const a = build();
      const b = build();
      expect(JSON.stringify(a.drawPile)).toBe(JSON.stringify(b.drawPile));
      expect(JSON.stringify(a.players.map((p) => p.hand))).toBe(
        JSON.stringify(b.players.map((p) => p.hand)),
      );
    }
  });
});
