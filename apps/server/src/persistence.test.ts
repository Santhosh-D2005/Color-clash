import type { Command, PlayerView } from '@colorclash/shared';
import { describe, expect, it } from '@colorclash/test-fixtures';
import { CHECKPOINT_EVERY, MatchRoom } from './room.js';

/**
 * Restart recovery.
 *
 * The claim being tested is narrow and important: a seed plus an ordered
 * command log is enough to rebuild a match exactly, because the engine is a
 * pure reducer. If that ever stops being true, these tests fail long before a
 * player notices their hand changed across a deploy.
 */

function playedRoom(moves: number) {
  const room = new MatchRoom({
    roomId: 'persist-1',
    code: 'SAVE1',
    version: 'CLASSIC',
    hostId: 'H',
    seed: 'persist-seed',
    rateLimitPerSecond: 100_000,
  });
  room.join({ playerId: 'H', name: 'Host', isBot: false, connected: true });
  room.join({ playerId: 'G', name: 'Guest', isBot: false, connected: true });
  room.setReady('H', true);
  room.setReady('G', true);
  room.start('H');

  for (let i = 0; i < moves && room.debugState()!.status === 'PLAYING'; i++) {
    const s = room.debugState()!;
    const actor = s.awaitingChoice?.playerId ?? s.players[s.activePlayerIndex]!.id;
    room.submit(legalCommand(room.viewFor(actor)!, `m-${i}`));
  }
  return room;
}

