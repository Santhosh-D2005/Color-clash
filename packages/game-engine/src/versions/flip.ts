import type {
  Card,
  CardKind,
  CardSideData,
  Color,
  OpeningContext,
  Resolution,
  ResolveContext,
  RuleContext,
  VersionManifest,
} from '@colorclash/shared';
import {
  FLIP_DARK_SKIP_IS_SKIP_EVERYONE,
  FLIP_DECK,
  FLIP_LIGHT_COLORS,
  FLIP_SIDE_PAIRS,
  flipColorsFor,
  RULE_PLAYER_LIMIT,
} from '@colorclash/game-content';
import { assertDeckSize, colorCode, kindCode } from '../deck.js';
import { standardIsPlayable } from '../legal.js';

/**
 * FLIP — §2.3 and Appendix A Table 4.
 *
 *   Dual deck state  DeckSide enum: LIGHT_SIDE or DARK_SIDE; card structs hold both sides
 *   Flip trigger     Playing a Flip toggles DeckSide and immediately changes rules/visuals
 *   Light actions    8 Skips, 8 Reverses, 8 Draw Ones, 8 Flips, 4 Wilds, 4 Wild Draw Twos
 *   Light Draw One   Target draws 1 and loses action
 *   Light Wild D2    Change active color, target draws 2, target turn skipped
 *   Dark actions     8 Skips, 8 Reverses, 8 Draw Fives, 8 Flips, 4 Wilds, 4 Wild Draw Everyones
 *   Dark Draw Five   Target draws 5 and loses action
 *   Dark Skip Everyone  Clear turn queue; play control returns instantly to card player
 *   Dark Wild Draw Color  Active player chooses a color; target draws continuously until they match it
 *
 * §8.3: "Every physical card has light-side and dark-side data", "Light and
 * dark action matrices are separate rule tables", "Skip Everyone is represented
 * as a turn-resolution strategy, not a hard-coded UI animation".
 */

/**
 * RF-010: the source does not state which dark colour is printed on the back of
 * which light card, nor whether the dark number differs. Defaults below are the
 * minimal non-inventing choice: same colour family, same number. Both are
 * switchable and covered by tests.
 */
export const FLIP_SIDE_PAIRING: 'IDENTITY' | 'ROTATED' = 'IDENTITY';
export const FLIP_DARK_NUMBERS: 'MIRROR' | 'SHIFTED' = 'MIRROR';

function darkColorFor(light: Color): Color {
  if (FLIP_SIDE_PAIRING === 'IDENTITY') return FLIP_SIDE_PAIRS[light]!;
  const idx = FLIP_LIGHT_COLORS.indexOf(light);
  const rotated = FLIP_LIGHT_COLORS[(idx + 1) % FLIP_LIGHT_COLORS.length]!;
  return FLIP_SIDE_PAIRS[rotated]!;
}

function darkValueFor(light: number): number {
  if (FLIP_DARK_NUMBERS === 'MIRROR') return light;
  return ((light + 3) % 9) + 1;
}

function darkKindFor(lightKind: CardKind): CardKind {
  switch (lightKind) {
    case 'NUMBER':
      return 'NUMBER';
    case 'SKIP':
      // RF-005 — the source's dark rule row defines "Dark Skip Everyone".
      return FLIP_DARK_SKIP_IS_SKIP_EVERYONE ? 'SKIP_EVERYONE' : 'SKIP';
    case 'REVERSE':
      return 'REVERSE';
    case 'DRAW_ONE':
      return 'DRAW_FIVE'; // SOURCE: 8 Draw Ones (light) / 8 Draw Fives (dark)
    case 'FLIP':
      return 'FLIP';
    case 'WILD':
      return 'WILD';
    case 'WILD_DRAW_TWO':
      // §2.3 note: keep the source label "Wild Draw Color" internally.
      return 'WILD_DRAW_COLOR';
    default:
      return lightKind;
  }
}

function makeFlipCard(
  id: string,
  lightKind: CardKind,
  lightColor?: Color,
  lightValue?: number,
): Card {
  const light: CardSideData = {
    kind: lightKind,
    color: lightColor,
    value: lightValue,
  };
  const dark: CardSideData = {
    kind: darkKindFor(lightKind),
    color: lightColor ? darkColorFor(lightColor) : undefined,
    value: lightValue !== undefined ? darkValueFor(lightValue) : undefined,
  };
  return {
    id,
    kind: lightKind,
    primaryColor: lightColor,
    value: lightValue,
    sides: { light, dark },
  };
}

