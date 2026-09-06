import {
  RuleError,
  createRng,
  type BotTier,
  type Command,
  type GameEvent,
  type GameState,
  type GameVersion,
  type MatchConfig,
  type PlayerId,
  type PlayerView,
  type RoomInfo,
  type RoomSeat,
  type RngLike,
} from '@colorclash/shared';
import { configFor, VERSION_META } from '@colorclash/game-content';
import { buildPlayerView, cloneState, createMatch, getManifest, reduce } from '@colorclash/game-engine';
import { decide } from '@colorclash/ai';
import { INLINE_TIMERS, type TimerHandle, type Timers } from './timers.js';

/**
 * Authoritative match room — §10.
 *
 *   Client -> Command -> Server validates -> Engine reduce() -> Events ->
 *   Server broadcasts snapshot/delta -> Clients animate
 *
 * The room owns the only authoritative GameState. It never trusts a client's
 * view of legality (§10.1), it rejects replayed commandIds and stale sequence
 * numbers (§15), and it hands each connection only its own PlayerView.
 *
 * This class is transport-agnostic on purpose: it has no socket, no timers and
 * no I/O, so the whole reconnect/duplicate/stale surface is unit-testable
 * without opening a port.
 */

export type RoomEvent =
  | { t: 'ROOM'; room: RoomInfo }
  | { t: 'SNAPSHOT'; playerId: PlayerId; view: PlayerView }
  | { t: 'EVENTS'; seq: number; events: GameEvent[] }
  | { t: 'REJECTED'; playerId: PlayerId; commandId: string; reason: string; seq: number }
  | { t: 'ROOM_CLOSED'; reason: string };

type HistoryEntry = { seq: number; events: GameEvent[] };

/**
 * Everything needed to rebuild a live match from nothing.
 *
 * The engine is a pure reducer over a seeded deal, so the whole of a match is
 * recoverable from its seed plus the ordered list of commands that were
 * accepted. That is what gets written to disk: no board state, no hands, no
 * derived values that could drift out of step with the code that produced them.
 */
export type PersistedRoom = {
  /** Bumped when the shape below changes, so an old file is discarded rather than misread. */
  format: 2;
  roomId: string;
  code: string;
  version: GameVersion;
  config: MatchConfig;
  maxSeats: number;
  hostId: PlayerId;
  seed: string;
  roundCount: number;
  seats: RoomSeat[];
  /** The seed the current match was dealt from, or undefined if still in the lobby. */
  matchSeed?: string;
  /**
   * A periodic checkpoint of the rebuilt state.
   *
   * Without one, the command log grew for the life of the room and the whole
   * thing was rewritten on every single move. With one, replay starts here and
   * only the commands since are kept, so both the file and the work stay
   * bounded however long a match runs.
   *
   * The checkpoint is still produced by the same reducer from the same seed, so
   * this changes how much is stored, never what the match is.
   */
  checkpoint?: { seq: number; state: GameState };
  /** Accepted commands since the checkpoint, in the order the engine applied them. */
  commands: Command[];
  savedAt: number;
};

export const PERSIST_FORMAT = 2;

/**
 * Commands between checkpoints.
 *
 * Small enough that a file stays small and a replay stays quick; large enough
 * that a checkpoint is not written on every other move.
 */
export const CHECKPOINT_EVERY = 40;

export class MatchRoom {
  readonly roomId: string;
  readonly code: string;
  version: GameVersion;
  config: MatchConfig;
  hostId: PlayerId;
  maxSeats: number;
  /**
   * §15 spam guard: accepted commands per player per rolling second.
   * Configurable so an automated harness can drive a match faster than a human
   * ever could without tripping it — the guard exists to stop abuse, not to
   * make tests time-dependent.
   */
  readonly rateLimitPerSecond: number;

  private seats: RoomSeat[] = [];
  private state?: GameState;
  private rng: RngLike;
  /** Accepted commandIds, for idempotency (§10.1). */
  private acceptedCommands = new Set<string>();
  /** Rolling event log so a reconnecting client can catch up (§10.1). */
  private history: HistoryEntry[] = [];
  private listeners: Array<(e: RoomEvent) => void> = [];
  private rateWindow = new Map<PlayerId, number[]>();
  /**
   * The room's base seed. `start()` derives the match seed from this rather
   * than from the clock, so a room created with an explicit seed deals the
   * same cards every time — which is what makes an online match reproducible
   * from a bug report, and what keeps the tests deterministic.
   */
  private readonly seed: string;
  /** Increments per start, so a rematch deals differently but reproducibly. */
  private roundCount = 0;

