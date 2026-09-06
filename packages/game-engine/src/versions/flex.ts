import type {
  Card,
  OpeningContext,
  Resolution,
  ResolveContext,
  RuleContext,
  VersionManifest,
} from '@colorclash/shared';
import { CLASSIC_COLORS, FLEX_DECK, RULE_PLAYER_LIMIT } from '@colorclash/game-content';
import { assertDeckSize, buildDeck } from '../deck.js';
import { standardIsPlayable } from '../legal.js';

/**
 * FLEX — §2.6 and Appendix A Table 7.
 *
 *   Card structure  Primary symbols plus secondary triangle indicators
 *                   containing alternate color/action matrix
 *   Power           Public FlexPowerTracker boolean. Using a flex action
 *                   consumes the token until globally reset
 *   Flex Number     Can validate through secondary triangle matrix if primary
 *                   color match fails
 *   Flex Draw Two   Standard: next player draws 2.
 *                   Flex: skip draw penalty and force all other players to
 *                   draw 1 simultaneously
 *   Flex Skip       Standard: skip next player.
 *                   Flex: skip all opponents and immediately grant active
 *                   player another turn
 *
 * §8.6: "Each card stores primary and secondary action/color data",
 * "FlexPowerTracker is public state", "Flex use consumes the token atomically
 * with card play", "Flex Number modifies legality only if primary validation
 * fails", "Flex Draw Two and Flex Skip resolve as alternative effects, not as
 * separate cards".
 */

/**
 * RF-012: the source says the token is consumed "until globally reset" but does
 * not say when the reset happens. Default: the tracker resets at the start of
 * every round. `FLEX_RESET` switches to per-trick behaviour if a table wants it.
 */
export const FLEX_RESET: 'ROUND_START' | 'EVERY_FULL_LAP' = 'ROUND_START';

export const flexManifest: VersionManifest = {
  id: 'FLEX',
  displayName: 'Freestyle',
  tagline: 'Bend one rule per round',
  // The rule limit, not the seat limit: the engine is tested across the
  // whole source range, while a table in the client seats fewer. Both live
  // in game-content/limits.ts.
  playerLimit: RULE_PLAYER_LIMIT,

  colors: () => CLASSIC_COLORS,

  createDeck(): Card[] {
    // RF-003 — Classic structure, every card additionally carrying the
    // secondary triangle matrix the source describes.
    const cards = buildDeck(FLEX_DECK, CLASSIC_COLORS, (card) => {
      if (!card.primaryColor) return card; // wilds have no secondary matrix
      const idx = CLASSIC_COLORS.indexOf(card.primaryColor);
      const secondaryColor = CLASSIC_COLORS[(idx + 2) % CLASSIC_COLORS.length]!;
      return {
        ...card,
        flex: {
          secondaryColor,
          secondaryKind: card.kind,
          secondaryValue: typeof card.value === 'number' ? card.value : undefined,
        },
      };
    });
    return assertDeckSize(cards, FLEX_DECK.expectedTotal, 'FLEX');
  },

  getStartingState() {
    return { flexPowerAvailable: true };
  },

  /**
   * "Flex Number modifies legality only if primary validation fails" — the
   * secondary matrix is consulted second, and only while the token is unspent.
   */
  isPlayable(ctx: RuleContext, card: Card): boolean {
    if (standardIsPlayable(ctx, card)) return true;
    if (!ctx.state.flexPowerAvailable) return false;
    return secondaryMatches(ctx, card);
  },

  isActionCard(card: Card): boolean {
    return card.kind !== 'NUMBER';
  },

  resolveCard(ctx: ResolveContext, card: Card): Resolution[] {
    const primaryLegal = standardIsPlayable(ctx, card);
    // A play that only stands up through the secondary matrix always spends the
    // token, whether or not the player asked for it.
    const mustFlex = !primaryLegal;
    const flexing = ctx.useFlex || mustFlex;

    if (!flexing) return standardEffects(card);

    const head: Resolution[] = [{ type: 'CONSUME_FLEX' }];
    if (mustFlex && card.flex) {
      // Legality came from the secondary colour, so that colour becomes active.
      head.push({ type: 'SET_COLOR', color: card.flex.secondaryColor });
    }
    return [...head, ...flexEffects(card)];
  },

  resolveOpeningDiscard(ctx: OpeningContext): Resolution[] {
    switch (ctx.openingCard.kind) {
      case 'SKIP':
        return [{ type: 'SKIP', count: 1 }];
      case 'REVERSE':
        return [{ type: 'REVERSE' }, { type: 'NO_ADVANCE' }];
      case 'DRAW_TWO':
        return [
          { type: 'DRAW', target: 'NEXT', count: 2 },
          { type: 'SKIP', count: 1 },
        ];
      case 'WILD':
      case 'WILD_DRAW_FOUR':
        return [{ type: 'REQUEST_COLOR_CHOICE' }];
      default:
        return [];
    }
  },
};

function secondaryMatches(ctx: RuleContext, card: Card): boolean {
  const flex = card.flex;
  if (!flex) return false;
  const top = ctx.topCard();
  if (!top) return true;
  const topFace = ctx.face(top);

  if (ctx.state.activeColor === flex.secondaryColor) return true;
  if (flex.secondaryKind === 'NUMBER' && topFace.kind === 'NUMBER') {
    return flex.secondaryValue === topFace.value;
  }
  return flex.secondaryKind === topFace.kind;
}

function standardEffects(card: Card): Resolution[] {
  switch (card.kind) {
    case 'SKIP':
      return [{ type: 'SKIP', count: 1 }];
    case 'REVERSE':
      return [{ type: 'REVERSE' }];
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
}

function flexEffects(card: Card): Resolution[] {
  switch (card.kind) {
    case 'DRAW_TWO':
      // SOURCE: "skip draw penalty and force all other players to draw 1
      // simultaneously" — no skip, because the next player's draw is replaced.
      return [{ type: 'DRAW', target: 'ALL_OTHERS', count: 1 }];

    case 'SKIP':
      // SOURCE: "skip all opponents and immediately grant active player another
      // turn" — modelled as suppressing the advance, so control never leaves.
      return [{ type: 'NO_ADVANCE' }];

    case 'REVERSE':
      return [{ type: 'REVERSE' }];

    case 'WILD':
      return [{ type: 'REQUEST_COLOR_CHOICE' }];

    case 'WILD_DRAW_FOUR':
      return [
        { type: 'REQUEST_COLOR_CHOICE' },
        { type: 'DRAW', target: 'NEXT', count: 4 },
        { type: 'SKIP', count: 1 },
      ];

    // Flex Number: the secondary matrix affects legality only; no extra effect.
    default:
      return [];
  }
}

/** Whether a card offers a *choice* of flex effect the UI should surface. */
export function offersFlexChoice(card: Card): boolean {
  return card.kind === 'DRAW_TWO' || card.kind === 'SKIP';
}
