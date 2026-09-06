import type { ClientMessage, PlayerView, ServerMessage } from '@colorclash/shared';
import { describe, expect, it } from '@colorclash/test-fixtures';
import { NetClient, type SocketLike } from './net.js';

/**
 * Client-side protocol tests — the other half of apps/server/src/room.test.ts.
 *
 * The server's contract is that a replayed commandId is applied once and a
 * stale sequence number is rejected. These tests pin the client behaviour that
 * makes that contract usable: every command carries a fresh id and the last
 * seen sequence number, unacknowledged commands are replayed after a
 * reconnect, and a reconnect always asks for a RESYNC.
 */

class FakeSocket implements SocketLike {
  readyState = 1;
  sent: ClientMessage[] = [];
  onopen: ((ev: unknown) => unknown) | null = null;
  onclose: ((ev: unknown) => unknown) | null = null;
  onerror: ((ev: unknown) => unknown) | null = null;
  onmessage: ((ev: { data: unknown }) => unknown) | null = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  close(): void {
    this.readyState = 3;
  }

  /* --- test drivers --- */
  open(): void {
    this.onopen?.({});
  }
  deliver(msg: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop(): void {
    this.readyState = 3;
    this.onclose?.({});
  }
  ofType<T extends ClientMessage['t']>(t: T): Array<Extract<ClientMessage, { t: T }>> {
    return this.sent.filter((m) => m.t === t) as Array<Extract<ClientMessage, { t: T }>>;
  }
}

function harness() {
  const sockets: FakeSocket[] = [];
  const client = new NetClient('ws://test', () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  });
  return { client, sockets, latest: () => sockets[sockets.length - 1]! };
}

function view(over: Partial<PlayerView> = {}): PlayerView {
  return {
    gameId: 'g',
    version: 'CLASSIC',
    status: 'PLAYING',
    players: [],
    you: 'P1',
    yourHand: [],
    cards: {},
    drawPileCount: 50,
    discardCount: 1,
    activePlayerIndex: 0,
    direction: 1,
    pendingDraw: 0,
    minimumResponsePenalty: 0,
    clashPending: null,
    roundNumber: 1,
    seq: 1,
    config: {
      winCondition: 'ONE_ROUND',
      drawRule: 'DRAW_ONE',
      stacking: false,
      challengeWildDrawFour: false,
      clashPenaltyCards: 2,
      eliminationThreshold: 25,
      clashGraceMs: 0,
      scoringMode: 'STANDARD',
      tableTheme: 'ocean',
    },
    stats: {
      cardsPlayed: 0,
      actionCardsPlayed: 0,
      clashCalls: 0,
      penaltiesDrawn: 0,
      startedAt: 0,
    },
    legalCardIds: [],
    canDraw: false,
    mayPass: false,
    ...over,
  };
}

