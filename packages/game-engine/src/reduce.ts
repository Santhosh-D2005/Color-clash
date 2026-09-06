import {
  RuleError,
  type Card,
  type CardId,
  type Command,
  type GameEvent,
  type GameState,
  type PlayerId,
  type Resolution,
  type RngLike,
  type Standing,
} from '@colorclash/shared';
import { cardPoints } from '@colorclash/game-content';
import { activePlayer, card, cloneState, face, isWildFace, livePlayers, player } from './state.js';
import { getManifest } from './registry.js';
import { isPlayable, legalCardIds, ruleContext } from './legal.js';
import { applyResolutions, eligibleTargets, legalColors } from './resolve.js';
import { advanceTurn } from './turn.js';
import { assertDrawAllowed, checkElimination, drawToPlayer } from './draw.js';
import { applyClashCall, enterClashPendingIfNeeded, settleMissedClash } from './clash.js';
import { assertInvariants } from './invariants.js';

export type ReduceResult = { state: GameState; events: GameEvent[] };

/**
 * §6 Game State Machine.
 *
 *   reduce(state, command, rng) => { state, events }
 *
 * Pure: no I/O, no clocks beyond the setup timestamp, no globals. The same
 * function backs local play, the authoritative server, the bots and the tests.
 */
export function reduce(state: GameState, command: Command, rng: RngLike): ReduceResult {
  assertCommandIsAllowed(state, command);

  const next = cloneState(state);
  const events: GameEvent[] = [];

  // §7.3 — a missed CLASH call is settled by the *next* game action.
  settleMissedClash(next, command, rng, events);

  switch (command.type) {
    case 'PLAY_CARD':
      applyPlay(next, command.playerId, command.cardId, command.useFlex ?? false, rng, events);
      break;
    case 'USE_FLEX':
      applyPlay(next, command.playerId, command.cardId, true, rng, events);
      break;
    case 'DRAW_CARD':
      applyDraw(next, command.playerId, rng, events);
      break;
    case 'CALL_CLASH':
      applyClashCall(next, command.playerId, events);
      break;
    case 'CHOOSE_COLOR':
      applyChooseColor(next, command.playerId, command.color, rng, events);
      break;
    case 'CHOOSE_TARGET':
      applyChooseTarget(next, command.playerId, command.targetId, rng, events);
      break;
    case 'SWAP_HAND':
      applySwapHand(next, command.playerId, command.targetId, rng, events);
      break;
    case 'END_TURN':
      applyEndTurn(next, command.playerId, events);
      break;
    case 'CHALLENGE_WILD_DRAW_FOUR':
      applyChallenge(next, command.playerId);
      break;
    case 'START_GAME':
      throw new RuleError('ALREADY_STARTED', 'Use createMatch() to start a match');
    default: {
      const never: never = command;
      throw new RuleError('UNKNOWN_COMMAND', JSON.stringify(never));
    }
  }

  // A recorded CLASH call only stands while the player still holds exactly one
  // card. Reconciling here covers every path that changes a hand size — draws,
  // penalties, hand swaps, rotations and Discard All — so the flag can never go
  // stale (§7.3).
  next.clashCalled = next.clashCalled.filter(
    (id) => next.players.find((p) => p.id === id)?.hand.length === 1,
  );

  checkTerminalConditions(next, events);
  next.seq = state.seq + 1;
  assertInvariants(next);
  return { state: next, events };
}

/* ------------------------------------------------------------------ */
/* Guards                                                              */
/* ------------------------------------------------------------------ */

export function assertCommandIsAllowed(state: GameState, command: Command): void {
  if (state.status === 'MATCH_END') throw new RuleError('MATCH_OVER');
  if (state.status === 'ROUND_END' && command.type !== 'START_GAME') {
    throw new RuleError('ROUND_OVER');
  }

  const p = state.players.find((x) => x.id === command.playerId);
  if (!p) throw new RuleError('UNKNOWN_PLAYER');
  if (p.eliminated && command.type !== 'CALL_CLASH') throw new RuleError('ELIMINATED');

  // A pending choice blocks every command except the one that answers it and an
  // CLASH call (§9.2 "the active player cannot accidentally play another card
  // underneath").
  if (state.awaitingChoice) {
    const answers: Record<string, Command['type']> = {
      COLOR: 'CHOOSE_COLOR',
      DRAW_COLOR: 'CHOOSE_COLOR',
      TARGET: 'CHOOSE_TARGET',
      SWAP_HAND: 'SWAP_HAND',
    };
    const expected = answers[state.awaitingChoice.type];
    if (command.type === 'CALL_CLASH') return;
    if (command.type !== expected) throw new RuleError('CHOICE_PENDING');
    if (command.playerId !== state.awaitingChoice.playerId) {
      throw new RuleError('NOT_YOUR_CHOICE');
    }
  }
}

