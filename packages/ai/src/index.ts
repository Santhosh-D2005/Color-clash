import type {
  BotTier,
  Card,
  CardId,
  Color,
  Command,
  PlayerId,
  PlayerView,
  RngLike,
} from '@colorclash/shared';
import { PENALTY_VALUE, cardPoints } from '@colorclash/game-content';

/**
 * Bot architecture — §11.
 *
 * "Bots should use the same command API as humans. A bot receives a sanitized
 * public state plus its own private hand, asks the engine for legal moves,
 * scores those moves, and submits exactly one command."
 *
 * §11.2 AI safety rule: a bot's only input is a `PlayerView`, the exact
 * structure a human client receives. There is no back door to the authoritative
 * `GameState`, so difficulty can only improve decision quality — it can never
 * create invisible information.
 */

export type BotDecision = Omit<Command, 'commandId'> & { commandId?: string };

let counter = 0;
function nextCommandId(playerId: PlayerId): string {
  counter += 1;
  return `bot-${playerId}-${counter}`;
}

/**
 * Produces exactly one command for the bot whose view this is, or null when the
 * bot has nothing to do (not its turn, no choice pending).
 */
export function decide(view: PlayerView, tier: BotTier, rng: RngLike): Command | null {
  const me = view.you;

  // 1. Answer an outstanding choice that belongs to us. Nothing else is legal
  //    while a choice is pending, so this always comes first.
  if (view.awaitingChoice && view.awaitingChoice.playerId === me) {
    return answerChoice(view, tier, rng);
  }
  if (view.awaitingChoice) return null;

  // 2. Call CLASH. Modelled as decision quality: weaker tiers sometimes forget,
  //    which costs them the source-defined 2-card penalty.
  if (view.clashPending === me && !forgetsUno(tier, rng)) {
    return { commandId: nextCommandId(me), playerId: me, type: 'CALL_CLASH' };
  }

  const isMyTurn = view.players[view.activePlayerIndex]?.id === me;
  if (!isMyTurn || view.status !== 'PLAYING') return null;

  // 3. Play if we can.
  if (view.legalCardIds.length > 0) {
    const cardId = chooseCard(view, tier, rng);
    const useFlex = shouldUseFlex(view, cardId, tier);
    return {
      commandId: nextCommandId(me),
      playerId: me,
      type: 'PLAY_CARD',
      cardId,
      useFlex,
    };
  }

  // 4. Otherwise pass if we already drew, else draw.
  if (view.mayPass) {
    return { commandId: nextCommandId(me), playerId: me, type: 'END_TURN' };
  }
  if (view.canDraw) {
    return { commandId: nextCommandId(me), playerId: me, type: 'DRAW_CARD' };
  }
  return null;
}

function forgetsUno(tier: BotTier, rng: RngLike): boolean {
  const forgetChance: Record<BotTier, number> = {
    EASY: 0.45,
    NORMAL: 0.15,
    HARD: 0.02,
    CHAOS: 0,
  };
  return rng.next() < forgetChance[tier];
}

/* ------------------------------------------------------------------ */
/* Card selection                                                      */
/* ------------------------------------------------------------------ */

