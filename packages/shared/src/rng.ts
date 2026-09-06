import type { RngLike } from './types.js';

/**
 * Deterministic RNG — §4.2: "All randomization accepts an injectable seeded RNG
 * in tests." mulberry32 is small, fast and reproducible across engines.
 */
export function createRng(seed: string | number): RngLike {
  let s = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
    state: () => s,
  };
}

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Fisher-Yates — §7.1 step 2 and §2.1 deck depletion. Mutates and returns. */
export function shuffle<T>(items: T[], rng: RngLike): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}
