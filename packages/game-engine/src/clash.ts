import type { Command, GameEvent, GameState, PlayerId, RngLike } from '@colorclash/shared';
import { checkElimination, drawToPlayer } from './draw.js';
import { player } from './state.js';

/**
 * CLASH timing — §7.3.
 *
 * - Playing a card that reduces a hand from 2 to 1 enters CLASH_PENDING immediately.
 * - CALL_CLASH is idempotent: repeated calls cannot create multiple rewards or penalties.
 * - If the next game action occurs first, apply the source-defined 2-card penalty.
 */

export function enterClashPendingIfNeeded(
  state: GameState,
  playerId: PlayerId,
  before: number,
  events: GameEvent[],
): void {
  const after = player(state, playerId).hand.length;
  if (before > 1 && after === 1) {
    if (!state.clashCalled.includes(playerId)) {
      state.clashPending = playerId;
      events.push({ type: 'CLASH_PENDING', playerId });
    }
  }
  // Leaving the one-card window clears any recorded call so a later 2->1
  // transition requires a fresh call.
  if (after !== 1) {
    state.clashCalled = state.clashCalled.filter((id) => id !== playerId);
    if (state.clashPending === playerId) state.clashPending = null;
  }
}

export function applyClashCall(state: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const p = player(state, playerId);
  // Idempotent: a second call is accepted and changes nothing.
  if (state.clashCalled.includes(playerId)) return;
  if (p.hand.length !== 1) {
    // Calling with the wrong hand size is a no-op rather than an error, so a
    // laggy client double-tap can never desync the match.
    return;
  }
  state.clashCalled.push(playerId);
  if (state.clashPending === playerId) state.clashPending = null;
  state.stats.clashCalls++;
  events.push({ type: 'CLASH_CALLED', playerId });
}

/**
 * Runs at the head of every command except the pending player's own CALL_CLASH.
 * "If the next game action occurs first, apply the source-defined 2-card
 * penalty" (§7.3 / §2.1).
 */
export function settleMissedClash(
  state: GameState,
  command: Command,
  rng: RngLike,
  events: GameEvent[],
): void {
  const pending = state.clashPending;
  if (!pending) return;
  if (command.type === 'CALL_CLASH' && command.playerId === pending) return;

  // Answering a pending choice finishes the card that is already in flight — it
  // is the *same* game action, not the next one. Penalising a player for the
  // mandatory colour/target/swap step of their own play would make cards like
  // the Mayhem 7 unplayable as a final-but-one card.
  if (state.awaitingChoice && command.playerId === state.awaitingChoice.playerId) {
    const answers: Record<string, Command['type']> = {
      COLOR: 'CHOOSE_COLOR',
      DRAW_COLOR: 'CHOOSE_COLOR',
      TARGET: 'CHOOSE_TARGET',
      SWAP_HAND: 'SWAP_HAND',
    };
    if (command.type === answers[state.awaitingChoice.type]) return;
  }

  state.clashPending = null;
  const p = player(state, pending);
  if (p.eliminated || p.hand.length !== 1) return;

  const count = state.config.clashPenaltyCards;
  drawToPlayer(state, pending, count, rng, events);
  state.stats.penaltiesDrawn += count;
  events.push({ type: 'CLASH_PENALTY', playerId: pending, count });
  checkElimination(state, pending, events);
}
