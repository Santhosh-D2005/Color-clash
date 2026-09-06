import type { ChangeEvent } from 'react';
import { Sheet } from './Sheet.js';

/**
 * The in-match pause sheet — what the settings gear on the table now opens.
 *
 * The gear was rendered on every match screen and wired to nothing. That is
 * worse than no gear: a control that looks live and is dead reads as a broken
 * build. This is the smallest honest version of what it promised — the three
 * things a player actually wants mid-match (mute, rules, leave) and nothing
 * invented to pad it out.
 *
 * Every control here is presentation or navigation. None of them can touch
 * game state, which is why leaving is a confirmation rather than a toggle.
 */
export function MatchSettings({
  sound,
  onSound,
  reducedMotion,
  onReducedMotion,
  onRules,
  onLeave,
  onClose,
}: {
  sound: boolean;
  onSound: (on: boolean) => void;
  reducedMotion: boolean;
  onReducedMotion: (on: boolean) => void;
  onRules: () => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      title="PAUSED"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onLeave}>
            LEAVE MATCH
          </button>
          <button className="btn btn-gold" onClick={onClose}>
            RESUME
          </button>
        </>
      }
    >
      <p className="dim settings-note">
        The match is still running on the server — this only pauses your screen.
      </p>

      <Toggle
        label="Sound"
        hint="Card, penalty and victory cues"
        checked={sound}
        onChange={onSound}
      />
      <Toggle
        label="Reduced motion"
        hint="Skips card travel and speeds up opponent turns"
        checked={reducedMotion}
        onChange={onReducedMotion}
      />

      <button className="sheet-row-btn" onClick={onRules}>
        <span>
          <b>How to play</b>
          <span className="dim sheet-row-hint">Rules for this mode</span>
        </span>
        <span aria-hidden="true">›</span>
      </button>
    </Sheet>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="sheet-row">
      <span>
        <b>{label}</b>
        <span className="dim sheet-row-hint">{hint}</span>
      </span>
      {/* A real checkbox, so it is keyboard-operable and announced correctly;
          the pill is drawn over it in CSS. */}
      <input
        type="checkbox"
        className="switch"
        checked={checked}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
      />
    </label>
  );
}
