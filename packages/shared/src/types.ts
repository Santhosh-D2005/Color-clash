/**
 * Canonical domain model — Master Blueprint §5.
 *
 * These types are the contract every other package codes against. The engine,
 * the server, the bots and the UI all import from here; nothing in this file
 * may import React, DOM or network code (§4.2).
 */

export type PlayerId = string;
export type CardId = string;
export type Color = string;
export type Direction = 1 | -1;
export type DeckSide = 'LIGHT_SIDE' | 'DARK_SIDE';

export type GameVersion = 'CLASSIC' | 'FLIP' | 'MAYHEM' | 'ALL_WILD' | 'FLEX';

/**
 * Every distinct card behaviour across all five rulesets.
 * Names follow the source blueprint. `WILD_DRAW_COLOR` in particular keeps the
 * source label "Wild Draw Color Card" (§2.3 note) rather than a user-facing alias.
 */
export type CardKind =
  // --- shared / classic
  | 'NUMBER'
  | 'SKIP'
  | 'REVERSE'
  | 'DRAW_TWO'
  | 'WILD'
  | 'WILD_DRAW_FOUR'
  // --- flip
  | 'FLIP'
  | 'DRAW_ONE'
  | 'WILD_DRAW_TWO'
  | 'DRAW_FIVE'
  | 'SKIP_EVERYONE'
  | 'WILD_DRAW_COLOR'
  // --- mayhem
  | 'DRAW_FOUR'
  | 'DISCARD_ALL'
  | 'WILD_DRAW_SIX'
  | 'WILD_DRAW_TEN'
  | 'WILD_REVERSE_SKIP'
  // --- wild rush
  | 'WILD_TARGET_DRAW_TWO'
  | 'WILD_SKIP'
  | 'WILD_REVERSE'
  | 'WILD_DOUBLE_SKIP';

/** One printed face of a card. Flip cards carry two of these. */
export type CardSideData = {
  kind: CardKind;
  color?: Color;
  value?: number;
};

/**
 * Flex secondary matrix — §2.6 / Appendix A Table 7.
 * "Primary symbols plus secondary triangle indicators containing alternate
 * color/action matrix."
 */
export type FlexCardData = {
  secondaryColor: Color;
  secondaryKind: CardKind;
  secondaryValue?: number;
};

export type Card = {
  id: CardId;
  kind: CardKind;
  primaryColor?: Color;
  value?: number | string;
  sides?: { light: CardSideData; dark: CardSideData };
  flex?: FlexCardData;
};

export type PlayerState = {
  id: PlayerId;
  name: string;
  isBot: boolean;
  botTier?: BotTier;
  hand: CardId[];
  eliminated: boolean;
  connected: boolean;
  /** Cumulative match score across rounds. */
  score: number;
  avatar?: string;
};

export type BotTier = 'EASY' | 'NORMAL' | 'HARD' | 'CHAOS';

/**
 * A pending player decision. While `awaitingChoice` is set the engine refuses
 * every command except the one that resolves it (§9.2: "Choice cards pause
 * progression with a focused modal").
 */
export type ChoiceState = {
  type: 'COLOR' | 'TARGET' | 'SWAP_HAND' | 'DRAW_COLOR';
  playerId: PlayerId;
  /** The card that opened the choice, for UI context and for replay. */
  cardId?: CardId;
  /** Legal answers for TARGET / SWAP_HAND. */
  eligibleTargets?: PlayerId[];
  /** Legal answers for COLOR / DRAW_COLOR. */
  eligibleColors?: Color[];
  /**
   * Effects queued behind this choice. They run verbatim once the choice
   * resolves, so a disconnect mid-choice cannot lose the rest of the card.
   */
  continuation?: Resolution[];
};

/** Stacking context — §8.4: "an explicit stacking context". */
export type PenaltyContext = {
  /** Total cards the next non-responding player must draw. */
  pendingDraw: number;
  /**
   * The lowest draw amount a response card must carry to pass the stack on.
   * Source §2.4: penalties "can pass iteratively when matching or higher cards
   * are played".
   */
  minimumResponsePenalty: number;
  /** Card kind that most recently added to the stack, for UI and bot logic. */
  sourceKind?: CardKind;
};

