import type { Card, CardId, GameState, PlayerId, RuleContext } from '@colorclash/shared';
import { PENALTY_VALUE } from '@colorclash/game-content';
import { card, face, isWildFace, ownsCard, isPlayersTurn, topCard } from './state.js';
import { getManifest } from './registry.js';

/** Build the read-only context a ruleset sees. */
export function ruleContext(state: GameState, playerId: PlayerId): RuleContext {
  return {
    state,
    playerId,
    card: (id: CardId) => card(state, id),
    topCard: () => topCard(state),
    face: (c: Card) => face(state, c),
  };
}

/**
 * §7.2 Legal Move Pipeline. Order of checks is exactly as specified:
 * turn ownership -> card ownership -> pending forced response ->
 * version-specific legality.
 */
export function isPlayable(state: GameState, cardId: CardId, playerId: PlayerId): boolean {
  if (state.status !== 'PLAYING') return false;
  if (state.awaitingChoice) return false;
  if (!isPlayersTurn(state, playerId)) return false;
  if (!ownsCard(state, playerId, cardId)) return false;

  const rules = getManifest(state.version);
  const ctx = ruleContext(state, playerId);
  const c = card(state, cardId);

  if (state.penalty.pendingDraw > 0) {
    if (!state.config.stacking) return false;
    return rules.canRespondToPenalty
      ? rules.canRespondToPenalty(ctx, c)
      : defaultCanRespondToPenalty(state, c);
  }
  return rules.isPlayable(ctx, c);
}

/**
 * Shared colour/value/wild matching — §2.1 "Color match / Value match /
 * Wild override". Rulesets that follow the standard matching rule call this.
 */
export function standardIsPlayable(ctx: RuleContext, c: Card): boolean {
  const f = ctx.face(c);
  if (isWildFace(f)) return true; // §2.1 wild override is always valid
  const top = ctx.topCard();
  if (!top) return true;
  const topFace = ctx.face(top);

  if (ctx.state.activeColor && f.color === ctx.state.activeColor) return true;
  if (f.kind === 'NUMBER' && topFace.kind === 'NUMBER') {
    return f.value === topFace.value;
  }
  return f.kind === topFace.kind;
}

/**
 * §2.4: penalties "can pass iteratively when matching or higher cards are
 * played". Default: the response must itself be a draw card worth at least the
 * minimum response penalty.
 */
export function defaultCanRespondToPenalty(state: GameState, c: Card): boolean {
  const f = face(state, c);
  const value = PENALTY_VALUE[f.kind];
  if (value === undefined) return false;

  // RF-013: the source phrase is "matching or higher cards", which qualifies the
  // *penalty magnitude* — a card matching the current penalty or exceeding it.
  // It states no colour requirement for a stack response, so none is imposed
  // here. Adding one would be an invented rule (§18.1 rule 8).
  return value >= state.penalty.minimumResponsePenalty;
}

/** All card ids in a player's hand the engine will currently accept. */
export function legalCardIds(state: GameState, playerId: PlayerId): CardId[] {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return [];
  return p.hand.filter((id) => isPlayable(state, id, playerId));
}

/** Whether DRAW_CARD is currently accepted for this player. */
export function canDraw(state: GameState, playerId: PlayerId): boolean {
  return (
    state.status === 'PLAYING' &&
    !state.awaitingChoice &&
    isPlayersTurn(state, playerId) &&
    !state.players[state.activePlayerIndex]!.eliminated
  );
}