/* ------------------------------------------------------------------ */
/* PLAY_CARD                                                           */
/* ------------------------------------------------------------------ */

function applyPlay(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
  useFlex: boolean,
  rng: RngLike,
  events: GameEvent[],
): void {
  const manifest = getManifest(state.version);
  const p = player(state, playerId);

  if (!isPlayable(state, cardId, playerId)) {
    throw new RuleError(illegalReason(state, cardId, playerId));
  }
  if (useFlex && !state.flexPowerAvailable) {
    throw new RuleError('FLEX_UNAVAILABLE');
  }

  const c = card(state, cardId);
  const before = p.hand.length;

  // The ruleset decides the card's effects against the board as it stood when
  // the card was played — before the card moves and before the active colour
  // changes. Evaluating afterwards would let a card "see" itself on the discard
  // pile and read its own colour as already active.
  const ctx = { ...ruleContext(state, playerId), useFlex };
  const resolutions = manifest.resolveCard(ctx, c);

  // Move the card: hand -> discard, in one transaction (§6.1 zone invariant).
  p.hand = p.hand.filter((id) => id !== cardId);
  state.discardPile.push(cardId);

  const f = face(state, c);
  if (!isWildFace(f) && f.color) state.activeColor = f.color;

  state.stats.cardsPlayed++;
  if (manifest.isActionCard(c)) state.stats.actionCardsPlayed++;
  events.push({ type: 'CARD_PLAYED', playerId, cardId, flex: useFlex || undefined });
  if (useFlex) events.push({ type: 'FLEX_USED', playerId, cardId });

  state.mayPass = false;
  state.drawnThisTurn = [];

  const result = applyResolutions(state, playerId, resolutions, rng, events);

  // §7.3 — the 2->1 transition is detected on the authoritative hand, after the
  // card has actually left it.
  enterClashPendingIfNeeded(state, playerId, before, events);

  if (!result.halted) {
    advanceTurn(state, result.advance, events);
  }
}

function illegalReason(state: GameState, cardId: CardId, playerId: PlayerId): string {
  if (state.players[state.activePlayerIndex]?.id !== playerId) return 'NOT_YOUR_TURN';
  if (!player(state, playerId).hand.includes(cardId)) return 'NOT_YOUR_CARD';
  if (state.penalty.pendingDraw > 0) return 'MUST_ANSWER_PENALTY';
  return 'NO_MATCH';
}

/* ------------------------------------------------------------------ */
/* DRAW_CARD                                                           */
/* ------------------------------------------------------------------ */

function applyDraw(
  state: GameState,
  playerId: PlayerId,
  rng: RngLike,
  events: GameEvent[],
): void {
  assertDrawAllowed(state, playerId);

  // Taking an outstanding penalty stack ends the turn (§2.4: the cumulative
  // penalty "lands on first player unable to respond").
  if (state.penalty.pendingDraw > 0) {
    const amount = state.penalty.pendingDraw;
    drawToPlayer(state, playerId, amount, rng, events);
    state.stats.penaltiesDrawn += amount;
    state.penalty = { pendingDraw: 0, minimumResponsePenalty: 0 };
    state.pendingDraw = 0;
    checkElimination(state, playerId, events);
    state.mayPass = false;
    state.drawnThisTurn = [];
    advanceTurn(state, 1, events);
    return;
  }

  if (state.mayPass) throw new RuleError('ALREADY_DREW');

  const manifest = getManifest(state.version);
  const drawn: CardId[] = [];

  if (state.config.drawRule === 'DRAW_UNTIL_PLAYABLE') {
    const cap = Object.keys(state.cards).length;
    while (drawn.length < cap) {
      const got = drawToPlayer(state, playerId, 1, rng, events);
      if (got.length === 0) break;
      drawn.push(...got);
      if (isPlayable(state, got[0]!, playerId)) break;
    }
  } else {
    drawn.push(...drawToPlayer(state, playerId, 1, rng, events));
  }

  checkElimination(state, playerId, events);
  if (player(state, playerId).eliminated) {
    advanceTurn(state, 1, events);
    return;
  }

  const hookResolutions: Resolution[] = manifest.afterDraw
    ? manifest.afterDraw({ ...ruleContext(state, playerId), drawn })
    : [];
  if (hookResolutions.length > 0) {
    const r = applyResolutions(state, playerId, hookResolutions, rng, events);
    if (!r.halted) advanceTurn(state, r.advance, events);
    return;
  }

  // Standard behaviour: if the drawn card can be played the player keeps the
  // turn and may play it or END_TURN; otherwise the turn passes immediately.
  const playable = drawn.some((id) => isPlayable(state, id, playerId));
  if (playable) {
    state.mayPass = true;
    state.drawnThisTurn = drawn;
  } else {
    state.mayPass = false;
    state.drawnThisTurn = [];
    advanceTurn(state, 1, events);
  }
}