describe('NetClient — client half of the §10 protocol', () => {
  it('announces itself on connect', () => {
    const { client, latest } = harness();
    client.connect('Alice');
    latest().open();
    const hello = latest().ofType('HELLO');
    expect(hello).toHaveLength(1);
    expect(hello[0]!.name).toBe('Alice');
  });

  it('stamps every command with a unique id and the last seen sequence', () => {
    const { client, latest } = harness();
    client.connect('Alice');
    latest().open();
    latest().deliver({ t: 'WELCOME', playerId: 'P1' });
    latest().deliver({ t: 'SNAPSHOT', view: view({ seq: 7 }) });

    client.submit({ type: 'DRAW_CARD', playerId: 'P1' });
    client.submit({ type: 'CALL_CLASH', playerId: 'P1' });

    const commands = latest().ofType('COMMAND');
    expect(commands).toHaveLength(2);
    expect(commands[0]!.ackSeq).toBe(7);
    expect(commands[0]!.command.playerId).toBe('P1');
    // Unique ids are what make the server's replay rejection meaningful.
    expect(commands[0]!.command.commandId).not.toBe(commands[1]!.command.commandId);
  });

  it('treats a snapshot as the acknowledgement and clears pending commands', () => {
    const { client, latest } = harness();
    client.connect('Alice');
    latest().open();
    latest().deliver({ t: 'WELCOME', playerId: 'P1' });

    client.submit({ type: 'DRAW_CARD', playerId: 'P1' });
    expect(client.unacknowledged).toBe(1);

    latest().deliver({ t: 'SNAPSHOT', view: view({ seq: 3 }) });
    expect(client.unacknowledged).toBe(0);
    expect(client.seq).toBe(3);
  });

  it('drops a rejected command from the pending set rather than replaying it', () => {
    const { client, latest } = harness();
    client.connect('Alice');
    latest().open();
    latest().deliver({ t: 'WELCOME', playerId: 'P1' });

    client.submit({ type: 'DRAW_CARD', playerId: 'P1' });
    const id = latest().ofType('COMMAND')[0]!.command.commandId;
    expect(client.unacknowledged).toBe(1);

    latest().deliver({ t: 'REJECTED', commandId: id, reason: 'NOT_YOUR_TURN', seq: 3 });
    expect(client.unacknowledged).toBe(0);
  });

  it('surfaces a rejection reason to the UI', () => {
    const { client, latest } = harness();
    const seen: string[] = [];
    client.on({ onRejected: (_id, why) => seen.push(why) });
    client.connect('Alice');
    latest().open();
    latest().deliver({ t: 'WELCOME', playerId: 'P1' });
    client.submit({ type: 'DRAW_CARD', playerId: 'P1' });
    const id = latest().ofType('COMMAND')[0]!.command.commandId;
    latest().deliver({ t: 'REJECTED', commandId: id, reason: 'MUST_ANSWER_PENALTY', seq: 4 });
    expect(seen).toEqual(['MUST_ANSWER_PENALTY']);
  });

  it('never lowers its sequence number', () => {
    const { client, latest } = harness();
    client.connect('Alice');
    latest().open();
    latest().deliver({ t: 'SNAPSHOT', view: view({ seq: 9 }) });
    latest().deliver({ t: 'EVENTS', seq: 4, events: [] });
    expect(client.seq).toBe(9);
  });

  it('reports connection state transitions', () => {
    const { client, latest } = harness();
    const states: string[] = [];
    client.on({ onStatus: (s) => states.push(s) });
    client.connect('Alice');
    latest().open();
    expect(states).toContain('CONNECTING');
    expect(states).toContain('CONNECTED');
    client.disconnect();
    expect(states).toContain('CLOSED');
  });

  it('rejoins, resyncs and replays unacknowledged commands after a drop', async () => {
    const { client, sockets, latest } = harness();
    client.connect('Alice');
    latest().open();
    latest().deliver({ t: 'WELCOME', playerId: 'P1' });
    latest().deliver({
      t: 'ROOM',
      room: {
        roomId: 'r1',
        code: 'ABCDE',
        version: 'CLASSIC',
        config: view().config,
        seats: [],
        hostId: 'P1',
        status: 'PLAYING',
        maxSeats: 4,
      },
    });
    latest().deliver({ t: 'SNAPSHOT', view: view({ seq: 12 }) });

    // A command goes out and is never acknowledged before the socket dies.
    client.submit({ type: 'DRAW_CARD', playerId: 'P1' });
    const inFlight = latest().ofType('COMMAND')[0]!.command.commandId;
    expect(client.unacknowledged).toBe(1);

    latest().drop();
    // Backoff is 500ms on the first attempt.
    await new Promise((r) => setTimeout(r, 700));
    expect(sockets.length).toBe(2);

    const revived = latest();
    revived.open();

    // Same identity, same room, and a resync from where we left off.
    expect(revived.ofType('HELLO')[0]!.playerId).toBe('P1');
    expect(revived.ofType('JOIN_ROOM')[0]!.code).toBe('ABCDE');
    expect(revived.ofType('RESYNC')[0]!.sinceSeq).toBe(12);

    // The in-flight command is replayed with the same id, so the server's
    // idempotency check decides whether it already landed.
    const replayed = revived.ofType('COMMAND');
    expect(replayed).toHaveLength(1);
    expect(replayed[0]!.command.commandId).toBe(inFlight);

    client.disconnect();
  });

  it('does not reconnect after an intentional disconnect', async () => {
    const { client, sockets, latest } = harness();
    client.connect('Alice');
    latest().open();
    client.disconnect();
    latest().drop();
    await new Promise((r) => setTimeout(r, 700));
    expect(sockets.length).toBe(1);
  });
});
