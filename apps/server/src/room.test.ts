import type { Command, GameVersion, PlayerView } from '@colorclash/shared';
import { describe, expect, it } from '@colorclash/test-fixtures';
import { MatchRoom } from './room.js';

/**
 * Network-layer edge cases from §16.2 and §16.1's "Network" test row:
 * reconnect, duplicate command, stale command, late join, resync.
 */

function room(version: GameVersion = 'CLASSIC') {
  const r = new MatchRoom({
    roomId: 'room-1',
    code: 'ABCDE',
    version,
    hostId: 'H',
    seed: 'server-seed',
  });
  r.join({ playerId: 'H', name: 'Host', isBot: false, connected: true });
  r.join({ playerId: 'G', name: 'Guest', isBot: false, connected: true });
  r.setReady('H', true);
  r.setReady('G', true);
  return r;
}

function firstLegalCommand(view: PlayerView, id = 'c1'): Command {
  if (view.awaitingChoice && view.awaitingChoice.playerId === view.you) {
    return {
      commandId: id,
      playerId: view.you,
      type: 'CHOOSE_COLOR',
      color: view.awaitingChoice.eligibleColors![0]!,
    };
  }
  if (view.legalCardIds.length > 0) {
    return { commandId: id, playerId: view.you, type: 'PLAY_CARD', cardId: view.legalCardIds[0]! };
  }
  return { commandId: id, playerId: view.you, type: 'DRAW_CARD' };
}

function activeViewer(r: MatchRoom): PlayerView {
  const s = r.debugState()!;
  const id = s.awaitingChoice?.playerId ?? s.players[s.activePlayerIndex]!.id;
  return r.viewFor(id)!;
}