  /* ---------------- timing ---------------- */

  private readonly timers: Timers;
  /**
   * Wall-clock gap between two visible bot moves.
   *
   * Zero means "resolve the whole bot chain now", which is what every existing
   * test relies on. Production sets a real value for two reasons at once: it
   * gives the table a readable pace instead of teleporting, and it forces the
   * bot loop off the main thread between decisions so one busy room cannot
   * stall another.
   */
  private readonly botDelayMs: number;
  /** Zero disables the turn timer entirely. */
  private readonly turnTimeoutMs: number;
  private botTimer: TimerHandle = null;
  private turnTimer: TimerHandle = null;
  private turnDeadline = 0;
  private turnOwner?: PlayerId;
  /** True while rebuilding from a command log: no bots, no broadcasts, no timers. */
  private replaying = false;
  /** Every accepted command, for persistence and restart recovery. */
  private commandLog: Command[] = [];
  /** State the log replays from, and the seq it was taken at. */
  private checkpoint?: { seq: number; state: GameState };
  private matchSeed?: string;
  private autoCommandSeq = 0;
  private onChange?: (room: MatchRoom) => void;

  constructor(opts: {
    roomId: string;
    code: string;
    version: GameVersion;
    hostId: PlayerId;
    seed?: string;
    config?: Partial<MatchConfig>;
    maxSeats?: number;
    rateLimitPerSecond?: number;
    timers?: Timers;
    botDelayMs?: number;
    turnTimeoutMs?: number;
    /** Called whenever durable state changed and is worth writing out. */
    onChange?: (room: MatchRoom) => void;
  }) {
    this.roomId = opts.roomId;
    this.code = opts.code;
    this.version = opts.version;
    this.hostId = opts.hostId;
    this.config = configFor(opts.version, opts.config);
    this.maxSeats = opts.maxSeats ?? VERSION_META[opts.version].maxPlayers;
    this.rateLimitPerSecond = opts.rateLimitPerSecond ?? 20;
    this.seed = opts.seed ?? `${opts.roomId}:${Date.now()}`;
    this.rng = createRng(this.seed);
    this.timers = opts.timers ?? INLINE_TIMERS;
    this.botDelayMs = opts.botDelayMs ?? 0;
    this.turnTimeoutMs = opts.turnTimeoutMs ?? 0;
    this.onChange = opts.onChange;
  }

  /* ---------------- lifecycle: §10.2 room lifecycle ---------------- */

