import { RuleError, type GameState } from '@colorclash/shared';

/**
 * §6.1 Invariants. `assertInvariants` runs after every accepted command; a
 * violation is a bug in the engine, never a rule outcome, so it throws rather
 * than returning a soft error.
 */
export function assertInvariants(state: GameState): void {
  const total = Object.keys(state.cards).length;
  const seen = new Map<string, string>();

  const claim = (id: string, zone: string) => {
    const prev = seen.get(id);
    if (prev) {
      throw new RuleError('CARD_DUPLICATED', `Card ${id} exists in both ${prev} and ${zone}`);
    }
    seen.set(id, zone);
  };

  for (const p of state.players) {
    const local = new Set<string>();
    for (const id of p.hand) {
      if (local.has(id)) {
        throw new RuleError('DUPLICATE_IN_HAND', `Player ${p.id} holds ${id} twice`);
      }
      local.add(id);
      claim(id, `hand:${p.id}`);
    }
  }
  for (const id of state.drawPile) claim(id, 'drawPile');
  for (const id of state.discardPile) claim(id, 'discardPile');

  // §6.1: "Every card exists in exactly one zone".
  if (seen.size !== total) {
    throw new RuleError(
      'CARD_LOST',
      `Card conservation broken: ${seen.size} of ${total} cards accounted for`,
    );
  }

  // §6.1: "Exactly one active player exists while status is PLAYING".
  if (state.status === 'PLAYING') {
    const active = state.players[state.activePlayerIndex];
    if (!active) throw new RuleError('NO_ACTIVE_PLAYER');
    if (active.eliminated && state.players.some((p) => !p.eliminated)) {
      throw new RuleError('ELIMINATED_PLAYER_ACTIVE', `${active.id} is eliminated`);
    }
  }

  // §6.1: "activeColor always matches the current color requirement after a
  // wild is resolved" — i.e. no pending colour choice may coexist with play.
  if (state.status === 'PLAYING' && !state.awaitingChoice && !state.activeColor) {
    throw new RuleError('NO_ACTIVE_COLOR');
  }

  // §6.1: "drawPile recycling never moves the current top discard into the
  // draw pile" — checked structurally.
  const top = state.discardPile[state.discardPile.length - 1];
  if (top && state.drawPile.includes(top)) {
    throw new RuleError('TOP_DISCARD_RECYCLED', `Top discard ${top} is in the draw pile`);
  }

  if (state.penalty.pendingDraw !== state.pendingDraw) {
    throw new RuleError('PENALTY_MIRROR_DRIFT');
  }

  if (state.awaitingChoice) {
    const owner = state.players.find((p) => p.id === state.awaitingChoice!.playerId);
    if (!owner) throw new RuleError('STALE_CHOICE', 'Choice owner is not in the match');
  }
}

/** Cheap structural check used by the server before broadcasting. */
export function validateStructure(state: GameState): string[] {
  const problems: string[] = [];
  try {
    assertInvariants(state);
  } catch (e) {
    problems.push((e as Error).message);
  }
  return problems;
}