export type GameStatus = 'SETUP' | 'PLAYING' | 'ROUND_END' | 'MATCH_END';

export type MatchConfig = {
  /** Lobby toggle — §"Configuration over hardcoding". */
  winCondition: 'ONE_ROUND' | 'POINTS_500' | 'BEST_OF_THREE';
  drawRule: 'DRAW_ONE' | 'DRAW_UNTIL_PLAYABLE';
  /** Whether +2/+4 style penalties may be stacked in versions that allow it. */
  stacking: boolean;
  /** Wild Draw Four challenge hook (Table 9, "only if enabled by version config"). */
  challengeWildDrawFour: boolean;
  /** Cards drawn when a Clash call is missed. Source-defined default: 2. */
  clashPenaltyCards: number;
  /** Hand size at which a Mayhem player is eliminated. Source-defined: 25. */
  eliminationThreshold: number;
  /**
   * How long the table waits before settling a missed Clash call (§7.3).
   *
   * This is a pacing rule, not an engine rule: the engine still applies the
   * penalty on the next game action, exactly as the source defines. What this
   * value does is hold that next action back, so a human has a fair window to
   * reach the button. Zero restores the old behaviour of settling immediately.
   *
   * Read by the local match pump and by the server's bot scheduler.
   */
  clashGraceMs: number;
  scoringMode: 'STANDARD' | 'NONE';
  tableTheme: string;
};

export type GameState = {
  gameId: string;
  version: GameVersion;
  players: PlayerState[];
  drawPile: CardId[];
  discardPile: CardId[];
  activePlayerIndex: number;
  direction: Direction;
  activeColor?: Color;
  deckSide?: DeckSide;
  pendingDraw: number;
  penalty: PenaltyContext;
  pendingTargetPlayerId?: PlayerId;
  awaitingChoice?: ChoiceState;
  flexPowerAvailable?: boolean;
  roundNumber: number;
  status: GameStatus;

  /** Card table for this match. Immutable after setup. */
  cards: Record<CardId, Card>;
  /** Player who must call CLASH before the next action, or null (§7.3). */
  clashPending: PlayerId | null;
  /** Players who already called CLASH this "one card" window — makes CALL_CLASH idempotent. */
  clashCalled: PlayerId[];
  /**
   * Set when the active player has drawn and may now either play the drawn
   * card or END_TURN. Cleared on every turn change, so it can never leak.
   */
  mayPass: boolean;
  /** Cards the active player drew this turn (playable-after-draw rule). */
  drawnThisTurn: CardId[];
  /** Monotonic count of accepted commands (§10.1). */
  seq: number;
  config: MatchConfig;
  winnerId?: PlayerId;
  /** Deterministic seed the match was created from, for replay. */
  seed: string;
  /** Round-level counters surfaced on the summary screen. */
  stats: MatchStats;
};

/**
 * Round counters for the summary screen.
 *
 * `startedAt` and `endedAt` are wall-clock milliseconds and are the one part of
 * `GameState` that is **not** a pure function of the seed and the command log.
 * They are runtime metadata — how long this sitting took — rather than anything
 * the rules depend on, and no reducer branch reads them.
 *
 * The consequence is precise and worth stating: replaying a command log
 * reproduces every card, every hand and every turn exactly, and produces
 * different timestamps. Anything comparing two runs for determinism must
 * exclude them. `statsFreeState` in the engine does that, and
 * `determinism.test.ts` pins both halves of the claim.
 */
export type MatchStats = {
  cardsPlayed: number;
  actionCardsPlayed: number;
  clashCalls: number;
  penaltiesDrawn: number;
  /** Wall clock. Not deterministic — see the note above. */
  startedAt: number;
  /** Wall clock. Not deterministic — see the note above. */
  endedAt?: number;
};

