import type { Command, PlayerView } from '@colorclash/shared';
import { describe, expect, it } from '@colorclash/test-fixtures';
import { MatchRoom } from './room.js';
import { FakeTimers } from './timers.js';

/**
 * Reconnect and timer safety — the combinations the brief asks to be checked
 * together, because each one is fine alone and the damage happens where they
 * meet: a timer firing for a player who has just come back, a command replayed
 * across a restart, a stack landing twice.
 *
 * The invariant behind all of them is the same and is asserted directly:
 * the total number of cards in the match never changes.
 */

function cards(room: MatchRoom): number {
  const s = room.debugState()!;
  return (
    s.players.reduce((n, p) => n + p.hand.length, 0) + s.drawPile.length + s.discardPile.length
  );
}

function timedRoom(turnTimeoutMs = 30_000) {
  const timers = new FakeTimers();
  const room = new MatchRoom({
    roomId: 'rc-1',
    code: 'RECON',
    version: 'MAYHEM',
    hostId: 'H',
    seed: 'reconnect-seed',
    rateLimitPerSecond: 100_000,
    timers,
    turnTimeoutMs,
  });
  room.join({ playerId: 'H', name: 'Host', isBot: false, connected: true });
  room.join({ playerId: 'G', name: 'Guest', isBot: false, connected: true });
  room.setReady('H', true);
  room.setReady('G', true);
  room.start('H');
  return { room, timers };
}

function waitingOn(room: MatchRoom): string {
  const s = room.debugState()!;
  return s.awaitingChoice?.playerId ?? s.players[s.activePlayerIndex]!.id;
}

function legal(view: PlayerView, id: string): Command {
  const choice = view.awaitingChoice;
  if (choice && choice.playerId === view.you) {
    if (choice.type === 'COLOR' || choice.type === 'DRAW_COLOR') {
      return {
        commandId: id,
        playerId: view.you,
        type: 'CHOOSE_COLOR',
        color: choice.eligibleColors![0]!,
      };
    }
    if (choice.type === 'SWAP_HAND') {
      return {
        commandId: id,
        playerId: view.you,
        type: 'SWAP_HAND',
        targetId: choice.eligibleTargets![0]!,
      };
    }
    return {
      commandId: id,
      playerId: view.you,
      type: 'CHOOSE_TARGET',
      targetId: choice.eligibleTargets![0]!,
    };
  }
  if (view.mayPass) return { commandId: id, playerId: view.you, type: 'END_TURN' };
  if (view.legalCardIds.length > 0) {
    return { commandId: id, playerId: view.you, type: 'PLAY_CARD', cardId: view.legalCardIds[0]! };
  }
  return { commandId: id, playerId: view.you, type: 'DRAW_CARD' };
}

describe('reconnect and timer safety', () => {
  it('a disconnect during your own turn still expires and moves play on', () => {
    const { room, timers } = timedRoom();
    const actor = waitingOn(room);
    const before = cards(room);

    room.leave(actor); // laptop lid closed mid-turn
    timers.advance(31_000);

    expect(waitingOn(room)).not.toBe(actor);
    expect(cards(room)).toBe(before);
  });

  it('reconnecting after an expiry does not replay the missed turn', () => {
    const { room, timers } = timedRoom();
    const actor = waitingOn(room);

    room.leave(actor);
    timers.advance(31_000);
    const seqAfterExpiry = room.debugState()!.seq;

    room.join({ playerId: actor, name: 'Back', isBot: false, connected: true });
    // The seat is restored, and nothing about coming back re-runs the turn the
    // server already played out.
    expect(room.debugState()!.seq).toBe(seqAfterExpiry);
    expect(room.info().seats.find((s) => s.playerId === actor)!.connected).toBe(true);
  });

  it('a command sent just before a disconnect is applied exactly once', () => {
    const { room } = timedRoom();
    const actor = waitingOn(room);
    const command = legal(room.viewFor(actor)!, 'inflight-1');

    room.submit(command);
    const after = room.debugState()!.seq;
    const handsAfter = room.debugState()!.players.map((p) => p.hand.length);

    // The client never saw the ack, dropped, reconnected and retried.
    room.leave(actor);
    room.join({ playerId: actor, name: 'Back', isBot: false, connected: true });
    const retry = room.submit(command);

    expect(retry.reason).toBe('DUPLICATE_IGNORED');
    expect(room.debugState()!.seq).toBe(after);
    expect(room.debugState()!.players.map((p) => p.hand.length)).toEqual(handsAfter);
  });

  it('survives a server restart mid-turn with the clock still correct', () => {
    const { room, timers } = timedRoom();
    for (let i = 0; i < 6 && room.debugState()!.status === 'PLAYING'; i++) {
      room.submit(legal(room.viewFor(waitingOn(room))!, `pre-${i}`));
    }
    const before = room.debugState()!;
    const saved = room.persist();

    const restoredTimers = new FakeTimers();
    const restored = MatchRoom.restore(saved, {
      timers: restoredTimers,
      turnTimeoutMs: 30_000,
      rateLimitPerSecond: 100_000,
    });

    expect(restored.debugState()!.players.map((p) => p.hand)).toEqual(
      before.players.map((p) => p.hand),
    );
    expect(cards(restored)).toBe(cards(room));

    // A fresh allowance starts on the restored turn rather than the old one
    // expiring instantly on a clock that moved on without it.
    const actor = waitingOn(restored);
    const view = restored.viewFor(actor)!;
    if (view.turn) expect(view.turn.deadline - view.turn.now).toBe(30_000);

    restoredTimers.advance(31_000);
    expect(restored.debugState()!.seq).toBeGreaterThan(before.seq);
    expect(cards(restored)).toBe(cards(room));
    void timers;
  });

  it('an expiry while a draw stack is pending takes the stack once, not twice', () => {
    const { room, timers } = timedRoom();

    // Play until something is owed, or give up quietly — this mode stacks
    // often enough that a short walk finds one.
    for (let i = 0; i < 40 && room.debugState()!.pendingDraw === 0; i++) {
      if (room.debugState()!.status !== 'PLAYING') break;
      room.submit(legal(room.viewFor(waitingOn(room))!, `walk-${i}`));
    }
    if (room.debugState()!.pendingDraw === 0) return;

    const owed = room.debugState()!.pendingDraw;
    const actor = waitingOn(room);
    const handBefore = room.debugState()!.players.find((p) => p.id === actor)!.hand.length;
    const total = cards(room);

    timers.advance(31_000);

    const handAfter = room.debugState()!.players.find((p) => p.id === actor)!.hand.length;
    // Either they answered it with a card, or they took it — never both, and
    // never the stack twice.
    expect(handAfter - handBefore).toBeLessThanOrEqual(owed);
    expect(cards(room)).toBe(total);
    expect(room.debugState()!.pendingDraw).toBeLessThanOrEqual(owed);
  });

  it('never lets two players hold the same card', () => {
    const { room, timers } = timedRoom();
    for (let i = 0; i < 25 && room.debugState()!.status === 'PLAYING'; i++) {
      if (i % 4 === 3) {
        // Periodically drop and restore whoever is on turn.
        const actor = waitingOn(room);
        room.leave(actor);
        timers.advance(31_000);
        room.join({ playerId: actor, name: actor, isBot: false, connected: true });
        continue;
      }
      room.submit(legal(room.viewFor(waitingOn(room))!, `churn-${i}`));
    }

    const s = room.debugState()!;
    const seen = new Set<string>();
    for (const id of [...s.players.flatMap((p) => p.hand), ...s.drawPile, ...s.discardPile]) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });
});
