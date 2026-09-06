import { useState } from 'react';
import type { GameVersion, MatchConfig } from '@colorclash/shared';
import { VERSION_META, VERSION_ORDER } from '@colorclash/game-content';
import { BOT_TIER_LABEL, BOT_TIERS } from '@colorclash/ai';
import { asset, avatarFor } from '../assets/index.js';
import type { OnlineMatch } from '../state/useOnline.js';

/**
 * Online room screens — §10.2 room lifecycle, from the player's side.
 *
 *   CREATE_ROOM / JOIN_ROOM -> READY_CHECK -> START_GAME
 *
 * Every control here sends a message and then waits for the server's `ROOM`
 * broadcast to redraw. Nothing is applied optimistically, so two clients can
 * never disagree about who is in a seat.
 */

export function OnlineHome({
  net,
  onBack,
}: {
  net: OnlineMatch;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [version, setVersion] = useState<GameVersion>('CLASSIC');
  const connected = net.status === 'CONNECTED';

  return (
    <div className="screen bg-menu">
      <div className="table-top">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <img src={asset('icon_back')} alt="" />
        </button>
        <div className="rule-title" style={{ flex: 1 }}>
          <h1 className="h1">PLAY ONLINE</h1>
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div className="online-home">
        <ConnectionPill net={net} />

        {net.error ? (
          <div className="net-error" role="alert">
            {net.error}
            <button className="btn btn-ghost" onClick={net.clearError} style={{ padding: '4px 12px' }}>
              Dismiss
            </button>
          </div>
        ) : null}

        <section className="panel online-card">
          <h2 className="h2">HOST A TABLE</h2>
          <p className="dim" style={{ fontSize: 13, margin: '4px 0 12px' }}>
            You get a room code to share. Add bots to fill empty seats.
          </p>
          <div className="setting" style={{ borderBottom: 'none', paddingLeft: 0 }}>
            <span className="setting-label">Ruleset</span>
            <select
              value={version}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setVersion(e.target.value as GameVersion)
              }
            >
              {VERSION_ORDER.map((v) => (
                <option key={v} value={v}>
                  {VERSION_META[v].title}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-gold"
            style={{ width: '100%' }}
            disabled={!connected}
            onClick={() => net.createRoom(version)}
          >
            CREATE ROOM
          </button>
        </section>

        <section className="panel online-card">
          <h2 className="h2">JOIN A TABLE</h2>
          <p className="dim" style={{ fontSize: 13, margin: '4px 0 12px' }}>
            Enter the five-character code from the host.
          </p>
          <input
            className="code-input"
            value={code}
            maxLength={5}
            placeholder="ABCDE"
            aria-label="Room code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
            }
          />
          <button
            className="btn btn-blue"
            style={{ width: '100%' }}
            disabled={!connected || code.length < 5}
            onClick={() => net.joinRoom(code)}
          >
            JOIN ROOM
          </button>
        </section>
      </div>
    </div>
  );
}

export function OnlineLobby({
  net,
  onLeave,
}: {
  net: OnlineMatch;
  onLeave: () => void;
}) {
  const room = net.room!;
  const me = room.seats.find((s) => s.playerId === net.playerId);
  const isHost = room.hostId === net.playerId;
  const meta = VERSION_META[room.version];
  const humans = room.seats.filter((s) => !s.isBot);
  const allReady = humans.every((s) => s.ready);
  const enoughPlayers = room.seats.length >= meta.minPlayers;

  return (
    <div className="screen bg-menu">
      <div className="table-top">
        <button className="icon-btn" onClick={onLeave} aria-label="Leave room">
          <img src={asset('icon_back')} alt="" />
        </button>
        <div className="rule-title" style={{ flex: 1 }}>
          <h1 className="h1">{meta.title}</h1>
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div className="room-code" aria-label={`Room code ${room.code.split('').join(' ')}`}>
        <span className="dim">ROOM CODE</span>
        <b>{room.code}</b>
      </div>

      <ConnectionPill net={net} />

      <div className="lobby-body">
        <section className="panel seat-list" aria-label="Players">
          <div className="setting-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Players</span>
            <span>
              {room.seats.length}/{room.maxSeats}
            </span>
          </div>
          {room.seats.map((s, i) => (
            <div className="seat-row" key={s.playerId}>
              <img className="avatar" src={avatarFor(i)} alt="" />
              <span className="seat-name">
                {s.name}
                {s.playerId === net.playerId ? ' (you)' : ''}
              </span>
              {!s.connected ? <span className="pill">OFFLINE</span> : null}
              {s.isHost ? <span className="pill">HOST</span> : null}
              {s.isBot ? (
                <span className="pill">{BOT_TIER_LABEL[s.botTier ?? 'NORMAL']}</span>
              ) : (
                <span className={`pill${s.ready ? ' ok' : ''}`}>
                  {s.ready ? 'READY' : 'WAITING'}
                </span>
              )}
              {isHost && s.playerId !== net.playerId ? (
                <button
                  className="icon-btn"
                  style={{ width: 28, height: 28 }}
                  aria-label={`Remove ${s.name}`}
                  onClick={() => net.removeSeat(s.playerId)}
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
          {isHost ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                aria-label="Bot difficulty to add"
                defaultValue="NORMAL"
                id="bot-tier"
                style={{
                  background: 'rgba(255,255,255,.08)',
                  border: '1px solid rgba(96,148,224,.28)',
                  color: 'inherit',
                  borderRadius: 8,
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  padding: '6px 8px',
                }}
              >
                {BOT_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {BOT_TIER_LABEL[t]}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                disabled={room.seats.length >= room.maxSeats}
                onClick={() => {
                  const el = document.getElementById('bot-tier') as HTMLSelectElement | null;
                  net.addBot((el?.value ?? 'NORMAL') as never);
                }}
              >
                + ADD BOT
              </button>
            </div>
          ) : null}
        </section>

        <section className="panel settings-list" aria-label="Table settings">
          <div className="setting-label" style={{ padding: '2px 8px 6px' }}>
            Table settings {isHost ? '' : '(host controls)'}
          </div>

          <div className="setting">
            <span className="setting-label">Ruleset</span>
            <select
              value={room.version}
              disabled={!isHost}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                net.setVersion(e.target.value as GameVersion)
              }
            >
              {VERSION_ORDER.map((v) => (
                <option key={v} value={v}>
                  {VERSION_META[v].title}
                </option>
              ))}
            </select>
          </div>

          <div className="setting">
            <span className="setting-label">Win condition</span>
            <select
              value={room.config.winCondition}
              disabled={!isHost}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                net.setConfig({ winCondition: e.target.value as MatchConfig['winCondition'] })
              }
            >
              <option value="ONE_ROUND">One Round</option>
              <option value="POINTS_500">First to 500</option>
            </select>
          </div>

          <div className="setting">
            <span className="setting-label">Draw rule</span>
            <select
              value={room.config.drawRule}
              disabled={!isHost}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                net.setConfig({ drawRule: e.target.value as MatchConfig['drawRule'] })
              }
            >
              <option value="DRAW_ONE">Draw One</option>
              <option value="DRAW_UNTIL_PLAYABLE">Draw Until Playable</option>
            </select>
          </div>

          <div className="setting">
            <span className="setting-label">Stacking</span>
            <button
              className={`toggle${room.config.stacking ? ' on' : ''}`}
              role="switch"
              aria-checked={room.config.stacking}
              aria-label="Stacking"
              disabled={!isHost}
              onClick={() => net.setConfig({ stacking: !room.config.stacking })}
            >
              <i />
            </button>
          </div>
        </section>
      </div>

      <div className="footer-actions">
        <button
          className={`btn ${me?.ready ? 'btn-ghost' : 'btn-blue'}`}
          onClick={() => net.setReady(!me?.ready)}
        >
          {me?.ready ? 'NOT READY' : "I'M READY"}
        </button>
        {isHost ? (
          <button
            className="btn btn-gold"
            disabled={!allReady || !enoughPlayers}
            onClick={net.startGame}
            title={
              !enoughPlayers
                ? `Needs at least ${meta.minPlayers} players`
                : !allReady
                  ? 'Waiting for everyone to be ready'
                  : undefined
            }
          >
            START GAME
          </button>
        ) : (
          <div className="btn btn-ghost" style={{ flex: 1, cursor: 'default' }}>
            WAITING FOR HOST
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectionPill({ net }: { net: OnlineMatch }) {
  const label: Record<string, string> = {
    IDLE: 'Not connected',
    CONNECTING: 'Connecting…',
    CONNECTED: 'Connected',
    RECONNECTING: 'Reconnecting…',
    CLOSED: 'Disconnected',
  };
  const tone =
    net.status === 'CONNECTED' ? 'ok' : net.status === 'RECONNECTING' ? 'warn' : 'bad';
  return (
    <div className={`conn-pill ${tone}`} aria-live="polite">
      <i />
      {label[net.status]}
      {net.statusDetail && net.status === 'RECONNECTING' ? ` — ${net.statusDetail}` : ''}
    </div>
  );
}