  subscribe(fn: (e: RoomEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(e: RoomEvent): void {
    for (const l of this.listeners) l(e);
  }

  get status(): RoomInfo['status'] {
    if (!this.state) return 'LOBBY';
    if (this.state.status === 'PLAYING') return 'PLAYING';
    if (this.state.status === 'SETUP') return 'LOBBY';
    return 'ROUND_END';
  }

  info(): RoomInfo {
    return {
      roomId: this.roomId,
      code: this.code,
      version: this.version,
      config: this.config,
      seats: this.seats.map((s) => ({ ...s })),
      hostId: this.hostId,
      status: this.status,
      maxSeats: this.maxSeats,
    };
  }

  join(seat: Omit<RoomSeat, 'ready' | 'isHost'>): RoomSeat {
    const existing = this.seats.find((s) => s.playerId === seat.playerId);
    if (existing) {
      // Reconnect into the same seat rather than creating a duplicate.
      existing.connected = true;
      if (this.state) {
        const p = this.state.players.find((p) => p.id === seat.playerId);
        if (p) p.connected = true;
      }
      this.broadcastRoom();
      return existing;
    }
    // §16.2: "Late join attempt after match has started."
    if (this.state && this.state.status !== 'SETUP') {
      throw new RuleError('MATCH_IN_PROGRESS', 'Cannot join a match that has already started');
    }
    if (this.seats.length >= this.maxSeats) {
      throw new RuleError('ROOM_FULL', `Room is limited to ${this.maxSeats} seats`);
    }
    const created: RoomSeat = {
      ...seat,
      ready: seat.isBot ?? false,
      isHost: this.seats.length === 0 || seat.playerId === this.hostId,
    };
    this.seats.push(created);
    this.broadcastRoom();
    return created;
  }

  leave(playerId: PlayerId): void {
    if (this.state && this.state.status === 'PLAYING') {
      // A live match keeps the seat so the player can reconnect (§10.1).
      const seat = this.seats.find((s) => s.playerId === playerId);
      if (seat) seat.connected = false;
      const p = this.state.players.find((p) => p.id === playerId);
      if (p) p.connected = false;
    } else {
      this.seats = this.seats.filter((s) => s.playerId !== playerId);
      if (playerId === this.hostId && this.seats[0]) {
        this.hostId = this.seats[0].playerId;
        this.seats[0].isHost = true;
      }
    }
    this.broadcastRoom();
  }

  addBot(tier: BotTier, name: string, avatar?: string): RoomSeat {
    return this.join({
      playerId: `bot-${this.seats.length}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      isBot: true,
      botTier: tier,
      connected: true,
      avatar,
    });
  }

  removeSeat(playerId: PlayerId): void {
    if (this.state && this.state.status === 'PLAYING') {
      throw new RuleError('MATCH_IN_PROGRESS');
    }
    this.seats = this.seats.filter((s) => s.playerId !== playerId);
    this.broadcastRoom();
  }

  setReady(playerId: PlayerId, ready: boolean): void {
    const seat = this.seats.find((s) => s.playerId === playerId);
    if (seat) seat.ready = ready;
    this.broadcastRoom();
  }

  setVersion(playerId: PlayerId, version: GameVersion): void {
    this.assertHost(playerId);
    if (this.state && this.state.status === 'PLAYING') throw new RuleError('MATCH_IN_PROGRESS');
    this.version = version;
    this.config = configFor(version, this.config);
    this.maxSeats = VERSION_META[version].maxPlayers;
    this.broadcastRoom();
  }

  setConfig(playerId: PlayerId, patch: Partial<MatchConfig>): void {
    this.assertHost(playerId);
    if (this.state && this.state.status === 'PLAYING') throw new RuleError('MATCH_IN_PROGRESS');
    this.config = { ...this.config, ...patch };
    this.broadcastRoom();
  }

  private assertHost(playerId: PlayerId): void {
    if (playerId !== this.hostId) throw new RuleError('NOT_HOST');
  }

  /** §10.2 START_GAME. */
  start(playerId: PlayerId, seed?: string): void {
    this.assertHost(playerId);
    const manifest = getManifest(this.version);
    if (this.seats.length < manifest.playerLimit.min) {
      throw new RuleError(
        'NOT_ENOUGH_PLAYERS',
        `${this.version} needs at least ${manifest.playerLimit.min} players`,
      );
    }
    if (this.seats.some((s) => !s.ready && !s.isBot)) {
      throw new RuleError('NOT_ALL_READY');
    }

    const matchSeed = seed ?? `${this.seed}:${this.roundCount}`;
    this.roundCount += 1;
    this.rng = createRng(matchSeed);
    const { state, events } = createMatch(
      {
        gameId: this.roomId,
        version: this.version,
        seed: matchSeed,
        config: this.config,
        players: this.seats.map((s) => ({
          id: s.playerId,
          name: s.name,
          isBot: s.isBot,
          botTier: s.botTier,
          avatar: s.avatar,
          connected: s.connected,
        })),
      },
      this.rng,
    );

    this.state = state;
    this.matchSeed = matchSeed;
    this.acceptedCommands.clear();
    this.commandLog = [];
    this.checkpoint = undefined;
    this.history = [{ seq: state.seq, events }];
    this.broadcastRoom();
    this.broadcastEvents(events);
    this.refreshTurnClock();
    this.broadcastSnapshots();
    this.save();
    this.scheduleAfterState();
  }

  /* ---------------- command path: §10.1 ---------------- */

  /**
   * Validates and applies one client command.
   *
   * Rejection is a normal outcome, not an exception on the wire: the caller
   * gets a REJECTED event carrying the current sequence number so the client
   * can resync rather than guess.
   */
  submit(command: Command, ackSeq?: number): { accepted: boolean; reason?: string } {
    const state = this.state;
    if (!state) return this.reject(command, 'NO_MATCH');

    // §15: rate-limit commands to prevent spam and duplicate submissions.
    if (!this.allowRate(command.playerId)) return this.reject(command, 'RATE_LIMITED');

    // §10.1 / §15: reject replayed commandIds. Replaying is *not* an error for
    // the client — it means their retry already landed — so we report success
    // without applying anything twice.
    if (this.acceptedCommands.has(command.commandId)) {
      return { accepted: true, reason: 'DUPLICATE_IGNORED' };
    }

    // §15: reject stale sequence numbers.
    if (ackSeq !== undefined && ackSeq < state.seq) {
      return this.reject(command, 'STALE_SEQUENCE');
    }

    // §10.1: commands include playerId for authorization. A client may only
    // ever act as itself; bots go through the same door.
    const seat = this.seats.find((s) => s.playerId === command.playerId);
    if (!seat) return this.reject(command, 'NOT_IN_ROOM');

    try {
      const result = reduce(state, command, this.rng);
      this.state = result.state;
      this.acceptedCommands.add(command.commandId);
      this.recordCommand(command, result.state);
      this.pushHistory(result.state.seq, result.events);
      this.broadcastEvents(result.events);
      this.refreshTurnClock();
      this.broadcastSnapshots();
      this.save();
      this.scheduleAfterState();
      return { accepted: true };
    } catch (e) {
      const reason = e instanceof RuleError ? e.code : 'ENGINE_ERROR';
      return this.reject(command, reason);
    }
  }

  private reject(command: Command, reason: string): { accepted: false; reason: string } {
    this.emit({
      t: 'REJECTED',
      playerId: command.playerId,
      commandId: command.commandId,
      reason,
      seq: this.state?.seq ?? 0,
    });
    return { accepted: false, reason };
  }

  /** §15: rate-limit — at most `rateLimitPerSecond` commands per player. */
  private allowRate(playerId: PlayerId): boolean {
    const now = Date.now();
    const window = (this.rateWindow.get(playerId) ?? []).filter((t) => now - t < 1000);
    if (window.length >= this.rateLimitPerSecond) {
      this.rateWindow.set(playerId, window);
      return false;
    }
    window.push(now);
    this.rateWindow.set(playerId, window);
    return true;
  }

  /* ---------------- bots ---------------- */

  /**
   * Runs at most one bot decision, then hands control back.
   *
   * The previous version recursed until no bot could act, which meant a room
   * of four bots resolved an entire chain of turns inside one call — invisible
   * to players, and for a long chain, a stall for every other room sharing the
   * event loop. Now each decision is a separate scheduled step, so the loop is
   * free between them.
   *
   * The commands produced are identical either way; only their spacing in time
   * differs. Determinism is unaffected because the rng is consumed in the same
   * order regardless of when the calls happen.
   */
  private pumpBots(guard = 0): void {
    if (this.replaying) return;
    const state = this.state;
    if (!state || state.status !== 'PLAYING' || guard > 400) return;

    for (const seat of this.botCandidates()) {
      const view = buildPlayerView(state, seat.playerId);
      const command = decide(view, seat.botTier ?? 'NORMAL', this.rng);
      if (!command) continue;
      const before = state.seq;
      this.submitBot(command);
      if (this.state!.seq !== before) {
        this.scheduleBotStep(guard + 1);
        return;
      }
    }
    // Nobody could act: the room is waiting on a human, so the turn clock starts.
    this.armTurnTimer();
  }

  private scheduleBotStep(guard = 0): void {
    if (this.replaying) return;
    this.timers.clear(this.botTimer);
    this.botTimer = this.timers.set(() => {
      this.botTimer = null;
      this.pumpBots(guard);
    }, this.nextBotDelay());
  }

  /**
   * Normally the pacing delay. But if a human owes a Clash call, the next
   * action at the table is what settles it and applies the penalty — so the
   * bots wait out `clashGraceMs` first, giving that player the same window they
   * get in a local match. The rule is untouched; only the timing of the next
   * action moves.
   */
  private nextBotDelay(): number {
    const state = this.state;
    if (!state?.clashPending) return this.botDelayMs;
    const owed = state.players.find((p) => p.id === state.clashPending);
    if (!owed || owed.isBot) return this.botDelayMs;
    return Math.max(this.botDelayMs, state.config.clashGraceMs);
  }

  /**
   * Re-arms the turn clock for the new state.
   *
   * Called *before* the snapshot goes out, not after. Arming afterwards meant
   * every snapshot carried the previous turn's clock — or none at all on the
   * first turn — so the countdown never appeared on screen even though the
   * server was timing the turn correctly. The clock is part of the state a
   * client is told about, so it has to exist before the telling.
   */
  private refreshTurnClock(): void {
    if (this.replaying) return;
    const state = this.state;
    if (!state || state.status !== 'PLAYING' || this.hasActingBot()) {
      this.clearTurnTimer();
      return;
    }
    this.armTurnTimer();
  }

  /** Called after the snapshot: decide whether a bot should move next. */
  private scheduleAfterState(): void {
    if (this.replaying) return;
    const state = this.state;
    if (!state || state.status !== 'PLAYING') return;
    if (this.hasActingBot()) {
      this.scheduleBotStep(0);
    } else {
      this.timers.clear(this.botTimer);
      this.botTimer = null;
    }
  }

  private hasActingBot(): boolean {
    return this.botCandidates().length > 0;
  }

  private submitBot(command: Command): void {
    const state = this.state!;
    try {
      const result = reduce(state, command, this.rng);
      this.state = result.state;
      this.acceptedCommands.add(command.commandId);
      this.recordCommand(command, result.state);
      this.pushHistory(result.state.seq, result.events);
      this.broadcastEvents(result.events);
      this.refreshTurnClock();
      this.broadcastSnapshots();
      this.save();
    } catch {
      // A bot that produced an illegal command is a bug, not a cheat attempt.
      // Swallowing here keeps the room alive; the engine state is untouched.
    }
  }

  private botCandidates(): RoomSeat[] {
    const state = this.state!;
    const byId = (id?: PlayerId) => this.seats.find((s) => s.playerId === id && s.isBot);
    if (state.awaitingChoice) {
      const owner = byId(state.awaitingChoice.playerId);
      return owner ? [owner] : [];
    }
    const out: RoomSeat[] = [];
    const clashOwner = byId(state.clashPending ?? undefined);
    if (clashOwner) out.push(clashOwner);
    const active = byId(state.players[state.activePlayerIndex]?.id);
    if (active && !out.includes(active)) out.push(active);
    return out;
  }

  /* ---------------- turn timer ---------------- */

  /**
   * Whoever the match is currently waiting on: the owner of a pending choice
   * if there is one, otherwise the active seat. This is the same rule the bot
   * candidate list uses, so the clock always runs on the seat that is actually
   * blocking play.
   */
  private waitingOn(): PlayerId | undefined {
    const state = this.state;
    if (!state || state.status !== 'PLAYING') return undefined;
    return state.awaitingChoice?.playerId ?? state.players[state.activePlayerIndex]?.id;
  }

  private clearTurnTimer(): void {
    this.timers.clear(this.turnTimer);
    this.turnTimer = null;
    this.turnDeadline = 0;
    this.turnOwner = undefined;
  }

  /**
   * Starts (or restarts) the clock for whoever must act next.
   *
   * Restarting on every state change is the point: the allowance is per
   * decision, so a player who answers a colour prompt and then has to play a
   * card gets a full turn for each, and a player who does nothing gets exactly
   * one allowance before the server acts for them.
   */
  private armTurnTimer(): void {
    if (this.replaying || this.turnTimeoutMs <= 0) return;
    const actor = this.waitingOn();
    const state = this.state;
    if (!actor || !state) {
      this.clearTurnTimer();
      return;
    }
    // Bots do not need a clock; they are already being pumped.
    if (state.players.find((p) => p.id === actor)?.isBot) {
      this.clearTurnTimer();
      return;
    }

    this.timers.clear(this.turnTimer);
    this.turnOwner = actor;
    this.turnDeadline = this.timers.now() + this.turnTimeoutMs;
    const armedAtSeq = state.seq;

    this.turnTimer = this.timers.set(() => {
      this.turnTimer = null;
      // The turn moved on between arming and firing: nothing to do. This is
      // what makes a late timer harmless after a slow network round-trip.
      if (!this.state || this.state.seq !== armedAtSeq) return;
      if (this.waitingOn() !== actor) return;
      this.expireTurn(actor);
    }, this.turnTimeoutMs);
  }

  /**
   * Acts for a player whose time ran out, using only moves that player could
   * have made. No new rules: every command below goes through `submit` and is
   * validated by the engine exactly as a human's would be.
   *
   * Preference order is the least presumptuous one — take the stack or draw
   * before spending a card the player might have been saving.
   */
  private expireTurn(actor: PlayerId): void {
    const view = this.viewFor(actor);
    if (!view) return;

    for (const command of autoCommandsFor(view, () => `auto-${this.roomId}-${this.autoCommandSeq++}`)) {
      const before = this.state?.seq;
      const out = this.submit(command);
      if (!out.accepted || this.state?.seq === before) break;
      // Stop as soon as the turn has left this player: one expiry, one turn.
      if (this.waitingOn() !== actor) break;
    }
    // If the seat is somehow still blocking (an unusual rule state), the next
    // arm gives it another allowance rather than looping here.
    this.armTurnTimer();
  }

  /** Current clock, for decorating a snapshot. */
  private turnClock(): PlayerView['turn'] {
    if (this.turnTimeoutMs <= 0 || !this.turnOwner || this.turnDeadline === 0) return undefined;
    return {
      playerId: this.turnOwner,
      deadline: this.turnDeadline,
      timeoutMs: this.turnTimeoutMs,
      now: this.timers.now(),
    };
  }

  /* ---------------- persistence ---------------- */

  /**
   * Appends a command and, every so often, folds the log into a checkpoint.
   *
   * The idempotency set is truncated with it: a commandId older than the
   * checkpoint can no longer be replayed by any client that is still connected,
   * so keeping it forever only costs memory.
   */
  private recordCommand(command: Command, next: GameState): void {
    this.commandLog.push(command);
    if (this.commandLog.length < CHECKPOINT_EVERY) return;

    this.checkpoint = { seq: next.seq, state: cloneState(next) };
    this.commandLog = [];
    this.acceptedCommands = new Set(
      // Keep the most recent ids so a retry that is genuinely in flight is
      // still recognised as a duplicate rather than applied twice.
      [...this.acceptedCommands].slice(-CHECKPOINT_EVERY),
    );
  }

  private save(): void {
    if (this.replaying) return;
    this.onChange?.(this);
  }

  /**
   * Everything a restart needs. Deliberately not the board: hands, piles and
   * turn order are all derived by replaying `commands` from `matchSeed`, so a
   * saved file can never disagree with the engine that reads it.
   */
  persist(): PersistedRoom {
    return {
      format: PERSIST_FORMAT,
      roomId: this.roomId,
      code: this.code,
      version: this.version,
      config: this.config,
      maxSeats: this.maxSeats,
      hostId: this.hostId,
      seed: this.seed,
      roundCount: this.roundCount,
      seats: this.seats.map((s) => ({ ...s, connected: false })),
      matchSeed: this.matchSeed,
      checkpoint: this.checkpoint
        ? { seq: this.checkpoint.seq, state: this.checkpoint.state }
        : undefined,
      commands: [...this.commandLog],
      savedAt: Date.now(),
    };
  }

  /**
   * Rebuilds a room from a saved file.
   *
   * The replay runs with broadcasts, bots and timers all suspended, so nothing
   * is emitted to clients that already saw it and no bot decision is taken
   * twice — the bot commands are in the log already.
   */
  static restore(
    data: PersistedRoom,
    opts: {
      timers?: Timers;
      botDelayMs?: number;
      turnTimeoutMs?: number;
      rateLimitPerSecond?: number;
      onChange?: (room: MatchRoom) => void;
    } = {},
  ): MatchRoom {
    if (data.format !== PERSIST_FORMAT) {
      throw new RuleError('UNREADABLE_SAVE', `Unknown save format ${data.format}`);
    }

    const room = new MatchRoom({
      roomId: data.roomId,
      code: data.code,
      version: data.version,
      hostId: data.hostId,
      seed: data.seed,
      config: data.config,
      maxSeats: data.maxSeats,
      ...opts,
    });
    room.config = data.config;
    room.seats = data.seats.map((s) => ({ ...s, connected: false }));
    room.roundCount = data.roundCount;

    if (!data.matchSeed) return room;

    room.replaying = true;
    try {
      // Deal the same cards, then walk the log through the same reducer.
      room.start(data.hostId, data.matchSeed);
      room.roundCount = data.roundCount;

      // A checkpoint short-circuits the replay: everything before it is already
      // folded into that state, so only the commands after it are applied.
      if (data.checkpoint) {
        room.state = cloneState(data.checkpoint.state);
        room.checkpoint = { seq: data.checkpoint.seq, state: cloneState(data.checkpoint.state) };
      }

      for (const command of data.commands) {
        try {
          const result = reduce(room.state!, command, room.rng);
          room.state = result.state;
          room.acceptedCommands.add(command.commandId);
          room.commandLog.push(command);
          room.history.push({ seq: result.state.seq, events: result.events });
        } catch {
          // A command the engine now refuses means the log and the code have
          // diverged. Stopping here restores the match up to the last state
          // both agree on, which is better than discarding it entirely.
          break;
        }
      }
    } finally {
      room.replaying = false;
    }

    room.refreshTurnClock();
    room.scheduleAfterState();
    return room;
  }

  /* ---------------- resync: §10.1 ---------------- */

  /**
   * "On reconnect, client requests latest authoritative snapshot plus missed
   * events." Returns both so a client that missed three or more updates can
   * rebuild without replaying from the start.
   */
  resync(playerId: PlayerId, sinceSeq: number): { view?: PlayerView; missed: GameEvent[] } {
    if (!this.state) return { missed: [] };
    const missed = this.history
      .filter((h) => h.seq > sinceSeq)
      .flatMap((h) => h.events);
    return { view: buildPlayerView(this.state, playerId), missed };
  }

  viewFor(playerId: PlayerId): PlayerView | undefined {
    if (!this.state) return undefined;
    const view = buildPlayerView(this.state, playerId);
    const turn = this.turnClock();
    return turn ? { ...view, turn } : view;
  }

  /** Read-only access for tests and diagnostics. Never sent over the wire. */
  debugState(): GameState | undefined {
    return this.state;
  }

  close(reason: string): void {
    this.emit({ t: 'ROOM_CLOSED', reason });
    this.listeners = [];
  }

  /* ---------------- broadcast helpers ---------------- */

  private pushHistory(seq: number, events: GameEvent[]): void {
    this.history.push({ seq, events });
    // Keep the log bounded; a client further behind than this takes a full
    // snapshot instead, which resync() always includes.
    if (this.history.length > 400) this.history.splice(0, this.history.length - 400);
  }

  private broadcastRoom(): void {
    this.emit({ t: 'ROOM', room: this.info() });
  }

  private broadcastEvents(events: GameEvent[]): void {
    if (events.length === 0) return;
    this.emit({ t: 'EVENTS', seq: this.state?.seq ?? 0, events });
  }

  private broadcastSnapshots(): void {
    if (!this.state || this.replaying) return;
    for (const seat of this.seats) {
      const view = this.viewFor(seat.playerId);
      if (view) this.emit({ t: 'SNAPSHOT', playerId: seat.playerId, view });
    }
  }
}

/**
 * The moves the server makes on behalf of a player whose clock ran out.
 *
 * Every one of these is a command that player could have sent themselves, in
 * the order that presumes least about their intent: settle a blocking choice,
 * take a stack you cannot answer, draw, then pass. Playing a card from the
 * hand is the last resort, for the rare state where drawing is not legal.
 */
export function autoCommandsFor(view: PlayerView, nextId: () => string): Command[] {
  const me = view.you;
  const choice = view.awaitingChoice;

  if (choice && choice.playerId === me) {
    if (choice.type === 'COLOR' || choice.type === 'DRAW_COLOR') {
      const color = choice.eligibleColors?.[0];
      return color ? [{ commandId: nextId(), playerId: me, type: 'CHOOSE_COLOR', color }] : [];
    }
    const targetId = choice.eligibleTargets?.[0];
    if (!targetId) return [];
    return [
      choice.type === 'SWAP_HAND'
        ? { commandId: nextId(), playerId: me, type: 'SWAP_HAND', targetId }
        : { commandId: nextId(), playerId: me, type: 'CHOOSE_TARGET', targetId },
    ];
  }

  // Already drew this turn: passing is the whole remaining move.
  if (view.mayPass) return [{ commandId: nextId(), playerId: me, type: 'END_TURN' }];

  if (view.canDraw) {
    // Drawing may leave the player holding a playable card and free to pass;
    // the follow-up END_TURN completes the turn in one expiry rather than
    // making a disconnected player wait out a second full allowance.
    return [
      { commandId: nextId(), playerId: me, type: 'DRAW_CARD' },
      { commandId: nextId(), playerId: me, type: 'END_TURN' },
    ];
  }

  if (view.legalCardIds.length > 0) {
    return [
      { commandId: nextId(), playerId: me, type: 'PLAY_CARD', cardId: view.legalCardIds[0]! },
    ];
  }

  return [];
}

/** Short, unambiguous room codes (no 0/O/1/I). */
export function makeRoomCode(rng: RngLike): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i++) out += alphabet[rng.int(alphabet.length)];
  return out;
}
