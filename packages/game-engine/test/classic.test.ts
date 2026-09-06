import { createRng } from '@colorclash/shared';
import { reduce } from '@colorclash/game-engine';
import { activeId, buildFixture, cmd, describe, expect, handOf, it } from '@colorclash/test-fixtures';

const rng = () => createRng('classic');

const base = (over: Partial<Parameters<typeof buildFixture>[0]> = {}) =>
  buildFixture({
    version: 'CLASSIC',
    players: [
      { id: 'P1', hand: ['R7#0', 'G2#0'] },
      { id: 'P2', hand: ['B7#0', 'Y9#0'] },
      { id: 'P3', hand: ['R3#0', 'B4#0'] },
      { id: 'P4', hand: ['Y3#0', 'G8#0'] },
    ],
    discardPile: ['R5#0'],
    drawPile: ['W#0', 'B2#0', 'G9#0'],
    activePlayerIndex: 0,
    direction: 1,
    activeColor: 'RED',
    ...over,
  });

describe('CLASSIC — §2.2 source rule table', () => {
  it('a colour match is legal and passes the turn to the next seat', () => {
    const s = reduce(base(), cmd('PLAY_CARD', 'P1', { cardId: 'R7#0' }), rng()).state;
    expect(activeId(s)).toBe('P2');
    expect(s.activeColor).toBe('RED');
    expect(handOf(s, 'P1')).toHaveLength(1);
  });

  it('a value match across colours is legal (SOURCE "Value match")', () => {
    const s0 = base({ discardPile: ['B7#0'], activeColor: 'BLUE', players: [
      { id: 'P1', hand: ['R7#0', 'G2#0'] },
      { id: 'P2', hand: ['Y9#0'] },
    ] });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'R7#0' }), rng()).state;
    expect(s.activeColor).toBe('RED');
  });

  it('rejects a card that matches neither colour nor value', () => {
    const s = base();
    expect(() => reduce(s, cmd('PLAY_CARD', 'P1', { cardId: 'G2#0' }), rng())).toThrow('NO_MATCH');
  });

  it('Skip advances the turn +2 (SOURCE)', () => {
    const s0 = base({ players: [
      { id: 'P1', hand: ['RSK#0', 'G2#0'] },
      { id: 'P2', hand: ['B7#0'] },
      { id: 'P3', hand: ['R3#0'] },
      { id: 'P4', hand: ['Y3#0'] },
    ] });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'RSK#0' }), rng()).state;
    expect(activeId(s)).toBe('P3');
  });

  it('Reverse inverts direction in a 4-player game', () => {
    const s0 = base({ players: [
      { id: 'P1', hand: ['RRV#0', 'G2#0'] },
      { id: 'P2', hand: ['B7#0'] },
      { id: 'P3', hand: ['R3#0'] },
      { id: 'P4', hand: ['Y3#0'] },
    ] });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'RRV#0' }), rng()).state;
    expect(s.direction).toBe(-1);
    expect(activeId(s)).toBe('P4');
  });

  it('Reverse behaves like Skip in a 2-player game (SOURCE, §16.2 edge case)', () => {
    // Appendix C fixture: 2 players, P1 plays a Reverse.
    const s0 = buildFixture({
      version: 'CLASSIC',
      players: [
        { id: 'P1', hand: ['RRV#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
      ],
      discardPile: ['R5#0'],
      drawPile: ['B2#0'],
      activeColor: 'RED',
    });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'RRV#0' }), rng()).state;
    expect(s.direction).toBe(-1);
    // Equivalent to skip behaviour: control returns to P1.
    expect(activeId(s)).toBe('P1');
  });

  it('Draw Two makes the next player draw 2 and moves over them (+2)', () => {
    const s0 = base({ players: [
      { id: 'P1', hand: ['RD2#0', 'G2#0'] },
      { id: 'P2', hand: ['B7#0'] },
      { id: 'P3', hand: ['R3#0'] },
      { id: 'P4', hand: ['Y3#0'] },
    ] });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'RD2#0' }), rng()).state;
    expect(handOf(s, 'P2')).toHaveLength(3);
    expect(activeId(s)).toBe('P3');
  });

  it('Wild requires a colour declaration before play continues', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['W#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
        { id: 'P3', hand: ['R3#0'] },
        { id: 'P4', hand: ['Y3#0'] },
      ],
      drawPile: ['B2#0', 'G9#0'],
    });
    const played = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'W#0' }), rng()).state;
    expect(played.awaitingChoice!.type).toBe('COLOR');
    expect(played.awaitingChoice!.playerId).toBe('P1');
    // The turn has not moved while the choice is open.
    expect(activeId(played)).toBe('P1');

    const done = reduce(played, cmd('CHOOSE_COLOR', 'P1', { color: 'GREEN' }), rng()).state;
    expect(done.activeColor).toBe('GREEN');
    expect(activeId(done)).toBe('P2');
    expect(done.awaitingChoice).toBeUndefined();
  });

  it('blocks every other command while a colour choice is pending', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['W#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
      ],
      drawPile: ['B2#0', 'G9#0'],
    });
    const played = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'W#0' }), rng()).state;
    expect(() => reduce(played, cmd('PLAY_CARD', 'P1', { cardId: 'G2#0' }), rng())).toThrow(
      'CHOICE_PENDING',
    );
    expect(() => reduce(played, cmd('CHOOSE_COLOR', 'P2', { color: 'RED' }), rng())).toThrow(
      'NOT_YOUR_CHOICE',
    );
  });

  it('Wild Draw Four: select colour, target draws 4, then skip (SOURCE)', () => {
    const s0 = base({ players: [
      { id: 'P1', hand: ['WD4#0', 'G2#0'] },
      { id: 'P2', hand: ['B7#0'] },
      { id: 'P3', hand: ['R3#0'] },
      { id: 'P4', hand: ['Y3#0'] },
    ] });
    const played = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'WD4#0' }), rng()).state;
    const done = reduce(played, cmd('CHOOSE_COLOR', 'P1', { color: 'BLUE' }), rng()).state;
    expect(done.activeColor).toBe('BLUE');
    expect(handOf(done, 'P2')).toHaveLength(5);
    expect(activeId(done)).toBe('P3');
  });

  it('rejects a play from a player whose turn it is not', () => {
    expect(() => reduce(base(), cmd('PLAY_CARD', 'P2', { cardId: 'B7#0' }), rng())).toThrow(
      'NOT_YOUR_TURN',
    );
  });

  it('rejects a card the player does not hold', () => {
    expect(() => reduce(base(), cmd('PLAY_CARD', 'P1', { cardId: 'B7#0' }), rng())).toThrow(
      'NOT_YOUR_CARD',
    );
  });

  it('drawing an unplayable card passes the turn immediately', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
      ],
      drawPile: ['B4#0'], // not red, not a 5
      discardPile: ['R5#0'],
      activeColor: 'RED',
    });
    const s = reduce(s0, cmd('DRAW_CARD', 'P1'), rng()).state;
    expect(handOf(s, 'P1')).toHaveLength(2);
    expect(activeId(s)).toBe('P2');
  });

  it('drawing a playable card keeps the turn and allows an explicit pass', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
      ],
      drawPile: ['R3#0'], // matches RED
      discardPile: ['R5#0'],
      activeColor: 'RED',
    });
    const drew = reduce(s0, cmd('DRAW_CARD', 'P1'), rng()).state;
    expect(activeId(drew)).toBe('P1');
    expect(drew.mayPass).toBe(true);
    const passed = reduce(drew, cmd('END_TURN', 'P1'), rng()).state;
    expect(activeId(passed)).toBe('P2');
  });

  it('emptying a hand ends the round and names the winner', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['R7#0'] },
        { id: 'P2', hand: ['B7#0', 'Y9#0'] },
      ],
      discardPile: ['R5#0'],
      activeColor: 'RED',
    });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'R7#0' }), rng()).state;
    expect(s.status).toBe('MATCH_END');
    expect(s.winnerId).toBe('P1');
  });
});
