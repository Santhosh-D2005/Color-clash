import { describe, expect, it } from '@colorclash/test-fixtures';
import {
  BOT_PACE_MAX_MS,
  BOT_PACE_MIN_MS,
  BOT_PACE_REDUCED_MS,
  FLIGHT_MS,
  botPace,
} from './pacing.js';

/**
 * The pacing helper.
 *
 * This is the whole of the fix for the worst problem the game had: opponents
 * used to resolve an entire chain of turns inside one repaint, about thirty
 * milliseconds for the table. The values below are the contract, and they are
 * worth pinning because "the bots feel wrong again" is a very expensive bug to
 * rediscover by playing.
 */
describe('bot pacing', () => {
  it('lands inside the readable band', () => {
    for (let i = 0; i < 200; i++) {
      const ms = botPace(false);
      expect(ms >= BOT_PACE_MIN_MS).toBe(true);
      expect(ms <= BOT_PACE_MAX_MS).toBe(true);
    }
  });

  it('varies, so four bots do not sound like a metronome', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 50; i++) seen.add(Math.round(botPace(false)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('stays sequential under reduced motion rather than becoming instant', () => {
    // The accessibility setting removes the wait, not the one-at-a-time
    // ordering — collapsing back to a single repaint would reintroduce exactly
    // the defect this whole mechanism exists to fix.
    expect(botPace(true)).toBe(BOT_PACE_REDUCED_MS);
    expect(BOT_PACE_REDUCED_MS).toBeGreaterThan(0);
  });

  it('gives a card time to land before the next move starts', () => {
    expect(FLIGHT_MS).toBeLessThan(BOT_PACE_MIN_MS);
  });
});
