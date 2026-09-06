import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { EMOTES, EMOTE_MS, emote, type EmoteId } from '@colorclash/game-content';
import { asset } from '../assets/index.js';

/**
 * Emotes.
 *
 * The smiley on the table was wired to nothing. This is the smallest thing
 * that makes it true: a fixed set of eight, sent as a message that never
 * reaches the reducer, shown as a bubble over the sender's seat.
 *
 * There is no free text on purpose. A closed list cannot be used to spell
 * something abusive, needs no moderation and no localisation, and is the
 * version of table talk that works in a game people play with their children.
 *
 * In a local match against bots the bubble still appears over your own seat —
 * the control behaves the same way everywhere, rather than being mysteriously
 * inert offline.
 */

export type ActiveEmote = { playerId: string; id: EmoteId; at: number };

export function EmoteButton({ onPick }: { onPick: (id: EmoteId) => void }) {
  const [open, setOpen] = useState(false);

  // Any tap outside closes the tray. Registered only while it is open so the
  // table keeps its normal tap handling the rest of the time.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const id = setTimeout(() => document.addEventListener('click', close), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', close);
    };
  }, [open]);

  return (
    <div className="emote-anchor">
      {open ? (
        <div className="emote-tray" role="menu" aria-label="Send an emote">
          {EMOTES.map((e) => (
            <button
              key={e.id}
              className="emote-choice"
              role="menuitem"
              title={e.label}
              aria-label={e.label}
              onClick={() => {
                onPick(e.id);
                setOpen(false);
              }}
            >
              <span aria-hidden="true">{e.glyph}</span>
            </button>
          ))}
        </div>
      ) : null}

      <button
        className="icon-btn"
        aria-label="Emotes"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <img src={asset('icon_emoji')} alt="" />
      </button>
    </div>
  );
}

/**
 * The bubble that pops over a seat. Text as well as glyph, never glyph alone.
 *
 * `side` decides which way it opens. A bubble anchored to the right of a
 * left-hand seat extends off the edge of the screen and gets clipped, which is
 * exactly what happened to the single opponent in a two-player online match.
 */
export function EmoteBubble({ id, side = 'right' }: { id: EmoteId; side?: 'left' | 'right' }) {
  const e = emote(id);
  if (!e) return null;
  return (
    <span className={`emote-bubble from-${side}`} role="status">
      <span aria-hidden="true">{e.glyph}</span>
      <span className="emote-bubble-label">{e.label}</span>
    </span>
  );
}

/**
 * Keeps the currently visible emote per player and expires it.
 *
 * A map rather than a list: a player spamming the tray replaces their own
 * bubble instead of stacking a column of them over their seat.
 */
export function useEmotes(): {
  active: Record<string, EmoteId>;
  show: (playerId: string, id: EmoteId) => void;
  clear: () => void;
} {
  const [active, setActive] = useState<Record<string, EmoteId>>({});

  const show = (playerId: string, id: EmoteId) => {
    setActive((prev) => ({ ...prev, [playerId]: id }));
    setTimeout(() => {
      setActive((prev) => {
        if (prev[playerId] !== id) return prev; // already replaced
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
    }, EMOTE_MS);
  };

  return { active, show, clear: () => setActive({}) };
}
