import { createRng } from '@colorclash/shared';
import { isPlayable, reduce } from '@colorclash/game-engine';
import { activeId, buildFixture, cmd, describe, expect, handOf, it } from '@colorclash/test-fixtures';

const rng = () => createRng('flex');

// The generated Flex matrix pairs each colour with the one two positions along:
// RED<->GREEN and YELLOW<->BLUE (CLASSIC_COLORS = RED, YELLOW, GREEN, BLUE).
const base = (over: Partial<Parameters<typeof buildFixture>[0]> = {}) =>
  buildFixture({
    version: 'FLEX',
    players: [
      { id: 'P1', hand: ['R7#0', 'G2#0'] },
      { id: 'P2', hand: ['B7#0', 'Y9#0'] },
      { id: 'P3', hand: ['R3#0', 'B4#0'] },
      { id: 'P4', hand: ['Y3#0', 'G8#0'] },
    ],
    discardPile: ['R5#0'],
    drawPile: ['B2#0', 'G9#0', 'Y4#0'],
    activeColor: 'RED',
    ...over,
  });

describe('FLEX — §2.6 source rule table', () => {
  it('the FlexPowerTracker starts available and is public state', () => {
    expect(base().flexPowerAvailable).toBe(true);
  });

  it('every coloured card carries a secondary colour distinct from its primary', () => {
    const s = base();
    const card = s.cards['R7#0']!;
    expect(card.flex!.secondaryColor).toBe('GREEN');
    expect(card.flex!.secondaryKind).toBe('NUMBER');
    expect(card.flex!.secondaryValue).toBe(7);
  });

  it('Flex Number validates through the secondary matrix when the primary fails', () => {
    // Active colour BLUE; G2 is neither blue nor a 5. Its secondary colour is
    // YELLOW, so it still fails — but B-secondary cards succeed.
    const s = base({ discardPile: ['B5#0'], activeColor: 'BLUE' });
    // Y9's secondary colour is BLUE (YELLOW <-> BLUE), so it becomes legal.
    const s2 = base({
      discardPile: ['B5#0'],
      activeColor: 'BLUE',
      players: [
        { id: 'P1', hand: ['Y9#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
      ],
    });
    expect(isPlayable(s2, 'Y9#0', 'P1')).toBe(true);
    // …and with the token already spent it is not.
    const spent = { ...s2, flexPowerAvailable: false };
    expect(isPlayable(spent, 'Y9#0', 'P1')).toBe(false);
    expect(s.flexPowerAvailable).toBe(true);
  });

  it('a flex-only play consumes the token atomically and sets the secondary colour', () => {
    const s0 = base({
      discardPile: ['B5#0'],
      activeColor: 'BLUE',
      players: [
        { id: 'P1', hand: ['Y9#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
      ],
    });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'Y9#0' }), rng()).state;
    expect(s.flexPowerAvailable).toBe(false);
    expect(s.activeColor).toBe('BLUE'); // the secondary colour that made it legal
  });

  it('Flex Draw Two: standard makes the next player draw 2', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['RD2#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
        { id: 'P3', hand: ['R3#0'] },
        { id: 'P4', hand: ['Y3#0'] },
      ],
    });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'RD2#0' }), rng()).state;
    expect(handOf(s, 'P2')).toHaveLength(3);
    expect(activeId(s)).toBe('P3');
    expect(s.flexPowerAvailable).toBe(true); // token untouched
  });

  it('Flex Draw Two: flex makes ALL other players draw 1 instead (SOURCE)', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['RD2#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
        { id: 'P3', hand: ['R3#0'] },
        { id: 'P4', hand: ['Y3#0'] },
      ],
    });
    const r = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'RD2#0', useFlex: true }), rng());
    const s = r.state;
    expect(handOf(s, 'P2')).toHaveLength(2);
    expect(handOf(s, 'P3')).toHaveLength(2);
    expect(handOf(s, 'P4')).toHaveLength(2);
    expect(s.flexPowerAvailable).toBe(false);
    expect(r.events.some((e) => e.type === 'FLEX_USED')).toBe(true);
    // No draw penalty on the next seat, so no skip: play continues normally.
    expect(activeId(s)).toBe('P2');
  });

  it('Flex Skip: standard skips one player', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['RSK#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
        { id: 'P3', hand: ['R3#0'] },
        { id: 'P4', hand: ['Y3#0'] },
      ],
    });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'RSK#0' }), rng()).state;
    expect(activeId(s)).toBe('P3');
  });

  it('Flex Skip: flex skips all opponents and grants another turn (SOURCE)', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['RSK#0', 'G2#0', 'R3#0'] },
        { id: 'P2', hand: ['B7#0'] },
        { id: 'P3', hand: ['Y3#0'] },
        { id: 'P4', hand: ['B4#0'] },
      ],
    });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'RSK#0', useFlex: true }), rng()).state;
    expect(activeId(s)).toBe('P1');
    expect(s.flexPowerAvailable).toBe(false);
  });

  it('the token cannot be spent twice', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['RSK#0', 'R3#0', 'G2#0'] },
        { id: 'P2', hand: ['B7#0'] },
      ],
    });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'RSK#0', useFlex: true }), rng()).state;
    expect(s.flexPowerAvailable).toBe(false);
    expect(() =>
      reduce(s, cmd('PLAY_CARD', 'P1', { cardId: 'R3#0', useFlex: true }), rng()),
    ).toThrow('FLEX_UNAVAILABLE');
  });

  it('USE_FLEX is equivalent to PLAY_CARD with the flex flag', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['RSK#0', 'G2#0', 'R3#0'] },
        { id: 'P2', hand: ['B7#0'] },
        { id: 'P3', hand: ['Y3#0'] },
      ],
    });
    const a = reduce(s0, cmd('USE_FLEX', 'P1', { cardId: 'RSK#0' }), rng()).state;
    const b = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'RSK#0', useFlex: true }), rng()).state;
    expect(a.activePlayerIndex).toBe(b.activePlayerIndex);
    expect(a.flexPowerAvailable).toBe(b.flexPowerAvailable);
  });
});
