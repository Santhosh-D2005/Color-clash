import type {
  Card,
  CardKind,
  OpeningContext,
  Resolution,
  ResolveContext,
  VersionManifest,
} from '@colorclash/shared';
import { ALL_WILD_DECK, ALL_WILD_TOTAL, CLASSIC_COLORS, RULE_PLAYER_LIMIT } from '@colorclash/game-content';
import { assertDeckSize, kindCode } from '../deck.js';

/**
 * WILD RUSH — §2.5 and Appendix A Table 6.
 *
 *   Deck          112 cards; no numbered or color-matched cards; every asset is
 *                 structurally Wild
 *   Composition   48 Standard Wilds, 24 Wild Target Draw Twos, 16 Wild Skips,
 *                 12 Wild Reverses, 8 Wild Double Skips, 4 Wild Draw Fours
 *   Target D2     Active player targets any player index globally; target draws 2
 *   Double Skip   Advance turn index +3, eliminating the next two consecutive
 *                 active players
 *
 * §8.5: "Card legality is not color/value matching; all cards are structurally
 * Wild", "Target selection must be explicit", "Wild Double Skip changes turn
 * index by +3", "Use an action queue for multi-effect cards".
 */
export const allWildManifest: VersionManifest = {
  id: 'ALL_WILD',
  displayName: 'Wild Rush',
  tagline: 'Every card is wild. Nothing is safe',
  // The rule limit, not the seat limit: the engine is tested across the
  // whole source range, while a table in the client seats fewer. Both live
  // in game-content/limits.ts.
  playerLimit: RULE_PLAYER_LIMIT,

  colors: () => CLASSIC_COLORS,

  createDeck(): Card[] {
    const cards: Card[] = [];
    for (const [kind, count] of Object.entries(ALL_WILD_DECK)) {
      for (let copy = 0; copy < (count ?? 0); copy++) {
        cards.push({ id: `${kindCode(kind as CardKind)}#${copy}`, kind: kind as CardKind });
      }
    }
    return assertDeckSize(cards, ALL_WILD_TOTAL, 'ALL_WILD');
  },

  getStartingState() {
    return {};
  },

  /**
   * SOURCE: "no numbered or color-matched cards; every asset is structurally
   * Wild" — so legality is unconditional. Turn ownership and card ownership are
   * still enforced upstream by the shared pipeline (§7.2).
   */
  isPlayable(): boolean {
    return true;
  },

  isActionCard(card: Card): boolean {
    return card.kind !== 'WILD';
  },

  resolveCard(_ctx: ResolveContext, card: Card): Resolution[] {
    return allWildEffects(card);
  },

  resolveOpeningDiscard(ctx: OpeningContext): Resolution[] {
    return allWildEffects(ctx.openingCard);
  },
};

/**
 * RF-011 — how the active colour is decided in this mode.
 *
 * `isPlayable` above is unconditional, so in Wild Rush the declared colour has
 * no effect on legality, and nothing else in this ruleset reads it either:
 * there is no Discard All and no draw-until-colour. It is therefore a choice
 * with no consequence, and asking for it on literally every card turned the
 * mode into a sequence of modal dialogs.
 *
 * So the colour is assigned rather than requested. It is derived from the card
 * itself, which makes it a pure function of the play: the same card always
 * produces the same colour locally, on the server, for a bot and after a
 * reconnect, without consuming a random number or depending on turn order.
 *
 * `'PLAYER'` restores the old prompt. It is one word, and the tests cover both.
 */
export type AllWildColorMode = 'AUTO' | 'PLAYER';
export const ALL_WILD_COLOR_MODE: AllWildColorMode = 'AUTO';

/**
 * Stable, order-independent colour for a card id. A plain sum of char codes is
 * enough — it only has to be deterministic and reasonably spread, and being
 * trivially reproducible matters more here than being well distributed.
 */
export function autoColorFor(cardId: string): string {
  let h = 0;
  for (let i = 0; i < cardId.length; i++) h = (h + cardId.charCodeAt(i) * (i + 1)) % 997;
  return CLASSIC_COLORS[h % CLASSIC_COLORS.length]!;
}

/** The colour step for a play: either a silent assignment or a prompt. */
function colorStep(card: Card, mode: AllWildColorMode): Resolution {
  return mode === 'AUTO'
    ? { type: 'SET_COLOR', color: autoColorFor(card.id) }
    : { type: 'REQUEST_COLOR_CHOICE' };
}

/**
 * Exported so both colour modes can be tested as a pure function, without
 * having to rebuild a match to observe a one-line difference.
 */
export function allWildEffects(
  card: Card,
  mode: AllWildColorMode = ALL_WILD_COLOR_MODE,
): Resolution[] {
  const color = colorStep(card, mode);

  switch (card.kind) {
    case 'WILD':
      return [color];

    case 'WILD_TARGET_DRAW_TWO':
      // SOURCE: "Active player targets any player index globally; target draws 2."
      // The target choice stays: that one genuinely changes the outcome.
      return [color, { type: 'REQUEST_TARGET_CHOICE' }, { type: 'DRAW', target: 'CHOSEN', count: 2 }];

    case 'WILD_SKIP':
      return [color, { type: 'SKIP', count: 1 }];

    case 'WILD_REVERSE':
      return [color, { type: 'REVERSE' }];

    case 'WILD_DOUBLE_SKIP':
      // SOURCE: "+3" — 1 normal advance plus 2 skipped seats.
      return [color, { type: 'SKIP', count: 2 }];

    case 'WILD_DRAW_FOUR':
      return [color, { type: 'DRAW', target: 'NEXT', count: 4 }, { type: 'SKIP', count: 1 }];

    default:
      return [color];
  }
}
