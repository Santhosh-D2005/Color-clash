import type {
  Card,
  OpeningContext,
  Resolution,
  ResolveContext,
  RuleContext,
  VersionManifest,
} from '@colorclash/shared';
import { CLASSIC_COLORS, MAYHEM_DECK, RULE_PLAYER_LIMIT } from '@colorclash/game-content';
import { assertDeckSize, buildDeck } from '../deck.js';
import { defaultCanRespondToPenalty, standardIsPlayable } from '../legal.js';

/**
 * MAYHEM — §2.4 and Appendix A Table 5.
 *
 *   Deck            168 cards
 *   Additions       8 Draw Four, 8 Discard All, 4 Wild Draw Six,
 *                   4 Wild Draw Ten, 4 Wild Reverse Skip
 *   Stacking        Draw penalties +2/+4/+6/+10 can pass iteratively when
 *                   matching or higher cards are played; cumulative penalty
 *                   lands on first player unable to respond
 *   Elimination threshold After every draw, if hand size >= 25, player is immediately
 *                   eliminated
 *   7 rule          Playing 7 triggers mandatory choice to swap hands with any player
 *   0 rule          Playing 0 rotates all hands sequentially down the turn queue
 *   Discard All     Immediately discard every card of matching color from the hand
 *
 * §8.4 requires the stacking context to be explicit (pendingDraw +
 * minimumResponsePenalty, held in state.penalty), elimination to run after
 * every draw (engine-level, see draw.ts), 7/0 to operate on authoritative hand
 * arrays, Discard All to move cards in one transaction, and Wild Reverse Skip
 * to be a single combined effect.
 */
export const mayhemManifest: VersionManifest = {
  id: 'MAYHEM',
  displayName: 'Mayhem',
  tagline: 'Stack it, dodge it, or drown',
  // The rule limit, not the seat limit: the engine is tested across the
  // whole source range, while a table in the client seats fewer. Both live
  // in game-content/limits.ts.
  playerLimit: RULE_PLAYER_LIMIT,

  colors: () => CLASSIC_COLORS,

  createDeck(): Card[] {
    const cards = buildDeck(MAYHEM_DECK, CLASSIC_COLORS);
    return assertDeckSize(cards, MAYHEM_DECK.expectedTotal, 'MAYHEM');
  },

  getStartingState() {
    return {};
  },

  isPlayable(ctx: RuleContext, card: Card): boolean {
    return standardIsPlayable(ctx, card);
  },

  /** SOURCE: penalties pass "when matching or higher cards are played". */
  canRespondToPenalty(ctx: RuleContext, card: Card): boolean {
    return defaultCanRespondToPenalty(ctx.state, card);
  },

  isActionCard(card: Card): boolean {
    return card.kind !== 'NUMBER';
  },

  resolveCard(ctx: ResolveContext, card: Card): Resolution[] {
    const stacking = ctx.state.config.stacking;

    switch (card.kind) {
      case 'NUMBER': {
        // SOURCE 7 rule / 0 rule.
        if (card.value === 7) return [{ type: 'REQUEST_SWAP_CHOICE' }];
        if (card.value === 0) return [{ type: 'ROTATE_HANDS' }];
        return [];
      }

      case 'SKIP':
        return [{ type: 'SKIP', count: 1 }];

      case 'SKIP_EVERYONE':
        return [{ type: 'SKIP_EVERYONE' }];

      case 'REVERSE':
        return [{ type: 'REVERSE' }];

      case 'DRAW_TWO':
        return penalty(stacking, 2, 'DRAW_TWO');

      case 'DRAW_FOUR':
        return penalty(stacking, 4, 'DRAW_FOUR');

      case 'DISCARD_ALL':
        // SOURCE: "Immediately discard every card of matching color".
        return [{ type: 'DISCARD_ALL_OF_COLOR' }];

      case 'WILD':
        return [{ type: 'REQUEST_COLOR_CHOICE' }];

      case 'WILD_DRAW_FOUR':
        return [{ type: 'REQUEST_COLOR_CHOICE' }, ...penalty(stacking, 4, 'WILD_DRAW_FOUR')];

      case 'WILD_DRAW_SIX':
        // SOURCE: "Change active color and add severe draw penalties to the
        // stacking vector."
        return [{ type: 'REQUEST_COLOR_CHOICE' }, ...penalty(stacking, 6, 'WILD_DRAW_SIX')];

      case 'WILD_DRAW_TEN':
        return [{ type: 'REQUEST_COLOR_CHOICE' }, ...penalty(stacking, 10, 'WILD_DRAW_TEN')];

      case 'WILD_REVERSE_SKIP':
        // §8.4: "modeled as a combined effect so direction and skipping cannot drift".
        return [
          { type: 'REQUEST_COLOR_CHOICE' },
          { type: 'REVERSE' },
          { type: 'SKIP', count: 1 },
        ];

      default:
        return [];
    }
  },

  resolveOpeningDiscard(ctx: OpeningContext): Resolution[] {
    const k = ctx.openingCard.kind;
    if (k === 'NUMBER') {
      // An opening 7 or 0 has no player to act, so the source's "special action
      // check" is a no-op here rather than a swap against an empty table.
      return [];
    }
    if (k === 'DISCARD_ALL') return [];
    if (k === 'SKIP') return [{ type: 'SKIP', count: 1 }];
    if (k === 'SKIP_EVERYONE') return [{ type: 'SKIP_EVERYONE' }];
    if (k === 'REVERSE') return [{ type: 'REVERSE' }, { type: 'NO_ADVANCE' }];
    if (k === 'DRAW_TWO' || k === 'DRAW_FOUR') {
      const amount = k === 'DRAW_TWO' ? 2 : 4;
      return [
        { type: 'DRAW', target: 'NEXT', count: amount },
        { type: 'SKIP', count: 1 },
      ];
    }
    if (k.startsWith('WILD')) return [{ type: 'REQUEST_COLOR_CHOICE' }];
    return [];
  },
};

function penalty(
  stacking: boolean,
  amount: number,
  kind: Card['kind'],
): Resolution[] {
  return stacking
    ? [{ type: 'STACK', amount, kind }]
    : [
        { type: 'DRAW', target: 'NEXT', count: amount },
        { type: 'SKIP', count: 1 },
      ];
}
