/**
 * The player's profile, and where it is kept.
 *
 * Two things used to be wrong. The name was hard-coded to "PlayerOne", so every
 * player in an online match had the same name and nobody could tell who was
 * who. And the coins and gems lived in React state only, so they reset on every
 * reload — while the Store sheet promised the opposite in writing.
 *
 * Both are the same fix: one small record, saved to the same place the sound
 * preference already uses, loaded once at startup.
 *
 * Nothing here changes the economy. Starting values, earning rules and reward
 * amounts are exactly what they were; they simply survive a reload now.
 */

export type Profile = {
  name: string;
  level: number;
  coins: number;
  gems: number;
};

const STORAGE_KEY = 'colorclash.profile';

/** Unchanged from the values the app has always started with. */
export const DEFAULT_PROFILE: Omit<Profile, 'name'> = {
  level: 25,
  coins: 12450,
  gems: 860,
};

export const NAME_MAX = 16;

/**
 * Names are the one field a person types, so they get the usual treatment:
 * trimmed, length-capped, and stripped of the control characters that would
 * let someone smuggle layout into another player's seat label.
 */
export function normaliseName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, NAME_MAX);
}

export function isValidName(raw: string): boolean {
  return normaliseName(raw).length > 0;
}

function read(): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Private mode, disabled storage, or a value written by an older build.
    return null;
  }
}

/**
 * The stored profile, or null on a first run.
 *
 * Returning null rather than a default is what lets the app tell "new player"
 * from "player who has been here", which is the whole point of asking for a
 * name exactly once.
 */
export function loadProfile(): Profile | null {
  const data = read();
  if (!data || typeof data !== 'object') return null;
  const p = data as Partial<Profile>;
  const name = typeof p.name === 'string' ? normaliseName(p.name) : '';
  if (!name) return null;
  return {
    name,
    level: numberOr(p.level, DEFAULT_PROFILE.level),
    coins: numberOr(p.coins, DEFAULT_PROFILE.coins),
    gems: numberOr(p.gems, DEFAULT_PROFILE.gems),
  };
}

export function saveProfile(profile: Profile): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* not fatal: the session still works, it just will not be remembered */
  }
}

/** Builds the profile a brand-new player starts with. */
export function newProfile(name: string): Profile {
  return { name: normaliseName(name), ...DEFAULT_PROFILE };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
