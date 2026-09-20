import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createRng,
  type BotTier,
  type Command,
  type CommandInput,
  type GameEvent,
  type GameState,
  type GameVersion,
  type MatchConfig,
  type PlayerView,
  type RngLike,
  type Standing,
} from '@colorclash/shared';
import { buildLocalView, createMatch, reduce } from '@colorclash/game-engine';
import { stepBots } from '@colorclash/ai/driver';
import { configFor } from '@colorclash/game-content';
import { LOG_LINES, bannerMs, presentEvents, type Banner } from './presentation.js';
import { playEvents } from './audio.js';
import { clearMatch, loadMatch, saveMatch, type SavedMatch } from './savedMatch.js';
import { BOT_PACE_MAX_MS, botPace, flightMs } from './pacing.js';

// Re-exported so existing importers keep working; the values live in pacing.ts
// where they can be tested without React.
export {
  BOT_PACE_MAX_MS,
  BOT_PACE_MIN_MS,
  BOT_PACE_REDUCED_MS,
  FLIGHT_MS,
  botPace,
} from './pacing.js';

/**
 * Local match controller.
 *
 * §4.2: "UI imports engine types and command contracts, but never mutates game
 * state directly." Every player action here becomes a Command and goes through
 * the same `reduce` the authoritative server uses. The hook holds no rules —
 * only presentation state: which banner to show, the event log, the pending
 * "illegal move" reason, and the pace of the table.
 */

export type Seat = {
  id: string;
  name: string;
  isBot: boolean;
  botTier?: BotTier;
};

/** The card currently travelling to the discard pile. */
export type Flight = { cardId: string; playerId: string; id: number } | null;

export type LocalMatch = {
  state: GameState | null;
  view: PlayerView | null;
  banner: Banner;
  log: string[];
  reason: string | null;
  flight: Flight;
  /** Epoch ms at which a pending Clash call becomes a penalty, or null. */
  clashDeadline: number | null;
  /** Final standings, taken from the engine's own round-end event. */
  standings: Standing[];
  start: (version: GameVersion, seats: Seat[], config: Partial<MatchConfig>, seed?: string) => void;
  /** Rebuilds an unfinished match from its saved seed and command log. */
  resume: (saved: SavedMatch) => boolean;
  dispatch: (command: CommandInput) => void;
  clearReason: () => void;
  reset: () => void;
};

const HUMAN = 'you';

