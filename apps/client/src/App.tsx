import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameVersion, MatchConfig, PlayerView, Standing } from '@colorclash/shared';
import { configFor, VERSION_META, type EmoteId } from '@colorclash/game-content';
import { calculateRoundScore, toStandings } from '@colorclash/game-engine';
import { Loading } from './screens/Loading.js';
import { MainMenu } from './screens/MainMenu.js';
import { NamePrompt } from './screens/NamePrompt.js';
import { ModeSelect } from './screens/ModeSelect.js';
import { Lobby } from './screens/Lobby.js';
import { OnlineHome, OnlineLobby } from './screens/OnlineLobby.js';
import { Table } from './screens/Table.js';
import { SummaryScreen, WinnerScreen, type ResultSource } from './screens/Result.js';
import { HUMAN_ID, useLocalMatch, type Seat } from './state/useGame.js';
import { useOnlineMatch } from './state/useOnline.js';
import { useEmotes } from './components/EmoteBar.js';
import { MatchSettings } from './components/MatchSettings.js';
import { RulesSheet } from './components/RulesSheet.js';
import { isSoundEnabled, onSoundChange, play, setSoundEnabled } from './state/audio.js';
import { loadProfile, newProfile, saveProfile, type Profile } from './state/profile.js';
import { clearMatch, loadMatch, type SavedMatch } from './state/savedMatch.js';
import { asset } from './assets/index.js';

/**
 * Screen router — §3.1 Main Flow:
 *   Boot -> splash -> profile/guest -> home
 *   Home -> select mode -> configure players/rules -> lobby/setup
 *   Match -> play -> round end -> winner/score summary -> rematch, next round, exit
 *
 * Local and online matches share every in-match screen. The only difference is
 * where the `PlayerView` comes from — the local engine, or the authoritative
 * server — which is exactly the boundary §4.2 asks for.
 */
type Screen =
  | 'LOADING'
  | 'MENU'
  | 'MODES'
  | 'LOBBY'
  | 'ONLINE_HOME'
  | 'ONLINE_LOBBY'
  | 'TABLE'
  | 'WINNER'
  | 'SUMMARY';

type Source = 'local' | 'online';

/** The bots are fixed; the human seat takes the player's own name. */
const BOT_SEATS: Seat[] = [
  { id: 'bot-1', name: 'Sunny', isBot: true, botTier: 'NORMAL' },
  { id: 'bot-2', name: 'Moonlight', isBot: true, botTier: 'NORMAL' },
  { id: 'bot-3', name: 'TigerX', isBot: true, botTier: 'HARD' },
];

