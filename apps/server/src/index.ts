import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import {
  createRng,
  type ClientMessage,
  type PlayerId,
  type ServerMessage,
} from '@colorclash/shared';
import { BOT_NAMES } from '@colorclash/ai';
import { EMOTE_COOLDOWN_MS, isEmoteId } from '@colorclash/game-content';
import { MatchRoom, makeRoomCode } from './room.js';
import { RoomStore } from './store.js';
import { REAL_TIMERS } from './timers.js';
import { createWsServer, type WsConnection } from './websocket.js';

/**
 * Match server entry point — §10.
 *
 * Owns the room registry and the socket plumbing; every rule decision goes
 * through MatchRoom, which goes through the shared engine. There is no game
 * logic in this file by design (§4.2).
 */

const PORT = Number(process.env.PORT ?? 8787);
/**
 * Where to find a built client to serve.
 *
 * Two builds can produce one: `npm run build:web` writes the Vite output to
 * apps/client/dist, and `npm run build:pwa` adds a manifest, icons and a
 * service worker to that same output in dist/pwa. The server takes whichever
 * exists, preferring the web build, so a developer who ran either one gets a
 * working server instead of a 404 and no explanation.
 */
const CLIENT_DIRS = [
  resolve(import.meta.dirname, '../../client/dist'),
  resolve(import.meta.dirname, '../../../dist/pwa'),
];
const CLIENT_DIR = CLIENT_DIRS.find((dir) => existsSync(dir)) ?? CLIENT_DIRS[0]!;
const DATA_DIR = process.env.CLASH_DATA_DIR ?? resolve(import.meta.dirname, '../../../data/rooms');

/**
 * How long a player has to act before the server acts for them.
 *
 * This is the fix for the single worst online failure mode: one player closing
 * a laptop and every other player at the table waiting forever. Set to 0 to
 * disable it entirely.
 */
const TURN_TIMEOUT_MS = Number(process.env.CLASH_TURN_TIMEOUT_MS ?? 30_000);

/**
 * Gap between two visible bot moves. Doubles as the yield that stops one
 * room's bot chain from monopolising the event loop.
 */
const BOT_DELAY_MS = Number(process.env.CLASH_BOT_DELAY_MS ?? 700);

const rng = createRng(`server-${Date.now()}`);
const rooms = new Map<string, MatchRoom>();
const roomsByCode = new Map<string, string>();
const store = new RoomStore({ dir: DATA_DIR });

/** Every room is built the same way, whether it is new or restored from disk. */
const roomRuntime = {
  timers: REAL_TIMERS,
  botDelayMs: BOT_DELAY_MS,
  turnTimeoutMs: TURN_TIMEOUT_MS,
  onChange: (room: MatchRoom) => store.save(room.persist()),
};

type Session = {
  conn: WsConnection;
  playerId: PlayerId;
  name: string;
  avatar?: string;
  roomId?: string;
  unsubscribe?: () => void;
  /** Last emote timestamp, for the per-player cooldown. */
  lastEmoteAt?: number;
};

const sessions = new Map<string, Session>();

/**
 * A room is not destroyed the instant its last socket drops.
 *
 * A brief network blip can disconnect every client at once — a flaky wifi
 * router, a laptop lid, a phone changing cells. Reaping immediately would
 * delete a live match that everyone is about to reconnect to, which is exactly
 * the case §10.1's reconnect handling exists to survive. So an empty room is
 * held for a grace period and reaped only if nobody comes back.
 */
const ROOM_GRACE_MS = 90_000;
const reapers = new Map<string, number>();

function scheduleReap(room: MatchRoom): void {
  cancelReap(room.roomId);
  const timer = setTimeout(() => {
    reapers.delete(room.roomId);
    // Re-check: someone may have rejoined between the timer and now.
    if (room.info().seats.some((s) => s.connected && !s.isBot)) return;
    room.close('everyone left');
    rooms.delete(room.roomId);
    roomsByCode.delete(room.code);
    store.remove(room.roomId);
  }, ROOM_GRACE_MS) as unknown as number;
  reapers.set(room.roomId, timer);
}

/**
 * Restart recovery.
 *
 * A deploy used to end every match in progress. Now the saved seed and command
 * log are replayed through the same reducer that produced them, so a player who
 * reconnects after a restart lands back in the same match, on the same turn,
 * holding the same cards.
 */