/* ------------------------------------------------------------------ */
/* Commands — §5.1 / Appendix A Table 9                                */
/* ------------------------------------------------------------------ */

type CommandBase = {
  /** Idempotency key (§10.1). The server rejects a replayed commandId. */
  commandId: string;
  playerId: PlayerId;
};

export type Command =
  | (CommandBase & { type: 'START_GAME' })
  | (CommandBase & { type: 'PLAY_CARD'; cardId: CardId; useFlex?: boolean })
  | (CommandBase & { type: 'DRAW_CARD' })
  | (CommandBase & { type: 'CALL_CLASH' })
  | (CommandBase & { type: 'CHALLENGE_WILD_DRAW_FOUR' })
  | (CommandBase & { type: 'CHOOSE_COLOR'; color: Color })
  | (CommandBase & { type: 'CHOOSE_TARGET'; targetId: PlayerId })
  | (CommandBase & { type: 'USE_FLEX'; cardId: CardId })
  | (CommandBase & { type: 'SWAP_HAND'; targetId: PlayerId })
  | (CommandBase & { type: 'END_TURN' });

export type CommandType = Command['type'];

/**
 * A Command before the transport assigns its idempotency key.
 *
 * A plain `Omit<Command, 'commandId'>` collapses the discriminated union into
 * one object type and loses the per-variant fields, so this maps over the union
 * instead. Callers build these; the client/server stamp the commandId.
 */
export type CommandInput = Command extends infer C
  ? C extends Command
    ? Omit<C, 'commandId'>
    : never
  : never;

/* ------------------------------------------------------------------ */
/* Events — Appendix B                                                 */
/* ------------------------------------------------------------------ */

export type GameEvent =
  | { type: 'GAME_STARTED'; gameId: string; version: GameVersion; players: PlayerId[] }
  | { type: 'CARD_DEALT'; playerId: PlayerId; count: number }
  | { type: 'CARD_PLAYED'; playerId: PlayerId; cardId: CardId; flex?: boolean }
  /**
   * `auto` marks a colour the engine assigned rather than one a player picked
   * — Wild Rush sets the colour itself because it has no gameplay consequence
   * there (RF-011). The flag exists so the log can say "pile turns red" rather
   * than crediting a decision nobody made.
   */
  | { type: 'COLOR_CHOSEN'; playerId: PlayerId; color: Color; auto?: boolean }
  | { type: 'TARGET_CHOSEN'; playerId: PlayerId; targetId: PlayerId }
  | { type: 'CARD_DRAWN'; playerId: PlayerId; count: number; cardIds?: CardId[] }
  | { type: 'STACK_UPDATED'; pendingDraw: number; sourceCard?: CardId }
  | { type: 'TURN_CHANGED'; from: PlayerId; to: PlayerId; direction: Direction }
  | { type: 'CLASH_PENDING'; playerId: PlayerId }
  | { type: 'CLASH_CALLED'; playerId: PlayerId }
  | { type: 'CLASH_PENALTY'; playerId: PlayerId; count: number }
  | { type: 'FLIP_TRIGGERED'; playerId: PlayerId; side: DeckSide }
  | { type: 'FLEX_USED'; playerId: PlayerId; cardId: CardId }
  | { type: 'PLAYER_ELIMINATED'; playerId: PlayerId; reason: string }
  | { type: 'HANDS_ROTATED'; direction: Direction }
  | { type: 'HANDS_SWAPPED'; a: PlayerId; b: PlayerId }
  | { type: 'DISCARD_ALL'; playerId: PlayerId; color: Color; count: number }
  | { type: 'DECK_RECYCLED'; count: number }
  | { type: 'CHOICE_REQUESTED'; choice: ChoiceState }
  | { type: 'ROUND_ENDED'; winnerId: PlayerId; standings: Standing[] }
  | { type: 'MATCH_ENDED'; winnerId: PlayerId; standings: Standing[] };

export type EventType = GameEvent['type'];