describe('MatchRoom — authoritative server (§10, §15)', () => {
  it('runs the room lifecycle from lobby to playing', () => {
    const r = room();
    expect(r.info().status).toBe('LOBBY');
    expect(r.info().seats).toHaveLength(2);
    r.start('H');
    expect(r.info().status).toBe('PLAYING');
    expect(r.debugState()!.players).toHaveLength(2);
  });

  it('only the host can start the match', () => {
    const r = room();
    expect(() => r.start('G')).toThrow('NOT_HOST');
  });

  it('rejects a command from a player whose turn it is not', () => {
    const r = room();
    r.start('H');
    // An opening wild leaves a colour choice pending, which is a different
    // (also correct) rejection; settle it first so this test asserts the
    // turn-ownership path it is actually about.
    const pending = r.debugState()!.awaitingChoice;
    if (pending) {
      r.submit({
        commandId: 'settle',
        playerId: pending.playerId,
        type: 'CHOOSE_COLOR',
        color: pending.eligibleColors![0]!,
      });
    }
    const s = r.debugState()!;
    const idle = s.players[(s.activePlayerIndex + 1) % 2]!.id;
    const out = r.submit({ commandId: 'x1', playerId: idle, type: 'DRAW_CARD' });
    expect(out.accepted).toBe(false);
    expect(out.reason).toBe('NOT_YOUR_TURN');
  });

  it('never lets a client decide legality — an illegal play is rejected', () => {
    const r = room();
    r.start('H');
    const view = activeViewer(r);
    const illegal = view.yourHand.find((id) => !view.legalCardIds.includes(id));
    if (!illegal) return; // every card happened to be legal in this deal
    const out = r.submit({
      commandId: 'x2',
      playerId: view.you,
      type: 'PLAY_CARD',
      cardId: illegal,
    });
    expect(out.accepted).toBe(false);
  });

  it('a replayed commandId is accepted once and applied once (idempotency)', () => {
    const r = room();
    r.start('H');
    const view = activeViewer(r);
    const command = firstLegalCommand(view, 'dup-1');

    const seqBefore = r.debugState()!.seq;
    const first = r.submit(command);
    expect(first.accepted).toBe(true);
    const seqAfter = r.debugState()!.seq;
    expect(seqAfter).toBeGreaterThan(seqBefore);

    // The client retried after a dropped ack.
    const second = r.submit(command);
    expect(second.accepted).toBe(true);
    expect(second.reason).toBe('DUPLICATE_IGNORED');
    expect(r.debugState()!.seq).toBe(seqAfter);
  });

  it('rejects a stale sequence number', () => {
    const r = room();
    r.start('H');
    const view = activeViewer(r);
    const command = firstLegalCommand(view, 'stale-1');
    r.submit(command);

    const view2 = activeViewer(r);
    const late = firstLegalCommand(view2, 'stale-2');
    const out = r.submit(late, 0); // client believes it is still at seq 0
    expect(out.accepted).toBe(false);
    expect(out.reason).toBe('STALE_SEQUENCE');
  });

  it('rate-limits command spam', () => {
    const r = room();
    r.start('H');
    const id = r.debugState()!.players[0]!.id;
    let rejected = 0;
    for (let i = 0; i < 40; i++) {
      const out = r.submit({ commandId: `spam-${i}`, playerId: id, type: 'CALL_CLASH' });
      if (!out.accepted && out.reason === 'RATE_LIMITED') rejected++;
    }
    expect(rejected).toBeGreaterThan(0);
  });

  it('rejects a late join once the match has started (§16.2)', () => {
    const r = room();
    r.start('H');
    expect(() =>
      r.join({ playerId: 'LATE', name: 'Latecomer', isBot: false, connected: true }),
    ).toThrow('MATCH_IN_PROGRESS');
  });

  it('keeps the seat when a player disconnects mid-match', () => {
    const r = room();
    r.start('H');
    r.leave('G');
    expect(r.info().seats).toHaveLength(2);
    expect(r.info().seats.find((s) => s.playerId === 'G')!.connected).toBe(false);
    expect(r.debugState()!.players.find((p) => p.id === 'G')!.connected).toBe(false);
  });

  it('a reconnecting player resumes the same seat', () => {
    const r = room();
    r.start('H');
    r.leave('G');
    r.join({ playerId: 'G', name: 'Guest', isBot: false, connected: true });
    expect(r.info().seats).toHaveLength(2);
    expect(r.info().seats.find((s) => s.playerId === 'G')!.connected).toBe(true);
  });

  it('resync returns a snapshot plus every missed event (§16.2, 3+ updates behind)', () => {
    const r = room();
    r.start('H');
    const startSeq = r.debugState()!.seq;

    for (let i = 0; i < 4; i++) {
      const view = activeViewer(r);
      r.submit(firstLegalCommand(view, `sync-${i}`));
    }

    const { view, missed } = r.resync('G', startSeq);
    expect(view).toBeDefined();
    expect(view!.seq).toBe(r.debugState()!.seq);
    expect(missed.length).toBeGreaterThan(0);
    // The snapshot alone is enough to rebuild — events are for animation only.
    expect(view!.players).toHaveLength(2);
  });

  it("a snapshot never contains another player's hand (§15)", () => {
    const r = room();
    r.start('H');
    const view = r.viewFor('H')!;
    const guestCards = r.debugState()!.players.find((p) => p.id === 'G')!.hand;
    for (const id of guestCards) {
      if (id === view.topCardId) continue;
      expect(Object.keys(view.cards)).not.toContain(id);
    }
  });

  it('config and version changes are host-only and locked during play', () => {
    const r = room();
    expect(() => r.setConfig('G', { stacking: true })).toThrow('NOT_HOST');
    r.setConfig('H', { stacking: true });
    expect(r.info().config.stacking).toBe(true);
    r.start('H');
    expect(() => r.setVersion('H', 'FLIP')).toThrow('MATCH_IN_PROGRESS');
  });

  it('bots play automatically through the same command path', () => {
    const r = new MatchRoom({
      roomId: 'room-2',
      code: 'BOTS1',
      version: 'CLASSIC',
      hostId: 'H',
      seed: 'bot-seed',
      rateLimitPerSecond: 100_000,
    });
    r.join({ playerId: 'H', name: 'Host', isBot: false, connected: true });
    r.addBot('NORMAL', 'Sunny');
    r.addBot('HARD', 'TigerX');
    r.setReady('H', true);
    r.start('H');

    // After start the room has already driven every bot up to the human's turn.
    const s = r.debugState()!;
    const waiting =
      s.status !== 'PLAYING' ||
      s.awaitingChoice?.playerId === 'H' ||
      s.players[s.activePlayerIndex]!.id === 'H';
    expect(waiting).toBe(true);
  });

  it('plays a complete online round to a winner', () => {
    const r = new MatchRoom({
      roomId: 'room-3',
      code: 'FULL1',
      version: 'CLASSIC',
      hostId: 'H',
      seed: 'full-round',
      // This harness plays a whole round as fast as the CPU allows; the spam
      // guard is exercised by its own test above.
      rateLimitPerSecond: 100_000,
    });
    r.join({ playerId: 'H', name: 'Host', isBot: false, connected: true });
    r.addBot('NORMAL', 'Sunny');
    r.setReady('H', true);
    r.start('H');

    for (let i = 0; i < 400 && r.debugState()!.status === 'PLAYING'; i++) {
      const s = r.debugState()!;
      const actor = s.awaitingChoice?.playerId ?? s.players[s.activePlayerIndex]!.id;
      if (actor !== 'H') break; // bots are driven by the room itself
      const view = r.viewFor('H')!;
      const out = r.submit(firstLegalCommand(view, `full-${i}`));
      // A rejection here is a real defect, not a reason to stop quietly.
      expect(out.accepted).toBe(true);
    }
    expect(r.debugState()!.status).toBe('MATCH_END');
    expect(r.debugState()!.winnerId).toBeDefined();
  });
});
