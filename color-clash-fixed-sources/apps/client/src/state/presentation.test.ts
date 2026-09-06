import type { Card, GameEvent } from '@colorclash/shared';
import { describe, expect, it } from '@colorclash/test-fixtures';
import { BANNER_MIN_MS, BANNER_MS, bannerMs, presentEvents } from './presentation.js';
import { cueForEvent } from './audio.js';

/**
 * The event-to-words and event-to-sound layers.
 *
 * Both are pure functions taking engine events and returning presentation, and
 * both were previously covered only through the browser suite — which is slower,
 * flakier and much worse at saying what broke. These are the tests that should
 * have existed when the functions were written.
 */

const CARDS: Record<string, Card> = {
  'R5#0': { id: 'R5#0', kind: 'NUMBER', primaryColor: 'RED', value: 5 },
  'BD2#0': { id: 'BD2#0', kind: 'DRAW_TWO', primaryColor: 'BLUE' },
  'W#0': { id: 'W#0', kind: 'WILD' },
  'WSK#0': { id: 'WSK#0', kind: 'WILD_SKIP' },
  'WDS#0': { id: 'WDS#0', kind: 'WILD_DOUBLE_SKIP' },
  'WRV#0': { id: 'WRV#0', kind: 'WILD_REVERSE' },
  'WTD2#0': { id: 'WTD2#0', kind: 'WILD_TARGET_DRAW_TWO' },
};

const who = {
  players: [
    { id: 'you', name: 'Ada' },
    { id: 'p2', name: 'Sunny' },
  ],
  cards: CARDS,
  you: 'you',
};

const present = (events: GameEvent[]) => presentEvents(events, who);

describe('presentEvents — the log', () => {
  it('names the player, the action and the card', () => {
    const { lines } = present([{ type: 'CARD_PLAYED', playerId: 'p2', cardId: 'BD2#0' }]);
    expect(lines).toEqual(['Sunny played Blue Draw Two']);
  });

  it('addresses the viewer in the second person', () => {
    const { lines } = present([{ type: 'CARD_PLAYED', playerId: 'you', cardId: 'R5#0' }]);
    expect(lines).toEqual(['You play Red 5']);
  });

  it('describes a card the viewer cannot identify generically', () => {
    // An online client only holds its own hand and the top discard, so an
    // event can legitimately name a card it has no data for.
    const { lines } = present([{ type: 'CARD_PLAYED', playerId: 'p2', cardId: 'UNKNOWN' }]);
    expect(lines).toEqual(['Sunny played a card']);
  });

  it('counts drawn cards in words a person would use', () => {
    expect(present([{ type: 'CARD_DRAWN', playerId: 'p2', count: 1 }]).lines).toEqual([
      'Sunny drew a card',
    ]);
    expect(present([{ type: 'CARD_DRAWN', playerId: 'p2', count: 4 }]).lines).toEqual([
      'Sunny drew 4 cards',
    ]);
  });

  it('says the pile turned rather than crediting a choice nobody made', () => {
    // Wild Rush assigns the colour (RF-011). Saying "Sunny chose Red" would be
    // a lie about a decision the player never got to take.
    expect(
      present([{ type: 'COLOR_CHOSEN', playerId: 'p2', color: 'RED', auto: true }]).lines,
    ).toEqual(['Pile turns Red']);
    expect(present([{ type: 'COLOR_CHOSEN', playerId: 'p2', color: 'RED' }]).lines).toEqual([
      'Sunny chose Red',
    ]);
  });

  it('does not narrate your own one-card warning twice', () => {
    // Your own is already a modal and a lit button; an opponent's is news.
    expect(present([{ type: 'CLASH_PENDING', playerId: 'you' }]).lines).toEqual([]);
    expect(present([{ type: 'CLASH_PENDING', playerId: 'p2' }]).lines).toEqual([
      'Sunny is down to 1 card',
    ]);
  });

  it('ignores events the board already shows', () => {
    const { lines, banner } = present([
      { type: 'TURN_CHANGED', from: 'you', to: 'p2', direction: 1 },
      { type: 'CARD_DEALT', playerId: 'you', count: 7 },
      { type: 'GAME_STARTED', gameId: 'g', version: 'CLASSIC', players: ['you', 'p2'] },
    ]);
    expect(lines).toEqual([]);
    expect(banner).toBe(null);
  });

  it('produces nothing at all for an empty batch', () => {
    expect(present([])).toEqual({ lines: [], banner: null });
  });
});

