import type {
  BotTier,
  ClientMessage,
  Command,
  CommandInput,
  GameEvent,
  GameVersion,
  MatchConfig,
  PlayerId,
  PlayerView,
  RoomInfo,
  ServerMessage,
} from '@colorclash/shared';

/**
 * The client half of the §10 protocol.
 *
 * Everything about *rules* lives on the server. This class only:
 *   - keeps a socket alive, reconnecting with backoff
 *   - stamps every command with a unique commandId and the last-seen sequence
 *     number, which is what lets the server reject replays and stale commands
 *   - asks for a RESYNC after any reconnect, so a client that missed updates
 *     rebuilds from an authoritative snapshot rather than guessing
 *
 * It deliberately holds no game state of its own beyond the latest snapshot:
 * "Animation state can be rebuilt from authoritative state, but game state
 * cannot be inferred from animation state" (§10.1).
 */

export type ConnectionStatus =
  | 'IDLE'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'CLOSED';

export type NetListeners = {
  onStatus?(status: ConnectionStatus, detail?: string): void;
  onWelcome?(playerId: PlayerId): void;
  onRoom?(room: RoomInfo): void;
  onSnapshot?(view: PlayerView): void;
  onEvents?(events: GameEvent[], seq: number): void;
  onRejected?(commandId: string, reason: string): void;
  /** An emote from any player in the room, including this one. */
  onEmote?(playerId: PlayerId, emote: string): void;
  onError?(message: string): void;
  onRoomClosed?(reason: string): void;
};

/** WebSocket.OPEN, as a literal, so the class does not depend on the global. */
const OPEN = 1;

/** Where the identity is kept so a refresh or a drop resumes the same seat. */
const STORAGE_KEY = 'colorclash.playerId';

/**
 * The room the player was last in.
 *
 * The client already rejoins by code after a dropped socket, but the code
 * lived in memory only — so a reload lost it and the player could not get back
 * to a match the server was still holding their seat in. Storing it costs one
 * key and reuses the rejoin path that already exists.
 */
const ROOM_KEY = 'colorclash.room';

export function loadLastRoom(): string | undefined {
  try {
    return localStorage.getItem(ROOM_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveLastRoom(code: string | undefined): void {
  try {
    if (code) localStorage.setItem(ROOM_KEY, code);
    else localStorage.removeItem(ROOM_KEY);
  } catch {
    /* storage unavailable; rejoin simply is not offered */
  }
}

export function clearLastRoom(): void {
  saveLastRoom(undefined);
}

function loadPlayerId(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    // Private mode, or storage blocked. A fresh id is a correct fallback —
    // the player simply joins as a new seat.
    return undefined;
  }
}

function savePlayerId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* nothing to do; the id lives in memory for this session */
  }
}

/** Default endpoint: same origin as the page, which is how the server serves it. */
export function defaultServerUrl(): string {
  if (typeof location === 'undefined') return 'ws://localhost:8787';
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  // A dev client on :5173 talks to the match server on :8787.
  const host = location.port === '5173' ? `${location.hostname}:8787` : location.host;
  return `${protocol}//${host}`;
}

/**
 * The slice of the WebSocket API this client uses. Declaring it explicitly
 * lets the tests drive a fake socket without a live server, and keeps the
 * class honest about what it actually depends on.
 */
export type SocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((this: unknown, ev: unknown) => unknown) | null;
  onclose: ((this: unknown, ev: unknown) => unknown) | null;
  onerror: ((this: unknown, ev: unknown) => unknown) | null;
  onmessage: ((this: unknown, ev: { data: unknown }) => unknown) | null;
};

export type SocketFactory = (url: string) => SocketLike;

export class NetClient {
  private ws?: SocketLike;
  private status: ConnectionStatus = 'IDLE';
  private listeners: NetListeners = {};
  private attempt = 0;
  private closedByUs = false;
  private reconnectTimer?: number;

  /** Highest sequence number this client has seen (§10.1 monotonic counter). */
  private lastSeq = 0;
  private commandCounter = 0;

  private playerId: PlayerId = loadPlayerId() ?? '';
  private name = 'Player';
  private avatar?: string;

  /** Set once we are in a room, so a reconnect can rejoin it. */
  private roomCode?: string;
  /** Commands sent but not yet acknowledged by a snapshot — replayed on resync. */
  private pending = new Map<string, Command>();

  constructor(
    private url: string = defaultServerUrl(),
    private factory: SocketFactory = (u) => new WebSocket(u) as unknown as SocketLike,
  ) {}

  /* ---------------- lifecycle ---------------- */

  connect(name: string, avatar?: string): void {
    this.name = name;
    this.avatar = avatar;
    this.closedByUs = false;
    this.open();
  }

  private open(): void {
    this.setStatus(this.attempt === 0 ? 'CONNECTING' : 'RECONNECTING');
    let socket: SocketLike;
    try {
      socket = this.factory(this.url);
    } catch (e) {
      this.scheduleReconnect((e as Error).message);
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.setStatus('CONNECTED');
      // Re-announce with the same id so the server returns us to our seat.
      this.send({
        t: 'HELLO',
        name: this.name,
        avatar: this.avatar,
        playerId: this.playerId || undefined,
      });
      if (this.roomCode) {
        this.send({ t: 'JOIN_ROOM', code: this.roomCode });
        this.send({ t: 'RESYNC', sinceSeq: this.lastSeq });
        // Anything we sent but never saw acknowledged goes again. The server
        // ignores a replayed commandId, so this is safe by construction.
        for (const command of this.pending.values()) {
          this.send({ t: 'COMMAND', command, ackSeq: this.lastSeq });
        }
      }
    };

    socket.onmessage = (event: { data: unknown }) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handle(msg);
    };

