import { createRng } from '@colorclash/shared';
import {
  ALL_WILD_DECK,
  ALL_WILD_TOTAL,
  CLASSIC_DECK,
  FLIP_DECK,
  MAYHEM_DECK,
  MAYHEM_SOURCE_PINNED,
  FLEX_DECK,
} from '@colorclash/game-content';
import { countKind, getManifest } from '@colorclash/game-engine';
import { describe, expect, it } from '@colorclash/test-fixtures';
import type { CardKind } from '@colorclash/shared';

const rng = () => createRng('deck');

describe('deck composition — Launch Checklist "validate each deck count against manifest"', () => {
  it('CLASSIC generates exactly 108 cards', () => {
    const deck = getManifest('CLASSIC').createDeck(rng());
    expect(deck).toHaveLength(108);
  });

  it('CLASSIC splits 76 numbered / 24 action / 8 wild (SOURCE Table 3)', () => {
    const deck = getManifest('CLASSIC').createDeck(rng());
    const numbered = deck.filter((c) => c.kind === 'NUMBER').length;
    const wild = deck.filter((c) => c.kind.startsWith('WILD')).length;
    expect(numbered).toBe(76);
    expect(wild).toBe(8);
    expect(deck.length - numbered - wild).toBe(24);
  });

  it('CLASSIC has one 0 and two of each 1-9 per colour', () => {
    const deck = getManifest('CLASSIC').createDeck(rng());
    for (const color of ['RED', 'YELLOW', 'GREEN', 'BLUE']) {
      const zeros = deck.filter((c) => c.primaryColor === color && c.value === 0);
      expect(zeros).toHaveLength(1);
      for (let v = 1; v <= 9; v++) {
        const n = deck.filter((c) => c.primaryColor === color && c.value === v);
        expect(n).toHaveLength(2);
      }
    }
  });

  it('CLASSIC has two Skips, Reverses and Draw Twos per colour', () => {
    const deck = getManifest('CLASSIC').createDeck(rng());
    for (const color of ['RED', 'YELLOW', 'GREEN', 'BLUE']) {
      for (const kind of ['SKIP', 'REVERSE', 'DRAW_TWO'] as CardKind[]) {
        const n = deck.filter((c) => c.primaryColor === color && c.kind === kind);
        expect(n).toHaveLength(2);
      }
    }
  });

  it('FLIP generates 112 cards and every card carries both sides', () => {
    const deck = getManifest('FLIP').createDeck(rng());
    expect(deck).toHaveLength(112);
    expect(deck.every((c) => c.sides !== undefined)).toBe(true);
  });

  it('FLIP matches the source light-side action counts exactly', () => {
    const deck = getManifest('FLIP').createDeck(rng());
    // SOURCE §2.3: 8 Skips, 8 Reverses, 8 Draw Ones, 8 Flips, 4 Wilds, 4 Wild Draw Twos
    expect(deck.filter((c) => c.sides!.light.kind === 'SKIP')).toHaveLength(8);
    expect(deck.filter((c) => c.sides!.light.kind === 'REVERSE')).toHaveLength(8);
    expect(deck.filter((c) => c.sides!.light.kind === 'DRAW_ONE')).toHaveLength(8);
    expect(deck.filter((c) => c.sides!.light.kind === 'FLIP')).toHaveLength(8);
    expect(deck.filter((c) => c.sides!.light.kind === 'WILD')).toHaveLength(4);
    expect(deck.filter((c) => c.sides!.light.kind === 'WILD_DRAW_TWO')).toHaveLength(4);
  });

  it('FLIP matches the source dark-side action counts exactly', () => {
    const deck = getManifest('FLIP').createDeck(rng());
    // SOURCE §2.3: 8 Skips, 8 Reverses, 8 Draw Fives, 8 Flips, 4 Wilds,
    // 4 Wild Draw Everyones (the source's rule row names it "Wild Draw Color").
    expect(deck.filter((c) => c.sides!.dark.kind === 'SKIP_EVERYONE')).toHaveLength(8);
    expect(deck.filter((c) => c.sides!.dark.kind === 'REVERSE')).toHaveLength(8);
    expect(deck.filter((c) => c.sides!.dark.kind === 'DRAW_FIVE')).toHaveLength(8);
    expect(deck.filter((c) => c.sides!.dark.kind === 'FLIP')).toHaveLength(8);
    expect(deck.filter((c) => c.sides!.dark.kind === 'WILD')).toHaveLength(4);
    expect(deck.filter((c) => c.sides!.dark.kind === 'WILD_DRAW_COLOR')).toHaveLength(4);
  });

  it('FLIP light colours are the source-defined Pink/Teal/Purple/Orange', () => {
    const deck = getManifest('FLIP').createDeck(rng());
    const colors = new Set(
      deck.map((c) => c.sides!.light.color).filter((c): c is string => Boolean(c)),
    );
    expect([...colors].sort()).toEqual(['ORANGE', 'PINK', 'PURPLE', 'TEAL']);
  });

  it('MAYHEM generates exactly 168 cards (SOURCE Table 5)', () => {
    const deck = getManifest('MAYHEM').createDeck(rng());
    expect(deck).toHaveLength(168);
  });

  it('MAYHEM honours every count the source pins verbatim', () => {
    // SOURCE additions: 8 Draw Four, 8 Discard All, 4 Wild Draw Six,
    // 4 Wild Draw Ten, 4 Wild Reverse Skip. RF-002 may change the *unstated*
    // slots but must never change these.
    const deck = getManifest('MAYHEM').createDeck(rng());
    for (const [kind, expected] of Object.entries(MAYHEM_SOURCE_PINNED)) {
      expect(countKind(deck, kind as CardKind)).toBe(expected!);
    }
  });

  it('ALL_WILD generates exactly the source composition (SOURCE Table 6)', () => {
    const deck = getManifest('ALL_WILD').createDeck(rng());
    expect(deck).toHaveLength(ALL_WILD_TOTAL);
    expect(countKind(deck, 'WILD')).toBe(48);
    expect(countKind(deck, 'WILD_TARGET_DRAW_TWO')).toBe(24);
    expect(countKind(deck, 'WILD_SKIP')).toBe(16);
    expect(countKind(deck, 'WILD_REVERSE')).toBe(12);
    expect(countKind(deck, 'WILD_DOUBLE_SKIP')).toBe(8);
    expect(countKind(deck, 'WILD_DRAW_FOUR')).toBe(4);
  });

  it('ALL_WILD contains no numbered or colour-matched cards (SOURCE)', () => {
    const deck = getManifest('ALL_WILD').createDeck(rng());
    expect(deck.some((c) => c.kind === 'NUMBER')).toBe(false);
    expect(deck.some((c) => c.primaryColor !== undefined)).toBe(false);
  });

  it('FLEX generates its declared deck and every coloured card has a flex matrix', () => {
    const deck = getManifest('FLEX').createDeck(rng());
    expect(deck).toHaveLength(FLEX_DECK.expectedTotal);
    const colored = deck.filter((c) => c.primaryColor);
    expect(colored.every((c) => c.flex !== undefined)).toBe(true);
    expect(colored.every((c) => c.flex!.secondaryColor !== c.primaryColor)).toBe(true);
  });

  it('every deck has unique card ids', () => {
    for (const v of ['CLASSIC', 'FLIP', 'MAYHEM', 'ALL_WILD', 'FLEX'] as const) {
      const deck = getManifest(v).createDeck(rng());
      expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length);
    }
  });

  it('declared expectedTotal matches generated size for every composition', () => {
    expect(getManifest('CLASSIC').createDeck(rng()).length).toBe(CLASSIC_DECK.expectedTotal);
    expect(getManifest('FLIP').createDeck(rng()).length).toBe(FLIP_DECK.expectedTotal);
    expect(getManifest('MAYHEM').createDeck(rng()).length).toBe(MAYHEM_DECK.expectedTotal);
    expect(Object.values(ALL_WILD_DECK).reduce((a, b) => a + (b ?? 0), 0)).toBe(ALL_WILD_TOTAL);
  });
});
