import {
  RuleError,
  type CardId,
  type ChoiceState,
  type Color,
  type GameEvent,
  type GameState,
  type PlayerId,
  type Resolution,
  type RngLike,
} from '@colorclash/shared';
import { FLIP_SIDE_PAIRS, flipColorsFor } from '@colorclash/game-content';
import { checkElimination, drawToPlayer } from './draw.js';
import { applyReverse, rotateHands, seatAfter } from './turn.js';
import { card, face, livePlayers, player, topCard } from './state.js';

export type ApplyResult = {
  /** Total seats to advance at end of turn (1 = normal). */
  advance: number;
  /** True when a choice interrupted the queue; the turn does not end yet. */
  halted: boolean;
};

/**
 * Applies a ruleset's Resolution queue in order (§8.5: "Use an action queue for
 * multi-effect cards so resolution remains deterministic").
 *
 * Nothing in here consults version identity except where the source rule is
 * itself version-scoped; rulesets express behaviour purely as Resolutions.
 */
export function applyResolutions(
  state: GameState,
  actorId: PlayerId,
  queue: Resolution[],
  rng: RngLike,
  events: GameEvent[],
  initial: { advance: number; suppressed: boolean } = { advance: 1, suppressed: false },
): ApplyResult {
  let advance = initial.advance;
  let suppressed = initial.suppressed;

  for (let i = 0; i < queue.length; i++) {
    const r = queue[i]!;

    switch (r.type) {
      case 'SET_COLOR': {
        state.activeColor = r.color;
        // Assigned by the ruleset, not chosen by the player.
        events.push({ type: 'COLOR_CHOSEN', playerId: actorId, color: r.color, auto: true });
        break;
      }

      case 'REVERSE': {
        advance += applyReverse(state);
        break;
      }

      case 'SKIP': {
        advance += r.count;
        break;
      }

      case 'NO_ADVANCE': {
        suppressed = true;
        break;
      }

      case 'SKIP_EVERYONE': {
        // §2.3 dark rule: control returns instantly to the player of the card.
        suppressed = true;
        break;
      }

      case 'STACK': {
        state.penalty.pendingDraw += r.amount;
        state.penalty.minimumResponsePenalty = r.amount;
        state.penalty.sourceKind = r.kind;
        state.pendingDraw = state.penalty.pendingDraw;
        events.push({
          type: 'STACK_UPDATED',
          pendingDraw: state.penalty.pendingDraw,
          sourceCard: state.discardPile[state.discardPile.length - 1],
        });
        break;
      }

      case 'DRAW': {
        for (const targetId of resolveTargets(state, actorId, r.target)) {
          drawToPlayer(state, targetId, r.count, rng, events);
          state.stats.penaltiesDrawn += r.count;
          checkElimination(state, targetId, events);
        }
        break;
      }

      case 'DRAW_UNTIL_COLOR': {
        const [targetId] = resolveTargets(state, actorId, r.target);
        if (targetId) drawUntilColor(state, targetId, rng, events);
        break;
      }

      case 'FLIP_DECK': {
        flipDeck(state, actorId, events);
        break;
      }

      case 'ROTATE_HANDS': {
        rotateHands(state, events);
        break;
      }

      case 'SWAP_HANDS': {
        swapHands(state, r.a, r.b, events);
        break;
      }

      case 'DISCARD_ALL_OF_COLOR': {
        discardAllOfColor(state, actorId, events);
        break;
      }

      case 'CONSUME_FLEX': {
        state.flexPowerAvailable = false;
        break;
      }

      case 'REQUEST_COLOR_CHOICE':
      case 'REQUEST_TARGET_CHOICE':
      case 'REQUEST_SWAP_CHOICE':
      case 'REQUEST_DRAW_COLOR_CHOICE': {
        // Everything after this point is deferred until the choice resolves,
        // so a disconnect mid-choice cannot lose the rest of the card (§16.2).
        const rest = queue.slice(i + 1);
        const continuation: Resolution[] = [];
        if (suppressed) continuation.push({ type: 'NO_ADVANCE' });
        if (advance - 1 !== 0) continuation.push({ type: 'SKIP', count: advance - 1 });
        continuation.push(...(r.type === 'REQUEST_COLOR_CHOICE' ? (r.continuation ?? []) : []));
        continuation.push(...(r.type === 'REQUEST_TARGET_CHOICE' ? (r.continuation ?? []) : []));
        continuation.push(...rest);

        state.awaitingChoice = buildChoice(state, actorId, r, continuation);
        events.push({ type: 'CHOICE_REQUESTED', choice: state.awaitingChoice });
        return { advance, halted: true };
      }

      default: {
        const never: never = r;
        throw new RuleError('UNKNOWN_RESOLUTION', JSON.stringify(never));
      }
    }
  }

  return { advance: suppressed ? 0 : advance, halted: false };
}

/* ------------------------------------------------------------------ */

function buildChoice(
  state: GameState,
  actorId: PlayerId,
  r: Resolution,
  continuation: Resolution[],
): ChoiceState {
  const cardId = state.discardPile[state.discardPile.length - 1];
  switch (r.type) {
    case 'REQUEST_COLOR_CHOICE':
      return {
        type: 'COLOR',
        playerId: actorId,
        cardId,
        eligibleColors: r.colors ?? legalColors(state),
        continuation,
      };
    case 'REQUEST_DRAW_COLOR_CHOICE':
      return {
        type: 'DRAW_COLOR',
        playerId: actorId,
        cardId,
        eligibleColors: legalColors(state),
        continuation,
      };
    case 'REQUEST_TARGET_CHOICE':
      return {
        type: 'TARGET',
        playerId: actorId,
        cardId,
        eligibleTargets: eligibleTargets(state, actorId),
        continuation,
      };
    case 'REQUEST_SWAP_CHOICE':
      return {
        type: 'SWAP_HAND',
        playerId: actorId,
        cardId,
        eligibleTargets: eligibleTargets(state, actorId),
        continuation,
      };
    default:
      throw new RuleError('NOT_A_CHOICE');
  }
}