export const flipManifest: VersionManifest = {
  id: 'FLIP',
  displayName: 'Flipstorm',
  tagline: 'One card turns the whole table',
  // The rule limit, not the seat limit: the engine is tested across the
  // whole source range, while a table in the client seats fewer. Both live
  // in game-content/limits.ts.
  playerLimit: RULE_PLAYER_LIMIT,

  colors: (state) => flipColorsFor(state?.deckSide ?? 'LIGHT_SIDE'),

  createDeck(): Card[] {
    const cards: Card[] = [];
    for (const color of FLIP_LIGHT_COLORS) {
      for (let v = 1; v <= 9; v++) {
        for (let copy = 0; copy < FLIP_DECK.numbers.oneToNine; copy++) {
          cards.push(makeFlipCard(`${colorCode(color)}${v}#${copy}`, 'NUMBER', color, v));
        }
      }
      for (const [kind, count] of Object.entries(FLIP_DECK.coloredActions)) {
        for (let copy = 0; copy < (count ?? 0); copy++) {
          cards.push(
            makeFlipCard(
              `${colorCode(color)}${kindCode(kind as CardKind)}#${copy}`,
              kind as CardKind,
              color,
            ),
          );
        }
      }
    }
    for (const [kind, count] of Object.entries(FLIP_DECK.wilds)) {
      for (let copy = 0; copy < (count ?? 0); copy++) {
        cards.push(
          makeFlipCard(`${kindCode(kind as CardKind)}#${copy}`, kind as CardKind),
        );
      }
    }
    return assertDeckSize(cards, FLIP_DECK.expectedTotal, 'FLIP');
  },

  getStartingState() {
    return { deckSide: 'LIGHT_SIDE' as const };
  },

  isPlayable(ctx: RuleContext, card: Card): boolean {
    return standardIsPlayable(ctx, card);
  },

  isActionCard(card: Card): boolean {
    return card.kind !== 'NUMBER';
  },

  resolveCard(ctx: ResolveContext, card: Card): Resolution[] {
    // Always read the face that is currently in play, never card.kind.
    const f = ctx.face(card);
    return effectsFor(f.kind);
  },

  resolveOpeningDiscard(ctx: OpeningContext): Resolution[] {
    const f = ctx.face(ctx.openingCard);
    // An opening Flip would toggle the side before anyone has played; the
    // source's setup rule says to execute the action, so we do.
    return effectsFor(f.kind);
  },
};

function effectsFor(kind: CardKind): Resolution[] {
  switch (kind) {
    case 'NUMBER':
      return [];

    case 'SKIP':
      return [{ type: 'SKIP', count: 1 }];

    case 'SKIP_EVERYONE':
      // SOURCE: "Clear turn queue; play control returns instantly to card player."
      return [{ type: 'SKIP_EVERYONE' }];

    case 'REVERSE':
      return [{ type: 'REVERSE' }];

    case 'DRAW_ONE':
      // SOURCE: "Target draws 1 and loses action."
      return [
        { type: 'DRAW', target: 'NEXT', count: 1 },
        { type: 'SKIP', count: 1 },
      ];

    case 'DRAW_FIVE':
      // SOURCE: "Target draws 5 and loses action."
      return [
        { type: 'DRAW', target: 'NEXT', count: 5 },
        { type: 'SKIP', count: 1 },
      ];

    case 'FLIP':
      // §8.3 — one atomic event chain: side, colour context, visuals.
      return [{ type: 'FLIP_DECK' }];

    case 'WILD':
      return [{ type: 'REQUEST_COLOR_CHOICE' }];

    case 'WILD_DRAW_TWO':
      // SOURCE: "Change active color, target draws 2, target turn skipped."
      return [
        { type: 'REQUEST_COLOR_CHOICE' },
        { type: 'DRAW', target: 'NEXT', count: 2 },
        { type: 'SKIP', count: 1 },
      ];

    case 'WILD_DRAW_COLOR':
      // SOURCE: "Active player chooses a color; target draws continuously until
      // they match it." The source states no skip, so the target keeps its turn.
      return [
        { type: 'REQUEST_DRAW_COLOR_CHOICE' },
        { type: 'DRAW_UNTIL_COLOR', target: 'NEXT' },
      ];

    default:
      return [];
  }
}
