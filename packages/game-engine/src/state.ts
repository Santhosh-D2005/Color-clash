import {
  RuleError,
  type Card,
  type CardId,
  type CardSideData,
  type GameState,
  type MatchStats,
  type PlayerId,
  type PlayerState,
} from '@colorclash/shared';

/** Structured deep clone of match state. Cards are immutable so shared by ref. */
export function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: [...p.hand] })),
    drawPile: [...state.drawPile],
    discardPile: [...state.discardPile],
    penalty: { ...state.penalty },
    clashCalled: [...state.clashCalled],
    stats: { ...state.stats },
    config: { ...state.config },
    awaitingChoice: state.awaitingChoice
      ? {
          ...state.awaitingChoice,
          eligibleTargets: state.awaitingChoice.eligibleTargets
            ? [...state.awaitingChoice.eligibleTargets]
            : undefined,
          eligibleColors: state.awaitingChoice.eligibleColors
            ? [...state.awaitingChoice.eligibleColors]
            : undefined,
          continuation: state.awaitingChoice.continuation
            ? [...state.awaitingChoice.continuation]
            : undefined,
        }
      : undefined,
    // `cards` is a frozen lookup table; never mutated after setup.
    cards: state.cards,
  };
}

export function player(state: GameState, id: PlayerId): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new RuleError('UNKNOWN_PLAYER', `No player ${id}`);
  return p;
}

export function playerIndex(state: GameState, id: PlayerId): number {
  const i = state.players.findIndex((x) => x.id === id);
  if (i < 0) throw new RuleError('UNKNOWN_PLAYER', `No player ${id}`);
  return i;
}

export function activePlayer(state: GameState): PlayerState {
  const p = state.players[state.activePlayerIndex];
  if (!p) throw new RuleError('NO_ACTIVE_PLAYER');
  return p;
}

export function isPlayersTurn(state: GameState, id: PlayerId): boolean {
  return state.players[state.activePlayerIndex]?.id === id;
}

export function ownsCard(state: GameState, id: PlayerId, cardId: CardId): boolean {
  return player(state, id).hand.includes(cardId);
}

export function card(state: GameState, id: CardId): Card {
  const c = state.cards[id];
  if (!c) throw new RuleError('UNKNOWN_CARD', `No card ${id}`);
  return c;
}

export function topDiscardId(state: GameState): CardId | undefined {
  return state.discardPile[state.discardPile.length - 1];
}

export function topCard(state: GameState): Card | undefined {
  const id = topDiscardId(state);
  return id ? state.cards[id] : undefined;
}

/**
 * The face currently in play. For Flip this resolves the active deck side;
 * for every other version the card only has one face.
 */
export function face(state: GameState, c: Card): CardSideData {
  if (c.sides) {
    return state.deckSide === 'DARK_SIDE' ? c.sides.dark : c.sides.light;
  }
  return {
    kind: c.kind,
    color: c.primaryColor,
    value: typeof c.value === 'number' ? c.value : undefined,
  };
}

/** True for cards that carry no colour of their own (wilds). */
export function isWildFace(f: CardSideData): boolean {
  return f.color === undefined;
}

export function livePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => !p.eliminated);
}

export function handCount(state: GameState, id: PlayerId): number {
  return player(state, id).hand.length;
}

/**
 * The state with its wall-clock fields removed.
 *
 * `stats.startedAt` and `stats.endedAt` are the only values in a GameState that
 * two identical replays can legitimately disagree about: they record when a
 * sitting happened, not what happened in it. Comparing states for determinism —
 * in a test, in a replay check, in a bug report — means comparing this.
 */
export function statsFreeState(state: GameState): Omit<GameState, 'stats'> & {
  stats: Omit<MatchStats, 'startedAt' | 'endedAt'>;
} {
  const { startedAt: _startedAt, endedAt: _endedAt, ...stats } = state.stats;
  return { ...state, stats };
}

/** Freeze a card lookup table so no downstream code can mutate card data. */
export function freezeCards(cards: Card[]): Record<CardId, Card> {
  const table: Record<CardId, Card> = {};
  for (const c of cards) table[c.id] = Object.freeze(c);
  return Object.freeze(table);
}
