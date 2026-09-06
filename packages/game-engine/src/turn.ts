import type { GameEvent, GameState, PlayerId } from '@colorclash/shared';
import { livePlayers } from './state.js';

/**
 * Turn arithmetic. Every advance goes through here so direction, elimination
 * and wrapping can never drift apart (§8.4: "modeled as a combined effect so
 * direction and skipping cannot drift").
 */

/** Index of the nth next non-eliminated seat from `from`. */
export function seatAfter(state: GameState, from: number, steps: number): number {
  const n = state.players.length;
  if (n === 0) return 0;
  const live = livePlayers(state);
  if (live.length === 0) return from;

  let idx = from;
  let moved = 0;
  let guard = 0;
  while (moved < steps) {
    idx = (idx + state.direction + n) % n;
    guard++;
    if (guard > n * (steps + 2)) break; // structural safety net
    if (!state.players[idx]!.eliminated) moved++;
  }
  return idx;
}

export function nextPlayerId(state: GameState, steps = 1): PlayerId {
  return state.players[seatAfter(state, state.activePlayerIndex, steps)]!.id;
}

export function advanceTurn(state: GameState, steps: number, events: GameEvent[]): void {
  if (steps <= 0) return;
  const fromId = state.players[state.activePlayerIndex]!.id;
  state.activePlayerIndex = seatAfter(state, state.activePlayerIndex, steps);
  const toId = state.players[state.activePlayerIndex]!.id;
  events.push({
    type: 'TURN_CHANGED',
    from: fromId,
    to: toId,
    direction: state.direction,
  });
}

/**
 * §2.2: "Reverse | Invert turn step by multiplying by -1; in 2-player games
 * behaves like Skip." Returns the extra skip steps the caller should apply.
 */
export function applyReverse(state: GameState): number {
  state.direction = (state.direction * -1) as 1 | -1;
  return livePlayers(state).length === 2 ? 1 : 0;
}

/**
 * §2.3 Dark Skip Everyone: "Clear turn queue; play control returns instantly to
 * card player." Implemented as a turn-resolution strategy (§8.3), i.e. the
 * active seat simply does not move.
 */
export function skipEveryone(): number {
  return 0;
}

/** Rotate every live hand one seat along the current direction (§2.4 "0 rule"). */
export function rotateHands(state: GameState, events: GameEvent[]): void {
  const live = state.players.filter((p) => !p.eliminated);
  if (live.length < 2) return;
  const hands = live.map((p) => p.hand);
  // direction 1 -> each player receives the hand of the player behind them
  const shifted =
    state.direction === 1
      ? [hands[hands.length - 1]!, ...hands.slice(0, -1)]
      : [...hands.slice(1), hands[0]!];
  live.forEach((p, i) => {
    p.hand = shifted[i]!;
  });
  events.push({ type: 'HANDS_ROTATED', direction: state.direction });
}
