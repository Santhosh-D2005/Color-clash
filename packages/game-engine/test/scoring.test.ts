import { createRng } from '@colorclash/shared';
import {
  applyRoundScore,
  calculateRoundScore,
  scoreRound,
  toStandings,
} from '@colorclash/game-engine';
import { buildFixture, describe, expect, it } from '@colorclash/test-fixtures';

const rng = () => createRng('scoring');
void rng;

/**
 * The split exists so a caller can ask what a round is worth without paying
 * for it. These tests pin both halves: that calculating changes nothing, and
 * that applying changes state exactly once.
 */

const fixture = () =>
  buildFixture({
    version: 'CLASSIC',
    players: [
      { id: 'P1', hand: [] },
      // 12 points: a 5 and a 7.
      { id: 'P2', hand: ['R5#0', 'B7#0'] },
      // 20 points: one Skip.
      { id: 'P3', hand: ['GSK#0'] },
    ],
    discardPile: ['R3#0'],
    drawPile: ['Y9#0', 'B2#0'],
    activeColor: 'RED',
  });

describe('scoring — calculate and apply are separate (issue 14)', () => {
  it('calculating a round mutates nothing', () => {
    const s = fixture();
    const before = s.players.map((p) => p.score);
    const beforeJson = JSON.stringify(s);

    const result = calculateRoundScore(s, 'P1');

    expect(s.players.map((p) => p.score)).toEqual(before);
    // Not just the scores: the whole state object is untouched.
    expect(JSON.stringify(s)).toBe(beforeJson);
    expect(result.pot).toBe(32);
  });

  it('reports each hand as a positive value, never as a penalty', () => {
    const result = calculateRoundScore(fixture(), 'P1');
    const byId = Object.fromEntries(result.rows.map((r) => [r.playerId, r]));

    expect(byId.P1!.handValue).toBe(0);
    expect(byId.P2!.handValue).toBe(12);
    expect(byId.P3!.handValue).toBe(20);
    for (const row of result.rows) expect(row.handValue >= 0).toBe(true);
  });

  it('applying changes state exactly once', () => {
    const s = fixture();
    const result = calculateRoundScore(s, 'P1');

    applyRoundScore(s, result);
    const after = s.players.map((p) => p.score);
    expect(after).toEqual([32, -12, -20]);

    // Applying the same result again is idempotent: rows carry absolute
    // targets, not deltas, so a retry cannot double-count.
    applyRoundScore(s, result);
    expect(s.players.map((p) => p.score)).toEqual(after);
  });

  it('scoreRound is exactly calculate-then-apply', () => {
    const a = fixture();
    const b = fixture();

    const viaSplit = applyRoundScore(a, calculateRoundScore(a, 'P1'));
    const viaCompose = scoreRound(b, 'P1');

    expect(viaCompose).toEqual(viaSplit);
    expect(a.players.map((p) => p.score)).toEqual(b.players.map((p) => p.score));
  });

  it('honours scoringMode NONE without touching any score', () => {
    const s = fixture();
    s.config = { ...s.config, scoringMode: 'NONE' };
    const result = calculateRoundScore(s, 'P1');
    applyRoundScore(s, result);
    expect(s.players.map((p) => p.score)).toEqual([0, 0, 0]);
    // The hand values are still reported, so a summary screen can show them.
    expect(result.rows.map((r) => r.handValue)).toEqual([0, 12, 20]);
  });

  it('standings carry what a summary screen needs', () => {
    const result = calculateRoundScore(fixture(), 'P1');
    const standings = toStandings(result);
    expect(standings[0]!.playerId).toBe('P1');
    expect(standings[0]!.banked).toBe(32);
    expect(standings[0]!.handValue).toBe(0);
    // Losers bank nothing; their line is a hand value, not a negative number.
    for (const s of standings.slice(1)) expect(s.banked).toBe(0);
  });
});