    socket.onclose = () => {
      if (this.closedByUs) {
        this.setStatus('CLOSED');
        return;
      }
      this.scheduleReconnect('connection lost');
    };

    socket.onerror = () => {
      // `onclose` always follows, which is where reconnect is scheduled.
    };
  }

  /** Exponential backoff, capped, so a downed server is not hammered. */
  private scheduleReconnect(detail: string): void {
    this.setStatus('RECONNECTING', detail);
    const delay = Math.min(500 * 2 ** this.attempt, 8000);
    this.attempt += 1;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.open(), delay) as unknown as number;
  }

  disconnect(): void {
    this.closedByUs = true;
    clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.setStatus('CLOSED');
  }

  on(listeners: NetListeners): void {
    this.listeners = { ...this.listeners, ...listeners };
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  get id(): PlayerId {
    return this.playerId;
  }

  private setStatus(status: ConnectionStatus, detail?: string): void {
    this.status = status;
    this.listeners.onStatus?.(status, detail);
  }

  /* ---------------- inbound ---------------- */

  private handle(msg: ServerMessage): void {
    switch (msg.t) {
      case 'WELCOME':
        this.playerId = msg.playerId;
        savePlayerId(msg.playerId);
        this.listeners.onWelcome?.(msg.playerId);
        break;

      case 'ROOM':
        this.roomCode = msg.room.code;
        saveLastRoom(this.roomCode);
        this.listeners.onRoom?.(msg.room);
        break;

      case 'SNAPSHOT':
        // A snapshot is the acknowledgement: anything at or below its sequence
        // number has landed, so it no longer needs replaying.
        this.lastSeq = Math.max(this.lastSeq, msg.view.seq);
        this.pending.clear();
        this.listeners.onSnapshot?.(msg.view);
        break;

      case 'EVENTS':
        this.lastSeq = Math.max(this.lastSeq, msg.seq);
        this.listeners.onEvents?.(msg.events, msg.seq);
        break;

      case 'REJECTED':
        this.pending.delete(msg.commandId);
        this.listeners.onRejected?.(msg.commandId, msg.reason);
        break;

      case 'EMOTE':
        this.listeners.onEmote?.(msg.playerId, msg.emote);
        break;

      case 'ROOM_CLOSED':
        this.roomCode = undefined;
        saveLastRoom(undefined);
        this.listeners.onRoomClosed?.(msg.reason);
        break;

      case 'ERROR':
        this.listeners.onError?.(msg.message);
        break;

      default:
        break;
    }
  }

  /* ---------------- outbound ---------------- */

  private send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  createRoom(version: GameVersion, config?: Partial<MatchConfig>): void {
    this.send({ t: 'CREATE_ROOM', version, config });
  }

  joinRoom(code: string): void {
    this.roomCode = code.toUpperCase();
    this.send({ t: 'JOIN_ROOM', code: this.roomCode });
  }

  leaveRoom(): void {
    saveLastRoom(undefined);
    this.roomCode = undefined;
    this.send({ t: 'LEAVE_ROOM' });
  }

  addBot(tier: BotTier): void {
    this.send({ t: 'ADD_BOT', tier });
  }

  removeSeat(playerId: PlayerId): void {
    this.send({ t: 'REMOVE_SEAT', playerId });
  }

  setConfig(config: Partial<MatchConfig>): void {
    this.send({ t: 'SET_CONFIG', config });
  }

  setVersion(version: GameVersion): void {
    this.send({ t: 'SET_VERSION', version });
  }

  setReady(ready: boolean): void {
    this.send({ t: 'READY', ready });
  }

  startGame(): void {
    this.send({ t: 'START_GAME' });
  }

  chat(text: string): void {
    this.send({ t: 'CHAT', text });
  }

  /**
   * Emotes are fire-and-forget: no commandId, no retry queue, no place in the
   * pending map. A dropped emote is a dropped emote, which is the correct
   * amount of engineering for a smiley — and the reason it can never interact
   * with the command idempotency that matters.
   */
  sendEmote(emote: string): void {
    this.send({ t: 'EMOTE', emote });
  }

  /**
   * Sends a game command. The commandId makes the send idempotent, so a retry
   * after a dropped acknowledgement cannot apply the move twice (§10.1).
   */
  submit(input: CommandInput): void {
    const command = {
      ...input,
      playerId: this.playerId,
      commandId: `${this.playerId}-${this.commandCounter++}`,
    } as Command;
    this.pending.set(command.commandId, command);
    this.send({ t: 'COMMAND', command, ackSeq: this.lastSeq });
  }

  /** Exposed for tests and diagnostics. */
  get unacknowledged(): number {
    return this.pending.size;
  }

  get seq(): number {
    return this.lastSeq;
  }
}
