import type { Card, CardId, GameEvent, PlayerId } from '@colorclash/shared';
import { CARD_LABEL, COLOR_LABEL } from '@colorclash/game-content';

/**
 * Turns engine events into the things the table screen shows: the big action
 * banner and the rolling log.
 *
 * This is presentation only — it reads events and produces strings. It is
 * shared by the local and the online match hooks so there is exactly one
 * implementation of "what does a Draw Six look like on screen" (§18.1 rule 3:
 * never create duplicate competing implementations).
 *
 * The rule for every line below: name the player, say what they did, and say
 * what it cost. "Sam drew 2 cards" is a log line; "CARD_DRAWN" is a debug
 * trace, and the log used to read too much like the second one.
 */

export type Banner = { title: string; note?: string; id: number } | null;

/** Anything that can name a player: authoritative state or a sanitised view. */
export type NameLookup = {
  /**
   * Seat order. `eliminated` is optional because it is only needed to work out
   * who a skip actually landed on — a jumped seat that is out of the game was
   * not skipped, it is simply not there any more. Both `PlayerState` and
   * `PublicPlayer` already carry it, so both call sites supply it.
   */
  players: Array<{ id: PlayerId; name: string; eliminated?: boolean }>;
  /** Cards this viewer can identify. Anything else is described generically. */
  cards?: Record<CardId, Card>;
  /** The viewing player, so lines can say "You" instead of a name. */
  you?: PlayerId;
};

export type Presented = {
  /** Newest lines for the event log, oldest first. */
  lines: string[];
  /** The banner to show, if any event in this batch warrants one. */
  banner: Omit<NonNullable<Banner>, 'id'> | null;
};

/**
 * Action banners for cards whose whole point is what they do to other people.
 *
 * Wild Rush produced no banners at all: skips, double skips, reverses and
 * target draws all happened silently, so the mode with the most going on had
 * the least feedback. The events already existed — only this table was missing
 * them. Nothing here changes a rule; it decides what gets a moment on screen.
 */
/**
 * Which player a banner is *about*.
 *
 * The note used to name whoever played the card, which is the one person the
 * card did not happen to: "SKIPPED! / Sunny" reads as "Sunny was skipped" when
 * Sunny did the skipping. These say where to look for the player who was
 * actually affected.
 */
type BannerSubject = 'skipped' | 'next' | 'drawer';

const ACTION_BANNERS: Partial<
  Record<string, { title: string; note?: string; subject?: BannerSubject }>
> = {
  WILD_SKIP: { title: 'SKIPPED!', subject: 'skipped' },
  SKIP: { title: 'SKIPPED!', subject: 'skipped' },
  WILD_DOUBLE_SKIP: {
    title: 'DOUBLE SKIP!',
    note: 'Two players lose their turn',
    subject: 'skipped',
  },
  SKIP_EVERYONE: { title: 'SKIP EVERYONE!', note: 'The turn comes straight back' },
  WILD_REVERSE: { title: 'REVERSE!', subject: 'next' },
  REVERSE: { title: 'REVERSE!', subject: 'next' },
  WILD_REVERSE_SKIP: { title: 'REVERSE + SKIP!', subject: 'skipped' },
  WILD_TARGET_DRAW_TWO: { title: 'TARGETED!', subject: 'drawer' },
  WILD_DRAW_FOUR: { title: '+4', subject: 'drawer' },
};

/**
 * The live seats a turn change jumped over — the players who lost a turn.
 *
 * Walks from the seat that played, in the direction the turn moved, until it
 * reaches the seat that received it. Eliminated seats are passed over by the
 * engine on every turn, so they are not counted: they were not skipped, they
 * are gone.
 */
function skippedSeats(
  who: NameLookup,
  turn: { from: PlayerId; to: PlayerId; direction: number },
): PlayerId[] {
  const seats = who.players;
  const n = seats.length;
  const start = seats.findIndex((p) => p.id === turn.from);
  if (n === 0 || start < 0 || turn.from === turn.to) return [];

  const step = turn.direction < 0 ? -1 : 1;
  const jumped: PlayerId[] = [];
  let i = start;
  // Bounded by the table size: one full lap can never be a legal skip.
  for (let guard = 0; guard < n; guard++) {
    i = (i + step + n) % n;
    const seat = seats[i];
    if (!seat || seat.id === turn.to) break;
    if (!seat.eliminated) jumped.push(seat.id);
  }
  return jumped;
}

