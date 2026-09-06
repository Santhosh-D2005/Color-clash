import type { Command, GameEvent, GameState, RngLike } from '@colorclash/shared';
import { reduce, buildPlayerView } from '@colorclash/game-engine';
import { decide } from './index.js';

/**
 * Drives bot seats until it is a human's turn again (or the round ends).
 *
 * Bots submit exactly the same commands through exactly the same reducer as
 * humans (§11), so this loop contains no rule logic of its own — it only
 * decides *when* a bot is asked for a decision.
 */
export function runBotTurns(
  state: GameState,
  rng: RngLike,
  options: { maxSteps?: number; onStep?: (state: GameState, events: GameEvent[]) => void } = {},
): { state: GameState; events: GameEvent[] } {
  const maxSteps = options.maxSteps ?? 500;
  let current = state;
  const all: GameEvent[] = [];

  for (let step = 0; step < maxSteps; step++) {
    if (current.status !== 'PLAYING') break;

    // Try each candidate in priority order. A bot that declines to act — a
    // weaker tier choosing not to call CLASH, for instance — must not stall the
    // loop, so we fall through to the next candidate rather than stopping.
    let acted = false;
    for (const actor of botCandidates(current)) {
      const view = buildPlayerView(current, actor.id);
      const command = decide(view, actor.botTier ?? 'NORMAL', rng);
      if (!command) continue;

      const result = reduce(current, command, rng);
      current = result.state;
      all.push(...result.events);
      options.onStep?.(current, result.events);
      acted = true;
      break;
    }
    // Nobody could act: the match is waiting on a human seat.
    if (!acted) break;
  }

  return { state: current, events: all };
}

/**
 * Runs exactly one bot decision and returns.
 *
 * `runBotTurns` above resolves an entire chain in one call, which is right for
 * a test and wrong for a screen: it is why three opponents used to finish their
 * turns inside a single frame. A caller that wants the table to be watchable
 * drives this instead, one step per animation beat, and gets the identical
 * sequence of commands spread over time.
 *
 * `acted: false` means the match is waiting on a human.
 */
export function stepBots(
  state: GameState,
  rng: RngLike,
): {
  state: GameState;
  events: GameEvent[];
  acted: boolean;
  actor?: string;
  /**
   * The command that was applied. A caller persisting the match needs this:
   * replaying a log without the bots' own commands would let them decide
   * differently and rebuild a different match.
   */
  command?: Command;
} {
  if (state.status !== 'PLAYING') return { state, events: [], acted: false };

  for (const actor of botCandidates(state)) {
    const view = buildPlayerView(state, actor.id);
    const command = decide(view, actor.botTier ?? 'NORMAL', rng);
    if (!command) continue;
    const result = reduce(state, command, rng);
    return {
      state: result.state,
      events: result.events,
      acted: true,
      actor: actor.id,
      command,
    };
  }

  return { state, events: [], acted: false };
}

/**
 * Bots that may act right now, most-constrained first: the owner of a pending
 * choice (nothing else is legal), then a bot owing a Clash call, then the
 * active seat.
 */
function botCandidates(state: GameState) {
  const out: GameState['players'] = [];
  const push = (p: GameState['players'][number] | undefined) => {
    if (p?.isBot && !p.eliminated && !out.includes(p)) out.push(p);
  };

  if (state.awaitingChoice) {
    push(state.players.find((p) => p.id === state.awaitingChoice!.playerId));
    return out; // a pending choice blocks every other command
  }
  if (state.clashPending) {
    push(state.players.find((p) => p.id === state.clashPending));
  }
  push(state.players[state.activePlayerIndex]);
  return out;
}

/** True when the match is waiting on the given human seat. */
export function isWaitingForHuman(state: GameState, humanId: string): boolean {
  if (state.status !== 'PLAYING') return false;
  if (state.awaitingChoice) return state.awaitingChoice.playerId === humanId;
  return state.players[state.activePlayerIndex]?.id === humanId;
}