function restoreRooms(): void {
  let restored = 0;
  for (const data of store.loadAll()) {
    try {
      const room = MatchRoom.restore(data, roomRuntime);
      rooms.set(room.roomId, room);
      roomsByCode.set(room.code, room.roomId);
      // Nobody is connected yet, so the grace window starts now: a match
      // nobody comes back to is reaped exactly like an abandoned live one.
      scheduleReap(room);
      restored += 1;
    } catch (e) {
      console.error(`Could not restore room ${data.roomId}: ${(e as Error).message}`);
      store.remove(data.roomId);
    }
  }
  if (restored > 0)
    console.log(`Restored ${restored} match${restored === 1 ? '' : 'es'} from disk`);
}

function cancelReap(roomId: string): void {
  const timer = reapers.get(roomId);
  if (timer !== undefined) {
    clearTimeout(timer);
    reapers.delete(roomId);
  }
}

const server = createWsServer();

server.onHttp((url) => {
  if (!existsSync(CLIENT_DIR)) return undefined;
  const clean = url.split('?')[0] ?? '/';
  const path = clean === '/' ? '/index.html' : clean;
  const file = join(CLIENT_DIR, path);
  if (!file.startsWith(CLIENT_DIR)) return undefined; // path traversal guard
  if (!existsSync(file)) {
    // SPA fallback
    const index = join(CLIENT_DIR, 'index.html');
    if (!existsSync(index)) return undefined;
    return { body: readFileSync(index), type: 'text/html; charset=utf-8' };
  }
  return { body: readFileSync(file), type: contentType(file) };
});

function contentType(file: string): string {
  const map: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
  };
  return map[extname(file)] ?? 'application/octet-stream';
}

server.onConnection((conn) => {
  const session: Session = { conn, playerId: '', name: 'Player' };
  sessions.set(conn.id, session);

  const send = (msg: ServerMessage) => conn.send(JSON.stringify(msg));

  conn.on('message', (raw: string) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      send({ t: 'ERROR', message: 'Malformed message' });
      return;
    }
    try {
      handle(session, msg, send);
    } catch (e) {
      send({ t: 'ERROR', message: (e as Error).message });
    }
  });

  conn.on('close', () => {
    const room = session.roomId ? rooms.get(session.roomId) : undefined;
    session.unsubscribe?.();
    if (room && session.playerId) {
      // §10.1: a disconnect keeps the seat so the player can resync.
      room.leave(session.playerId);
      if (room.info().seats.every((s) => !s.connected || s.isBot)) {
        scheduleReap(room);
      }
    }
    sessions.delete(conn.id);
  });
});