function applyEndTurn(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  if (state.players[state.activePlayerIndex]?.id !== playerId) {
    throw new RuleError('NOT_YOUR_TURN');
  }
  if (!state.mayPass) throw new RuleError('MUST_ACT');
  state.mayPass = false;
  state.drawnThisTurn = [];
  advanceTurn(state, 1, events);
}

/* ------------------------------------------------------------------ */
/* Choices                                                             */
/* ------------------------------------------------------------------ */

function resumeAfterChoice(
  state: GameState,
  actorId: PlayerId,
  continuation: Resolution[],
  rng: RngLike,
  events: GameEvent[],
): void {
  state.awaitingChoice = undefined;
  const result = applyResolutions(state, actorId, continuation, rng, events, {
    advance: 1,
    suppressed: false,
  });
  if (!result.halted) {
    advanceTurn(state, result.advance, events);
  }
}

function applyChooseColor(
  state: GameState,
  playerId: PlayerId,
  color: string,
  rng: RngLike,
  events: GameEvent[],
): void {
  const choice = state.awaitingChoice;
  if (!choice || (choice.type !== 'COLOR' && choice.type !== 'DRAW_COLOR')) {
    throw new RuleError('NO_COLOR_CHOICE');
  }
  const allowed = choice.eligibleColors ?? legalColors(state);
  if (!allowed.includes(color)) throw new RuleError('ILLEGAL_COLOR');

  state.activeColor = color;
  events.push({ type: 'COLOR_CHOSEN', playerId, color });

  const continuation = choice.continuation ?? [];
  resumeAfterChoice(state, playerId, continuation, rng, events);
}

function applyChooseTarget(
  state: GameState,
  playerId: PlayerId,
  targetId: PlayerId,
  rng: RngLike,
  events: GameEvent[],
): void {
  const choice = state.awaitingChoice;
  if (!choice || choice.type !== 'TARGET') throw new RuleError('NO_TARGET_CHOICE');
  const allowed = choice.eligibleTargets ?? eligibleTargets(state, playerId);
  if (!allowed.includes(targetId)) throw new RuleError('ILLEGAL_TARGET');

  state.pendingTargetPlayerId = targetId;
  events.push({ type: 'TARGET_CHOSEN', playerId, targetId });
  resumeAfterChoice(state, playerId, choice.continuation ?? [], rng, events);
  state.pendingTargetPlayerId = undefined;
}

function applySwapHand(
  state: GameState,
  playerId: PlayerId,
  targetId: PlayerId,
  rng: RngLike,
  events: GameEvent[],
): void {
  const choice = state.awaitingChoice;
  if (!choice || choice.type !== 'SWAP_HAND') throw new RuleError('NO_SWAP_CHOICE');
  const allowed = choice.eligibleTargets ?? eligibleTargets(state, playerId);
  if (!allowed.includes(targetId)) throw new RuleError('ILLEGAL_TARGET');

  const continuation: Resolution[] = [
    { type: 'SWAP_HANDS', a: playerId, b: targetId },
    ...(choice.continuation ?? []),
  ];
  resumeAfterChoice(state, playerId, continuation, rng, events);
}

function applyChallenge(state: GameState, playerId: PlayerId): void {
  // Table 9: "Optional challenge hook | Only if enabled by version config".
  // Left explicitly unimplemented rather than guessed: the source blueprint
  // defines no challenge outcome. See docs/RULE_FLAGS.md RF-009.
  if (!state.config.challengeWildDrawFour) throw new RuleError('CHALLENGE_DISABLED');
  throw new RuleError(
    'CHALLENGE_NOT_SPECIFIED',
    'RF-009: the source blueprint defines no Wild Draw Four challenge outcome',
  );
}

/* ------------------------------------------------------------------ */
/* Terminal conditions                                                 */
/* ------------------------------------------------------------------ */

