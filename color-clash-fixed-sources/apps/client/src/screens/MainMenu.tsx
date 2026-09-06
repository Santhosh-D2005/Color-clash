import { useState } from 'react';
import { asset } from '../assets/index.js';
import { ComingSoon } from '../components/ComingSoon.js';
import type { Profile } from '../state/profile.js';
import type { SavedMatch } from '../state/savedMatch.js';

/** Screen 2 — Main menu. §9.1 Home: "Play, rule versions, profile, settings, cosmetics". */

export type { Profile };

/**
 * The nav bar was five entries — Store, Collection, Events, Missions and
 * Leaderboard — every one of them inert and tagged SOON. A first-time player
 * tapped at least one before learning that none of them go anywhere, which
 * reads as an unfinished app rather than a stated roadmap.
 *
 * One honest entry instead. The individual blurbs are kept in ComingSoon and
 * are what the sheet still lists, so nothing about the roadmap is lost — it is
 * just no longer four-fifths of the navigation.
 */
const NAV_SOON = { icon: 'nav_events', label: 'COMING SOON' } as const;

export function MainMenu({
  profile,
  saved,
  savedLabel,
  onResume,
  onDiscardSaved,
  onlineRoom,
  onRejoinOnline,
  onForgetOnline,
  onQuickMatch,
  onGameModes,
  onOnline,
  onCustomRoom,
  onSettings,
}: {
  profile: Profile;
  /** An unfinished match found in storage, or null. */
  saved?: SavedMatch | null;
  savedLabel?: string;
  onResume?: () => void;
  onDiscardSaved?: () => void;
  /** A room code the server may still be holding a seat in. */
  onlineRoom?: string;
  onRejoinOnline?: () => void;
  onForgetOnline?: () => void;
  onQuickMatch: () => void;
  onGameModes: () => void;
  onOnline: () => void;
  onCustomRoom: () => void;
  onSettings: () => void;
}) {
  // Which "not built yet" sheet is open, if any. Keeping it here rather than
  // in App means the menu owns its own inert-button problem end to end.
  const [soon, setSoon] = useState<string | null>(null);

  return (
    <div className="screen menu bg-menu">
      <div className="topbar">
        <div className="profile-chip">
          <img className="avatar" src={asset('avatar_player')} alt="" />
          <div>
            <div className="profile-name">{profile.name}</div>
            <div className="dim" style={{ fontSize: 12, fontWeight: 700 }}>
              Lv. {profile.level} ★
            </div>
          </div>
        </div>
        <div className="currency">
          <img src={asset('icon_coin')} alt="Coins" />
          {profile.coins.toLocaleString()}
        </div>
        <div className="currency">
          <img src={asset('icon_gem')} alt="Gems" />
          {profile.gems.toLocaleString()}
        </div>
        <span className="spacer" />
        <button className="icon-btn" aria-label="Messages">
          <img src={asset('icon_mail')} alt="" />
        </button>
        <button className="icon-btn" aria-label="Settings" onClick={onSettings}>
          <img src={asset('icon_gear')} alt="" />
        </button>
      </div>

      {/*
        A match the player did not finish. It appears only when there is one,
        so the menu is unchanged for everyone else — but backgrounding the app
        no longer silently destroys a game in progress.
      */}
      {saved ? (
        <div className="resume-bar">
          <button className="resume-main" onClick={onResume}>
            <span className="resume-title">RESUME MATCH</span>
            <span className="resume-sub">
              {savedLabel ?? 'In progress'} · {saved.seats.length} players
            </span>
          </button>
          <button className="resume-discard" onClick={onDiscardSaved} aria-label="Discard the unfinished match">
            DISCARD
          </button>
        </div>
      ) : null}

      {/* The server holds a seat for ninety seconds after a drop; without the
          room code the client had no way to walk back into it. */}
      {!saved && onlineRoom ? (
        <div className="resume-bar">
          <button className="resume-main" onClick={onRejoinOnline}>
            <span className="resume-title">REJOIN ONLINE MATCH</span>
            <span className="resume-sub">Room {onlineRoom}</span>
          </button>
          <button
            className="resume-discard"
            onClick={onForgetOnline}
            aria-label="Forget the online room"
          >
            DISCARD
          </button>
        </div>
      ) : null}

      <div className="tile-row">
        <Tile
          title="PLAY"
          sub="QUICK MATCH"
          art="icon_cards_fan"
          from="#f0a81c"
          to="#c47a09"
          onClick={onQuickMatch}
        />
        <Tile
          title="GAME MODES"
          sub="Explore all modes"
          art="icon_crown"
          from="#7a3fc0"
          to="#4a2076"
          onClick={onGameModes}
        />
        <Tile
          title="ONLINE"
          sub="Play with friends"
          art="icon_online"
          from="#2b7fd4"
          to="#134a86"
          onClick={onOnline}
        />
        <Tile
          title="CUSTOM ROOM"
          sub="Create your table"
          art="icon_table"
          from="#3f9e2e"
          to="#1e5a15"
          onClick={onCustomRoom}
        />
      </div>

      <nav className="navbar">
        <button
          className="nav-item"
          onClick={() => setSoon(NAV_SOON.label)}
          aria-label="Coming soon — what is still to be built"
        >
          <img src={asset(NAV_SOON.icon)} alt="" />
          {NAV_SOON.label}
        </button>
      </nav>

      {soon ? <ComingSoon which={soon} onClose={() => setSoon(null)} /> : null}
    </div>
  );
}

function Tile({
  title,
  sub,
  art,
  from,
  to,
  onClick,
}: {
  title: string;
  sub: string;
  art: Parameters<typeof asset>[0];
  from: string;
  to: string;
  onClick: () => void;
}) {
  return (
    <button
      className="tile"
      onClick={onClick}
      style={{ background: `linear-gradient(170deg, ${from}, ${to})` }}
    >
      <span className="tile-title">{title}</span>
      <span className="tile-sub">{sub}</span>
      <img className="tile-art" src={asset(art)} alt="" />
    </button>
  );
}
