import { createRng } from '@colorclash/shared';
import { reduce } from '@colorclash/game-engine';
import { buildFixture, cmd, describe, expect, handOf, it } from '@colorclash/test-fixtures';

const rng = () => createRng('clash');

const twoPlayer = () =>
  buildFixture({
    version: 'CLASSIC',
    players: [
      { id: 'P1', hand: ['R7#0', 'R3#0'] },
      { id: 'P2', hand: ['B7#0', 'Y9#0', 'G8#0'] },
    ],
    discardPile: ['R5#0'],
    drawPile: ['B2#0', 'G9#0', 'Y4#0', 'B4#0'],
    activeColor: 'RED',
  });

describe('CLASH timing — §7.3 and §2.1', () => {
  it('going from 2 cards to 1 enters CLASH_PENDING immediately', () => {
    const r = reduce(twoPlayer(), cmd('PLAY_CARD', 'P1', { cardId: 'R7#0' }), rng());
    expect(r.state.clashPending).toBe('P1');
    expect(r.events.some((e) => e.type === 'CLASH_PENDING')).toBe(true);
  });

  it('calling CLASH clears the pending state and records the call', () => {
    let s = reduce(twoPlayer(), cmd('PLAY_CARD', 'P1', { cardId: 'R7#0' }), rng()).state;
    s = reduce(s, cmd('CALL_CLASH', 'P1'), rng()).state;
    expect(s.clashPending).toBe(null);
    expect(s.clashCalled).toContain('P1');
    expect(s.stats.clashCalls).toBe(1);
  });

  it('CALL_CLASH is idempotent — repeated calls create no extra reward', () => {
    let s = reduce(twoPlayer(), cmd('PLAY_CARD', 'P1', { cardId: 'R7#0' }), rng()).state;
    s = reduce(s, cmd('CALL_CLASH', 'P1'), rng()).state;
    s = reduce(s, cmd('CALL_CLASH', 'P1'), rng()).state;
    s = reduce(s, cmd('CALL_CLASH', 'P1'), rng()).state;
    expect(s.stats.clashCalls).toBe(1);
    expect(handOf(s, 'P1')).toHaveLength(1);
  });

  it('missing the call before the next action costs the 2-card penalty (SOURCE)', () => {
    let s = reduce(twoPlayer(), cmd('PLAY_CARD', 'P1', { cardId: 'R7#0' }), rng()).state;
    expect(handOf(s, 'P1')).toHaveLength(1);
    // P2 acts before P1 calls CLASH.
    const r = reduce(s, cmd('PLAY_CARD', 'P2', { cardId: 'B7#0' }), rng());
    s = r.state;
    expect(handOf(s, 'P1')).toHaveLength(3); // 1 + 2 penalty
    expect(r.events.some((e) => e.type === 'CLASH_PENALTY')).toBe(true);
    expect(s.clashPending).toBe(null);
  });

  it('a called CLASH survives the next action with no penalty', () => {
    let s = reduce(twoPlayer(), cmd('PLAY_CARD', 'P1', { cardId: 'R7#0' }), rng()).state;
    s = reduce(s, cmd('CALL_CLASH', 'P1'), rng()).state;
    s = reduce(s, cmd('PLAY_CARD', 'P2', { cardId: 'B7#0' }), rng()).state;
    expect(handOf(s, 'P1')).toHaveLength(1);
  });

  it('the penalty applies once, not once per subsequent action', () => {
    let s = reduce(twoPlayer(), cmd('PLAY_CARD', 'P1', { cardId: 'R7#0' }), rng()).state;
    s = reduce(s, cmd('PLAY_CARD', 'P2', { cardId: 'B7#0' }), rng()).state;
    const after = handOf(s, 'P1').length;
    s = reduce(s, cmd('DRAW_CARD', 'P1'), rng()).state;
    expect(handOf(s, 'P1').length).toBe(after + 1); // just the draw
  });

  it('calling CLASH with more than one card is a harmless no-op', () => {
    const s = reduce(twoPlayer(), cmd('CALL_CLASH', 'P1'), rng()).state;
    expect(s.clashCalled).toHaveLength(0);
    expect(handOf(s, 'P1')).toHaveLength(2);
  });

  it('leaving the one-card window clears the recorded call (§16.2 boundary)', () => {
    let s = reduce(twoPlayer(), cmd('PLAY_CARD', 'P1', { cardId: 'R7#0' }), rng()).state;
    s = reduce(s, cmd('CALL_CLASH', 'P1'), rng()).state;
    expect(s.clashCalled).toContain('P1');
    // P2 plays something P1 cannot follow, forcing P1 to draw back up to 2.
    s = reduce(s, cmd('PLAY_CARD', 'P2', { cardId: 'B7#0' }), rng()).state;
    s = reduce(s, cmd('DRAW_CARD', 'P1'), rng()).state;
    expect(handOf(s, 'P1').length).toBeGreaterThan(1);
    expect(s.clashCalled).not.toContain('P1');
  });
});