function defaultSeats(name: string): Seat[] {
  return [{ id: HUMAN_ID, name, isBot: false }, ...BOT_SEATS];
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('LOADING');
  const [source, setSource] = useState<Source>('local');
  const [version, setVersion] = useState<GameVersion>('CLASSIC');
  const [seats, setSeats] = useState<Seat[]>(() => defaultSeats(loadProfile()?.name ?? 'You'));
  const [config, setConfig] = useState<MatchConfig>(configFor('CLASSIC'));
  /**
   * Motion preference. Seeded from the OS setting, then overridable in the
   * pause sheet — an accessibility preference the player has already expressed
   * once should not have to be expressed again.
   */
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [sound, setSound] = useState(isSoundEnabled);
  /** The settings sheet, opened from the menu's gear rather than the table's. */
  const [menuSettings, setMenuSettings] = useState(false);
  const [menuRules, setMenuRules] = useState(false);
  const [standings, setStandings] = useState<Standing[]>([]);

  /**
   * The profile is loaded once, and null means "this person has not been here
   * before" — which is what gates the one-time name prompt. It is persisted on
   * every change, so coins and gems survive a reload; the Store sheet has been
   * promising exactly that in writing.
   */
  const [profile, setProfile] = useState<Profile | null>(loadProfile);
  useEffect(() => {
    if (profile) saveProfile(profile);
  }, [profile]);

  /** An unfinished match found in storage, offered on the menu as Resume. */
  const [saved, setSaved] = useState<SavedMatch | null>(loadMatch);

  const local = useLocalMatch(reducedMotion);
  const net = useOnlineMatch();
  const emotes = useEmotes();

  /** The toggle is the whole contract: off means no audio node is created. */
  const changeSound = useCallback((on: boolean) => {
    setSoundEnabled(on);
    if (on) play('UI_TAP');
  }, []);

  // One preference, several switches. Whichever one is used, every other view
  // of it updates — the lobby toggle and the pause sheet cannot disagree.
  useEffect(() => onSoundChange(setSound), []);

  const view = source === 'local' ? local.view : net.view;
  const banner = source === 'local' ? local.banner : net.banner;
  const log = source === 'local' ? local.log : net.log;
  const reason = source === 'local' ? local.reason : net.reason;
  const dispatch = source === 'local' ? local.dispatch : net.dispatch;

  /* ---------------- local round end ---------------- */

  useEffect(() => {
    if (source !== 'local') return;
    const s = local.state;
    if (!s) return;
    if ((s.status === 'ROUND_END' || s.status === 'MATCH_END') && screen === 'TABLE') {
      // The engine already scored this round and put the standings in its own
      // ROUND_ENDED event, which the match hook captured. Reading them back
      // used to mean calling the scoring function a second time with scoring
      // switched off — a workaround for it being both a calculation and a
      // mutation, and one that would now double-count. The event is the single
      // authoritative answer, so the screen and the engine cannot disagree.
      setStandings(
        local.standings.length > 0
          ? local.standings
          : toStandings(calculateRoundScore(s, s.winnerId ?? s.players[0]!.id)),
      );
      const won = s.winnerId === HUMAN_ID;
      setProfile((p) =>
        p ? { ...p, coins: p.coins + (won ? 100 : 25), gems: p.gems + (won ? 50 : 10) } : p,
      );
      const t = setTimeout(() => setScreen('WINNER'), 700);
      return () => clearTimeout(t);
    }
    return;
  }, [local.state, local.standings, screen, source]);

  /* ---------------- online lifecycle ---------------- */

  // The server's ROOM broadcast is what moves us into the lobby, so both the
  // host and a joining player follow the same path.
  useEffect(() => {
    if (source !== 'online') return;
    if (net.room && (screen === 'ONLINE_HOME' || screen === 'MENU')) {
      setScreen('ONLINE_LOBBY');
    }
    if (!net.room && screen === 'ONLINE_LOBBY') {
      setScreen('ONLINE_HOME');
    }
  }, [net.room, screen, source]);

  // A snapshot with status PLAYING means the host started; every client
  // transitions off the same authoritative signal rather than a local guess.
  useEffect(() => {
    if (source !== 'online' || !net.view) return;
    if (net.view.status === 'PLAYING' && screen === 'ONLINE_LOBBY') {
      setScreen('TABLE');
    }
    if (
      (net.view.status === 'ROUND_END' || net.view.status === 'MATCH_END') &&
      screen === 'TABLE'
    ) {
      // Same rule online: the server's ROUND_ENDED standings win, and the view
      // is only a fallback for a client that joined after the event.
      setStandings(net.standings.length > 0 ? net.standings : standingsFromView(net.view));
      const won = net.view.winnerId === net.playerId;
      setProfile((p) =>
        p ? { ...p, coins: p.coins + (won ? 100 : 25), gems: p.gems + (won ? 50 : 10) } : p,
      );
      const t = setTimeout(() => setScreen('WINNER'), 700);
      return () => clearTimeout(t);
    }
    return;
  }, [net.view, net.standings, net.playerId, screen, source]);

  /* ---------------- actions ---------------- */

  /**
   * An emote goes to the room online, and to your own seat locally, so the
   * button behaves identically in both modes rather than being silently dead
   * against bots.
   */
  const sendEmote = useCallback(
    (id: EmoteId) => {
      if (source === 'online') net.sendEmote(id);
      else emotes.show(HUMAN_ID, id);
    },
    [source, net, emotes],
  );

  const pickVersion = useCallback((v: GameVersion) => {
    setVersion(v);
    setConfig(configFor(v));
    setSeats((current) => {
      const meta = VERSION_META[v];
      return current.slice(0, Math.max(meta.minPlayers, Math.min(current.length, meta.maxPlayers)));
    });
    setScreen('LOBBY');
  }, []);

  const startLocalMatch = useCallback(() => {
    setSource('local');
    local.start(version, seats, config);
    setSaved(null);
    setScreen('TABLE');
  }, [local, version, seats, config]);

  const goOnline = useCallback(() => {
    setSource('online');
    // The player's own name goes on the wire, so opponents see who they are
    // playing. Every seat used to arrive as "PlayerOne".
    net.connect(profile?.name ?? 'Player');
    setScreen('ONLINE_HOME');
  }, [net, profile?.name]);

  const backToMenu = useCallback(() => {
    if (source === 'online') {
      net.leaveRoom();
      net.disconnect();
    }
    local.reset();
    setSource('local');
    setSaved(loadMatch());
    setScreen('MENU');
  }, [local, net, source]);

  /* ---------------- result source ---------------- */

  const resultSource: ResultSource | null = useMemo(() => {
    if (source === 'local') {
      const s = local.state;
      if (!s) return null;
      return {
        players: s.players.map((p) => ({ id: p.id, name: p.name })),
        winnerId: s.winnerId,
        stats: s.stats,
        you: HUMAN_ID,
      };
    }
    const v = net.view;
    if (!v) return null;
    return {
      players: v.players.map((p) => ({ id: p.id, name: p.name })),
      winnerId: v.winnerId,
      stats: v.stats,
      you: v.you,
    };
  }, [source, local.state, net.view]);

  const body = useMemo(() => {
    // First run: ask for a name once, before anything else. Everything
    // downstream — the local seat label, the online handshake — reads it.
    if (!profile && screen !== 'LOADING') {
      return (
        <NamePrompt
          onDone={(name) => {
            const created = newProfile(name);
            setProfile(created);
            setSeats(defaultSeats(created.name));
          }}
        />
      );
    }

    switch (screen) {
      case 'LOADING':
        return <Loading onDone={() => setScreen('MENU')} />;

      case 'MENU':
        return (
          <MainMenu
            profile={profile!}
            saved={saved}
            savedLabel={saved ? VERSION_META[saved.version].title : undefined}
            onlineRoom={net.lastRoom}
            onRejoinOnline={() => {
              setSource('online');
              net.rejoin(profile?.name ?? 'Player', net.lastRoom!);
              setScreen('ONLINE_HOME');
            }}
            onForgetOnline={() => net.forgetLastRoom()}
            onResume={() => {
              if (!saved) return;
              setSource('local');
              setVersion(saved.version);
              setConfig(saved.config);
              setSeats(saved.seats);
              if (local.resume(saved)) setScreen('TABLE');
              else setSaved(null);
            }}
            onDiscardSaved={() => {
              clearMatch();
              setSaved(null);
            }}
            onQuickMatch={() => {
              const fresh = defaultSeats(profile?.name ?? 'You');
              setSource('local');
              setVersion('CLASSIC');
              setConfig(configFor('CLASSIC'));
              setSeats(fresh);
              local.start('CLASSIC', fresh, configFor('CLASSIC'));
              setSaved(null);
              setScreen('TABLE');
            }}
            onGameModes={() => {
              setSource('local');
              setScreen('MODES');
            }}
            onOnline={goOnline}
            onCustomRoom={goOnline}
            onSettings={() => setMenuSettings(true)}
          />
        );

      case 'MODES':
        return <ModeSelect onPick={pickVersion} onBack={() => setScreen('MENU')} />;

      case 'LOBBY':
        return (
          <Lobby
            version={version}
            seats={seats}
            config={config}
            onConfig={(patch) => setConfig((c) => ({ ...c, ...patch }))}
            onSeats={setSeats}
            onStart={startLocalMatch}
            onBack={() => setScreen('MODES')}
            sound={sound}
            onSound={changeSound}
          />
        );

      case 'ONLINE_HOME':
        return <OnlineHome net={net} onBack={backToMenu} />;

      case 'ONLINE_LOBBY':
        return net.room ? (
          <OnlineLobby
            net={net}
            onLeave={() => {
              net.leaveRoom();
              setScreen('ONLINE_HOME');
            }}
          />
        ) : null;

      case 'TABLE':
        return view ? (
          <>
            <Table
              view={view}
              banner={banner}
              log={log}
              reason={reason}
              flight={source === 'local' ? local.flight : net.flight}
              clashDeadline={source === 'local' ? local.clashDeadline : null}
              emotes={source === 'local' ? emotes.active : net.emotes}
              onEmote={sendEmote}
              onCommand={dispatch}
              onExit={backToMenu}
              sound={sound}
              onSound={changeSound}
              reducedMotion={reducedMotion}
              onReducedMotion={setReducedMotion}
            />
            {source === 'online' && net.status !== 'CONNECTED' ? (
              <div className="waiting-note" role="status">
                <div>
                  <div className="h2">Reconnecting…</div>
                  <p className="dim" style={{ fontSize: 13 }}>
                    Your seat is held. The table resumes from the server's state.
                  </p>
                </div>
              </div>
            ) : null}
          </>
        ) : null;

      case 'WINNER':
        return resultSource ? (
          <WinnerScreen
            state={resultSource}
            standings={standings}
            onContinue={() => setScreen('SUMMARY')}
            onMenu={backToMenu}
          />
        ) : null;

      case 'SUMMARY':
        return resultSource ? (
          <SummaryScreen
            state={resultSource}
            standings={standings}
            onMenu={backToMenu}
            onPlayAgain={() => {
              if (source === 'online') {
                setScreen('ONLINE_LOBBY');
              } else {
                startLocalMatch();
              }
            }}
          />
        ) : null;
    }
  }, [
    screen,
    profile,
    version,
    seats,
    config,
    local,
    net,
    view,
    banner,
    log,
    reason,
    dispatch,
    source,
    standings,
    resultSource,
    saved,
    sound,
    changeSound,
    pickVersion,
    startLocalMatch,
    goOnline,
    backToMenu,
  ]);

  return (
    <div className={`app${reducedMotion ? ' reduced-motion' : ''}`}>
      <div className="stage" style={themeVars()}>
        {body}

        {menuSettings ? (
          <MatchSettings
            sound={sound}
            onSound={changeSound}
            reducedMotion={reducedMotion}
            onReducedMotion={setReducedMotion}
            onRules={() => {
              setMenuSettings(false);
              setMenuRules(true);
            }}
            onLeave={() => setMenuSettings(false)}
            onClose={() => setMenuSettings(false)}
          />
        ) : null}

        {menuRules ? <RulesSheet version={version} onClose={() => setMenuRules(false)} /> : null}
      </div>
    </div>
  );
}

/**
 * Seeds the motion preference from the operating system.
 *
 * Someone who has already asked their device to reduce motion should not have
 * to ask this game separately; the in-app switch is there to override it, not
 * to be the only way to express it.
 */
function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

/**
 * Standings for an online match come from the sanitised view: the server has
 * already applied scoring, so the client only sorts and labels.
 */
function standingsFromView(view: PlayerView): Standing[] {
  return view.players
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      score: p.score,
      cardsLeft: p.handCount,
      eliminated: p.eliminated,
    }))
    .sort((a, b) => b.score - a.score);
}

/** Injects the sliced textures as CSS custom properties for the backgrounds. */
function themeVars(): Record<string, string> {
  return {
    ['--tex-water' as string]: `url(${asset('tex_water')})`,
    ['--tex-navy' as string]: `url(${asset('tex_navy')})`,
  };
}