function chooseCard(view: PlayerView, tier: BotTier, rng: RngLike): CardId {
  const legal = view.legalCardIds;
  if (tier === 'EASY') {
    // Table 12: "Random legal move; simple target selection".
    return legal[rng.int(legal.length)]!;
  }

  let best = legal[0]!;
  let bestScore = -Infinity;
  for (const id of legal) {
    const score = scoreCard(view, id, tier) + rng.next() * 0.01; // deterministic tiebreak
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

function scoreCard(view: PlayerView, cardId: CardId, tier: BotTier): number {
  const card = view.cards[cardId];
  if (!card) return 0;
  const kind = faceKind(view, card);
  const value = faceValue(view, card);
  let score = 0;

  // Table 12 NORMAL: "Prefer getting rid of high-risk cards; basic penalty
  // awareness." High point value = high risk if we get caught holding it.
  score += cardPoints(kind, value) * 0.35;

  const penalty = PENALTY_VALUE[kind] ?? 0;
  const nextPlayer = playerAt(view, 1);
  const nextHand = nextPlayer?.handCount ?? 7;

  // Answering an active stack is almost always better than eating it.
  if (view.pendingDraw > 0 && penalty >= view.minimumResponsePenalty) {
    score += 100 + penalty * 5;
  }

  if (tier === 'HARD' || tier === 'CHAOS') {
    // "Track opponents' visible hand size, likely colors, pending stack, and
    // target value."
    if (nextHand <= 2) {
      // Hurt or block a player who is about to go out.
      if (penalty > 0) score += 40 + penalty * 4;
      if (kind === 'SKIP' || kind === 'WILD_SKIP' || kind === 'WILD_DOUBLE_SKIP') score += 35;
      if (kind === 'REVERSE' || kind === 'WILD_REVERSE') score += 20;
    }
    // Hold wilds for when we genuinely need them.
    if (isWildKind(kind) && view.legalCardIds.length > 1) score -= 25;
    // Prefer dumping our most-held colour so the hand stays flexible.
    score += colorFrequency(view, faceColor(view, card)) * 3;
  }

  if (tier === 'CHAOS') {
    // Table 12: "Aggressive penalty stacking, elimination awareness,
    // hand-swap optimization."
    score += penalty * 8;
    if (kind === 'DISCARD_ALL') score += colorFrequency(view, view.activeColor) * 12;
    if (kind === 'NUMBER' && value === 7 && view.yourHand.length > 4) score += 30;
    if (kind === 'NUMBER' && value === 0 && view.yourHand.length > 5) score += 20;
    // Elimination awareness: push players who are close to the elimination threshold.
    const threshold = view.config.eliminationThreshold;
    const nearest = Math.max(...view.players.filter((p) => !p.eliminated).map((p) => p.handCount));
    if (penalty > 0 && nearest >= threshold - 8) score += 45;
  }

  return score;
}

/* ------------------------------------------------------------------ */
/* Choices                                                             */
/* ------------------------------------------------------------------ */

function answerChoice(view: PlayerView, tier: BotTier, rng: RngLike): Command {
  const me = view.you;
  const choice = view.awaitingChoice!;

  switch (choice.type) {
    case 'COLOR':
    case 'DRAW_COLOR': {
      const colors = choice.eligibleColors ?? [];
      const color =
        tier === 'EASY'
          ? colors[rng.int(colors.length)]!
          : choice.type === 'DRAW_COLOR'
            ? rarestColor(view, colors) // make the target draw as long as possible
            : bestColor(view, colors);
      return { commandId: nextCommandId(me), playerId: me, type: 'CHOOSE_COLOR', color };
    }

    case 'TARGET': {
      const targets = choice.eligibleTargets ?? [];
      const target =
        tier === 'EASY'
          ? targets[rng.int(targets.length)]!
          : // Hit whoever is closest to going out.
            [...targets].sort(
              (a, b) => handCountOf(view, a) - handCountOf(view, b),
            )[0]!;
      return {
        commandId: nextCommandId(me),
        playerId: me,
        type: 'CHOOSE_TARGET',
        targetId: target,
      };
    }

    case 'SWAP_HAND': {
      const targets = choice.eligibleTargets ?? [];
      // Swap into the smallest hand available; if ours is already smallest,
      // take from the player closest to winning anyway to slow them down.
      const target = [...targets].sort(
        (a, b) => handCountOf(view, a) - handCountOf(view, b),
      )[0]!;
      return {
        commandId: nextCommandId(me),
        playerId: me,
        type: 'SWAP_HAND',
        targetId: target,
      };
    }
  }
}

function bestColor(view: PlayerView, colors: Color[]): Color {
  let best = colors[0]!;
  let bestCount = -1;
  for (const c of colors) {
    const n = colorFrequency(view, c);
    if (n > bestCount) {
      bestCount = n;
      best = c;
    }
  }
  return best;
}

function rarestColor(view: PlayerView, colors: Color[]): Color {
  let best = colors[0]!;
  let bestCount = Infinity;
  for (const c of colors) {
    const n = colorFrequency(view, c);
    if (n < bestCount) {
      bestCount = n;
      best = c;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Helpers — all read from PlayerView only                             */
/* ------------------------------------------------------------------ */

function shouldUseFlex(view: PlayerView, cardId: CardId, tier: BotTier): boolean {
  if (view.version !== 'FLEX' || !view.flexPowerAvailable) return false;
  const card = view.cards[cardId];
  if (!card) return false;
  if (tier === 'EASY') return false;
  // Spend the token on Flex Skip (extra turn) when we are close to going out,
  // or on Flex Draw Two to hit the whole table.
  if (card.kind === 'SKIP' && view.yourHand.length <= 3) return true;
  if (card.kind === 'DRAW_TWO' && view.players.filter((p) => !p.eliminated).length > 2) {
    return tier === 'CHAOS' || tier === 'HARD';
  }
  return false;
}

function faceOf(view: PlayerView, card: Card) {
  if (card.sides) {
    return view.deckSide === 'DARK_SIDE' ? card.sides.dark : card.sides.light;
  }
  return {
    kind: card.kind,
    color: card.primaryColor,
    value: typeof card.value === 'number' ? card.value : undefined,
  };
}

function faceKind(view: PlayerView, card: Card) {
  return faceOf(view, card).kind;
}
function faceValue(view: PlayerView, card: Card) {
  return faceOf(view, card).value;
}
function faceColor(view: PlayerView, card: Card) {
  return faceOf(view, card).color;
}

function isWildKind(kind: string): boolean {
  return kind.startsWith('WILD');
}

function colorFrequency(view: PlayerView, color?: Color): number {
  if (!color) return 0;
  return view.yourHand.filter((id) => {
    const c = view.cards[id];
    return c ? faceColor(view, c) === color : false;
  }).length;
}

function playerAt(view: PlayerView, steps: number) {
  const n = view.players.length;
  let idx = view.activePlayerIndex;
  let moved = 0;
  let guard = 0;
  while (moved < steps && guard++ < n * 3) {
    idx = (idx + view.direction + n) % n;
    if (!view.players[idx]!.eliminated) moved++;
  }
  return view.players[idx];
}

function handCountOf(view: PlayerView, id: PlayerId): number {
  return view.players.find((p) => p.id === id)?.handCount ?? 99;
}

export const BOT_TIERS: BotTier[] = ['EASY', 'NORMAL', 'HARD', 'CHAOS'];

export const BOT_TIER_LABEL: Record<BotTier, string> = {
  EASY: 'Easy',
  NORMAL: 'Normal',
  HARD: 'Hard',
  CHAOS: 'Chaos',
};

/** Deterministic bot names for local matches, taken from the supplied key art. */
export const BOT_NAMES = ['Sunny', 'Moonlight', 'TigerX', 'Nova', 'Echo', 'Rook', 'Vega', 'Pixel', 'Ada'];
