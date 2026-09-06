import {
  RuleError,
  shuffle,
  type GameEvent,
  type GameState,
  type GameVersion,
  type MatchConfig,
  type PlayerState,
  type RngLike,
} from '@colorclash/shared';
import { configFor } from '@colorclash/game-content';
import { freezeCards, face, topCard } from './state.js';
import { getManifest } from './registry.js';
import { applyResolutions } from './resolve.js';
import { advanceTurn } from './turn.js';
import { ruleContext } from './legal.js';
import { assertInvariants } from './invariants.js';

export type CreateMatchInput = {
  gameId: string;
  version: GameVersion;
  seed: string;
  players: Array<Pick<PlayerState, 'id' | 'name' | 'isBot'> & Partial<PlayerState>>;
  config?: Partial<MatchConfig>;
};

/**
 * §7.1 Setup Algorithm, in the stated order:
 *  1. Load VersionManifest and generate cards
 *  2. Shuffle with Fisher-Yates using injectable RNG
 *  3. Deal exactly 7 cards to every player
 *  4. Create discard pile from draw pile top
 *  5. Resolve any required opening-card action through the ruleset hook
 *  6. Set active player and direction
 */
export function createMatch(
  input: CreateMatchInput,
  rng: RngLike,
): { state: GameState; events: GameEvent[] } {
  const manifest = getManifest(input.version);
  const config = configFor(input.version, input.config);
  const events: GameEvent[] = [];

  const count = input.players.length;
  if (count < manifest.playerLimit.min || count > manifest.playerLimit.max) {
    throw new RuleError(
      'PLAYER_COUNT',
      `${input.version} supports ${manifest.playerLimit.min}-${manifest.playerLimit.max} players, got ${count}`,
    );
  }

  // 1 + 2
  const deck = manifest.createDeck(rng);
  const cards = freezeCards(deck);
  const drawPile = shuffle(
    deck.map((c) => c.id),
    rng,
  );

  const players: PlayerState[] = input.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    botTier: p.botTier,
    hand: [],
    eliminated: false,
    connected: p.connected ?? true,
    score: p.score ?? 0,
    avatar: p.avatar,
  }));

  const state: GameState = {
    gameId: input.gameId,
    version: input.version,
    players,
    drawPile,
    discardPile: [],
    activePlayerIndex: 0,
    direction: 1,
    activeColor: undefined,
    deckSide: undefined,
    pendingDraw: 0,
    penalty: { pendingDraw: 0, minimumResponsePenalty: 0 },
    awaitingChoice: undefined,
    flexPowerAvailable: undefined,
    roundNumber: 1,
    status: 'SETUP',
    cards,
    clashPending: null,
    clashCalled: [],
    mayPass: false,
    drawnThisTurn: [],
    seq: 0,
    config,
    seed: input.seed,
    stats: {
      cardsPlayed: 0,
      actionCardsPlayed: 0,
      clashCalls: 0,
      penaltiesDrawn: 0,
      startedAt: 0,
    },
  };

  // Version-specific starting state (deck side, flex token, ...).
  Object.assign(state, manifest.getStartingState({ players, config, rng }));

  // 3 — deal exactly 7 to every player
  for (let round = 0; round < 7; round++) {
    for (const p of state.players) {
      const id = state.drawPile.pop();
      if (!id) throw new RuleError('DRAW_PILE_EMPTY', 'Deck too small to deal 7 cards');
      p.hand.push(id);
    }
  }
  for (const p of state.players) {
    events.push({ type: 'CARD_DEALT', playerId: p.id, count: 7 });
  }

  // 4 — top of draw pile becomes the discard
  const openingId = state.drawPile.pop();
  if (!openingId) throw new RuleError('DRAW_PILE_EMPTY');
  state.discardPile.push(openingId);

  const opening = state.cards[openingId]!;
  const openingFace = face(state, opening);
  state.activeColor = openingFace.color;

  // 6 — active player and direction, established before the opening hook so the
  // hook can move them.
  state.status = 'PLAYING';
  state.stats.startedAt = Date.now();
  events.push({
    type: 'GAME_STARTED',
    gameId: state.gameId,
    version: state.version,
    players: state.players.map((p) => p.id),
  });

  // 5 — opening action, isolated in the ruleset hook (§8.2) rather than hidden
  // in setup. The virtual "dealer" seat is the one before player 0, so a
  // Draw Two on the opening discard lands on player 0 exactly as at a table.
  if (manifest.resolveOpeningDiscard) {
    const n = state.players.length;
    state.activePlayerIndex = (n - 1) % n;
    const actorId = state.players[0]!.id;
    const resolutions = manifest.resolveOpeningDiscard({
      ...ruleContext(state, actorId),
      openingCard: opening,
    });
    const result = applyResolutions(state, actorId, resolutions, rng, events);
    if (!result.halted) {
      advanceTurn(state, result.advance, events);
    }
  }

  // A wild opener with no declared colour must be resolved before play; the
  // hook above will have raised a colour choice in that case.
  if (!state.activeColor && !state.awaitingChoice) {
    const top = topCard(state);
    state.activeColor = top ? face(state, top).color : undefined;
  }

  assertInvariants(state);
  return { state, events };
}
