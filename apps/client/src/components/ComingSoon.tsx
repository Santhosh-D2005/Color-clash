import { Sheet } from './Sheet.js';

/**
 * What the five bottom-menu buttons open.
 *
 * Store, Collection, Events, Missions and Leaderboard were all rendered, all
 * tappable, and all inert. A button that does nothing is worse than an absent
 * one — it reads as a bug every single time it is pressed.
 *
 * Removing them would have been the other honest answer. This one keeps the
 * shape of the menu the artwork was designed around while being straight with
 * the player about what is and is not built, and it says what the feature will
 * be rather than just "coming soon", so the sheet is worth opening once.
 *
 * Nothing here invents an economy. The coin and gem counters keep working
 * exactly as they did; this only stops the app implying you can spend them.
 */

const COPY: Record<string, { title: string; blurb: string; detail: string }> = {
  STORE: {
    title: 'Store',
    blurb: 'Card backs and table themes, bought with the coins you already earn.',
    detail:
      'Your coins and gems are being banked now and will carry over — nothing you win before the store opens is lost.',
  },
  COLLECTION: {
    title: 'Collection',
    blurb: 'Every card back and avatar you own, in one place.',
    detail: 'The three table themes in the lobby are the start of this.',
  },
  EVENTS: {
    title: 'Events',
    blurb: 'Limited-time rule twists on a weekly rotation.',
    detail:
      'The engine already loads a ruleset from a manifest, so an event is a new manifest rather than a new game.',
  },
  MISSIONS: {
    title: 'Missions',
    blurb: 'Daily goals — win with a Draw Four, call Clash three times, finish a Mayhem round.',
    detail: 'The match summary already counts everything a mission would need.',
  },
  LEADERBOARD: {
    title: 'Leaderboard',
    blurb: 'Weekly standings among friends, and across all players.',
    detail: 'This one waits on accounts; right now a profile lives only on this device.',
  },
};

/**
 * The one entry the nav bar now opens.
 *
 * The five separate buttons were four-fifths of the navigation and every one
 * of them inert. Collapsing them to a single honest entry meant this sheet had
 * to carry the whole roadmap rather than one item of it, so nothing that was
 * worth reading is lost — it is just no longer reached by pressing a button
 * that pretends to be a feature.
 */
const ROADMAP = ['STORE', 'COLLECTION', 'EVENTS', 'MISSIONS', 'LEADERBOARD'] as const;

export function ComingSoon({ which, onClose }: { which: string; onClose: () => void }) {
  if (which === 'COMING SOON') {
    return (
      <Sheet
        title="COMING SOON"
        onClose={onClose}
        footer={
          <button className="btn btn-gold" onClick={onClose}>
            GOT IT
          </button>
        }
      >
        <div className="soon-badge">NOT BUILT YET</div>
        <p className="dim soon-detail">
          Everything below is planned but not in the game yet. Your coins and gems are being
          banked now and will carry over.
        </p>
        {ROADMAP.map((key) => {
          const item = COPY[key]!;
          return (
            <p className="soon-blurb" key={key}>
              <b>{item.title}</b> — {item.blurb}
            </p>
          );
        })}
      </Sheet>
    );
  }

  const copy = COPY[which] ?? {
    title: which,
    blurb: 'Not built yet.',
    detail: '',
  };

  return (
    <Sheet
      title={copy.title.toUpperCase()}
      onClose={onClose}
      footer={
        <button className="btn btn-gold" onClick={onClose}>
          GOT IT
        </button>
      }
    >
      <div className="soon-badge">NOT BUILT YET</div>
      <p className="soon-blurb">{copy.blurb}</p>
      {copy.detail ? <p className="dim soon-detail">{copy.detail}</p> : null}
    </Sheet>
  );
}

export const COMING_SOON_KEYS = Object.keys(COPY);