export function presentEvents(events: GameEvent[], who: NameLookup): Presented {
  const lines: string[] = [];
  let banner: Presented['banner'] = null;

  const isYou = (id?: PlayerId) => Boolean(id && who.you && id === who.you);
  const nameOf = (id?: PlayerId) =>
    isYou(id) ? 'You' : who.players.find((p) => p.id === id)?.name ?? id ?? '';
  /** "Sam played" but "You play" — the log reads as narration either way. */
  const verb = (id: PlayerId | undefined, past: string, present: string) =>
    isYou(id) ? present : past;

  /**
   * Names a card if this viewer is allowed to know it. In an online match the
   * card table is restricted to your own hand and the top discard, so an
   * opponent's play is nameable exactly because playing it turns it face up.
   */
  const cardName = (id?: CardId): string => {
    const card = id ? who.cards?.[id] : undefined;
    if (!card) return 'a card';
    const color = card.primaryColor ? COLOR_LABEL[card.primaryColor] ?? card.primaryColor : '';
    const what =
      card.kind === 'NUMBER' ? String(card.value ?? 0) : CARD_LABEL[card.kind] ?? card.kind;
    return color ? `${color} ${what}` : what;
  };

  /**
   * The turn move and the penalty draw that belong to this batch.
   *
   * A card's victim is never on the CARD_PLAYED event — it is implied by where
   * the turn went, or by who ended up drawing. Both arrive in the same batch,
   * so a single look-ahead is enough to name them.
   */
  const turn = events.find((e) => e.type === 'TURN_CHANGED');
  const penalty = events.find(
    (e): e is Extract<GameEvent, { type: 'CARD_DRAWN' }> => e.type === 'CARD_DRAWN' && e.count > 1,
  );

  /** "Ada", "Ada and Sunny", "Ada, Sunny and Moonlight". */
  const listNames = (ids: PlayerId[]): string => {
    const names = ids.map((id) => nameOf(id)).filter(Boolean);
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  };

  /** The note for an action banner: who it happened *to*. */
  const subjectNote = (subject: BannerSubject | undefined, actor: PlayerId): string | undefined => {
    if (!subject) return undefined;

    if (subject === 'drawer') {
      if (!penalty || penalty.playerId === actor) return undefined;
      return `${nameOf(penalty.playerId)} ${verb(penalty.playerId, 'draws', 'draw')} ${penalty.count}`;
    }

    if (!turn || turn.type !== 'TURN_CHANGED') return undefined;

    if (subject === 'next') {
      return turn.to ? `${nameOf(turn.to)} ${verb(turn.to, 'plays', 'play')} next` : undefined;
    }

    const lost = skippedSeats(who, turn);
    if (lost.length === 0) return undefined;
    const one = lost.length === 1;
    return `${listNames(lost)} ${one ? verb(lost[0], 'loses', 'lose') : 'lose'} a turn`;
  };

  for (const e of events) {
    switch (e.type) {
      case 'CARD_PLAYED': {
        lines.push(
          `${nameOf(e.playerId)} ${verb(e.playerId, 'played', 'play')} ${cardName(e.cardId)}`,
        );
        const kind = e.cardId ? who.cards?.[e.cardId]?.kind : undefined;
        const shout = kind ? ACTION_BANNERS[kind] : undefined;
        if (shout) {
          // Fall back to the card's own note, then to naming the player who
          // played it — vague, but never wrong.
          const note = subjectNote(shout.subject, e.playerId) ?? shout.note ?? nameOf(e.playerId);
          banner = { title: shout.title, note };
        }
        break;
      }

      case 'COLOR_CHOSEN':
        lines.push(
          e.auto
            ? `Pile turns ${COLOR_LABEL[e.color] ?? e.color}`
            : `${nameOf(e.playerId)} ${verb(e.playerId, 'chose', 'choose')} ` +
              `${COLOR_LABEL[e.color] ?? e.color}`,
        );
        break;

      case 'TARGET_CHOSEN':
        lines.push(
          `${nameOf(e.playerId)} ${verb(e.playerId, 'targeted', 'target')} ${nameOf(e.targetId)}`,
        );
        banner = { title: 'TARGETED!', note: `${nameOf(e.targetId)} draws` };
        break;

      case 'CARD_DRAWN':
        lines.push(
          `${nameOf(e.playerId)} ${verb(e.playerId, 'drew', 'draw')} ` +
            (e.count === 1 ? 'a card' : `${e.count} cards`),
        );
        break;

      case 'STACK_UPDATED':
        lines.push(`Stack is now +${e.pendingDraw}`);
        banner = { title: `+${e.pendingDraw}`, note: 'Answer it, or take the stack' };
        break;

      case 'CLASH_PENDING':
        // Your own is already a modal and a lit button; someone else's is news.
        if (!isYou(e.playerId)) lines.push(`${nameOf(e.playerId)} is down to 1 card`);
        break;

      case 'CLASH_CALLED':
        lines.push(`${nameOf(e.playerId)} ${verb(e.playerId, 'called', 'call')} CLASH!`);
        break;

      case 'CLASH_PENALTY':
        lines.push(`${nameOf(e.playerId)} missed the call and drew ${e.count}`);
        banner = { title: 'MISSED CLASH!', note: `${nameOf(e.playerId)} draws ${e.count}` };
        break;

      case 'FLIP_TRIGGERED':
        lines.push(`${nameOf(e.playerId)} flipped the deck`);
        banner = {
          title: e.side === 'DARK_SIDE' ? 'DARK SIDE!' : 'LIGHT SIDE!',
          note: `${nameOf(e.playerId)} flipped the deck`,
        };
        break;

      case 'PLAYER_ELIMINATED':
        lines.push(`${nameOf(e.playerId)} was eliminated — ${e.reason}`);
        banner = { title: 'ELIMINATED!', note: `${nameOf(e.playerId)} — ${e.reason}` };
        break;

      case 'HANDS_ROTATED':
        lines.push('All hands rotated');
        banner = { title: 'ALL HANDS ROTATE!' };
        break;

      case 'HANDS_SWAPPED':
        lines.push(`${nameOf(e.a)} swapped hands with ${nameOf(e.b)}`);
        banner = { title: 'HAND SWAP!', note: `${nameOf(e.a)} ⇄ ${nameOf(e.b)}` };
        break;

      case 'DISCARD_ALL':
        lines.push(
          `${nameOf(e.playerId)} dumped ${e.count} ${COLOR_LABEL[e.color] ?? e.color} cards`,
        );
        banner = { title: 'DISCARD ALL!', note: `${nameOf(e.playerId)} dumped ${e.count} cards` };
        break;

      case 'FLEX_USED':
        lines.push(`${nameOf(e.playerId)} spent the Flex token`);
        banner = { title: 'FLEX!', note: `${nameOf(e.playerId)} spent the token` };
        break;

      case 'DECK_RECYCLED':
        lines.push(`Deck reshuffled — ${e.count} cards back in play`);
        break;

      case 'ROUND_ENDED':
        lines.push(`${nameOf(e.winnerId)} won the round`);
        break;

      default:
        // TURN_CHANGED, CARD_DEALT, GAME_STARTED and CHOICE_REQUESTED are all
        // already visible on the board itself; narrating them is noise.
        break;
    }
  }

  return { lines, banner };
}

/** How long a banner stays on screen — Table 11's "major reveal" band. */
export const BANNER_MS = 1400;

/**
 * The shortest a banner may be shown. Below this it is a flash rather than a
 * message, which is the defect the banner exists to avoid in the first place.
 */
export const BANNER_MIN_MS = 420;

/**
 * How long a banner may stay up given the pace of the table.
 *
 * A fixed 1,400 ms against a 600-900 ms turn meant a caption was *guaranteed*
 * to outlive the move it described, and to still be on screen while the next
 * player — often the next two — acted. Deriving it from the pace keeps the
 * caption inside the beat it belongs to. The 100 ms is so it clears before the
 * next move lands rather than at the same instant.
 */
export function bannerMs(paceMs?: number): number {
  if (!paceMs || !Number.isFinite(paceMs)) return BANNER_MS;
  return Math.max(BANNER_MIN_MS, Math.min(BANNER_MS, paceMs - 100));
}

/**
 * How many log lines the table keeps.
 *
 * Five was about four seconds of history at the measured pace — shorter than
 * the time it takes to choose a card, so the record of what just happened was
 * routinely gone before it could be read.
 */
export const LOG_LINES = 14;
