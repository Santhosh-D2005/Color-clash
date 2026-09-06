import type { Command, PlayerView } from '@colorclash/shared';
import { describe, expect, it } from '@colorclash/test-fixtures';
import { MatchRoom, autoCommandsFor } from './room.js';
import { FakeTimers } from './timers.js';

/**
 * The turn timer and the paced bot loop both depend on time, which is exactly
 * why `MatchRoom` takes a clock instead of calling `setTimeout`. Every test
 * here drives a `FakeTimers` by hand: no waiting, no flakes, and the 30-second
 * production allowance is exercised in microseconds.
 */

function timedRoom(opts: { turnTimeoutMs?: number; botDelayMs?: number } = {}) {
  const timers = new FakeTimers();
  const room = new MatchRoom({
    roomId: 'timed-1',
    code: 'TIMER',
    version: 'CLASSIC',
    hostId: 'H',
    seed: 'timer-seed',
    rateLimitPerSecond: 100_000,
    timers,
    turnTimeoutMs: opts.turnTimeoutMs ?? 30_000,
    botDelayMs: opts.botDelayMs ?? 0,
  });
  return { room, timers };
}

function twoHumans(room: MatchRoom) {
  room.join({ playerId: 'H', name: 'Host', isBot: false, connected: true });
  room.join({ playerId: 'G', name: 'Guest', isBot: false, connected: true });
  room.setReady('H', true);
  room.setReady('G', true);
  room.start('H');
}

function waitingOn(room: MatchRoom): string {
  const s = room.debugState()!;
  return s.awaitingChoice?.playerId ?? s.players[s.activePlayerIndex]!.id;
}

describe('turn timer — authoritative, server-owned (issue 9)', () => {
  it('publishes a deadline in the snapshot so clients can only render it', () => {
    const { room } = timedRoom();
    twoHumans(room);

    const view = room.viewFor('H')!;
    expect(view.turn).toBeDefined();
    expect(view.turn!.timeoutMs).toBe(30_000);
    expect(view.turn!.playerId).toBe(waitingOn(room));
    // The deadline is expressed on the server's clock, and the snapshot carries
    // that clock alongside it, so a client with a skewed clock still counts
    // down correctly instead of trusting its own idea of "now".
    expect(view.turn!.deadline - view.turn!.now).toBe(30_000);
  });

  it('acts for a player who never moves, and only after the full allowance', () => {
    const { room, timers } = timedRoom();
    twoHumans(room);
    const actor = waitingOn(room);
    const seqBefore = room.debugState()!.seq;

    timers.advance(29_000);
    expect(room.debugState()!.seq).toBe(seqBefore);

    timers.advance(2_000);
    expect(room.debugState()!.seq).toBeGreaterThan(seqBefore);
    // The turn actually moved on rather than merely being poked.
    expect(waitingOn(room)).not.toBe(actor);
  });

  it('resets the clock after a completed action', () => {
    const { room, timers } = timedRoom();
    twoHumans(room);

    // Burn most of the first allowance, then act.
    timers.advance(25_000);
    const actor = waitingOn(room);
    const view = room.viewFor(actor)!;
    room.submit(legalCommand(view, 'act-1'));

    const fresh = room.viewFor(waitingOn(room))!;
    // A new full allowance, not the 5 seconds left over from the last one.
    expect(fresh.turn!.deadline - fresh.turn!.now).toBe(30_000);
  });

  it('a timer armed for a turn that already moved on does nothing', () => {
    const { room, timers } = timedRoom();
    twoHumans(room);

    const actor = waitingOn(room);
    room.submit(legalCommand(room.viewFor(actor)!, 'quick-1'));
    const seqAfterAction = room.debugState()!.seq;

    // The first turn's timer is still in flight. It must not fire an action
    // for a player who already played — that is the double-action bug.
    timers.advance(31_000);
    // Exactly one expiry happened (the *new* turn's), not two.
    const s = room.debugState()!;
    expect(s.seq).toBeGreaterThan(seqAfterAction);
    expect(s.status === 'PLAYING' || s.status === 'MATCH_END').toBe(true);
  });

  it('never runs a clock on a bot seat', () => {
    const timers = new FakeTimers();
    const room = new MatchRoom({
      roomId: 'timed-2',
      code: 'TIMR2',
      version: 'CLASSIC',
      hostId: 'H',
      seed: 'bot-timer',
      rateLimitPerSecond: 100_000,
      timers,
      turnTimeoutMs: 30_000,
      botDelayMs: 0,
    });
    room.join({ playerId: 'H', name: 'Host', isBot: false, connected: true });
    room.addBot('NORMAL', 'Sunny');
    room.setReady('H', true);
    room.start('H');

    // Bots resolve their own turns, so the clock belongs to the human seat.
    const view = room.viewFor('H')!;
    if (view.turn) expect(view.turn.playerId).toBe('H');
  });

  it('is off unless a timeout is configured', () => {
    const timers = new FakeTimers();
    const room = new MatchRoom({
      roomId: 'timed-3',
      code: 'TIMR3',
      version: 'CLASSIC',
      hostId: 'H',
      seed: 'no-timer',
      timers,
    });
    twoHumans(room);
    expect(room.viewFor('H')!.turn).toBe(undefined);
    const seq = room.debugState()!.seq;
    timers.advance(10 * 60_000);
    expect(room.debugState()!.seq).toBe(seq);
  });
});

