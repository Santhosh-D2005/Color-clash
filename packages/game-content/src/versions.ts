import type { GameVersion, MatchConfig } from '@colorclash/shared';
import { SEAT_LIMIT } from './limits.js';

/** Copy for the mode-select screen. */
export type VersionMeta = {
  id: GameVersion;
  title: string;
  tagline: string;
  isNew: boolean;
  /** Asset key in the client's art registry. */
  icon: string;
  /** Tile accent, from the brand palette in tools/gen-brand.ts. */
  accent: string;
  accentDark: string;
  complexity: 1 | 2 | 3 | 4 | 5;
  /** Seats this client shows at one table. See limits.ts — defined once. */
  minPlayers: number;
  maxPlayers: number;
};

export const VERSION_META: Record<GameVersion, VersionMeta> = {
  CLASSIC: {
    id: 'CLASSIC',
    title: 'CLASSIC CLASH',
    tagline: 'Where every match starts',
    isNew: false,
    icon: 'mode_classic',
    accent: '#c2312c',
    accentDark: '#6d1512',
    complexity: 1,
    minPlayers: SEAT_LIMIT.min,
    maxPlayers: SEAT_LIMIT.max,
  },
  FLIP: {
    id: 'FLIP',
    title: 'FLIPSTORM',
    tagline: 'One card turns the whole table',
    isNew: true,
    icon: 'mode_flip',
    accent: '#7a3fc0',
    accentDark: '#361a5c',
    complexity: 3,
    minPlayers: SEAT_LIMIT.min,
    maxPlayers: SEAT_LIMIT.max,
  },
  MAYHEM: {
    id: 'MAYHEM',
    title: 'MAYHEM',
    tagline: 'Stack it, dodge it, or drown',
    isNew: true,
    icon: 'mode_mayhem',
    accent: '#b4620d',
    accentDark: '#4d2603',
    complexity: 5,
    minPlayers: SEAT_LIMIT.min,
    maxPlayers: SEAT_LIMIT.max,
  },
  ALL_WILD: {
    id: 'ALL_WILD',
    title: 'WILD RUSH',
    tagline: 'Every card is wild. Nothing is safe',
    isNew: true,
    icon: 'mode_wildrush',
    accent: '#1f6fc4',
    accentDark: '#0d2f57',
    complexity: 2,
    minPlayers: SEAT_LIMIT.min,
    maxPlayers: SEAT_LIMIT.max,
  },
  FLEX: {
    id: 'FLEX',
    title: 'FREESTYLE',
    tagline: 'Bend one rule per round',
    isNew: true,
    icon: 'mode_freestyle',
    accent: '#2c7a2c',
    accentDark: '#123d12',
    complexity: 4,
    minPlayers: SEAT_LIMIT.min,
    maxPlayers: SEAT_LIMIT.max,
  },
};

export const VERSION_ORDER: GameVersion[] = [
  'CLASSIC',
  'FLIP',
  'MAYHEM',
  'ALL_WILD',
  'FLEX',
];

export const DEFAULT_CONFIG: MatchConfig = {
  winCondition: 'ONE_ROUND',
  drawRule: 'DRAW_ONE',
  stacking: true,
  challengeWildDrawFour: false,
  clashPenaltyCards: 2, // SOURCE §2.1
  eliminationThreshold: 25, // SOURCE §2.4
  clashGraceMs: 4000,
  scoringMode: 'STANDARD',
  tableTheme: 'ocean',
};

/**
 * Per-version config overrides. Stacking is only source-defined for
 * Mayhem (§2.4); elsewhere it is an opt-in table rule exposed in
 * the lobby, defaulting off so Classic matches the source rules exactly.
 */
export const VERSION_CONFIG_DEFAULTS: Partial<
  Record<GameVersion, Partial<MatchConfig>>
> = {
  CLASSIC: { stacking: false },
  FLIP: { stacking: false },
  MAYHEM: { stacking: true },
  ALL_WILD: { stacking: false },
  FLEX: { stacking: false },
};

export function configFor(
  version: GameVersion,
  overrides: Partial<MatchConfig> = {},
): MatchConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(VERSION_CONFIG_DEFAULTS[version] ?? {}),
    ...overrides,
  };
}

export const TABLE_THEMES = [
  { id: 'ocean', label: 'Ocean' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'ember', label: 'Ember' },
];
