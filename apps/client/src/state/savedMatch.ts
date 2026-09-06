import type { Command, GameVersion, MatchConfig } from '@colorclash/shared';
import type { Seat } from './useGame.js';

/**
 * Local match persistence.
 *
 * A local match used to live in React state and nowhere else, so a reload, a
 * backgrounded tab or a phone locking at the wrong moment destroyed it and
 * dropped the player back at the main menu with no explanation. On a phone that
 * is not an edge case.
 *
 * The fix reuses the architecture the server already relies on: the engine is a
 * pure reducer over a seeded deal, so a match is fully described by its seed
 * plus the ordered list of commands that were accepted. That is what gets
 * stored — not the board. Nothing saved here can drift out of step with the
 * code that reads it, because everything is recomputed by the same reducer that
 * produced it in the first place.
 *
 * Bot commands are in the log too. They have to be: replaying without them
 * would let the bots decide differently and produce a different match.
 */

export type SavedMatch = {
  /** Bumped when the shape changes, so an old value is discarded not misread. */
  format: 2;
  version: GameVersion;
  seed: string;
  config: MatchConfig;
  seats: Seat[];
  /** Every accepted command, in the order the engine applied it. */
  commands: Command[];
  savedAt: number;
};

export const SAVED_MATCH_FORMAT = 2;
const STORAGE_KEY = 'colorclash.match';

/**
 * How long an unfinished match is offered for.
 *
 * Long enough to survive a night's sleep, short enough that a match from last
 * month is not still sitting on the menu.
 */
export const SAVED_MATCH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function saveMatch(data: Omit<SavedMatch, 'format' | 'savedAt'>): void {
  try {
    const payload: SavedMatch = { ...data, format: SAVED_MATCH_FORMAT, savedAt: Date.now() };
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full, private mode, or disabled. The match still plays; it just
    // will not survive a reload, which is exactly the old behaviour.
  }
}

export function loadMatch(): SavedMatch | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedMatch;
    if (data?.format !== SAVED_MATCH_FORMAT) return null;
    if (!data.seed || !Array.isArray(data.commands) || !Array.isArray(data.seats)) return null;
    if (Date.now() - (data.savedAt ?? 0) > SAVED_MATCH_MAX_AGE_MS) {
      clearMatch();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearMatch(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

/** A short line for the menu, so "Resume" says what it is resuming. */
export function describeSavedMatch(data: SavedMatch, title: string): string {
  const human = data.seats.filter((s) => !s.isBot).length;
  const bots = data.seats.length - human;
  const opponents = bots === 1 ? '1 opponent' : `${bots} opponents`;
  return `${title} — ${opponents}`;
}
