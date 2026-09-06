import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BotTier,
  CommandInput,
  GameVersion,
  MatchConfig,
  PlayerView,
  RoomInfo,
  Standing,
} from '@colorclash/shared';
import { EMOTE_MS, isEmoteId, type EmoteId } from '@colorclash/game-content';
import { NetClient, clearLastRoom, loadLastRoom, type ConnectionStatus } from './net.js';
import { LOG_LINES, bannerMs, presentEvents, type Banner } from './presentation.js';
import { playEvents } from './audio.js';
import { FLIGHT_MS } from './pacing.js';

/**
 * Online match controller.
 *
 * Exposes the same surface as `useLocalMatch` — `view`, `banner`, `log`,
 * `reason`, `dispatch` — so `Table.tsx` renders an online match with no
 * changes at all. That works because `PlayerView` is both what the local
 * engine projects and what the server sends over the wire.
 *
 * The client never decides legality: `view.legalCardIds` arrives already
 * computed by the authoritative engine (§10.1).
 */

export type OnlineMatch = {
  status: ConnectionStatus;
  statusDetail?: string;
  playerId: string;
  room: RoomInfo | null;
  view: PlayerView | null;
  banner: Banner;
  log: string[];
  reason: string | null;
  error: string | null;
  /** The card in flight, for the travel animation. */
  flight: { cardId: string; playerId: string; id: number } | null;
  /** Standings from the server's own round-end event. */
  standings: Standing[];
  /** Emotes currently showing, keyed by player. */
  emotes: Record<string, EmoteId>;

  connect: (name: string) => void;
  /** A room the server may still be holding a seat in, from a previous visit. */
  lastRoom: string | undefined;
  /** Connect and walk straight back into that room. */
  rejoin: (name: string, code: string) => void;
  forgetLastRoom: () => void;
  disconnect: () => void;
  createRoom: (version: GameVersion, config?: Partial<MatchConfig>) => void;
  joinRoom: (code: string) => void;
  leaveRoom: () => void;
  addBot: (tier: BotTier) => void;
  removeSeat: (playerId: string) => void;
  setConfig: (config: Partial<MatchConfig>) => void;
  setVersion: (version: GameVersion) => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;
  dispatch: (command: CommandInput) => void;
  sendEmote: (id: EmoteId) => void;
  clearError: () => void;
};

export function useOnlineMatch(serverUrl?: string): OnlineMatch {
  const clientRef = useRef<NetClient | null>(null);
  const bannerSeq = useRef(0);

  const [status, setStatus] = useState<ConnectionStatus>('IDLE');
  const [statusDetail, setStatusDetail] = useState<string | undefined>(undefined);
  const [playerId, setPlayerId] = useState('');
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [log, setLog] = useState<string[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flight, setFlight] = useState<OnlineMatch['flight']>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [emotes, setEmotes] = useState<Record<string, EmoteId>>({});
  const flightSeq = useRef(0);

  // The latest view, for naming players in event text without re-subscribing.
  const viewRef = useRef<PlayerView | null>(null);
  viewRef.current = view;

  const client = useCallback((): NetClient => {
    if (!clientRef.current) {
      clientRef.current = new NetClient(serverUrl);
    }
    return clientRef.current;
  }, [serverUrl]);

  useEffect(() => {
    const net = client();
    net.on({
      onStatus: (s, detail) => {
        setStatus(s);
        setStatusDetail(detail);
      },
      onWelcome: (id) => setPlayerId(id),
      onRoom: (r) => setRoom(r),
      onSnapshot: (v) => setView(v),
      onEvents: (events) => {
        const source = viewRef.current;
        if (!source) return;
        const { lines, banner: next } = presentEvents(events, source);
        if (lines.length) setLog((prev) => [...prev, ...lines].slice(-LOG_LINES));
        if (next) {
          const id = ++bannerSeq.current;
          setBanner({ ...next, id });
          setTimeout(() => setBanner((b) => (b && b.id === id ? null : b)), bannerMs());
        } else {
          // A new action with nothing to shout about: anything still up now
          // describes the previous one. Same staleness fix as the local hook.
          setBanner(null);
        }
        playEvents(events, source.you);

        // The server scored the round; the client only displays the result.
        const ended = events.find((e) => e.type === 'ROUND_ENDED' || e.type === 'MATCH_ENDED');
        if (ended && (ended.type === 'ROUND_ENDED' || ended.type === 'MATCH_ENDED')) {
          setStandings(ended.standings);
        }

        const played = events.find((e) => e.type === 'CARD_PLAYED');
        if (played && played.type === 'CARD_PLAYED') {
          const id = ++flightSeq.current;
          setFlight({ cardId: played.cardId, playerId: played.playerId, id });
          setTimeout(() => setFlight((f) => (f && f.id === id ? null : f)), FLIGHT_MS);
        }
      },
      onEmote: (playerId, raw) => {
        if (!isEmoteId(raw)) return;
        const id: EmoteId = raw;
        setEmotes((prev) => ({ ...prev, [playerId]: id }));
        setTimeout(() => {
          setEmotes((prev) => {
            if (prev[playerId] !== id) return prev;
            const next: Record<string, EmoteId> = { ...prev };
            delete next[playerId];
            return next;
          });
        }, EMOTE_MS);
      },
      onRejected: (_commandId, why) => {
        // Same affordance as local play: a short, plain-language toast.
        setReason(why);
        setTimeout(() => setReason(null), 1800);
      },
      onRoomClosed: (why) => {
        setRoom(null);
        setView(null);
        setError(`Room closed: ${why}`);
      },
      onError: (message) => setError(message),
    });

    return () => {
      net.disconnect();
      clientRef.current = null;
    };
  }, [client]);

  const connect = useCallback(
    (name: string) => {
      setError(null);
      client().connect(name);
    },
    [client],
  );

  const dispatch = useCallback(
    (command: CommandInput) => {
      client().submit(command);
    },
    [client],
  );

  const rejoin = useCallback(
    (name: string, code: string) => {
      setError(null);
      const net = client();
      net.connect(name);
      // The socket may not be open yet; joinRoom stores the code and the
      // existing reconnect path replays JOIN_ROOM + RESYNC once it is.
      net.joinRoom(code);
    },
    [client],
  );

  return useMemo<OnlineMatch>(
    () => ({
      status,
      statusDetail,
      playerId,
      room,
      view,
      banner,
      log,
      reason,
      error,
      flight,
      standings,
      emotes,

      connect,
      lastRoom: loadLastRoom(),
      rejoin,
      forgetLastRoom: clearLastRoom,
      disconnect: () => client().disconnect(),
      createRoom: (version, config) => client().createRoom(version, config),
      joinRoom: (code) => client().joinRoom(code),
      leaveRoom: () => {
        client().leaveRoom();
        setRoom(null);
        setView(null);
        setLog([]);
        setStandings([]);
        setEmotes({});
      },
      addBot: (tier) => client().addBot(tier),
      removeSeat: (id) => client().removeSeat(id),
      setConfig: (config) => client().setConfig(config),
      setVersion: (version) => client().setVersion(version),
      setReady: (ready) => client().setReady(ready),
      startGame: () => client().startGame(),
      dispatch,
      sendEmote: (id) => client().sendEmote(id),
      clearError: () => setError(null),
    }),
    [
      status,
      statusDetail,
      playerId,
      room,
      view,
      banner,
      log,
      reason,
      error,
      flight,
      standings,
      emotes,
      client,
      connect,
      rejoin,
      dispatch,
    ],
  );
}