export function legalColors(state: GameState): Color[] {
  if (state.version === 'FLIP') {
    return flipColorsFor(state.deckSide ?? 'LIGHT_SIDE');
  }
  return ['RED', 'YELLOW', 'GREEN', 'BLUE'];
}

/**
 * §16.2 "Wild Rush target is self / eliminated target handling": eliminated
 * players are never eligible, and a player may not target themselves.
 */
export function eligibleTargets(state: GameState, actorId: PlayerId): PlayerId[] {
  return livePlayers(state)
    .filter((p) => p.id !== actorId)
    .map((p) => p.id);
}

function resolveTargets(
  state: GameState,
  actorId: PlayerId,
  target: 'NEXT' | 'CHOSEN' | 'SELF' | 'ALL_OTHERS',
): PlayerId[] {
  switch (target) {
    case 'SELF':
      return [actorId];
    case 'NEXT': {
      const idx = seatAfter(state, state.activePlayerIndex, 1);
      const p = state.players[idx];
      return p && !p.eliminated ? [p.id] : [];
    }
    case 'CHOSEN': {
      const id = state.pendingTargetPlayerId;
      if (!id) return [];
      const p = state.players.find((x) => x.id === id);
      return p && !p.eliminated ? [p.id] : [];
    }
    case 'ALL_OTHERS':
      return livePlayers(state)
        .filter((p) => p.id !== actorId)
        .map((p) => p.id);
  }
}

/**
 * §2.3: "Dark Wild Draw Color | Active player chooses a color; target draws
 * continuously until they match it."
 */
function drawUntilColor(
  state: GameState,
  targetId: PlayerId,
  rng: RngLike,
  events: GameEvent[],
): void {
  const wanted = state.activeColor;
  if (!wanted) return;
  const p = player(state, targetId);
  const has = () =>
    p.hand.some((id) => {
      const f = face(state, card(state, id));
      return f.color === wanted;
    });

  // Hard cap: the whole deck. Prevents an unbounded loop when no card of the
  // chosen colour remains in circulation (edge case: deck exhaustion).
  const cap = Object.keys(state.cards).length;
  let drawnTotal = 0;
  while (!has() && drawnTotal < cap) {
    const got = drawToPlayer(state, targetId, 1, rng, events);
    if (got.length === 0) break; // genuinely exhausted
    drawnTotal++;
    state.stats.penaltiesDrawn++;
    checkElimination(state, targetId, events);
    if (player(state, targetId).eliminated) break;
  }
}

function swapHands(state: GameState, aId: PlayerId, bId: PlayerId, events: GameEvent[]): void {
  const a = player(state, aId);
  const b = player(state, bId);
  const tmp = a.hand;
  a.hand = b.hand;
  b.hand = tmp;
  events.push({ type: 'HANDS_SWAPPED', a: aId, b: bId });
}

/**
 * §2.4 / §8.4: "Discard All filters the acting hand by active/matching color and
 * moves matching cards to discard in one transaction."
 */
function discardAllOfColor(state: GameState, actorId: PlayerId, events: GameEvent[]): void {
  const color = state.activeColor;
  if (!color) return;
  const p = player(state, actorId);
  const keep: CardId[] = [];
  const moved: CardId[] = [];
  for (const id of p.hand) {
    const f = face(state, card(state, id));
    if (f.color === color) moved.push(id);
    else keep.push(id);
  }
  if (moved.length === 0) return;
  p.hand = keep;
  // The played Discard All card is already on top; matching cards go beneath it
  // so the top discard (and therefore the active colour) is unchanged.
  const top = state.discardPile.pop();
  state.discardPile.push(...moved);
  if (top) state.discardPile.push(top);
  events.push({ type: 'DISCARD_ALL', playerId: actorId, color, count: moved.length });
}

/**
 * §8.3: "Flip commits atomically: change deckSide, refresh active color
 * context, and update visuals in one event chain."
 */
function flipDeck(state: GameState, actorId: PlayerId, events: GameEvent[]): void {
  const next = state.deckSide === 'DARK_SIDE' ? 'LIGHT_SIDE' : 'DARK_SIDE';
  state.deckSide = next;

  const top = topCard(state);
  const newFace = top ? face(state, top) : undefined;
  if (newFace?.color) {
    state.activeColor = newFace.color;
  } else if (state.activeColor) {
    // Top card is a wild on the new side: carry the declared colour across.
    state.activeColor = mapColorAcrossSides(state.activeColor, next);
  }
  events.push({ type: 'FLIP_TRIGGERED', playerId: actorId, side: next });
}

export function mapColorAcrossSides(color: Color, side: 'LIGHT_SIDE' | 'DARK_SIDE'): Color {
  if (side === 'DARK_SIDE') return FLIP_SIDE_PAIRS[color] ?? color;
  const entry = Object.entries(FLIP_SIDE_PAIRS).find(([, dark]) => dark === color);
  return entry ? entry[0] : color;
}