export function useLocalMatch(reducedMotion = false): LocalMatch {
  const [state, setState] = useState<GameState | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [log, setLog] = useState<string[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [flight, setFlight] = useState<Flight>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  /** When the Clash grace window closes, or null when none is running. */
  const [clashDeadline, setClashDeadline] = useState<number | null>(null);

  const rngRef = useRef<RngLike>(createRng('local'));
  const commandSeq = useRef(0);
  /**
   * Everything needed to rebuild this match: the setup, and every command the
   * engine has accepted. Held in a ref rather than state because it changes on
   * every move and nothing renders from it.
   */
  const logRef = useRef<{
    setup: Omit<SavedMatch, 'format' | 'savedAt' | 'commands'>;
    commands: Command[];
  } | null>(null);
  const bannerSeq = useRef(0);
  const flightSeq = useRef(0);
  /** The scheduled next bot step, so it can be cancelled on reset or unmount. */
  const pumpRef = useRef<number | null>(null);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  /**
   * The pace the last step was scheduled at, so a banner can be held for the
   * beat it belongs to rather than a fixed span that outlives it.
   */
  const paceRef = useRef<number>(BOT_PACE_MAX_MS);

  const cancelPump = useCallback(() => {
    if (pumpRef.current !== null) {
      clearTimeout(pumpRef.current);
      pumpRef.current = null;
    }
  }, []);

  // Leaving a match mid-pump must not leave a timer running against a state
  // nothing is rendering any more.
  useEffect(() => cancelPump, [cancelPump]);

  const present = useCallback((events: GameEvent[], s: GameState) => {
    if (events.length === 0) return;
    const { lines, banner: next } = presentEvents(events, s);
    if (lines.length) setLog((prev) => [...prev, ...lines].slice(-LOG_LINES));
    if (next) {
      const id = ++bannerSeq.current;
      setBanner({ ...next, id });
      setTimeout(() => setBanner((b) => (b && b.id === id ? null : b)), bannerMs(paceRef.current));
    } else {
      // This batch is a new action with nothing to shout about. Whatever is
      // still on screen describes the *previous* one, so it is now stale — the
      // timer alone used to leave it up across the next turn or two.
      setBanner(null);
    }
    playEvents(events, HUMAN);

    // The engine already scored the round and put the result in the event.
    // Reading it here means the screen and the engine can never disagree, and
    // nothing has to recompute a score that has already been applied.
    const ended = events.find((e) => e.type === 'ROUND_ENDED' || e.type === 'MATCH_ENDED');
    if (ended && (ended.type === 'ROUND_ENDED' || ended.type === 'MATCH_ENDED')) {
      setStandings(ended.standings);
    }

    const played = events.find((e) => e.type === 'CARD_PLAYED');
    if (played && played.type === 'CARD_PLAYED') {
      const id = ++flightSeq.current;
      setFlight({ cardId: played.cardId, playerId: played.playerId, id });
      setTimeout(
        () => setFlight((f) => (f && f.id === id ? null : f)),
        flightMs(reducedRef.current),
      );
    }
  }, []);

  /**
   * Records an accepted command and writes the match out.
   *
   * Called for the player's moves and for the bots' alike — a replay that
   * skipped bot commands would let them decide differently and rebuild a
   * different match.
   */
  const record = useCallback((command: Command, next: GameState) => {
    const entry = logRef.current;
    if (!entry) return;
    entry.commands.push(command);
    if (next.status === 'MATCH_END') {
      // A finished match is not worth resuming, and leaving it behind would
      // offer the player a table with nothing left to do.
      logRef.current = null;
      clearMatch();
      return;
    }
    saveMatch({ ...entry.setup, commands: entry.commands });
  }, []);

  /**
   * How long to wait before the next opponent move.
   *
   * Normally one animation beat. But when the human owes a Clash call, the
   * *next* action at the table is what settles the missed call and applies the
   * penalty — so at a 772 ms beat the player had about three quarters of a
   * second to reach the button. `clashGraceMs` exists for exactly this and was
   * never read by anything; holding the next action back for it is what makes
   * the window fair without touching a single rule.
   */
  const stepDelay = useCallback((from: GameState): number => {
    const pace = botPace(reducedRef.current);
    paceRef.current = pace;
    if (from.clashPending !== HUMAN) return pace;
    return Math.max(pace, from.config.clashGraceMs);
  }, []);

  const scheduleStep = useCallback(
    (from: GameState, run: (s: GameState) => void) => {
      cancelPump();
      const delay = stepDelay(from);
      // When the wait is the grace window rather than the pace, the button
      // needs a deadline to count down from.
      setClashDeadline(from.clashPending === HUMAN ? Date.now() + delay : null);
      pumpRef.current = setTimeout(() => {
        pumpRef.current = null;
        setClashDeadline(null);
        run(from);
      }, delay);
    },
    [cancelPump, stepDelay],
  );

  /**
   * Advances the match by exactly one bot decision, then schedules the next.
   *
   * Committing state after every step is what makes the table readable: hand
   * counts tick down one seat at a time and each action banner gets its own
   * moment, instead of four turns collapsing into a single repaint.
   */
  const pump = useCallback(
    (from: GameState) => {
      const result = stepBots(from, rngRef.current);
      if (!result.acted) return;
      if (result.command) record(result.command, result.state);
      setState(result.state);
      present(result.events, result.state);
      scheduleStep(result.state, pump);
    },
    [present, record, scheduleStep],
  );

  const start = useCallback(
    (
      version: GameVersion,
      seats: Seat[],
      config: Partial<MatchConfig>,
      seed = `m-${Date.now()}`,
    ) => {
      cancelPump();
      const rng = createRng(seed);
      rngRef.current = rng;
      commandSeq.current = 0;
      setLog([]);
      setReason(null);
      setBanner(null);
      setFlight(null);
      setStandings([]);
      setClashDeadline(null);
      const { state: fresh, events } = createMatch(
        {
          gameId: `local-${seed}`,
          version,
          seed,
          config: configFor(version, config),
          players: seats.map((s) => ({
            id: s.id,
            name: s.name,
            isBot: s.isBot,
            botTier: s.botTier,
          })),
        },
        rng,
      );
      logRef.current = {
        setup: { version, seed, config: fresh.config, seats },
        commands: [],
      };
      saveMatch({ ...logRef.current.setup, commands: [] });

      setState(fresh);
      present(events, fresh);
      // The first beat waits, so the deal is on screen before anyone acts.
      scheduleStep(fresh, pump);
    },
    [cancelPump, present, pump, scheduleStep],
  );

  /**
   * Rebuilds a saved match by replaying its command log through the same
   * reducer that produced it.
   *
   * Replay is silent: no banners, no sounds, no card flights for moves the
   * player already watched. What they see is the table exactly as they left it.
   *
   * A command the engine now refuses means the log and the code have diverged —
   * a rule changed under an old save. Stopping there restores the match up to
   * the last state both agree on, which beats discarding it.
   */
  const resume = useCallback(
    (saved: SavedMatch): boolean => {
      cancelPump();
      try {
        const rng = createRng(saved.seed);
        rngRef.current = rng;
        const { state: fresh } = createMatch(
          {
            gameId: `local-${saved.seed}`,
            version: saved.version,
            seed: saved.seed,
            config: saved.config,
            players: saved.seats.map((s) => ({
              id: s.id,
              name: s.name,
              isBot: s.isBot,
              botTier: s.botTier,
            })),
          },
          rng,
        );

        let current = fresh;
        const applied: Command[] = [];
        for (const command of saved.commands) {
          try {
            current = reduce(current, command, rng).state;
            applied.push(command);
          } catch {
            break;
          }
        }

        // Continue numbering past the replayed commands so a new move cannot
        // reuse an id that is already in the log.
        commandSeq.current = applied.length + 1;
        logRef.current = {
          setup: {
            version: saved.version,
            seed: saved.seed,
            config: saved.config,
            seats: saved.seats,
          },
          commands: applied,
        };

        setLog([]);
        setReason(null);
        setBanner(null);
        setFlight(null);
        setStandings([]);
        setState(current);
        if (current.status === 'PLAYING') scheduleStep(current, pump);
        return true;
      } catch {
        // An unreadable save is discarded rather than left to fail again.
        clearMatch();
        logRef.current = null;
        return false;
      }
    },
    [cancelPump, pump, scheduleStep],
  );

  const dispatch = useCallback(
    (partial: CommandInput) => {
      setState((current) => {
        if (!current) return current;
        const command = {
          ...partial,
          commandId: `h-${commandSeq.current++}`,
        } as Command;
        try {
          const result = reduce(current, command, rngRef.current);
          record(command, result.state);
          present(result.events, result.state);
          // Your own move lands instantly; only opponents are paced.
          scheduleStep(result.state, pump);
          return result.state;
        } catch (e) {
          const code = (e as { code?: string }).code ?? 'ILLEGAL';
          setReason(code);
          setTimeout(() => setReason(null), 1800);
          return current;
        }
      });
    },
    [present, pump, record, scheduleStep],
  );

  const view = useMemo(() => (state ? buildLocalView(state, HUMAN) : null), [state]);

  return {
    state,
    view,
    banner,
    log,
    reason,
    flight,
    clashDeadline,
    standings,
    start,
    resume,
    dispatch,
    clearReason: () => setReason(null),
    reset: () => {
      cancelPump();
      logRef.current = null;
      setClashDeadline(null);
      setState(null);
      setLog([]);
      setBanner(null);
      setFlight(null);
      setStandings([]);
    },
  };
}

export const HUMAN_ID = HUMAN;
export type { Banner };
