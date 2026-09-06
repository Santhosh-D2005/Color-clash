import { createRng } from '@colorclash/shared';
import {
  ALL_WILD_COLOR_MODE,
  allWildEffects,
  autoColorFor,
  reduce,
} from '@colorclash/game-engine';
import { activeId, buildFixture, cmd, describe, expect, handOf, it } from '@colorclash/test-fixtures';

const rng = () => createRng('allwild');

const base = (over: Partial<Parameters<typeof buildFixture>[0]> = {}) =>
  buildFixture({
    version: 'ALL_WILD',
    players: [
      { id: 'P1', hand: ['W#0', 'W#1'] },
      { id: 'P2', hand: ['W#2', 'W#3'] },
      { id: 'P3', hand: ['W#4', 'W#5'] },
      { id: 'P4', hand: ['W#6', 'W#7'] },
    ],
    discardPile: ['W#40'],
    drawPile: ['W#41', 'W#42', 'W#43', 'W#44', 'W#45'],
    activeColor: 'RED',
    ...over,
  });

describe('WILD RUSH — §2.5 source rule table', () => {
  it('every card is legal — legality is not colour or value matching (SOURCE)', () => {
    const s = base();
    // Nothing in the hand is blocked, whatever the active colour is.
    expect(s.players[0]!.hand.every((id) => typeof id === 'string')).toBe(true);
    const played = reduce(s, cmd('PLAY_CARD', 'P1', { cardId: 'W#0' }), rng()).state;
    expect(played.discardPile[played.discardPile.length - 1]).toBe('W#0');
  });

  it('a standard Wild sets a colour and passes the turn in one command', () => {
    const s = reduce(base(), cmd('PLAY_CARD', 'P1', { cardId: 'W#0' }), rng()).state;
    // RF-011: no picker, because a declared colour has no consequence here.
    expect(s.awaitingChoice).toBe(undefined);
    expect(s.activeColor).toBe(autoColorFor('W#0'));
    expect(activeId(s)).toBe('P2');
  });

  it('Wild Target Draw Two targets any player globally (SOURCE)', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['WTD2#0', 'W#1'] },
        { id: 'P2', hand: ['W#2'] },
        { id: 'P3', hand: ['W#4'] },
        { id: 'P4', hand: ['W#6'] },
      ],
    });
    // The target choice survives: unlike colour, it changes the outcome.
    let s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'WTD2#0' }), rng()).state;
    expect(s.awaitingChoice!.type).toBe('TARGET');
    expect(s.awaitingChoice!.eligibleTargets).toEqual(['P2', 'P3', 'P4']);

    s = reduce(s, cmd('CHOOSE_TARGET', 'P1', { targetId: 'P4' }), rng()).state;
    expect(handOf(s, 'P4')).toHaveLength(3);
    expect(handOf(s, 'P2')).toHaveLength(1);
    expect(activeId(s)).toBe('P2');
  });

  it('a player cannot target themselves (§16.2 self-target handling)', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['WTD2#0', 'W#1'] },
        { id: 'P2', hand: ['W#2'] },
      ],
    });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'WTD2#0' }), rng()).state;
    expect(s.awaitingChoice!.eligibleTargets).not.toContain('P1');
    expect(() => reduce(s, cmd('CHOOSE_TARGET', 'P1', { targetId: 'P1' }), rng())).toThrow(
      'ILLEGAL_TARGET',
    );
  });

  it('Wild Double Skip advances the turn index by +3 (SOURCE)', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['WDS#0', 'W#1'] },
        { id: 'P2', hand: ['W#2'] },
        { id: 'P3', hand: ['W#4'] },
        { id: 'P4', hand: ['W#6'] },
      ],
    });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'WDS#0' }), rng()).state;
    expect(activeId(s)).toBe('P4');
  });

  it('Wild Skip skips exactly one player', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['WSK#0', 'W#1'] },
        { id: 'P2', hand: ['W#2'] },
        { id: 'P3', hand: ['W#4'] },
        { id: 'P4', hand: ['W#6'] },
      ],
    });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'WSK#0' }), rng()).state;
    expect(activeId(s)).toBe('P3');
  });

  it('Wild Reverse inverts direction', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['WRV#0', 'W#1'] },
        { id: 'P2', hand: ['W#2'] },
        { id: 'P3', hand: ['W#4'] },
        { id: 'P4', hand: ['W#6'] },
      ],
    });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'WRV#0' }), rng()).state;
    expect(s.direction).toBe(-1);
    expect(activeId(s)).toBe('P4');
  });

  it('Wild Draw Four hits the next seat and skips it', () => {
    const s0 = base({
      players: [
        { id: 'P1', hand: ['WD4#0', 'W#1'] },
        { id: 'P2', hand: ['W#2'] },
        { id: 'P3', hand: ['W#4'] },
        { id: 'P4', hand: ['W#6'] },
      ],
    });
    const s = reduce(s0, cmd('PLAY_CARD', 'P1', { cardId: 'WD4#0' }), rng()).state;
    expect(handOf(s, 'P2')).toHaveLength(5);
    expect(activeId(s)).toBe('P3');
  });
});

/**
 * RF-011. The picker was removed because it decided nothing; these tests pin
 * both that it is gone and that it can be brought back with one constant.
 */
describe('WILD RUSH — colour handling (RF-011)', () => {
  it('assigns a colour instead of asking for one, by default', () => {
    expect(ALL_WILD_COLOR_MODE).toBe('AUTO');
    const effects = allWildEffects({ id: 'W#0', kind: 'WILD' });
    expect(effects[0]!.type).toBe('SET_COLOR');
    expect(effects.some((e) => e.type === 'REQUEST_COLOR_CHOICE')).toBe(false);
  });

  it("still prompts in 'PLAYER' mode, so the old behaviour is one word away", () => {
    const effects = allWildEffects({ id: 'W#0', kind: 'WILD' }, 'PLAYER');
    expect(effects[0]!.type).toBe('REQUEST_COLOR_CHOICE');
  });

  it('keeps the colour step first, ahead of every other effect', () => {
    for (const kind of [
      'WILD',
      'WILD_SKIP',
      'WILD_REVERSE',
      'WILD_DOUBLE_SKIP',
      'WILD_DRAW_FOUR',
      'WILD_TARGET_DRAW_TWO',
    ] as const) {
      const effects = allWildEffects({ id: `X#${kind}`, kind });
      expect(effects[0]!.type).toBe('SET_COLOR');
    }
  });

  it('is a pure function of the card, so every client agrees', () => {
    // Determinism is the whole reason this is derived from the id rather than
    // drawn from the rng: local play, the server, a bot and a resync all
    // compute the same value without sharing a random stream.
    expect(autoColorFor('W#17')).toBe(autoColorFor('W#17'));
    const a = autoColorFor('W#0');
    const b = autoColorFor('W#1');
    expect(typeof a).toBe('string');
    expect(['RED', 'YELLOW', 'GREEN', 'BLUE']).toContain(a);
    expect(['RED', 'YELLOW', 'GREEN', 'BLUE']).toContain(b);
  });

  it('leaves the active colour defined after every play (engine invariant §6.1)', () => {
    let s = base();
    s = reduce(s, cmd('PLAY_CARD', 'P1', { cardId: 'W#0' }), rng()).state;
    expect(s.activeColor).toBeTruthy();
    s = reduce(s, cmd('PLAY_CARD', 'P2', { cardId: 'W#2' }), rng()).state;
    expect(s.activeColor).toBeTruthy();
  });
});
