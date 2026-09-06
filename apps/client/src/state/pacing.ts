/**
 * How fast the table moves.
 *
 * Extracted from the match hook so it can be tested without pulling React in —
 * these are plain numbers and one function, and they are the whole of the fix
 * for the worst problem the game had: opponents used to resolve an entire chain
 * of turns inside a single repaint, about thirty milliseconds for the table,
 * so the board appeared to teleport.
 *
 * Nothing here changes what the engine does. The commands and their order are
 * identical either way; only their spacing in time differs.
 */

/**
 * The gap between two visible bot moves.
 *
 * Fast enough not to be a wait, slow enough that each move gets its own moment.
 * The jitter stops four opponents sounding like a metronome.
 */
export const BOT_PACE_MIN_MS = 600;
export const BOT_PACE_MAX_MS = 900;

/**
 * Reduced motion keeps the pace; it drops the movement.
 *
 * This used to be 120 ms, which made the setting counter-productive: turns ran
 * at roughly eight per second while the banner still stood for its full span,
 * so a single caption covered about twelve turns. The players most likely to
 * enable the setting are those who want *more* time to read, and it gave them
 * the fastest and least synchronised version of the game.
 *
 * The pace is now the ordinary one, without the jitter — the jitter exists to
 * stop four opponents sounding like a metronome, which is a motion concern.
 * Animation is what reduced motion removes, and that is handled where it
 * belongs: the CSS media query, and the card flight below.
 */
export const BOT_PACE_REDUCED_MS = BOT_PACE_MIN_MS;

/** How long a card stays in flight. Matches the CSS animation duration. */
export const FLIGHT_MS = 420;

/**
 * The card flight, which is the one piece of pacing that *is* motion. Reduced
 * motion collapses it to nothing so the card simply appears on the pile.
 */
export const FLIGHT_REDUCED_MS = 0;

export function botPace(reduced: boolean): number {
  return reduced
    ? BOT_PACE_REDUCED_MS
    : BOT_PACE_MIN_MS + Math.random() * (BOT_PACE_MAX_MS - BOT_PACE_MIN_MS);
}

/** How long the travel animation runs, given the motion preference. */
export function flightMs(reduced: boolean): number {
  return reduced ? FLIGHT_REDUCED_MS : FLIGHT_MS;
}
