import type {
  Card,
  CardId,
  Command,
  GameState,
  GameVersion,
  MatchConfig,
  PlayerId,
  RngLike,
} from '@colorclash/shared';
import { createRng } from '@colorclash/shared';
import { createMatch, freezeCards, getManifest, reduce } from '@colorclash/game-engine';

export * from './harness.js';

/**
 * Deterministic fixtures — §16.3.
 *
 * `buildFixture` constructs an exact board position without shuffling, so a
 * test asserts one rule rather than fighting the RNG. Every card referenced
 * must exist in the version's real deck, which keeps fixtures honest: a typo'd
 * card id fails loudly instead of silently inventing a card.
 */

export type Fixture = {
  version: GameVersion;
  players: Array<{ id: PlayerId; hand: CardId[]; name?: string; eliminated?: boolean }>;
  discardPile: CardId[];
  drawPile: CardId[];
  activePlayerIndex?: number;
  direction?: 1 | -1;
  activeColor?: string;
  deckSide?: 'LIGHT_SIDE' | 'DARK_SIDE';
  pendingDraw?: number;
  minimumResponsePenalty?: number;
  flexPowerAvailable?: boolean;
  config?: Partial<MatchConfig>;
};

export function buildFixture(fixture: Fixture): GameState {
  const manifest = getManifest(fixture.version);
  const deck = manifest.createDeck(createRng('fixture'));
  const byId = new Map<CardId, Card>(deck.map((c) => [c.id, c]));

  const used = new Set<CardId>();
  const check = (id: CardId, zone: string): CardId => {
    if (!byId.has(id)) {
      throw new Error(`Fixture references unknown card "${id}" in ${zone} for ${fixture.version}`);
    }
    if (used.has(id)) {
      throw new Error(`Fixture uses card "${id}" twice (second time in ${zone})`);
    }
    used.add(id);
    return id;
  };

  const players = fixture.players.map((p, i) => ({
    id: p.id,
    name: p.name ?? p.id,
    isBot: false,
    hand: p.hand.map((id) => check(id, `hand:${p.id}`)),
    eliminated: p.eliminated ?? false,
    connected: true,
    score: 0,
  }));

  const discardPile = fixture.discardPile.map((id) => check(id, 'discardPile'));
  const drawPile = fixture.drawPile.map((id) => check(id, 'drawPile'));

  // Every card not named by the fixture sits at the bottom of the draw pile, so
  // card-conservation invariants hold exactly as in a real match.
  const rest = deck.filter((c) => !used.has(c.id)).map((c) => c.id);

  const topId = discardPile[discardPile.length - 1];
  const top = topId ? byId.get(topId)! : undefined;
  const side = fixture.deckSide ?? (fixture.version === 'FLIP' ? 'LIGHT_SIDE' : undefined);
  const topFace = top?.sides
    ? side === 'DARK_SIDE'
      ? top.sides.dark
      : top.sides.light
    : top
      ? { color: top.primaryColor }
      : undefined;

  const pending = fixture.pendingDraw ?? 0;

  return {
    gameId: 'fixture',
    version: fixture.version,
    players,
    // Cards are popped from the end, so reversing makes fixture.drawPile[0]
    // the next card drawn — the order a reader expects.
    drawPile: [...rest, ...[...drawPile].reverse()],
    discardPile,
    activePlayerIndex: fixture.activePlayerIndex ?? 0,
    direction: fixture.direction ?? 1,
    activeColor: fixture.activeColor ?? topFace?.color,
    deckSide: side,
    pendingDraw: pending,
    penalty: {
      pendingDraw: pending,
      minimumResponsePenalty: fixture.minimumResponsePenalty ?? 0,
    },
    awaitingChoice: undefined,
    flexPowerAvailable:
      fixture.flexPowerAvailable ?? (fixture.version === 'FLEX' ? true : undefined),
    roundNumber: 1,
    status: 'PLAYING',
    cards: freezeCards(deck),
    clashPending: null,
    clashCalled: [],
    mayPass: false,
    drawnThisTurn: [],
    seq: 0,
    config: {
      winCondition: 'ONE_ROUND',
      drawRule: 'DRAW_ONE',
      stacking: fixture.version === 'MAYHEM',
      challengeWildDrawFour: false,
      clashPenaltyCards: 2,
      eliminationThreshold: 25,
      clashGraceMs: 0,
      scoringMode: 'STANDARD',
      tableTheme: 'ocean',
      ...fixture.config,
    },
    seed: 'fixture',
    stats: {
      cardsPlayed: 0,
      actionCardsPlayed: 0,
      clashCalls: 0,
      penaltiesDrawn: 0,
      startedAt: 0,
    },
  };
}

/** Apply a sequence of commands, returning the final state. */
export function play(
  state: GameState,
  commands: Array<Omit<Command, 'commandId'>>,
  rng: RngLike = createRng('test'),
): GameState {
  let current = state;
  commands.forEach((c, i) => {
    current = reduce(current, { ...c, commandId: `t${i}` } as Command, rng).state;
  });
  return current;
}

export function cmd<T extends Command['type']>(
  type: T,
  playerId: PlayerId,
  extra: Record<string, unknown> = {},
): Command {
  return { type, playerId, commandId: `c${Math.random().toString(36).slice(2)}`, ...extra } as Command;
}

/** A fully shuffled, seeded match — used for smoke and property tests. */
export function seededMatch(
  version: GameVersion,
  playerCount = 4,
  seed = 'seed-1',
  config?: Partial<MatchConfig>,
) {
  const rng = createRng(seed);
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `P${i + 1}`,
    name: `P${i + 1}`,
    isBot: true,
    botTier: 'NORMAL' as const,
  }));
  return { ...createMatch({ gameId: 'g', version, seed, players, config }, rng), rng };
}

export function handOf(state: GameState, id: PlayerId): CardId[] {
  return state.players.find((p) => p.id === id)!.hand;
}

export function activeId(state: GameState): PlayerId {
  return state.players[state.activePlayerIndex]!.id;
}
