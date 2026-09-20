import {
  RuleError,
  shuffle,
  type CardId,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RngLike,
} from '@colorclash/shared';
import { player, topDiscardId } from './state.js';

/**
 * Draw-pile recycling — §2.1 and invariant §6.1:
 * "drawPile recycling never moves the current top discard into the draw pile."
 */
export function ensureDrawPile(state: GameState, rng: RngLike, events: GameEvent[]): void {
  if (state.drawPile.length > 0) return;

  const top = topDiscardId(state);
  const recyclable = state.discardPile.filter((id) => id !== top);
  if (recyclable.length === 0) return; // genuinely exhausted; caller decides

  state.discardPile = top ? [top] : [];
  state.drawPile = shuffle(recyclable, rng);
  events.push({ type: 'DECK_RECYCLED', count: state.drawPile.length });
}

/**
 * §7.1 drawToPlayer. Returns the ids actually drawn — fewer than `count` only
 * when the deck is genuinely exhausted, which the caller must handle rather
 * than crash mid-penalty (edge case §16.2 "Draw pile empties while penalty is
 * pending").
 */
export function drawToPlayer(
  state: GameState,
  playerId: PlayerId,
  count: number,
  rng: RngLike,
  events: GameEvent[],
): CardId[] {
  const p = player(state, playerId);
  const drawn: CardId[] = [];
  for (let i = 0; i < count; i++) {
    ensureDrawPile(state, rng, events);
    const cardId = state.drawPile.pop();
    if (!cardId) break;
    p.hand.push(cardId);
    drawn.push(cardId);
  }
  if (drawn.length > 0) {
    events.push({ type: 'CARD_DRAWN', playerId, count: drawn.length, cardIds: drawn });
  }
  return drawn;
}

/**
 * Elimination rule — §2.4 / §8.4: "Elimination check runs immediately after every
 * draw." Called by the engine after *every* draw path, never by a ruleset.
 */
export function checkElimination(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  if (state.version !== 'MAYHEM') return;
  const p = player(state, playerId);
  if (p.eliminated) return;
  if (p.hand.length >= state.config.eliminationThreshold) {
    p.eliminated = true;
    // Eliminated hands return to the draw pool so card conservation holds.
    state.drawPile.push(...p.hand);
    p.hand = [];
    events.push({
      type: 'PLAYER_ELIMINATED',
      playerId,
      reason: `hand reached ${state.config.eliminationThreshold}`,
    });
  }
}

export function assertDrawAllowed(state: GameState, playerId: PlayerId): void {
  if (state.status !== 'PLAYING') throw new RuleError('NOT_PLAYING');
  if (state.awaitingChoice) throw new RuleError('CHOICE_PENDING');
  if (state.players[state.activePlayerIndex]?.id !== playerId) {
    throw new RuleError('NOT_YOUR_TURN');
  }
}
