import type { CardKind } from '@colorclash/shared';

/** Localization keys / display strings for card kinds and events. */
export const CARD_LABEL: Record<CardKind, string> = {
  NUMBER: 'Number',
  SKIP: 'Skip',
  REVERSE: 'Reverse',
  DRAW_TWO: 'Draw Two',
  WILD: 'Wild',
  WILD_DRAW_FOUR: 'Wild Draw Four',
  FLIP: 'Flip',
  DRAW_ONE: 'Draw One',
  WILD_DRAW_TWO: 'Wild Draw Two',
  DRAW_FIVE: 'Draw Five',
  SKIP_EVERYONE: 'Skip Everyone',
  WILD_DRAW_COLOR: 'Wild Draw Color',
  DRAW_FOUR: 'Draw Four',
  DISCARD_ALL: 'Discard All',
  WILD_DRAW_SIX: 'Wild Draw Six',
  WILD_DRAW_TEN: 'Wild Draw Ten',
  WILD_REVERSE_SKIP: 'Wild Reverse Skip',
  WILD_TARGET_DRAW_TWO: 'Wild Target Draw Two',
  WILD_SKIP: 'Wild Skip',
  WILD_REVERSE: 'Wild Reverse',
  WILD_DOUBLE_SKIP: 'Wild Double Skip',
};

/** Short glyph shown on the card face. Rendered as text, never as bitmap art. */
export const CARD_GLYPH: Record<CardKind, string> = {
  NUMBER: '',
  SKIP: '⊘',
  REVERSE: '⇄',
  DRAW_TWO: '+2',
  WILD: '★',
  WILD_DRAW_FOUR: '+4',
  FLIP: '⇵',
  DRAW_ONE: '+1',
  WILD_DRAW_TWO: '+2',
  DRAW_FIVE: '+5',
  SKIP_EVERYONE: '⊘⊘',
  WILD_DRAW_COLOR: '+?',
  DRAW_FOUR: '+4',
  DISCARD_ALL: '⇩',
  WILD_DRAW_SIX: '+6',
  WILD_DRAW_TEN: '+10',
  WILD_REVERSE_SKIP: '⇄⊘',
  WILD_TARGET_DRAW_TWO: '+2',
  WILD_SKIP: '⊘',
  WILD_REVERSE: '⇄',
  WILD_DOUBLE_SKIP: '⊘⊘',
};

/** Player-facing reason strings for illegal plays (§9.2). */
export const ILLEGAL_REASON: Record<string, string> = {
  NOT_YOUR_TURN: 'Wait for your turn.',
  NOT_YOUR_CARD: "That card isn't in your hand.",
  MUST_ANSWER_PENALTY: 'Play a matching or higher draw card, or take the stack.',
  NO_MATCH: 'Match color, number, or wild.',
  CHOICE_PENDING: 'Finish the current choice first.',
  FLEX_UNAVAILABLE: 'Flex power already used.',
  ELIMINATED: 'You are out of this round.',
};

export const EVENT_CAPTION: Record<string, string> = {
  CARD_PLAYED: 'played a card',
  CARD_DRAWN: 'drew cards',
  CLASH_CALLED: 'called CLASH',
  CLASH_PENALTY: 'missed CLASH and drew a penalty',
  FLIP_TRIGGERED: 'flipped the deck',
  PLAYER_ELIMINATED: 'was eliminated',
  HANDS_ROTATED: 'rotated all hands',
  HANDS_SWAPPED: 'swapped hands',
  DISCARD_ALL: 'discarded a whole color',
};
