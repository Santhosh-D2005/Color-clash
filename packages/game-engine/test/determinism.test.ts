import { createRng, type Command, type GameState, type GameVersion } from '@colorclash/shared';
import { createMatch, reduce, statsFreeState } from '@colorclash/game-engine';
import { stepBots } from '@colorclash/ai/driver';
import { describe, expect, it } from '@colorclash/test-fixtures';

/**
 * Determinism — the claim the whole persistence design rests on (issue 18).
 *
 * A saved match is a seed plus an ordered command log, nothing else: not the
 * hands, not the piles, not whose turn it is. That is only safe if replaying
 * the log rebuilds the identical match, so this file pins both halves of the
 * claim the type documentation makes:
 *
 *  1. Two replays of the same seed and log agree on every field of the state
 *     that `statsFreeState` keeps.
 *  2. `stats.startedAt` and `stats.endedAt` are the *only* fields they may
 *     disagree about — they are wall-clock metadata about the sitting, not the
 *     match, and excluding them is a deliberate, bounded exception rather than
 *     a convenient way to hide drift.
 *
 * The second is the one worth the effort. An exclusion nobody tests quietly
 * grows: the day someone adds a third timestamp, or reaches for `Date.now()`
 * inside a rule, this fails.
 */

const VERSIONS: GameVersion[] = ['CLASSIC', 'FLIP', 'MAYHEM', 'ALL_WILD', 'FLEX'];

/** Four bots, one seed, driven to the end — and every command they issued. */
function playToEnd(version: GameVersion, seed: string): { state: GameState; log: Command[] } {
  const rng = createRng(seed);
  let { state } = createMatch(
    {
      gameId: 'determinism',
      version,
      seed,
      players: ['A', 'B', 'C', 'D'].map((id) => ({ id, name: id, isBot: true })),
    },
    rng,
  );

  const log: Command[] = [];
  for (let step = 0; step < 2000 && state.status === 'PLAYING'; step++) {
    const out = stepBots(state, rng);
    if (!out.acted || !out.command) break;
    state = out.state;
    log.push(out.command);
  }
  return { state, log };
}

/** Rebuilds a match from the two things a save file actually holds. */
function replay(version: GameVersion, seed: string, log: Command[]): GameState {
  const rng = createRng(seed);
  let { state } = createMatch(
    {
      gameId: 'determinism',
      version,
      seed,
      players: ['A', 'B', 'C', 'D'].map((id) => ({ id, name: id, isBot: true })),
    },
    rng,
  );
  for (const command of log) state = reduce(state, command, rng).state;
  return state;
}

/** Every leaf path at which two states disagree, in dotted form. */
function differingPaths(a: unknown, b: unknown, path = ''): string[] {
  if (a === b) return [];
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return [path];
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  const out: string[] = [];
  for (const key of keys) {
    const child = path ? `${path}.${key}` : key;
    out.push(
      ...differingPaths(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        child,
      ),
    );
  }
  return out;
}

describe('determinism — seed plus command log rebuilds the match (issue 18)', () => {
  it('replays to the identical state, every ruleset', () => {
    for (const version of VERSIONS) {
      for (let n = 0; n < 4; n++) {
        const seed = `det-${version}-${n}`;
        const { state, log } = playToEnd(version, seed);
        expect(log.length).toBeGreaterThan(0);

        const rebuilt = replay(version, seed, log);
        expect(statsFreeState(rebuilt)).toEqual(statsFreeState(state));
      }
    }
  });

  it('disagrees about the timestamps and nothing else', () => {
    // The two runs are separated in wall-clock time, so their timestamps really
    // do differ — which is exactly what makes this test meaningful rather than
    // an accident of both happening inside the same millisecond.
    const seed = 'det-timestamps';
    const { state, log } = playToEnd('CLASSIC', seed);
    const busyUntil = Date.now() + 2;
    while (Date.now() < busyUntil) {
      /* let the clock move */
    }
    const rebuilt = replay('CLASSIC', seed, log);

    const diff = differingPaths(state, rebuilt);
    for (const p of diff) {
      expect(p === 'stats.startedAt' || p === 'stats.endedAt').toBe(true);
    }
    // And the exclusion is not vacuous: at least one of them genuinely moved.
    expect(diff.length).toBeGreaterThan(0);
    expect(statsFreeState(state)).toEqual(statsFreeState(rebuilt));
  });

  it('keeps every field except the two it drops', () => {
    // A guard against the exclusion widening by accident. If someone adds a
    // third wall-clock field to MatchStats and quietly strips it here, the
    // saved-match architecture stops being verifiable and this test says so.
    const { state } = playToEnd('CLASSIC', 'det-shape');
    const stripped = statsFreeState(state);

    expect(Object.keys(stripped).sort()).toEqual(Object.keys(state).sort());
    const dropped = Object.keys(state.stats).filter((k) => !(k in stripped.stats));
    expect(dropped.sort()).toEqual(['endedAt', 'startedAt']);
  });

  it('is the state itself that is deterministic, not just the summary', () => {
    // Hands, piles and turn order are what a player would notice changing
    // under them across a restart, so they are asserted by name as well as by
    // the whole-object comparison above.
    const seed = 'det-zones';
    const { state, log } = playToEnd('MAYHEM', seed);
    const rebuilt = replay('MAYHEM', seed, log);

    expect(rebuilt.seq).toBe(state.seq);
    expect(rebuilt.drawPile).toEqual(state.drawPile);
    expect(rebuilt.discardPile).toEqual(state.discardPile);
    expect(rebuilt.players.map((p) => p.hand)).toEqual(state.players.map((p) => p.hand));
    expect(rebuilt.players.map((p) => p.score)).toEqual(state.players.map((p) => p.score));
    expect(rebuilt.activePlayerIndex).toBe(state.activePlayerIndex);
    expect(rebuilt.direction).toBe(state.direction);
    expect(rebuilt.activeColor).toBe(state.activeColor);
    expect(rebuilt.status).toBe(state.status);
  });
});