export function checkTerminalConditions(state: GameState, events: GameEvent[]): void {
  if (state.status !== 'PLAYING') return;

  const emptied = state.players.find((p) => !p.eliminated && p.hand.length === 0);
  const survivors = livePlayers(state);
  const lastStanding = survivors.length === 1 ? survivors[0] : undefined;

  const winner = emptied ?? lastStanding;
  if (!winner) {
    if (survivors.length === 0) {
      state.status = 'ROUND_END';
      state.stats.endedAt = Date.now();
    }
    return;
  }

  state.status = 'ROUND_END';
  state.winnerId = winner.id;
  state.stats.endedAt = Date.now();
  state.clashPending = null;
  state.awaitingChoice = undefined;

  const standings = scoreRound(state, winner.id);
  events.push({ type: 'ROUND_ENDED', winnerId: winner.id, standings });

  if (state.config.winCondition === 'ONE_ROUND') {
    state.status = 'MATCH_END';
    events.push({ type: 'MATCH_ENDED', winnerId: winner.id, standings });
  } else if (state.config.winCondition === 'POINTS_500') {
    const champion = state.players.find((p) => p.score >= 500);
    if (champion) {
      state.status = 'MATCH_END';
      events.push({ type: 'MATCH_ENDED', winnerId: champion.id, standings });
    }
  }
}

/**
 * RF-006: the source blueprint defines no scoring table. Default STANDARD is
 * the conventional one — the winner banks the point value of every card still
 * held by the other players, and each of those players records the negative of
 * their own remaining hand so the match total can show a spread.
 *
 * Scoring is split in two on purpose. `calculateRoundScore` answers "what is
 * this round worth?" and touches nothing; `applyRoundScore` performs the one
 * mutation. Before the split, the single function did both, and the client had
 * to call it a second time with scoring switched off just to read the numbers
 * for the summary screen — a trap for anyone who did not know why.
 */

/** One player's line in a round result. Every field is a fact, not a display choice. */
export type RoundScoreRow = {
  playerId: PlayerId;
  name: string;
  /** Point value of the cards still in this player's hand. Always >= 0. */
  handValue: number;
  cardsLeft: number;
  eliminated: boolean;
  /** Cumulative match score before this round was applied. */
  scoreBefore: number;
  /** Cumulative match score this round would produce. */
  scoreAfter: number;
};

export type RoundScore = {
  winnerId: PlayerId;
  /** Total the winner banks: the sum of every other hand. */
  pot: number;
  rows: RoundScoreRow[];
};

/**
 * Pure. Reads state, allocates a result, mutates nothing — not the players,
 * not their scores, not the state object.
 */
export function calculateRoundScore(state: GameState, winnerId: PlayerId): RoundScore {
  const standard = state.config.scoringMode === 'STANDARD';
  let pot = 0;

  const rows: RoundScoreRow[] = state.players.map((p) => {
    const handValue = p.hand.reduce((sum, id) => {
      const c = state.cards[id]!;
      const f = face(state, c);
      return sum + cardPoints(f.kind, f.value);
    }, 0);
    if (p.id !== winnerId) pot += handValue;
    return {
      playerId: p.id,
      name: p.name,
      handValue,
      cardsLeft: p.hand.length,
      eliminated: p.eliminated,
      scoreBefore: p.score,
      scoreAfter: p.score,
    };
  });

  if (standard) {
    for (const row of rows) {
      row.scoreAfter =
        row.playerId === winnerId ? row.scoreBefore + pot : row.scoreBefore - row.handValue;
    }
  }

  return { winnerId, pot, rows };
}

/**
 * The only place a round changes a score. Applying the same result twice would
 * double-count, so callers apply once and pass the standings around.
 */
export function applyRoundScore(state: GameState, result: RoundScore): Standing[] {
  for (const row of result.rows) {
    player(state, row.playerId).score = row.scoreAfter;
  }
  return toStandings(result);
}

/** Display-ready standings, highest cumulative score first. */
export function toStandings(result: RoundScore): Standing[] {
  return result.rows
    .map((row) => ({
      playerId: row.playerId,
      name: row.name,
      score: row.scoreAfter,
      cardsLeft: row.cardsLeft,
      eliminated: row.eliminated,
      handValue: row.handValue,
      banked: row.playerId === result.winnerId ? result.pot : 0,
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Calculate and apply, in that order. Kept because it is what the reducer
 * wants at the end of a round, and because every existing caller and test is
 * written against this name.
 */
export function scoreRound(state: GameState, winnerId: PlayerId): Standing[] {
  return applyRoundScore(state, calculateRoundScore(state, winnerId));
}

/* ------------------------------------------------------------------ */
/* Convenience re-exports for callers that need read-only queries       */
/* ------------------------------------------------------------------ */

export { legalCardIds, isPlayable };

/** The card the given player would be told about in a "why not?" tooltip. */
export function describeIllegal(
  state: GameState,
  cardId: CardId,
  playerId: PlayerId,
): string {
  return illegalReason(state, cardId, playerId);
}

export function currentPlayer(state: GameState): PlayerId {
  return activePlayer(state).id;
}

export function topFaceOf(state: GameState): Card | undefined {
  const id = state.discardPile[state.discardPile.length - 1];
  return id ? state.cards[id] : undefined;
}
