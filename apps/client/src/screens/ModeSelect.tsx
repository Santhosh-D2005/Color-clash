import { useState } from 'react';
import type { GameVersion } from '@colorclash/shared';
import { VERSION_META, VERSION_ORDER } from '@colorclash/game-content';
import { asset } from '../assets/index.js';
import { RulesSheet } from '../components/RulesSheet.js';

/** Screen 3 — Mode select. §9.1: "Version cards, difficulty/complexity indicator". */
export function ModeSelect({
  onPick,
  onBack,
}: {
  onPick: (v: GameVersion) => void;
  onBack: () => void;
}) {
  const [rulesFor, setRulesFor] = useState<GameVersion | null>(null);

  return (
    <div className="screen bg-menu">
      <div className="table-top">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <img src={asset('icon_back')} alt="" />
        </button>
        <div className="rule-title" style={{ flex: 1 }}>
          <h1 className="h1">CHOOSE YOUR MODE</h1>
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div className="modes">
        {VERSION_ORDER.map((id) => {
          const m = VERSION_META[id];
          return (
            <div className="mode-slot" key={id}>
              <button
                className="mode-card"
                onClick={() => onPick(id)}
                style={{ background: `linear-gradient(170deg, ${m.accent}, ${m.accentDark})` }}
                aria-label={`${m.title} — ${m.tagline}`}
              >
                {m.isNew ? <img className="badge-new" src={asset('badge_new')} alt="New" /> : null}
                <img className="mode-art" src={asset(m.icon as never)} alt="" />
                <span className="mode-name">{m.title}</span>
                <span className="mode-tag">{m.tagline}</span>
                <span className="complexity" aria-label={`Complexity ${m.complexity} of 5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <i key={n} className={n <= m.complexity ? 'on' : ''} />
                  ))}
                </span>
              </button>

              {/*
                Five modes with genuinely different rules, and until now no way
                to read any of them before committing to a match. The link sits
                on the tile rather than behind a menu, at the moment the
                question actually occurs to someone.
              */}
              <button
                className="mode-rules"
                onClick={() => setRulesFor(id)}
                aria-label={`How to play ${m.title}`}
              >
                HOW TO PLAY
              </button>
            </div>
          );
        })}
      </div>

      {rulesFor ? <RulesSheet version={rulesFor} onClose={() => setRulesFor(null)} /> : null}
    </div>
  );
}