describe('room persistence — a match survives a restart (issue 20)', () => {
  it('saves inputs, not board state', () => {
    const saved = playedRoom(6).persist();
    expect(saved.seed).toBe('persist-seed');
    expect(saved.matchSeed).toBeDefined();
    expect(saved.commands.length).toBeGreaterThan(0);
    // No hands, no piles, nothing that could disagree with the engine.
    const json = JSON.stringify(saved);
    expect(json.includes('"drawPile"')).toBe(false);
    expect(json.includes('"discardPile"')).toBe(false);
  });

  it('restores the identical match', () => {
    const original = playedRoom(8);
    const before = original.debugState()!;

    const restored = MatchRoom.restore(original.persist());
    const after = restored.debugState()!;

    expect(after.seq).toBe(before.seq);
    expect(after.activePlayerIndex).toBe(before.activePlayerIndex);
    expect(after.direction).toBe(before.direction);
    expect(after.activeColor).toBe(before.activeColor);
    expect(after.discardPile).toEqual(before.discardPile);
    expect(after.drawPile).toEqual(before.drawPile);
    expect(after.players.map((p) => p.hand)).toEqual(before.players.map((p) => p.hand));
  });

  it('lets a player carry on playing after the restart', () => {
    const restored = MatchRoom.restore(playedRoom(6).persist(), { rateLimitPerSecond: 100_000 });
    const s = restored.debugState()!;
    const actor = s.awaitingChoice?.playerId ?? s.players[s.activePlayerIndex]!.id;

    restored.join({ playerId: actor, name: 'Back', isBot: false, connected: true });
    const out = restored.submit(legalCommand(restored.viewFor(actor)!, 'after-restart'));
    expect(out.accepted).toBe(true);
  });

  it('does not replay a command twice', () => {
    const original = playedRoom(6);
    const saved = original.persist();
    const restored = MatchRoom.restore(saved);

    // Every saved commandId is already spent, so a client retrying one of them
    // after reconnecting gets the idempotent answer, not a second application.
    const replayed = saved.commands[0]!;
    const seqBefore = restored.debugState()!.seq;
    const out = restored.submit(replayed);
    expect(out.reason).toBe('DUPLICATE_IGNORED');
    expect(restored.debugState()!.seq).toBe(seqBefore);
  });

  it('holds every seat, marked disconnected until players return', () => {
    const restored = MatchRoom.restore(playedRoom(4).persist());
    const seats = restored.info().seats;
    expect(seats).toHaveLength(2);
    expect(seats.every((s) => !s.connected)).toBe(true);

    restored.join({ playerId: 'G', name: 'Guest', isBot: false, connected: true });
    expect(restored.info().seats.find((s) => s.playerId === 'G')!.connected).toBe(true);
  });

  it('restores a lobby that had not started yet', () => {
    const room = new MatchRoom({
      roomId: 'lobby-1',
      code: 'LOB01',
      version: 'FLIP',
      hostId: 'H',
      seed: 'lobby-seed',
    });
    room.join({ playerId: 'H', name: 'Host', isBot: false, connected: true });

    const restored = MatchRoom.restore(room.persist());
    expect(restored.info().status).toBe('LOBBY');
    expect(restored.version).toBe('FLIP');
    expect(restored.debugState()).toBe(undefined);
  });

  it('checkpoints instead of growing the log without bound', () => {
    // Long before the checkpoint the log is just the commands so far.
    const short = playedRoom(6).persist();
    expect(short.checkpoint).toBe(undefined);
    expect(short.commands.length).toBeGreaterThan(0);

    // Past the interval, the log folds into a checkpoint and starts again —
    // which is what stops a long match rewriting an ever-larger file on every
    // single move.
    const long = playedRoom(CHECKPOINT_EVERY + 12).persist();
    expect(long.checkpoint).toBeDefined();
    expect(long.commands.length).toBeLessThan(CHECKPOINT_EVERY);
  });

  it('restores identically from a checkpoint', () => {
    const original = playedRoom(CHECKPOINT_EVERY + 12);
    const before = original.debugState()!;
    const saved = original.persist();
    expect(saved.checkpoint).toBeDefined();

    const restored = MatchRoom.restore(saved);
    const after = restored.debugState()!;

    // The whole point: folding the log changes how much is stored, never what
    // the match is.
    expect(after.seq).toBe(before.seq);
    expect(after.players.map((p) => p.hand)).toEqual(before.players.map((p) => p.hand));
    expect(after.drawPile).toEqual(before.drawPile);
    expect(after.discardPile).toEqual(before.discardPile);
    expect(after.activePlayerIndex).toBe(before.activePlayerIndex);
    expect(after.activeColor).toBe(before.activeColor);
  });

  it('refuses a save file it does not understand', () => {
    const saved = { ...playedRoom(2).persist(), format: 99 } as never;
    expect(() => MatchRoom.restore(saved)).toThrow('UNREADABLE_SAVE');
  });

  it('recovers as far as the log agrees with the engine', () => {
    // A command the current code refuses (a rule changed under an old log)
    // must not throw away the whole match — it truncates at the last state
    // both sides agree on.
    const saved = playedRoom(8).persist();
    saved.commands.splice(3, 0, {
      commandId: 'bogus',
      playerId: 'H',
      type: 'PLAY_CARD',
      cardId: 'NOT_A_CARD',
    });

    const restored = MatchRoom.restore(saved);
    expect(restored.debugState()).toBeDefined();
    expect(restored.debugState()!.seq).toBeGreaterThan(0);
  });
});

function legalCommand(view: PlayerView, id: string): Command {
  if (view.awaitingChoice && view.awaitingChoice.playerId === view.you) {
    if (view.awaitingChoice.type === 'COLOR' || view.awaitingChoice.type === 'DRAW_COLOR') {
      return {
        commandId: id,
        playerId: view.you,
        type: 'CHOOSE_COLOR',
        color: view.awaitingChoice.eligibleColors![0]!,
      };
    }
    return {
      commandId: id,
      playerId: view.you,
      type: 'CHOOSE_TARGET',
      targetId: view.awaitingChoice.eligibleTargets![0]!,
    };
  }
  if (view.legalCardIds.length > 0) {
    return { commandId: id, playerId: view.you, type: 'PLAY_CARD', cardId: view.legalCardIds[0]! };
  }
  return { commandId: id, playerId: view.you, type: 'DRAW_CARD' };
}
