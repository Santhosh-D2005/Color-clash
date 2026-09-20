import { createRng } from '@colorclash/shared';
import { reduce } from '@colorclash/game-engine';
import {
  activeId,
  buildFixture,
  cmd,
  describe,
  expect,
  handOf,
  it,
} from '@colorclash/test-fixtures';

const rng = () => createRng('mayhem');

const base = (over: Partial<Parameters<typeof buildFixture>[0]> = {}) =>
  buildFixture({
    version: 'MAYHEM',
    players: [
      { id: 'P1', hand: ['R7#0', 'G2#0'] },
      { id: 'P2', hand: ['B7#0', 'Y9#0'] },
      { id: 'P3', hand: ['R3#0', 'B4#0'] },
      { id: 'P4', hand: ['Y3#0', 'G8#0'] },
    ],
    discardPile: ['R5#0'],
    drawPile: ['B2#1', 'G9#1', 'Y4#1', 'B1#1', 'G1#1', 'Y1#1', 'R1#1', 'B3#1', 'G3#1', 'Y5#1'],
    activeColor: 'RED',
    ...over,
  });

describe('MAYHEM — §2.4 source rule table', () => {
  it('Draw Two opens a stacking context rather than drawing immediately', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['RD2#0', 'G2#0'] },
        { id: 'P2', hand: ['BD2#0'] },
        { id: 'P3', hand: ['R3#0'] },
        { id: 'P4', hand: ['Y3#0'] },
      ],
    });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'RD2#0' }), rng()).state;
    expect(s.pendingDraw).toBe(2);
    expect(s.penalty.minimumResponsePenalty).toBe(2);
    expect(handOf(s, 'P2')).toHaveLength(1); // nothing drawn yet
    expect(activeId(s)).toBe('P2');
  });

  it('a matching-or-higher card passes the stack on and accumulates it', () => {
    let s = base({
      players: [
        { id: 'P1', hand: ['RD2#0', 'G2#0'] },
        { id: 'P2', hand: ['BD2#0', 'Y1#0'] },
        { id: 'P3', hand: ['RD4#0', 'B1#0'] },
        { id: 'P4', hand: ['Y3#0'] },
      ],
    });
    s = reduce(s, cmd('PLAY_CARD', 'P1', { cardId: 'RD2#0' }), rng()).state;
    s = reduce(s, cmd('PLAY_CARD', 'P2', { cardId: 'BD2#0' }), rng()).state;
    expect(s.pendingDraw).toBe(4);
    s = reduce(s, cmd('PLAY_CARD', 'P3', { cardId: 'RD4#0' }), rng()).state;
    expect(s.pendingDraw).toBe(8);
    expect(s.penalty.minimumResponsePenalty).toBe(4);
  });

  it('a lower draw card cannot answer a higher stack', () => {
    let s = base({
      players: [
        { id: 'P1', hand: ['RD4#0', 'G2#0'] },
        { id: 'P2', hand: ['RD2#0'] },
        { id: 'P3', hand: ['R3#0'] },
        { id: 'P4', hand: ['Y3#0'] },
      ],
    });
    s = reduce(s, cmd('PLAY_CARD', 'P1', { cardId: 'RD4#0' }), rng()).state;
    expect(s.pendingDraw).toBe(4);
    expect(() => reduce(s, cmd('PLAY_CARD', 'P2', { cardId: 'RD2#0' }), rng())).toThrow(
      'MUST_ANSWER_PENALTY',
    );
  });

  it('the cumulative penalty lands on the first player unable to respond (SOURCE)', () => {
    let s = base({
      players: [
        { id: 'P1', hand: ['RD2#0', 'G2#0'] },
        { id: 'P2', hand: ['BD2#0', 'Y1#0'] },
        { id: 'P3', hand: ['R3#0'] },
        { id: 'P4', hand: ['Y3#0'] },
      ],
    });
    s = reduce(s, cmd('PLAY_CARD', 'P1', { cardId: 'RD2#0' }), rng()).state;
    s = reduce(s, cmd('PLAY_CARD', 'P2', { cardId: 'BD2#0' }), rng()).state;
    expect(s.pendingDraw).toBe(4);
    // P3 cannot answer, so it takes the whole stack.
    s = reduce(s, cmd('DRAW_CARD', 'P3'), rng()).state;
    expect(handOf(s, 'P3')).toHaveLength(5); // 1 + 4
    expect(s.pendingDraw).toBe(0);
    expect(activeId(s)).toBe('P4');
  });

  it('a non-draw card cannot be played into an active stack', () => {
    const s = reduce(
      base({
        players: [
          { id: 'P1', hand: ['RD2#0', 'G2#0'] },
          { id: 'P2', hand: ['R3#0'] },
          { id: 'P3', hand: ['B4#0'] },
          { id: 'P4', hand: ['Y3#0'] },
        ],
      }),
      cmd('PLAY_CARD', 'P1', { cardId: 'RD2#0' }),
      rng(),
    ).state;
    expect(() => reduce(s, cmd('PLAY_CARD', 'P2', { cardId: 'R3#0' }), rng())).toThrow(
      'MUST_ANSWER_PENALTY',
    );
  });

  it('Wild Draw Six and Wild Draw Ten feed the same stacking vector (SOURCE)', () => {
    let s = base({
      players: [
        { id: 'P1', hand: ['WD6#0', 'G2#0'] },
        { id: 'P2', hand: ['WD10#0', 'Y1#0'] },
        { id: 'P3', hand: ['R3#0'] },
        { id: 'P4', hand: ['Y3#0'] },
      ],
    });
    s = reduce(s, cmd('PLAY_CARD', 'P1', { cardId: 'WD6#0' }), rng()).state;
    s = reduce(s, cmd('CHOOSE_COLOR', 'P1', { color: 'BLUE' }), rng()).state;
    expect(s.pendingDraw).toBe(6);
    s = reduce(s, cmd('PLAY_CARD', 'P2', { cardId: 'WD10#0' }), rng()).state;
    s = reduce(s, cmd('CHOOSE_COLOR', 'P2', { color: 'GREEN' }), rng()).state;
    expect(s.pendingDraw).toBe(16);
  });

  it('a player is eliminated the moment a draw puts them at 25 cards (SOURCE)', () => {
    // 24 cards in hand plus a 1-card draw crosses the threshold exactly.
    const hand24 = [
      'R0#0',
      'R1#0',
      'R1#1',
      'R2#0',
      'R2#1',
      'R3#0',
      'R3#1',
      'R4#0',
      'R4#1',
      'R5#1',
      'R6#0',
      'R6#1',
      'R7#0',
      'R7#1',
      'R8#0',
      'R8#1',
      'R9#0',
      'R9#1',
      'B1#0',
      'B1#1',
      'B2#0',
      'B2#1',
      'B3#0',
      'B3#1',
    ];
    const s0 = buildFixture({
      version: 'MAYHEM',
      players: [
        { id: 'P1', hand: hand24 },
        { id: 'P2', hand: ['Y9#0'] },
      ],
      discardPile: ['R5#0'],
      drawPile: ['G9#0'],
      activeColor: 'GREEN', // nothing in P1's hand is green or a 5
    });
    const r = reduce(s0, cmd('DRAW_CARD', 'P1'), rng());
    expect(r.events.some((e) => e.type === 'PLAYER_ELIMINATED')).toBe(true);
    expect(r.state.players[0]!.eliminated).toBe(true);
    // Last player standing wins the round.
    expect(r.state.winnerId).toBe('P2');
  });

  it('playing a 7 forces a hand swap choice (SOURCE "7 rule")', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['R7#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
        { id: 'P3', hand: ['R3#0', 'B4#0', 'Y3#0'] },
        { id: 'P4', hand: ['G8#0'] },
      ],
    });
    const played = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'R7#0' }), rng()).state;
    expect(played.awaitingChoice!.type).toBe('SWAP_HAND');
    expect(played.awaitingChoice!.eligibleTargets).toEqual(['P2', 'P3', 'P4']);

    const s = reduce(played, cmd('SWAP_HAND', 'P1', { targetId: 'P3' }), rng()).state;
    expect(handOf(s, 'P1')).toHaveLength(3);
    expect(handOf(s, 'P3')).toHaveLength(1);
    expect(activeId(s)).toBe('P2');
  });

  it('playing a 0 rotates every hand down the turn queue (SOURCE "0 rule")', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['R0#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
        { id: 'P3', hand: ['R3#0', 'B4#0', 'Y3#0'] },
        { id: 'P4', hand: ['G8#0', 'Y5#0'] },
      ],
      drawPile: ['B2#0'],
    });
    const r = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'R0#0' }), rng());
    const s = r.state;
    expect(r.events.some((e) => e.type === 'HANDS_ROTATED')).toBe(true);
    // direction +1: each player receives the hand of the player behind them.
    expect(handOf(s, 'P1')).toHaveLength(2); // was P4's (2)
    expect(handOf(s, 'P2')).toHaveLength(1); // was P1's remaining (1)
    expect(handOf(s, 'P3')).toHaveLength(1); // was P2's
    expect(handOf(s, 'P4')).toHaveLength(3); // was P3's
  });

  it('Discard All moves every matching-colour card in one transaction (SOURCE)', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['RDA#0', 'R1#0', 'R2#0', 'B4#0'] },
        { id: 'P2', hand: ['B7#0'] },
      ],
      discardPile: ['R5#0'],
      drawPile: ['B2#0', 'G9#0'],
      activeColor: 'RED',
    });
    const r = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'RDA#0' }), rng());
    const s = r.state;
    expect(handOf(s, 'P1')).toEqual(['B4#0']);
    expect(r.events.some((e) => e.type === 'DISCARD_ALL')).toBe(true);
    // The played card stays on top, so the active colour is unchanged.
    expect(s.discardPile[s.discardPile.length - 1]).toBe('RDA#0');
    expect(s.activeColor).toBe('RED');
  });

  it('Wild Reverse Skip reverses and skips as one combined effect (§8.4)', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['WRS#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
        { id: 'P3', hand: ['R3#0'] },
        { id: 'P4', hand: ['Y3#0'] },
      ],
    });
    let s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'WRS#0' }), rng()).state;
    s = reduce(s, cmd('CHOOSE_COLOR', 'P1', { color: 'YELLOW' }), rng()).state;
    expect(s.direction).toBe(-1);
    // Reversed to P4, then skipped over them -> P3.
    expect(activeId(s)).toBe('P3');
    expect(s.activeColor).toBe('YELLOW');
  });

  it('an eliminated player is never a legal swap target', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['R7#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'], eliminated: true },
        { id: 'P3', hand: ['R3#0'] },
        { id: 'P4', hand: ['Y3#0'] },
      ],
    });
    const played = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'R7#0' }), rng()).state;
    expect(played.awaitingChoice!.eligibleTargets).toEqual(['P3', 'P4']);
    expect(() => reduce(played, cmd('SWAP_HAND', 'P1', { targetId: 'P2' }), rng())).toThrow(
      'ILLEGAL_TARGET',
    );
  });
});
