import type { BotTier, GameVersion, MatchConfig } from '@colorclash/shared';
import { TABLE_THEMES, VERSION_META } from '@colorclash/game-content';
import { BOT_TIER_LABEL, BOT_TIERS } from '@colorclash/ai';
import { asset, avatarFor } from '../assets/index.js';
import type { Seat } from '../state/useGame.js';

/** Screen 4 — Lobby / table setup. §9.1: "Player slots, host controls, privacy, start". */
export function Lobby({
  version,
  seats,
  config,
  onConfig,
  onSeats,
  onStart,
  onBack,
  sound,
  onSound,
}: {
  version: GameVersion;
  seats: Seat[];
  config: MatchConfig;
  onConfig: (patch: Partial<MatchConfig>) => void;
  onSeats: (seats: Seat[]) => void;
  onStart: () => void;
  onBack: () => void;
  sound: boolean;
  onSound: (on: boolean) => void;
}) {
  const meta = VERSION_META[version];
  // The seat limit lives in game-content and nowhere else — see limits.ts.
  const canAdd = seats.length < meta.maxPlayers;
  const canRemove = seats.length > meta.minPlayers;

  const addBot = () => {
    const names = ['Sunny', 'Moonlight', 'TigerX', 'Nova', 'Echo', 'Rook', 'Vega', 'Pixel'];
    const taken = new Set(seats.map((s) => s.name));
    const name = names.find((n) => !taken.has(n)) ?? `Bot ${seats.length}`;
    onSeats([
      ...seats,
      { id: `bot-${seats.length}`, name, isBot: true, botTier: 'NORMAL' },
    ]);
  };

  return (
    <div className="screen bg-menu">
      <div className="table-top">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <img src={asset('icon_back')} alt="" />
        </button>
        <div className="rule-title" style={{ flex: 1 }}>
          <h1 className="h1">{meta.title}</h1>
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div className="lobby-body">
        <section className="panel seat-list" aria-label="Players">
          <div
            className="setting-label"
            style={{ display: 'flex', justifyContent: 'space-between' }}
          >
            <span>Players</span>
            <span>
              {seats.length}/{meta.maxPlayers}
            </span>
          </div>
          {seats.map((s, i) => (
            <div className="seat-row" key={s.id}>
              <img className="avatar" src={avatarFor(i)} alt="" />
              <span className="seat-name">{s.name}</span>
              {s.isBot ? (
                <select
                  aria-label={`${s.name} difficulty`}
                  value={s.botTier}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    onSeats(
                      seats.map((x) =>
                        x.id === s.id ? { ...x, botTier: e.target.value as BotTier } : x,
                      ),
                    )
                  }
                  style={{
                    background: 'rgba(255,255,255,.08)',
                    border: '1px solid rgba(96,148,224,.28)',
                    color: 'inherit',
                    borderRadius: 8,
                    fontFamily: 'inherit',
                    fontWeight: 700,
                    padding: '3px 6px',
                  }}
                >
                  {BOT_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {BOT_TIER_LABEL[t]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="pill">HOST</span>
              )}
              {s.isBot && canRemove ? (
                <button
                  className="icon-btn"
                  style={{ width: 28, height: 28 }}
                  aria-label={`Remove ${s.name}`}
                  onClick={() => onSeats(seats.filter((x) => x.id !== s.id))}
                >
                  ✕
                </button>
              ) : (
                <span className="pill ok">READY</span>
              )}
            </div>
          ))}
          <button className="btn btn-ghost" onClick={addBot} disabled={!canAdd}>
            + ADD BOT
          </button>
          {seats.length < meta.maxPlayers ? (
            <div style={{ textAlign: 'center', margin: '6px 0 2px' }}>
              <div className="waiting-balloon" style={{ fontSize: 16, padding: '6px 18px' }}>
                Waiting for players…
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel settings-list" aria-label="Game settings">
          <div className="setting-label" style={{ padding: '2px 8px 6px' }}>
            Game settings
          </div>

          <div className="setting">
            <span className="setting-label">Win condition</span>
            <select
              value={config.winCondition}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                onConfig({ winCondition: e.target.value as MatchConfig['winCondition'] })
              }
            >
              <option value="ONE_ROUND">One Round</option>
              <option value="POINTS_500">First to 500</option>
            </select>
          </div>

          <div className="setting">
            <span className="setting-label">Draw rule</span>
            <select
              value={config.drawRule}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onConfig({ drawRule: e.target.value as MatchConfig['drawRule'] })}
            >
              <option value="DRAW_ONE">Draw One</option>
              <option value="DRAW_UNTIL_PLAYABLE">Draw Until Playable</option>
            </select>
          </div>

          <div className="setting">
            <span className="setting-label">
              Stacking
              {version === 'MAYHEM' ? '' : ' (house rule)'}
            </span>
            <Toggle on={config.stacking} onChange={(v) => onConfig({ stacking: v })} label="Stacking" />
          </div>

          {/*
            One sound preference, shared with the in-match pause sheet and with
            the audio system itself. This toggle used to write a MatchConfig
            field that nothing read, so it looked live and did nothing.
          */}
          <div className="setting">
            <span className="setting-label">Sound</span>
            <Toggle on={sound} onChange={onSound} label="Sound" />
          </div>
        </section>

        <section className="panel theme-picker" aria-label="Table theme">
          <img src={asset('theme_thumb')} alt="" />
          <div className="setting-label">Table theme</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="icon-btn"
              style={{ width: 30, height: 30 }}
              aria-label="Previous theme"
              onClick={() => onConfig({ tableTheme: cycleTheme(config.tableTheme, -1) })}
            >
              ‹
            </button>
            <b style={{ minWidth: 68, textAlign: 'center' }}>
              {TABLE_THEMES.find((t) => t.id === config.tableTheme)?.label ?? 'Ocean'}
            </b>
            <button
              className="icon-btn"
              style={{ width: 30, height: 30 }}
              aria-label="Next theme"
              onClick={() => onConfig({ tableTheme: cycleTheme(config.tableTheme, 1) })}
            >
              ›
            </button>
          </div>
        </section>
      </div>

      <div className="footer-actions">
        <button className="btn btn-gold" onClick={onStart} style={{ fontSize: 17 }}>
          START GAME
        </button>
      </div>
    </div>
  );
}

function cycleTheme(current: string, delta: number): string {
  const i = TABLE_THEMES.findIndex((t) => t.id === current);
  const next = (i + delta + TABLE_THEMES.length) % TABLE_THEMES.length;
  return TABLE_THEMES[next]!.id;
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      className={`toggle${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
    >
      <i />
    </button>
  );
}