export type Standing = {
  playerId: PlayerId;
  name: string;
  /** Cumulative match score. Can be negative — see `handValue` before showing it. */
  score: number;
  cardsLeft: number;
  eliminated: boolean;
  /**
   * Point value of the cards this player still held when the round ended.
   * Always >= 0, which is what a summary screen should actually show a loser:
   * "12 left in hand" reads as a fact, where "-12" reads as a punishment.
   */
  handValue?: number;
  /** Points banked this round. Non-zero only for the winner. */
  banked?: number;
};

/* ------------------------------------------------------------------ */
/* Resolutions — the declarative effect queue (§8.5)                   */
/* ------------------------------------------------------------------ */

/**
 * A ruleset never mutates state directly. `resolveCard` returns an ordered
 * list of Resolutions and the engine applies them, so multi-effect cards stay
 * deterministic and every effect is testable in isolation.
 */
export type Resolution =
  | { type: 'SET_COLOR'; color: Color }
  | { type: 'REQUEST_COLOR_CHOICE'; colors?: Color[]; continuation?: Resolution[] }
  | { type: 'REQUEST_TARGET_CHOICE'; continuation?: Resolution[] }
  | { type: 'REQUEST_SWAP_CHOICE' }
  | { type: 'REQUEST_DRAW_COLOR_CHOICE' }
  | { type: 'REVERSE' }
  /** Extra turn steps on top of the normal +1 advance. */
  | { type: 'SKIP'; count: number }
  /** Suppress the normal end-of-turn advance entirely. */
  | { type: 'NO_ADVANCE' }
  | { type: 'DRAW'; target: 'NEXT' | 'CHOSEN' | 'SELF' | 'ALL_OTHERS'; count: number }
  | { type: 'STACK'; amount: number; kind: CardKind }
  | { type: 'FLIP_DECK' }
  | { type: 'SKIP_EVERYONE' }
  | { type: 'ROTATE_HANDS' }
  | { type: 'SWAP_HANDS'; a: PlayerId; b: PlayerId }
  | { type: 'DISCARD_ALL_OF_COLOR' }
  | { type: 'DRAW_UNTIL_COLOR'; target: 'NEXT' | 'CHOSEN' }
  | { type: 'CONSUME_FLEX' };

/* ------------------------------------------------------------------ */
/* Version manifest — §8.1                                             */
/* ------------------------------------------------------------------ */

export type RngLike = {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Opaque serialisable cursor so a match can be resumed deterministically. */
  state(): number;
};

export type SetupContext = {
  players: PlayerState[];
  config: MatchConfig;
  rng: RngLike;
};

export type RuleContext = {
  state: GameState;
  playerId: PlayerId;
  /** Convenience accessor; identical to state.cards[id]. */
  card(id: CardId): Card;
  topCard(): Card | undefined;
  /** The face currently in play for this card, resolving Flip's deck side. */
  face(card: Card): CardSideData;
};

export type ResolveContext = RuleContext & {
  /** True when the player spent the flex token on this play. */
  useFlex: boolean;
};

export type OpeningContext = RuleContext & { openingCard: Card };
export type DrawContext = RuleContext & { drawn: CardId[] };
export type RoundEndContext = { state: GameState };

export interface VersionManifest {
  id: GameVersion;
  displayName: string;
  tagline: string;
  playerLimit: { min: number; max: number };
  /** Colours legal for a wild declaration on the current side. */
  colors(state?: GameState): Color[];
  createDeck(rng: RngLike): Card[];
  getStartingState(ctx: SetupContext): Partial<GameState>;
  isPlayable(ctx: RuleContext, card: Card): boolean;
  /** Whether `card` may be used to pass an active draw stack on. */
  canRespondToPenalty?(ctx: RuleContext, card: Card): boolean;
  resolveCard(ctx: ResolveContext, card: Card): Resolution[];
  resolveOpeningDiscard?(ctx: OpeningContext): Resolution[];
  afterDraw?(ctx: DrawContext): Resolution[];
  onRoundEnd?(ctx: RoundEndContext): Resolution[];
  /** Cards this version treats as "action cards" for analytics/scoring. */
  isActionCard(card: Card): boolean;
}