describe('presentEvents — action banners', () => {
  it('gives Wild Rush actions the moment they were missing', () => {
    // Every one of these used to pass silently: the mode with the most going on
    // had the least feedback on screen.
    for (const [cardId, title] of [
      ['WSK#0', 'SKIPPED!'],
      ['WDS#0', 'DOUBLE SKIP!'],
      ['WRV#0', 'REVERSE!'],
      ['WTD2#0', 'TARGETED!'],
    ] as const) {
      const { banner } = present([{ type: 'CARD_PLAYED', playerId: 'p2', cardId }]);
      expect(banner?.title).toBe(title);
    }
  });

  it('leaves an ordinary number card without one', () => {
    expect(present([{ type: 'CARD_PLAYED', playerId: 'p2', cardId: 'R5#0' }]).banner).toBe(null);
  });

  it('shows a growing stack', () => {
    const { banner } = present([{ type: 'STACK_UPDATED', pendingDraw: 6 }]);
    expect(banner?.title).toBe('+6');
  });

  it('keeps the last banner when a batch contains several', () => {
    const { banner } = present([
      { type: 'CARD_PLAYED', playerId: 'p2', cardId: 'WSK#0' },
      { type: 'PLAYER_ELIMINATED', playerId: 'p2', reason: 'hand reached 25' },
    ]);
    expect(banner?.title).toBe('ELIMINATED!');
  });
});

/**
 * Who the banner is about.
 *
 * The note used to name whoever played the card — the one player it did not
 * happen to. "SKIPPED! / Sunny" for a skip *Sunny played* reads as "Sunny was
 * skipped" and sent the player looking at the wrong seat.
 */
describe('presentEvents — the banner names the player it happened to', () => {
  const table = {
    players: [
      { id: 'you', name: 'Ada' },
      { id: 'p2', name: 'Sunny' },
      { id: 'p3', name: 'Moonlight' },
      { id: 'p4', name: 'TigerX' },
    ],
    cards: CARDS,
    you: 'you',
  };
  const at = (events: GameEvent[]) => presentEvents(events, table);

  it('names the skipped player, not the one who played the skip', () => {
    const { banner } = at([
      { type: 'CARD_PLAYED', playerId: 'p2', cardId: 'WSK#0' },
      { type: 'TURN_CHANGED', from: 'p2', to: 'p4', direction: 1 },
    ]);
    expect(banner?.title).toBe('SKIPPED!');
    // p3 sat between them and lost the turn. p2 did the skipping.
    expect(banner?.note).toBe('Moonlight loses a turn');
  });

  it('says "You" when the skip lands on the viewer', () => {
    const { banner } = at([
      { type: 'CARD_PLAYED', playerId: 'p4', cardId: 'WSK#0' },
      { type: 'TURN_CHANGED', from: 'p4', to: 'p2', direction: 1 },
    ]);
    expect(banner?.note).toBe('You lose a turn');
  });

  it('names both players a double skip took out', () => {
    const { banner } = at([
      { type: 'CARD_PLAYED', playerId: 'you', cardId: 'WDS#0' },
      { type: 'TURN_CHANGED', from: 'you', to: 'p4', direction: 1 },
    ]);
    expect(banner?.note).toBe('Sunny and Moonlight lose a turn');
  });

  it('does not count an eliminated seat as skipped', () => {
    // The engine passes over eliminated seats on every turn; they were not
    // skipped, they are gone. Naming one would send the player to a dead seat.
    const withOut = {
      ...table,
      players: [
        { id: 'you', name: 'Ada' },
        { id: 'p2', name: 'Sunny' },
        { id: 'p3', name: 'Moonlight', eliminated: true },
        { id: 'p4', name: 'TigerX' },
      ],
    };
    const { banner } = presentEvents(
      [
        { type: 'CARD_PLAYED', playerId: 'p2', cardId: 'WSK#0' },
        { type: 'TURN_CHANGED', from: 'p2', to: 'you', direction: 1 },
      ],
      withOut,
    );
    expect(banner?.note).toBe('TigerX loses a turn');
  });

  it('follows the direction the turn actually moved', () => {
    const { banner } = at([
      { type: 'CARD_PLAYED', playerId: 'p2', cardId: 'WSK#0' },
      { type: 'TURN_CHANGED', from: 'p2', to: 'p4', direction: -1 },
    ]);
    // Going the other way round the table, 'you' is the seat jumped.
    expect(banner?.note).toBe('You lose a turn');
  });

  it('names who plays next on a reverse, since a reverse has no victim', () => {
    const { banner } = at([
      { type: 'CARD_PLAYED', playerId: 'p2', cardId: 'WRV#0' },
      { type: 'TURN_CHANGED', from: 'p2', to: 'you', direction: -1 },
    ]);
    expect(banner?.title).toBe('REVERSE!');
    expect(banner?.note).toBe('You play next');
  });

  it('names who takes the cards on a targeted draw', () => {
    const { banner } = at([
      { type: 'CARD_PLAYED', playerId: 'p2', cardId: 'WTD2#0' },
      { type: 'CARD_DRAWN', playerId: 'p3', count: 2 },
    ]);
    expect(banner?.note).toBe('Moonlight draws 2');
  });

  it('falls back to the player rather than inventing a victim', () => {
    // No turn change in the batch, so there is nothing to derive from. Vague
    // beats wrong.
    const { banner } = at([{ type: 'CARD_PLAYED', playerId: 'p2', cardId: 'WSK#0' }]);
    expect(banner?.title).toBe('SKIPPED!');
    expect(banner?.note).toBe('Sunny');
  });
});