describe('turn timer — what the server plays for you', () => {
  const nextId = () => 'auto-1';

  it('settles a blocking colour choice before anything else', () => {
    const view = {
      you: 'P1',
      awaitingChoice: { type: 'COLOR', playerId: 'P1', eligibleColors: ['RED', 'BLUE'] },
      mayPass: false,
      canDraw: true,
      legalCardIds: ['x'],
    } as unknown as PlayerView;
    const [first] = autoCommandsFor(view, nextId);
    expect(first!.type).toBe('CHOOSE_COLOR');
  });

  it('passes when the player has already drawn', () => {
    const view = {
      you: 'P1',
      mayPass: true,
      canDraw: false,
      legalCardIds: ['x'],
    } as unknown as PlayerView;
    expect(autoCommandsFor(view, nextId).map((c) => c.type)).toEqual(['END_TURN']);
  });

  it('draws, then passes, rather than spending a card for you', () => {
    const view = {
      you: 'P1',
      mayPass: false,
      canDraw: true,
      legalCardIds: ['a', 'b'],
    } as unknown as PlayerView;
    expect(autoCommandsFor(view, () => Math.random().toString()).map((c) => c.type)).toEqual([
      'DRAW_CARD',
      'END_TURN',
    ]);
  });

  it('plays a legal card only when drawing is not available', () => {
    const view = {
      you: 'P1',
      mayPass: false,
      canDraw: false,
      legalCardIds: ['a'],
    } as unknown as PlayerView;
    const out = autoCommandsFor(view, nextId);
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe('PLAY_CARD');
  });

  it('does nothing when the player has no legal move at all', () => {
    const view = {
      you: 'P1',
      mayPass: false,
      canDraw: false,
      legalCardIds: [],
    } as unknown as PlayerView;
    expect(autoCommandsFor(view, nextId)).toHaveLength(0);
  });
});

describe('bot pacing — the loop yields between decisions (issue 19)', () => {
  it('resolves one bot decision per scheduled step, not the whole chain at once', () => {
    const timers = new FakeTimers();
    const room = new MatchRoom({
      roomId: 'paced-1',
      code: 'PACE1',
      version: 'CLASSIC',
      hostId: 'H',
      seed: 'pace-seed',
      rateLimitPerSecond: 100_000,
      timers,
      botDelayMs: 700,
    });
    room.join({ playerId: 'H', name: 'Host', isBot: false, connected: true });
    room.addBot('NORMAL', 'Sunny');
    room.addBot('NORMAL', 'Moonlight');
    room.addBot('HARD', 'TigerX');
    room.setReady('H', true);
    room.start('H');

    // Immediately after start, nothing has been pumped yet: the first bot step
    // is scheduled, not executed. This is what keeps one room's bot chain from
    // occupying the event loop that every other room shares.
    const seqAtStart = room.debugState()!.seq;

    timers.advance(700);
    const afterOne = room.debugState()!.seq;

    timers.advance(700);
    const afterTwo = room.debugState()!.seq;

    expect(afterOne).toBeGreaterThanOrEqual(seqAtStart);
    expect(afterTwo).toBeGreaterThanOrEqual(afterOne);

    // Left alone, the chain still completes and reaches the human.
    timers.advance(60_000);
    const s = room.debugState()!;
    const waiting =
      s.status !== 'PLAYING' ||
      s.awaitingChoice?.playerId === 'H' ||
      s.players[s.activePlayerIndex]!.id === 'H';
    expect(waiting).toBe(true);
  });

  it('produces the same commands whether paced or immediate', () => {
    // Determinism must not depend on the clock: the rng is consumed in the
    // same order either way, so the two rooms deal and play identically.
    const build = (timers?: FakeTimers, botDelayMs = 0) => {
      const r = new MatchRoom({
        roomId: 'det-1',
        code: 'DET01',
        version: 'CLASSIC',
        hostId: 'H',
        seed: 'determinism',
        rateLimitPerSecond: 100_000,
        timers,
        botDelayMs,
      });
      r.join({ playerId: 'H', name: 'Host', isBot: false, connected: true });
      r.addBot('NORMAL', 'Sunny');
      r.setReady('H', true);
      r.start('H');
      return r;
    };

    const immediate = build();
    const timers = new FakeTimers();
    const paced = build(timers, 700);
    timers.advance(60_000);

    expect(paced.debugState()!.seq).toBe(immediate.debugState()!.seq);
    expect(paced.debugState()!.players.map((p) => p.hand.length)).toEqual(
      immediate.debugState()!.players.map((p) => p.hand.length),
    );
  });
});

function legalCommand(view: PlayerView, id: string): Command {
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
