import type { Card, CardKind, Color } from '@colorclash/shared';
import type { DeckComposition } from '@colorclash/game-content';

/**
 * Deterministic deck generation from a composition table.
 *
 * Card ids are stable and human-readable (`R7#0`, `WILD#3`) so test fixtures
 * and failure messages stay legible, and so a snapshot diff points at a real
 * card rather than a random uuid.
 */

let makeId = (parts: (string | number | undefined)[]): string =>
  parts.filter((p) => p !== undefined && p !== '').join('#');

export function colorCode(color: Color): string {
  const map: Record<string, string> = {
    RED: 'R',
    YELLOW: 'Y',
    GREEN: 'G',
    BLUE: 'B',
    PINK: 'P',
    TEAL: 'T',
    PURPLE: 'U',
    ORANGE: 'O',
  };
  return map[color] ?? color.slice(0, 2);
}

export function kindCode(kind: CardKind, value?: number): string {
  if (kind === 'NUMBER') return String(value ?? 0);
  const map: Partial<Record<CardKind, string>> = {
    SKIP: 'SK',
    REVERSE: 'RV',
    DRAW_TWO: 'D2',
    DRAW_ONE: 'D1',
    DRAW_FOUR: 'D4',
    DRAW_FIVE: 'D5',
    FLIP: 'FL',
    DISCARD_ALL: 'DA',
    SKIP_EVERYONE: 'SE',
    WILD: 'W',
    WILD_DRAW_FOUR: 'WD4',
    WILD_DRAW_TWO: 'WD2',
    WILD_DRAW_SIX: 'WD6',
    WILD_DRAW_TEN: 'WD10',
    WILD_DRAW_COLOR: 'WDC',
    WILD_REVERSE_SKIP: 'WRS',
    WILD_TARGET_DRAW_TWO: 'WTD2',
    WILD_SKIP: 'WSK',
    WILD_REVERSE: 'WRV',
    WILD_DOUBLE_SKIP: 'WDS',
  };
  return map[kind] ?? kind;
}

/**
 * Build a standard coloured deck from a composition table.
 * `decorate` lets a version attach extra per-card data (Flip sides, Flex matrix)
 * without duplicating the generation loop.
 */
export function buildDeck(
  comp: DeckComposition,
  colors: Color[],
  decorate?: (card: Card, index: number) => Card,
): Card[] {
  const out: Card[] = [];
  const push = (c: Card) => {
    out.push(decorate ? decorate(c, out.length) : c);
  };

  for (const color of colors) {
    // Numbers
    for (let copy = 0; copy < comp.numbers.zero; copy++) {
      push({
        id: makeId([colorCode(color) + '0', copy]),
        kind: 'NUMBER',
        primaryColor: color,
        value: 0,
      });
    }
    for (let v = 1; v <= 9; v++) {
      for (let copy = 0; copy < comp.numbers.oneToNine; copy++) {
        push({
          id: makeId([colorCode(color) + String(v), copy]),
          kind: 'NUMBER',
          primaryColor: color,
          value: v,
        });
      }
    }
    // Coloured actions
    for (const [kind, count] of Object.entries(comp.coloredActions)) {
      for (let copy = 0; copy < (count ?? 0); copy++) {
        push({
          id: makeId([colorCode(color) + kindCode(kind as CardKind), copy]),
          kind: kind as CardKind,
          primaryColor: color,
        });
      }
    }
  }

  // Colourless wilds
  for (const [kind, count] of Object.entries(comp.wilds)) {
    for (let copy = 0; copy < (count ?? 0); copy++) {
      push({
        id: makeId([kindCode(kind as CardKind), copy]),
        kind: kind as CardKind,
      });
    }
  }

  return out;
}

/**
 * Every deck generator runs through this. A composition whose generated size
 * disagrees with its declared `expectedTotal` is a build-time failure, not a
 * subtle in-game bug (Launch Checklist: "Validate each deck count against
 * manifest").
 */
export function assertDeckSize(cards: Card[], expected: number, version: string): Card[] {
  if (cards.length !== expected) {
    throw new Error(
      `[${version}] deck size mismatch: generated ${cards.length}, manifest declares ${expected}`,
    );
  }
  const ids = new Set(cards.map((c) => c.id));
  if (ids.size !== cards.length) {
    throw new Error(`[${version}] duplicate card ids in generated deck`);
  }
  return cards;
}

export function countKind(cards: Card[], kind: CardKind): number {
  return cards.filter((c) => c.kind === kind).length;
}