function handle(session: Session, msg: ClientMessage, send: (m: ServerMessage) => void): void {
  switch (msg.t) {
    case 'HELLO': {
      session.playerId = msg.playerId ?? `p-${rng.int(1e9).toString(36)}`;
      session.name = msg.name;
      session.avatar = msg.avatar;
      send({ t: 'WELCOME', playerId: session.playerId });
      return;
    }

    case 'CREATE_ROOM': {
      const roomId = `r-${rng.int(1e9).toString(36)}`;
      const code = uniqueCode();
      const room = new MatchRoom({
        roomId,
        code,
        version: msg.version,
        hostId: session.playerId,
        config: msg.config,
        maxSeats: msg.maxSeats,
        ...roomRuntime,
      });
      rooms.set(roomId, room);
      roomsByCode.set(code, roomId);
      attach(session, room, send);
      room.join({
        playerId: session.playerId,
        name: session.name,
        isBot: false,
        connected: true,
        avatar: session.avatar,
      });
      return;
    }

    case 'JOIN_ROOM': {
      const roomId = roomsByCode.get(msg.code.toUpperCase());
      const room = roomId ? rooms.get(roomId) : undefined;
      if (!room) {
        send({ t: 'ERROR', message: 'No room with that code' });
        return;
      }
      cancelReap(room.roomId);
      attach(session, room, send);
      room.join({
        playerId: session.playerId,
        name: session.name,
        isBot: false,
        connected: true,
        avatar: session.avatar,
      });
      return;
    }

    case 'LEAVE_ROOM': {
      const room = currentRoom(session);
      room?.leave(session.playerId);
      session.unsubscribe?.();
      session.roomId = undefined;
      return;
    }

    case 'ADD_BOT': {
      const room = requireRoom(session);
      const taken = new Set(room.info().seats.map((s) => s.name));
      const name = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${room.info().seats.length}`;
      room.addBot(msg.tier, name);
      return;
    }

    case 'REMOVE_SEAT':
      requireRoom(session).removeSeat(msg.playerId);
      return;

    case 'SET_CONFIG':
      requireRoom(session).setConfig(session.playerId, msg.config);
      return;

    case 'SET_VERSION':
      requireRoom(session).setVersion(session.playerId, msg.version);
      return;

    case 'READY':
      requireRoom(session).setReady(session.playerId, msg.ready);
      return;

    case 'START_GAME':
      requireRoom(session).start(session.playerId);
      return;

    case 'COMMAND': {
      const room = requireRoom(session);
      // §10.1: a client may only ever act as itself.
      if (msg.command.playerId !== session.playerId) {
        send({ t: 'ERROR', message: 'Command playerId does not match session' });
        return;
      }
      room.submit(msg.command, msg.ackSeq);
      return;
    }

    case 'RESYNC': {
      const room = requireRoom(session);
      const { view, missed } = room.resync(session.playerId, msg.sinceSeq);
      if (view) send({ t: 'SNAPSHOT', view });
      if (missed.length > 0) send({ t: 'EVENTS', seq: view?.seq ?? 0, events: missed });
      return;
    }

    case 'CHAT': {
      // There is no chat UI in the client, and the config flag that used to
      // gate this was never read by anything that could turn it off. The
      // transport stays — the protocol message is still the right shape if a
      // chat surface is ever built — but nothing in the app sends one today.
      const room = requireRoom(session);
      broadcast(room, {
        t: 'CHAT',
        playerId: session.playerId,
        name: session.name,
        text: msg.text.slice(0, 240),
        at: Date.now(),
      });
      return;
    }

    case 'EMOTE': {
      const room = requireRoom(session);
      // Unknown ids are dropped, not echoed: the client renders whatever it is
      // sent, so the closed vocabulary has to be enforced here, on the server.
      if (!isEmoteId(msg.emote)) return;
      const now = Date.now();
      if (session.lastEmoteAt && now - session.lastEmoteAt < EMOTE_COOLDOWN_MS) return;
      session.lastEmoteAt = now;
      broadcast(room, {
        t: 'EMOTE',
        playerId: session.playerId,
        name: session.name,
        emote: msg.emote,
        at: now,
      });
      return;
    }
  }
}

function attach(session: Session, room: MatchRoom, send: (m: ServerMessage) => void): void {
  session.unsubscribe?.();
  session.roomId = room.roomId;
  session.unsubscribe = room.subscribe((e) => {
    switch (e.t) {
      case 'ROOM':
        send({ t: 'ROOM', room: e.room });
        break;
      case 'SNAPSHOT':
        // Each connection receives only its own view (§15).
        if (e.playerId === session.playerId) send({ t: 'SNAPSHOT', view: e.view });
        break;
      case 'EVENTS':
        send({ t: 'EVENTS', seq: e.seq, events: e.events });
        break;
      case 'REJECTED':
        if (e.playerId === session.playerId) {
          send({ t: 'REJECTED', commandId: e.commandId, reason: e.reason, seq: e.seq });
        }
        break;
      case 'ROOM_CLOSED':
        send({ t: 'ROOM_CLOSED', reason: e.reason });
        break;
    }
  });
}

function broadcast(room: MatchRoom, msg: ServerMessage): void {
  for (const s of sessions.values()) {
    if (s.roomId === room.roomId) s.conn.send(JSON.stringify(msg));
  }
}

function currentRoom(session: Session): MatchRoom | undefined {
  return session.roomId ? rooms.get(session.roomId) : undefined;
}

function requireRoom(session: Session): MatchRoom {
  const room = currentRoom(session);
  if (!room) throw new Error('Not in a room');
  return room;
}

function uniqueCode(): string {
  for (let i = 0; i < 50; i++) {
    const code = makeRoomCode(rng);
    if (!roomsByCode.has(code)) return code;
  }
  throw new Error('Could not allocate a room code');
}

restoreRooms();

server.listen(PORT, () => {
  console.log(`Color Clash match server listening on http://localhost:${PORT}`);
  console.log(
    `  turn timer ${TURN_TIMEOUT_MS > 0 ? `${TURN_TIMEOUT_MS / 1000}s` : 'disabled'} · ` +
      `bot pacing ${BOT_DELAY_MS}ms · state in ${DATA_DIR}`,
  );
  if (existsSync(CLIENT_DIR)) console.log(`Serving client build from ${CLIENT_DIR}`);
});

// A restart should not cost the last few commands of a live match.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    store.flush();
    process.exit(0);
  });
}
