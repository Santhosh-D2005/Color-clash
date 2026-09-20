import type {
  Card,
  OpeningContext,
  Resolution,
  ResolveContext,
  RuleContext,
  RngLike,
  VersionManifest,
} from '@colorclash/shared';
import { CLASSIC_COLORS, CLASSIC_DECK, RULE_PLAYER_LIMIT } from '@colorclash/game-content';
import { assertDeckSize, buildDeck } from '../deck.js';
import { defaultCanRespondToPenalty, standardIsPlayable } from '../legal.js';

/**
 * CLASSIC — §2.2 and Appendix A Table 3. Every behaviour below is quoted from
 * the source rule table; nothing here is inferred.
 *
 *   Deck        108 cards: 76 numbered, 24 action, 8 wild
 *   Skip        "Advance turn +2, skipping next player"
 *   Reverse     "Invert turn step by multiplying by -1; in 2-player games
 *                behaves like Skip"
 *   Draw Two    "Next target draws 2 and turn moves over them (+2)"
 *   Wild        "Require color declaration and update active color"
 *   Wild Draw 4 "Select color, target draws 4, then skip"
 */
export const classicManifest: VersionManifest = {
  id: 'CLASSIC',
  displayName: 'Classic Clash',
  tagline: 'Where every match starts',
  // The rule limit, not the seat limit: the engine is tested across the
  // whole source range, while a table in the client seats fewer. Both live
  // in game-content/limits.ts.
  playerLimit: RULE_PLAYER_LIMIT,

  colors: () => CLASSIC_COLORS,

  createDeck(_rng: RngLike): Card[] {
    const cards = buildDeck(CLASSIC_DECK, CLASSIC_COLORS);
    return assertDeckSize(cards, CLASSIC_DECK.expectedTotal, 'CLASSIC');
  },

  getStartingState() {
    return {};
  },

  isPlayable(ctx: RuleContext, card: Card): boolean {
    return standardIsPlayable(ctx, card);
  },

  canRespondToPenalty(ctx: RuleContext, card: Card): boolean {
    // Stacking is off for Classic by default (VERSION_CONFIG_DEFAULTS); when a
    // table enables it, the shared "matching or higher" rule applies.
    return defaultCanRespondToPenalty(ctx.state, card);
  },

  isActionCard(card: Card): boolean {
    return card.kind !== 'NUMBER';
  },

  resolveCard(ctx: ResolveContext, card: Card): Resolution[] {
    const stacking = ctx.state.config.stacking;
    switch (card.kind) {
      case 'NUMBER':
        return [];

      case 'SKIP':
        // +1 on top of the normal +1 advance == "advance turn +2".
        return [{ type: 'SKIP', count: 1 }];

      case 'REVERSE':
        // 2-player Skip equivalence is handled inside applyReverse.
        return [{ type: 'REVERSE' }];

      case 'DRAW_TWO':
        return stacking
          ? [{ type: 'STACK', amount: 2, kind: 'DRAW_TWO' }]
          : [
              { type: 'DRAW', target: 'NEXT', count: 2 },
              { type: 'SKIP', count: 1 },
            ];

      case 'WILD':
        return [{ type: 'REQUEST_COLOR_CHOICE' }];

      case 'WILD_DRAW_FOUR':
        return stacking
          ? [{ type: 'REQUEST_COLOR_CHOICE' }, { type: 'STACK', amount: 4, kind: 'WILD_DRAW_FOUR' }]
          : [
              { type: 'REQUEST_COLOR_CHOICE' },
              { type: 'DRAW', target: 'NEXT', count: 4 },
              { type: 'SKIP', count: 1 },
            ];

      default:
        return [];
    }
  },

  /**
   * §2.1 discard setup: "Move top DrawPile card to DiscardPile; execute special
   * action checks if it is an action/wild."
   *
   * Read literally, an opening action card takes effect against the first
   * player. RF-008 records the one place the source is silent — an opening
   * Reverse — where we make the dealer seat play first rather than inventing a
   * different turn origin.
   */
  resolveOpeningDiscard(ctx: OpeningContext): Resolution[] {
    switch (ctx.openingCard.kind) {
      case 'SKIP':
        return [{ type: 'SKIP', count: 1 }];
      case 'REVERSE':
        return [{ type: 'REVERSE' }, { type: 'NO_ADVANCE' }]; // RF-008
      case 'DRAW_TWO':
        return [
          { type: 'DRAW', target: 'NEXT', count: 2 },
          { type: 'SKIP', count: 1 },
        ];
      case 'WILD':
        return [{ type: 'REQUEST_COLOR_CHOICE' }];
      case 'WILD_DRAW_FOUR':
        return [
          { type: 'REQUEST_COLOR_CHOICE' },
          { type: 'DRAW', target: 'NEXT', count: 4 },
          { type: 'SKIP', count: 1 },
        ];
      default:
        return [];
    }
  },
};
