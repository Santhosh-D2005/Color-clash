/**
 * The emote vocabulary.
 *
 * A closed set on purpose. The brief asks for something family-friendly and
 * lightweight, and a fixed list is the only version of that which cannot be
 * turned into harassment: there is no free text to moderate, nothing to
 * localise, and nothing a player can spell out one emote at a time.
 *
 * Emotes are pure presentation. They never enter `GameState`, never go through
 * `reduce`, and carry no card or turn information, so a flood of them cannot
 * affect a match beyond being annoying — which the server's rate limit handles.
 */

export type EmoteId =
  | 'NICE'
  | 'OOF'
  | 'THINKING'
  | 'HURRY'
  | 'LAUGH'
  | 'WOW'
  | 'GG'
  | 'SORRY';

export type Emote = {
  id: EmoteId;
  /** Shown on the button and in the bubble. */
  glyph: string;
  /** Read out by screen readers and shown in the log — never colour or glyph alone. */
  label: string;
};

export const EMOTES: Emote[] = [
  { id: 'NICE', glyph: '👍', label: 'Nice one' },
  { id: 'OOF', glyph: '😬', label: 'Ouch' },
  { id: 'THINKING', glyph: '🤔', label: 'Thinking' },
  { id: 'HURRY', glyph: '⏳', label: 'Your turn!' },
  { id: 'LAUGH', glyph: '😄', label: 'Ha!' },
  { id: 'WOW', glyph: '😮', label: 'Wow' },
  { id: 'GG', glyph: '🤝', label: 'Good game' },
  { id: 'SORRY', glyph: '🙇', label: 'Sorry' },
];

const BY_ID = new Map(EMOTES.map((e) => [e.id, e]));

export function emote(id: EmoteId): Emote | undefined {
  return BY_ID.get(id);
}

/** Guards the wire: anything not in the list is dropped rather than shown. */
export function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === 'string' && BY_ID.has(value as EmoteId);
}

/** How long an emote bubble stays over a seat. */
export const EMOTE_MS = 2600;
/** Server-side floor between two emotes from the same player. */
export const EMOTE_COOLDOWN_MS = 1500;
