import type {
  Command,
  GameEvent,
  GameState,
  GameVersion,
  MatchConfig,
  PlayerId,
  BotTier,
} from './types.js';

/**
 * Wire protocol — §10. The server is authoritative; clients send Commands and
 * receive snapshots + events. Private hands are never broadcast (§15).
 */

export type PublicPlayer = {
  id: PlayerId;
  name: string;
  isBot: boolean;
  handCount: number;
  eliminated: boolean;
  connected: boolean;
  score: number;
  avatar?: string;
  calledClash: boolean;
};

/**
 * Exactly what a given client is allowed to see: full public state plus only
 * its own hand (§11.2 — bots get the same shape, so an AI physically cannot
 * read information a human could not).
 */
export type PlayerView = {
  gameId: string;
  version: GameVersion;
  status: GameState['status'];
  players: PublicPlayer[];
  you: PlayerId;
  yourHand: string[];
  /** Card table restricted to cards this viewer can legally identify. */
  cards: GameState['cards'];
  drawPileCount: number;
  topCardId?: string;
  discardCount: number;
  activePlayerIndex: number;
  direction: GameState['direction'];
  activeColor?: string;
  deckSide?: GameState['deckSide'];
  pendingDraw: number;
  minimumResponsePenalty: number;
  awaitingChoice?: GameState['awaitingChoice'];
  flexPowerAvailable?: boolean;
  clashPending: PlayerId | null;
  roundNumber: number;
  seq: number;
  config: MatchConfig;
  winnerId?: PlayerId;
  stats: GameState['stats'];
  /** Card ids in `yourHand` the engine currently accepts. */
  legalCardIds: string[];
  canDraw: boolean;
  /** The viewer drew and may now play the drawn card or pass. */
  mayPass: boolean;
  /**
   * Server-owned turn clock. Absent in local play and whenever the timer is
   * disabled. The client renders a countdown from this and nothing else — it
   * has no timer of its own, so a client cannot give itself longer by lying
   * about the time (§10.1: the server is authoritative).
   */
  turn?: TurnClock;
};

export type TurnClock = {
  /** Whose clock is running. */
  playerId: PlayerId;
  /** Server epoch milliseconds at which the turn expires. */
  deadline: number;
  /** The full allowance, so a client can draw a proportional bar. */
  timeoutMs: number;
  /** Server clock at the moment this snapshot was built, for offset correction. */
  now: number;
};

export type RoomSeat = {
  playerId: PlayerId;
  name: string;
  isBot: boolean;
  botTier?: BotTier;
  ready: boolean;
  connected: boolean;
  avatar?: string;
  isHost: boolean;
};

export type RoomInfo = {
  roomId: string;
  code: string;
  version: GameVersion;
  config: MatchConfig;
  seats: RoomSeat[];
  hostId: PlayerId;
  status: 'LOBBY' | 'PLAYING' | 'ROUND_END' | 'CLOSED';
  maxSeats: number;
};

/* ---------------- client -> server ---------------- */

export type ClientMessage =
  | { t: 'HELLO'; playerId?: PlayerId; name: string; avatar?: string }
  | { t: 'CREATE_ROOM'; version: GameVersion; config?: Partial<MatchConfig>; maxSeats?: number }
  | { t: 'JOIN_ROOM'; code: string }
  | { t: 'LEAVE_ROOM' }
  | { t: 'ADD_BOT'; tier: BotTier }
  | { t: 'REMOVE_SEAT'; playerId: PlayerId }
  | { t: 'SET_CONFIG'; config: Partial<MatchConfig> }
  | { t: 'SET_VERSION'; version: GameVersion }
  | { t: 'READY'; ready: boolean }
  | { t: 'START_GAME' }
  | { t: 'COMMAND'; command: Command; ackSeq: number }
  | { t: 'RESYNC'; sinceSeq: number }
  | { t: 'CHAT'; text: string }
  /**
   * Emotes are deliberately not Commands: they never reach `reduce`, so no
   * amount of emote traffic can touch a hand, a turn or a score.
   */
  | { t: 'EMOTE'; emote: string };

/* ---------------- server -> client ---------------- */

export type ServerMessage =
  | { t: 'WELCOME'; playerId: PlayerId }
  | { t: 'ROOM'; room: RoomInfo }
  | { t: 'ROOM_CLOSED'; reason: string }
  | { t: 'SNAPSHOT'; view: PlayerView }
  | { t: 'EVENTS'; seq: number; events: GameEvent[] }
  | { t: 'REJECTED'; commandId: string; reason: string; seq: number }
  | { t: 'CHAT'; playerId: PlayerId; name: string; text: string; at: number }
  | { t: 'EMOTE'; playerId: PlayerId; name: string; emote: string; at: number }
  | { t: 'ERROR'; message: string };

export const PROTOCOL_VERSION = 1;