describe('bannerMs — a caption fits inside its own beat', () => {
  it('never outlives the turn that follows it', () => {
    // The whole defect: 1400 ms against a 600-900 ms turn meant the caption was
    // still up while the next player, often the next two, acted.
    expect(bannerMs(600)).toBeLessThan(600);
    expect(bannerMs(900)).toBeLessThan(900);
  });

  it('stays readable rather than becoming a flash', () => {
    expect(bannerMs(200)).toBe(BANNER_MIN_MS);
    expect(bannerMs(0)).toBe(BANNER_MS);
  });

  it('never exceeds the original span', () => {
    expect(bannerMs(99_000)).toBe(BANNER_MS);
    expect(bannerMs(undefined)).toBe(BANNER_MS);
  });
});

describe('cueForEvent — the sound map', () => {
  it('maps the events that deserve a sound', () => {
    expect(cueForEvent({ type: 'CARD_PLAYED', playerId: 'p2', cardId: 'R5#0' })).toBe('CARD_PLAY');
    expect(cueForEvent({ type: 'CLASH_CALLED', playerId: 'p2' })).toBe('CLASH_OK');
    expect(cueForEvent({ type: 'CLASH_PENALTY', playerId: 'p2', count: 2 })).toBe('CLASH_MISSED');
    expect(cueForEvent({ type: 'PLAYER_ELIMINATED', playerId: 'p2', reason: 'x' })).toBe(
      'ELIMINATED',
    );
    expect(cueForEvent({ type: 'FLIP_TRIGGERED', playerId: 'p2', side: 'DARK_SIDE' })).toBe('FLIP');
  });

  it('tells a single draw from a penalty by the count', () => {
    expect(cueForEvent({ type: 'CARD_DRAWN', playerId: 'p2', count: 1 })).toBe('CARD_DRAW');
    expect(cueForEvent({ type: 'CARD_DRAWN', playerId: 'p2', count: 6 })).toBe('PENALTY');
  });

  it('only chimes for the turn that is actually yours', () => {
    const turn: GameEvent = { type: 'TURN_CHANGED', from: 'p2', to: 'you', direction: 1 };
    expect(cueForEvent(turn, 'you')).toBe('YOUR_TURN');
    expect(cueForEvent(turn, 'p2')).toBe(null);
    // No viewer, no idea whose turn it is, so no sound.
    expect(cueForEvent(turn)).toBe(null);
  });

  it('stays silent for bookkeeping', () => {
    expect(cueForEvent({ type: 'CARD_DEALT', playerId: 'you', count: 7 })).toBe(null);
    expect(
      cueForEvent({
        type: 'CHOICE_REQUESTED',
        choice: { type: 'COLOR', playerId: 'you' },
      }),
    ).toBe(null);
  });
});
