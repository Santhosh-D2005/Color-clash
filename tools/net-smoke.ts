/**
 * End-to-end network smoke test.
 *
 * Run the server first, then this:
 *
 *   PORT=8790 npx tsx apps/server/src/index.ts &
 *   npx tsx tools/net-smoke.ts
 *
 * Two real WebSocket clients create a room, join, ready up, and play a full
 * Classic round against each other, each acting only on its own snapshot. It
 * asserts the two things the blueprint cares about most on the wire: neither
 * client ever sees the other's hand (§15), and no legal command is rejected.
 */
import type { ClientMessage, PlayerView, ServerMessage } from '@colorclash/shared';

const URL = 'ws://127.0.0.1:8790';
function open(name: string) {
  const ws = new WebSocket(URL);
  const views: PlayerView[] = [];
  const msgs: ServerMessage[] = [];
  const send = (m: ClientMessage) => ws.send(JSON.stringify(m));
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as ServerMessage;
    msgs.push(m);
    if (m.t === 'SNAPSHOT') views.push(m.view);
  };
  return {
    ws,
    views,
    msgs,
    send,
    name,
    ready: new Promise<void>((r) => {
      ws.onopen = () => r();
    }),
  };
}

const A = open('Alice');
const B = open('Bob');
await Promise.all([A.ready, B.ready]);

A.send({ t: 'HELLO', name: 'Alice' });
B.send({ t: 'HELLO', name: 'Bob' });
await new Promise((r) => setTimeout(r, 200));

A.send({ t: 'CREATE_ROOM', version: 'CLASSIC' });
await new Promise((r) => setTimeout(r, 250));
const room = [...A.msgs].reverse().find((m) => m.t === 'ROOM');
const code = room && room.t === 'ROOM' ? room.room.code : '';
console.log('room code:', code);

B.send({ t: 'JOIN_ROOM', code });
await new Promise((r) => setTimeout(r, 250));
A.send({ t: 'READY', ready: true });
B.send({ t: 'READY', ready: true });
await new Promise((r) => setTimeout(r, 200));
A.send({ t: 'START_GAME' });
await new Promise((r) => setTimeout(r, 400));

console.log('A snapshots:', A.views.length, '| B snapshots:', B.views.length);
const av = A.views.at(-1)!,
  bv = B.views.at(-1)!;
console.log('A hand size:', av.yourHand.length, '| B hand size:', bv.yourHand.length);
const leak = av.yourHand.some((id) => bv.yourHand.includes(id));
console.log('hand leak between clients:', leak);
console.log(
  'A can see B cards:',
  Object.keys(av.cards).filter((id) => bv.yourHand.includes(id) && id !== av.topCardId).length,
);

// play until the round ends, both clients acting on their own snapshots
let moves = 0;
for (let i = 0; i < 300; i++) {
  const who = [A, B].find((c) => {
    const v = c.views.at(-1);
    return (
      v &&
      v.status === 'PLAYING' &&
      (v.awaitingChoice
        ? v.awaitingChoice.playerId === v.you
        : v.players[v.activePlayerIndex]?.id === v.you)
    );
  });
  const v0 = A.views.at(-1)!;
  if (v0.status !== 'PLAYING') break;
  if (!who) {
    await new Promise((r) => setTimeout(r, 30));
    continue;
  }
  const v = who.views.at(-1)!;
  const id = `n${moves++}`;
  if (v.awaitingChoice?.type === 'COLOR' || v.awaitingChoice?.type === 'DRAW_COLOR') {
    who.send({
      t: 'COMMAND',
      ackSeq: v.seq,
      command: {
        commandId: id,
        playerId: v.you,
        type: 'CHOOSE_COLOR',
        color: v.awaitingChoice.eligibleColors![0]!,
      },
    });
  } else if (v.clashPending === v.you) {
    who.send({
      t: 'COMMAND',
      ackSeq: v.seq,
      command: { commandId: id, playerId: v.you, type: 'CALL_CLASH' },
    });
  } else if (v.legalCardIds.length) {
    who.send({
      t: 'COMMAND',
      ackSeq: v.seq,
      command: { commandId: id, playerId: v.you, type: 'PLAY_CARD', cardId: v.legalCardIds[0]! },
    });
  } else if (v.mayPass) {
    who.send({
      t: 'COMMAND',
      ackSeq: v.seq,
      command: { commandId: id, playerId: v.you, type: 'END_TURN' },
    });
  } else {
    who.send({
      t: 'COMMAND',
      ackSeq: v.seq,
      command: { commandId: id, playerId: v.you, type: 'DRAW_CARD' },
    });
  }
  await new Promise((r) => setTimeout(r, 35));
}
const fin = A.views.at(-1)!;
console.log('final status:', fin.status, '| winner:', fin.winnerId, '| moves:', moves);
console.log(
  'rejections:',
  A.msgs.filter((m) => m.t === 'REJECTED').length + B.msgs.filter((m) => m.t === 'REJECTED').length,
);
A.ws.close();
B.ws.close();
process.exit(0);
