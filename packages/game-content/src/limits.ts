/**
 * How many players fit at a table — the single authoritative answer.
 *
 * Three places used to disagree: the manifests said 2-10, the rules said
 * nothing, and the lobby quietly capped at six with a hard-coded
 * `Math.min(meta.maxPlayers, 6)`. A player who read one and then saw the other
 * was being told two different things.
 *
 * There are genuinely two numbers here, and the honest fix is to name both
 * rather than pick one:
 *
 *   RULE_PLAYER_LIMIT   what the rules of the game permit (source §2.1)
 *   SEAT_LIMIT          what one table in this client can actually show
 *
 * The engine enforces the first, because that is the rule. Everything a player
 * can see or press — the lobby, the online room, the rules sheet, the seat
 * validation — reads the second, because that is what the product does. Both
 * are defined here and nowhere else.
 */

export type PlayerLimit = { min: number; max: number };

/** SOURCE §2.1: "2-10 players". The engine is tested across this whole range. */
export const RULE_PLAYER_LIMIT: PlayerLimit = { min: 2, max: 10 };

/**
 * What a table seats in this build.
 *
 * The felt has three opponent positions plus an overflow row, so six is the
 * point past which the table stops being readable rather than an arbitrary
 * number. Raise it here and the lobby, the rules copy and the online room all
 * follow.
 */
export const SEAT_LIMIT: PlayerLimit = { min: 2, max: 6 };

/** The limit every player-facing surface should use. */
export function seatLimit(): PlayerLimit {
  return SEAT_LIMIT;
}

/** Human-readable, for rules copy and error messages. */
export function seatLimitText(): string {
  return `${SEAT_LIMIT.min} to ${SEAT_LIMIT.max} players`;
}
