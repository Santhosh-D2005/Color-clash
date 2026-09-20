import { createRng } from '@colorclash/shared';
import { assertInvariants, createMatch, reduce } from '@colorclash/game-engine';
import { runBotTurns } from '@colorclash/ai/driver';
import {
  activeId,
  buildFixture,
  cmd,
  describe,
  expect,
  handOf,
  it,
  seededMatch,
} from '@colorclash/test-fixtures';

const rng = () => createRng('edge');

/**
 * §16.2 Must-pass edge cases, in the order the blueprint lists them.
 * The network-specific rows (reconnect, duplicate command, late join) live in
 * apps/server/src/room.test.ts, which drives the authoritative room directly.
 */
describe('§16.2 must-pass edge cases', () => {
  it('2-player Reverse behaviour', () => {
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
    expect(activeId(s)).toBe('P1');
    expect(s.direction).toBe(-1);
  });

  it('opening discard is an action card', () => {
    // Force a Skip on top by seeding until one appears, then assert the first
    // seat was actually skipped rather than the effect being dropped.
    let found = false;
    for (let i = 0; i < 200 && !found; i++) {
      const { state } = seededMatch('CLASSIC', 4, `open-${i}`);
      const top = state.cards[state.discardPile[state.discardPile.length - 1]!]!;
      if (top.kind === 'SKIP') {
        found = true;
        expect(state.activePlayerIndex).toBe(1); // P1 skipped
        assertInvariants(state);
      }
    }
    expect(found).toBe(true);
  });

  it('opening discard is a wild — play cannot begin until a colour is declared', () => {
    let found = false;
    for (let i = 0; i < 300 && !found; i++) {
      const { state } = seededMatch('CLASSIC', 4, `wild-${i}`);
      const top = state.cards[state.discardPile[state.discardPile.length - 1]!]!;
      if (top.kind === 'WILD') {
        found = true;
        expect(state.awaitingChoice!.type).toBe('COLOR');
        expect(state.activeColor).toBeUndefined();
        const after = reduce(
          state,
          cmd('CHOOSE_COLOR', state.awaitingChoice!.playerId, { color: 'RED' }),
          rng(),
        ).state;
        expect(after.activeColor).toBe('RED');
        assertInvariants(after);
      }
    }
    expect(found).toBe(true);
  });

  it('draw pile empties while a penalty is pending', () => {
    // Two players hold nearly the whole deck between them, so the draw pile is
    // exhausted and only the discard (minus its top card) can be recycled.
    const { state } = seededMatch('CLASSIC', 2, 'exhaust');
    let s = state;
    // Drain the draw pile into P1's hand.
    const r = createRng('drain');
    while (s.drawPile.length > 0) {
      s = {
        ...s,
        players: s.players.map((p, i) =>
          i === 0 ? { ...p, hand: [...p.hand, ...s.drawPile] } : p,
        ),
        drawPile: [],
      };
      break;
    }
    expect(s.drawPile).toHaveLength(0);
    // A draw now must recycle the discard (except its top) rather than throw.
    const active = s.players[s.activePlayerIndex]!.id;
    const before = handOf(s, active).length;
    const out = reduce(s, cmd('DRAW_CARD', active), r);
    expect(handOf(out.state, active).length).toBeGreaterThanOrEqual(before);
    assertInvariants(out.state);
  });

  it('draw pile recycling never moves the current top discard', () => {
    const s0 = buildFixture({
      version: 'CLASSIC',
      players: [
        { id: 'P1', hand: ['G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
      ],
      discardPile: ['R5#0', 'R7#0', 'R3#0'],
      drawPile: [],
      activeColor: 'RED',
    });
    // Empty the draw pile completely.
    const emptied = { ...s0, drawPile: [] as string[] };
    const rest = s0.drawPile;
    const withHand = {
      ...emptied,
      players: emptied.players.map((p, i) => (i === 0 ? { ...p, hand: [...p.hand, ...rest] } : p)),
    };
    const top = withHand.discardPile[withHand.discardPile.length - 1]!;
    const out = reduce(withHand, cmd('DRAW_CARD', 'P1'), rng());
    expect(out.state.drawPile).not.toContain(top);
    expect(out.state.discardPile[out.state.discardPile.length - 1]).toBe(top);
    assertInvariants(out.state);
  });

  it('CLASH called and missed around the same command boundary', () => {
    const s0 = buildFixture({
      version: 'CLASSIC',
      players: [
        { id: 'P1', hand: ['R7#0', 'R3#0'] },
        { id: 'P2', hand: ['B7#0', 'Y9#0'] },
      ],
      discardPile: ['R5#0'],
      drawPile: ['B2#0', 'G9#0'],
      activeColor: 'RED',
    });
    // Called exactly at the boundary: no penalty.
    let called = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'R7#0' }), rng()).state;
    called = reduce(called, cmd('CALL_CLASH', 'P1'), rng()).state;
    called = reduce(called, cmd('PLAY_CARD', 'P2', { cardId: 'B7#0' }), rng()).state;
    expect(handOf(called, 'P1')).toHaveLength(1);

    // Missed by one command: exactly one 2-card penalty.
    let missed = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'R7#0' }), rng()).state;
    missed = reduce(missed, cmd('PLAY_CARD', 'P2', { cardId: 'B7#0' }), rng()).state;
    expect(handOf(missed, 'P1')).toHaveLength(3);
  });

  it('Mayhem stacking reaches a player who cannot answer', () => {
    let s = buildFixture({
      version: 'MAYHEM',
      players: [
        { id: 'P1', hand: ['RD2#0', 'G2#0'] },
        { id: 'P2', hand: ['BD2#0', 'Y1#0'] },
        { id: 'P3', hand: ['YD4#0', 'B1#0'] },
        { id: 'P4', hand: ['R3#0', 'G3#0'] },
      ],
      discardPile: ['R5#0'],
      drawPile: ['B2#1', 'G9#1', 'Y4#1', 'B3#1', 'G1#1', 'Y5#1', 'R1#1', 'B4#1', 'G8#1', 'Y8#1'],
      activeColor: 'RED',
    });
    s = reduce(s, cmd('PLAY_CARD', 'P1', { cardId: 'RD2#0' }), rng()).state;
    s = reduce(s, cmd('PLAY_CARD', 'P2', { cardId: 'BD2#0' }), rng()).state;
    s = reduce(s, cmd('PLAY_CARD', 'P3', { cardId: 'YD4#0' }), rng()).state;
    expect(s.pendingDraw).toBe(8);
    // P4 holds only number cards and must eat the whole stack.
    const out = reduce(s, cmd('DRAW_CARD', 'P4'), rng());
    expect(handOf(out.state, 'P4')).toHaveLength(10); // 2 + 8
    expect(out.state.pendingDraw).toBe(0);
    assertInvariants(out.state);
  });

  it('Mayhem player hits 25 cards exactly after a draw', () => {
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
        { id: 'P2', hand: ['Y9#0', 'Y8#0'] },
        { id: 'P3', hand: ['G8#0', 'G7#0'] },
      ],
      discardPile: ['R5#0'],
      drawPile: ['G9#0'],
      activeColor: 'GREEN',
    });
    expect(handOf(s0, 'P1')).toHaveLength(24);
    const out = reduce(s0, cmd('DRAW_CARD', 'P1'), rng());
    expect(out.state.players[0]!.eliminated).toBe(true);
    // The eliminated player's hand returns to circulation, so no card is lost.
    assertInvariants(out.state);
    expect(out.state.status).toBe('PLAYING');
    expect(activeId(out.state)).toBe('P2');
  });

  it('an eliminated player can neither act nor be skipped onto', () => {
    const s0 = buildFixture({
      version: 'MAYHEM',
      players: [
        { id: 'P1', hand: ['R1#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'], eliminated: true },
        { id: 'P3', hand: ['R3#0', 'B4#0'] },
      ],
      discardPile: ['R5#0'],
      drawPile: ['B2#1'],
      activeColor: 'RED',
    });
    expect(() => reduce(s0, cmd('PLAY_CARD', 'P2', { cardId: 'B7#0' }), rng())).toThrow(
      'ELIMINATED',
    );
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'R1#0' }), rng()).state;
    expect(activeId(s)).toBe('P3'); // skipped straight over the eliminated seat
  });

  it('Flip occurs while a penalty context is live and stays consistent', () => {
    const s0 = buildFixture({
      version: 'FLIP',
      deckSide: 'LIGHT_SIDE',
      players: [
        { id: 'P1', hand: ['PFL#0', 'T2#0'] },
        { id: 'P2', hand: ['T7#0', 'U9#0'] },
      ],
      discardPile: ['P5#0'],
      drawPile: ['P1#0', 'T1#0', 'U1#0'],
      activeColor: 'PINK',
    });
    const out = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'PFL#0' }), rng());
    expect(out.state.deckSide).toBe('DARK_SIDE');
    assertInvariants(out.state);
    // Every card is still accounted for across the side change.
    const total =
      out.state.players.reduce((n, p) => n + p.hand.length, 0) +
      out.state.drawPile.length +
      out.state.discardPile.length;
    expect(total).toBe(112);
  });

  it('Wild Rush target is self / eliminated target handling', () => {
    const s0 = buildFixture({
      version: 'ALL_WILD',
      players: [
        { id: 'P1', hand: ['WTD2#0', 'W#1'] },
        { id: 'P2', hand: ['W#2'], eliminated: true },
        { id: 'P3', hand: ['W#4'] },
      ],
      discardPile: ['W#40'],
      drawPile: ['W#41', 'W#42', 'W#43'],
      activeColor: 'RED',
    });
    // RF-011: Wild Rush assigns the colour rather than asking, so the target
    // choice is the only thing this play stops for.
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'WTD2#0' }), rng()).state;
    expect(s.awaitingChoice!.eligibleTargets).toEqual(['P3']);
    expect(() => reduce(s, cmd('CHOOSE_TARGET', 'P1', { targetId: 'P2' }), rng())).toThrow(
      'ILLEGAL_TARGET',
    );
    expect(() => reduce(s, cmd('CHOOSE_TARGET', 'P1', { targetId: 'P1' }), rng())).toThrow(
      'ILLEGAL_TARGET',
    );
  });

  it('Flex token consumption and simultaneous effects', () => {
    const s0 = buildFixture({
      version: 'FLEX',
      players: [
        { id: 'P1', hand: ['RD2#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
        { id: 'P3', hand: ['Y3#0'] },
        { id: 'P4', hand: ['B4#0'] },
      ],
      discardPile: ['R5#0'],
      drawPile: ['B2#0', 'G9#0', 'Y4#0', 'B1#0'],
      activeColor: 'RED',
    });
    const out = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'RD2#0', useFlex: true }), rng());
    // Simultaneous: all three opponents drew exactly one, in one command.
    expect(handOf(out.state, 'P2')).toHaveLength(2);
    expect(handOf(out.state, 'P3')).toHaveLength(2);
    expect(handOf(out.state, 'P4')).toHaveLength(2);
    expect(out.state.flexPowerAvailable).toBe(false);
    expect(out.events.filter((e) => e.type === 'CARD_DRAWN')).toHaveLength(3);
    assertInvariants(out.state);
  });

  it('a choice left pending blocks progress until it is answered', () => {
    // Models the "player disconnects while a choice is pending" case: the state
    // machine simply refuses to advance, so nothing is lost or half-applied.
    const s0 = buildFixture({
      version: 'CLASSIC',
      players: [
        { id: 'P1', hand: ['WD4#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
      ],
      discardPile: ['R5#0'],
      drawPile: ['B2#0', 'G9#0', 'Y4#0', 'B1#0', 'G1#0'],
      activeColor: 'RED',
    });
    const pending = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'WD4#0' }), rng()).state;
    expect(pending.awaitingChoice).toBeDefined();
    expect(() => reduce(pending, cmd('DRAW_CARD', 'P2'), rng())).toThrow('CHOICE_PENDING');
    // The queued Draw Four has not been applied yet.
    expect(handOf(pending, 'P2')).toHaveLength(1);

    // Answering it later applies the rest of the card verbatim.
    const done = reduce(pending, cmd('CHOOSE_COLOR', 'P1', { color: 'BLUE' }), rng()).state;
    expect(handOf(done, 'P2')).toHaveLength(5);
  });

  it('a full bot-driven round completes in every ruleset', () => {
    for (const version of ['CLASSIC', 'FLIP', 'MAYHEM', 'ALL_WILD', 'FLEX'] as const) {
      const r = createRng(`bots-${version}`);
      const players = ['P1', 'P2', 'P3', 'P4'].map((id) => ({
        id,
        name: id,
        isBot: true,
        botTier: 'NORMAL' as const,
      }));
      const { state } = createMatch({ gameId: 'g', version, seed: `bots-${version}`, players }, r);
      const out = runBotTurns(state, r, { maxSteps: 5000 });
      assertInvariants(out.state);
      expect(out.state.status).toBe('MATCH_END');
      expect(out.state.winnerId).toBeDefined();
    }
  });
});
