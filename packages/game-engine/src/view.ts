import type { Card, CardId, GameState, PlayerId, PlayerView, PublicPlayer } from '@colorclash/shared';
import { canDraw, legalCardIds } from './legal.js';

/**
 * Projects authoritative state onto exactly what one participant may see.
 *
 * §15: "do not expose private hand contents to other clients".
 * §11.2: bots consume this same shape, so an AI physically cannot read
 * information a human in the same mode could not.
 */
export function buildPlayerView(state: GameState, viewerId: PlayerId): PlayerView {
  const players: PublicPlayer[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    handCount: p.hand.length,
    eliminated: p.eliminated,
    connected: p.connected,
    score: p.score,
    avatar: p.avatar,
    calledClash: state.clashCalled.includes(p.id),
  }));

  const you = state.players.find((p) => p.id === viewerId);
  const yourHand = you ? [...you.hand] : [];
  const topId = state.discardPile[state.discardPile.length - 1];

  // Only cards the viewer can legally identify: their own hand and the top
  // discard. Everything else is a face-down count.
  const visible: Record<CardId, Card> = {};
  for (const id of yourHand) visible[id] = state.cards[id]!;
  if (topId) visible[topId] = state.cards[topId]!;

  return {
    gameId: state.gameId,
    version: state.version,
    status: state.status,
    players,
    you: viewerId,
    yourHand,
    cards: visible,
    drawPileCount: state.drawPile.length,
    topCardId: topId,
    discardCount: state.discardPile.length,
    activePlayerIndex: state.activePlayerIndex,
    direction: state.direction,
    activeColor: state.activeColor,
    deckSide: state.deckSide,
    pendingDraw: state.pendingDraw,
    minimumResponsePenalty: state.penalty.minimumResponsePenalty,
    awaitingChoice: state.awaitingChoice,
    flexPowerAvailable: state.flexPowerAvailable,
    clashPending: state.clashPending,
    roundNumber: state.roundNumber,
    seq: state.seq,
    config: state.config,
    winnerId: state.winnerId,
    stats: state.stats,
    legalCardIds: you ? legalCardIds(state, viewerId) : [],
    canDraw: you ? canDraw(state, viewerId) : false,
    mayPass: state.mayPass && state.players[state.activePlayerIndex]?.id === viewerId,
  };
}

/**
 * Local (hot-seat and vs-bot) play needs the full card table so the renderer
 * can draw every hand. Never send this over the wire in an online match.
 */
export function buildLocalView(state: GameState, viewerId: PlayerId): PlayerView {
  return { ...buildPlayerView(state, viewerId), cards: state.cards };
}
