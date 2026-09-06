import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card, CommandInput, PlayerView } from '@colorclash/shared';
import { COLOR_HEX, COLOR_INK, COLOR_LABEL, ILLEGAL_REASON, VERSION_META } from '@colorclash/game-content';
import type { EmoteId } from '@colorclash/game-content';
import { offersFlexChoice } from '@colorclash/game-engine';
import { asset, avatarFor } from '../assets/index.js';
import { CardBack, CardFace, describeCard } from '../components/CardFace.js';
import { EmoteBubble, EmoteButton } from '../components/EmoteBar.js';
import { MatchSettings } from '../components/MatchSettings.js';
import { RulesSheet } from '../components/RulesSheet.js';
import { TurnTimer } from '../components/TurnTimer.js';
import type { Banner, Flight } from '../state/useGame.js';

/**
 * Screens 5-8 — the shared table.
 *
 *   5  in-game table         6  action moment       7  colour picker
 *   8  CLASH reminder
 *
 * §9.2 card interaction rules are implemented here: tap lifts the card, the
 * engine decides legality (the view arrives with `legalCardIds` already
 * computed authoritatively), illegal cards are dimmed but not punished, and a
 * choice modal blocks the hand underneath.
 */
export function Table({
  view,
  banner,
  log,
  reason,
  flight,
  clashDeadline,
  emotes,
  onEmote,
  onCommand,
  onExit,
  elapsed,
  sound,
  onSound,
  reducedMotion,
  onReducedMotion,
}: {
  view: PlayerView;
  banner: Banner;
  log: string[];
  reason: string | null;
  flight?: Flight;
  /** Epoch ms at which a pending Clash call turns into a penalty. */
  clashDeadline?: number | null;
  emotes?: Record<string, EmoteId>;
  onEmote?: (id: EmoteId) => void;
  onCommand: (c: CommandInput) => void;
  onExit: () => void;
  elapsed: number;
  sound: boolean;
  onSound: (on: boolean) => void;
  reducedMotion: boolean;
  onReducedMotion: (on: boolean) => void;
}) {
  const me = view.you;
  const opponents = useMemo(
    () => view.players.filter((p) => p.id !== me),
    [view.players, me],
  );
  const activeId = view.players[view.activePlayerIndex]?.id;
  const isMyTurn = activeId === me && !view.awaitingChoice;
  const myChoice = view.awaitingChoice?.playerId === me ? view.awaitingChoice : undefined;

  const [flexPrompt, setFlexPrompt] = useState<Card | null>(null);
  const [paused, setPaused] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const handScrollRef = useRef<HTMLDivElement | null>(null);
  const overflow = useHandOverflow(handScrollRef, view.yourHand.length);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest line in view as the round runs; the player can still scroll
  // back through the rest.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);
  const top = view.topCardId ? view.cards[view.topCardId] : undefined;

  // Seat placement: left / top / right for up to three visible opponents, the
  // rest wrap onto the top row (§9.2 responsive hands).
  const seatSlots = ['left', 'top', 'right'] as const;

  return (
    <div className="screen bg-table">
      <div className="table-top">
        <button className="icon-btn" onClick={onExit} aria-label="Leave match">
          <img src={asset('icon_back')} alt="" />
        </button>

        <TurnChip view={view} />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/*
            The deck count lives on the draw pile, where the cards are, and
            nowhere else. It was briefly shown here as well — the same number in
            two sizes, which invites the player to look for a difference that
            does not exist. The pile's own label already answers it out loud.
          */}
          <button
            className="icon-btn"
            aria-label="Settings and pause"
            onClick={() => setPaused(true)}
          >
            <img src={asset('icon_gear')} alt="" />
          </button>
        </div>
      </div>

      <div className="felt">
        <div className={`direction-ring${view.direction === -1 ? ' ccw' : ''}`} aria-hidden="true" />

        {opponents.slice(0, 3).map((p, i) => {
          const seatIndex = view.players.findIndex((x) => x.id === p.id);
          return (
            <div
              key={p.id}
              className={`seat ${seatSlots[i]}${p.id === activeId ? ' active' : ''}${
                p.eliminated ? ' out' : ''
              }`}
            >
              <div className="seat-avatar">
                <img src={avatarFor(seatIndex)} alt="" />
                {p.handCount === 1 ? <span className="clash-flag">CLASH</span> : null}
                {/* A left-hand seat opens its bubble to the right, and the
                    other way round, so neither runs off the screen edge. */}
                {emotes?.[p.id] ? (
                  <EmoteBubble id={emotes[p.id]!} side={seatSlots[i] === 'left' ? 'left' : 'right'} />
                ) : null}
              </div>
              <div>
                <div className="seat-meta">{p.name}</div>
                <div className="seat-meta" style={{ opacity: 0.85 }}>
                  {p.eliminated ? 'OUT' : p.handCount}
                </div>
              </div>
              <div className="seat-fan" aria-hidden="true">
                {Array.from({ length: Math.min(p.handCount, 4) }).map((_, k) => (
                  <img key={k} src={asset('card_back')} alt="" />
                ))}
              </div>
            </div>
          );
        })}

        {opponents.length > 3 ? (
          <div className="seat top" style={{ top: 52 }}>
            <span className="seat-meta">
              +{opponents.length - 3} more ·{' '}
              {opponents
                .slice(3)
                .map((p) => `${p.name} ${p.handCount}`)
                .join('  ')}
            </span>
          </div>
        ) : null}

        {view.pendingDraw > 0 ? (
          <div className="stack-badge">
            STACK +{view.pendingDraw} · answer with {view.minimumResponsePenalty}+
          </div>
        ) : null}

        <div className="pile-row">
          <button
            className={`draw-pile${isMyTurn && view.canDraw ? ' actionable' : ''}`}
            onClick={() => onCommand({ type: 'DRAW_CARD', playerId: me })}
            disabled={!view.canDraw}
            aria-label={`Draw pile, ${view.drawPileCount} cards remaining`}
          >
            <img src={asset('card_back')} alt="" />
            <span className="pile-count">{view.drawPileCount}</span>
          </button>

          <div className="discard">
            {view.activeColor ? (
              <span
                className="color-halo"
                style={{ background: COLOR_HEX[view.activeColor] }}
                aria-hidden="true"
              />
            ) : null}
            {top ? (
              <CardFace
                key={top.id}
                card={top}
                deckSide={view.deckSide}
                size="lg"
                /* The travel animation only runs for the card that was just
                   played, and `from-*` tells the CSS which seat it flew from. */
                className={
                  flight && flight.cardId === top.id
                    ? `card-travel ${flightOrigin(view, flight.playerId)}`
                    : 'card-play-anim'
                }
                showFlex={view.version === 'FLEX'}
              />
            ) : null}
            {/*
              The active colour, said in words.
              This is the affordance that exists so colour is not the only cue,
              and it was the one piece of text on the table that failed contrast:
              11px drawn in the very colour it names, measured at 2.93:1 against
              the felt. The colour is now the chip behind the word rather than
              the word itself, so the label reads at any vision.
            */}
            {view.activeColor ? (
              <div
                className="color-name active-color"
                style={{
                  ['--swatch' as string]: COLOR_HEX[view.activeColor],
                  ['--ink' as string]: COLOR_INK[view.activeColor],
                }}
              >
                {COLOR_LABEL[view.activeColor] ?? view.activeColor}
              </div>
            ) : null}
          </div>
        </div>

        {view.version === 'FLIP' ? (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              right: 12,
              fontWeight: 800,
              letterSpacing: '.08em',
              fontSize: 11,
              opacity: 0.85,
            }}
          >
            {view.deckSide === 'DARK_SIDE' ? '🌑 DARK SIDE' : '☀ LIGHT SIDE'}
          </div>
        ) : null}

        {/*
          Freestyle's twist, stated rather than implied.
          The mode is sold as "Bend one rule per round" and the table said only
          "FLEX POWER READY" in 11px dim text in a corner — which names the
          token without ever saying what it does, so the one thing that makes
          the mode different from Classic was never explained while playing.
        */}
        {view.version === 'FLEX' ? (
          <div
            className={`flex-twist${view.flexPowerAvailable ? ' ready' : ' spent'}`}
            aria-label={
              view.flexPowerAvailable
                ? 'Flex power ready: one card this round may use its alternate effect'
                : 'Flex power spent for this round'
            }
          >
            <b>FLEX POWER {view.flexPowerAvailable ? 'READY' : 'SPENT'}</b>
            <span>
              {view.flexPowerAvailable
                ? 'One card this round can use its alternate effect'
                : 'Alternate effects used for this round'}
            </span>
          </div>
        ) : null}

        {/*
          The log holds fourteen lines and scrolls. At five it was about four
          seconds of history at the table's pace — shorter than the time it
          takes to choose a card, so the record of what just happened was
          routinely gone before it could be read. DOM order stays oldest-first
          for the live region; the view is pinned to the newest line.
        */}
        <div className="log" aria-live="polite" ref={logRef}>
          {log.map((l, i) => (
            <div key={`${l}-${i}`}>{l}</div>
          ))}
        </div>
      </div>

      {/* Screen 6 — action moment */}
      {banner ? (
        <div className="action-burst" key={banner.id}>
          <div style={{ textAlign: 'center' }}>
            <div className="action-title">{banner.title}</div>
            {banner.note ? <div className="action-note">{banner.note}</div> : null}
          </div>
        </div>
      ) : null}

      {reason ? <div className="reason-toast">{ILLEGAL_REASON[reason] ?? reason}</div> : null}

      <div className="hand-bar">
        <div className="emote-slot">
          <EmoteButton onPick={(id) => onEmote?.(id)} />
          {/* Your own emote shows here rather than over a seat, because your
              seat is the hand at the bottom of the screen, not a portrait. */}
          {emotes?.[me] ? <EmoteBubble id={emotes[me]!} /> : null}
        </div>

        {/*
          A hand wider than the bar gave no sign that it was. The scrollbar is
          deliberately hidden (it stole vertical space in landscape), so a
          fifteen-card Mayhem hand looked like whatever eight cards happened to
          fit — the winning card could sit off-screen with nothing saying so.
        */}
        <div
          className={`hand-scroll${overflow.left ? ' more-left' : ''}${
            overflow.right > 0 ? ' more-right' : ''
          }`}
          ref={handScrollRef}
        >
          {overflow.right > 0 ? (
            <span className="hand-more" aria-hidden="true">
              +{overflow.right}
            </span>
          ) : null}
          <div className="hand">
            {view.yourHand.map((id) => {
              const card = view.cards[id];
              if (!card) return null;
              const playable = view.legalCardIds.includes(id);
              return (
                <div
                  key={id}
                  className={`card-slot ${playable ? 'playable' : 'blocked'}`}
                  onClick={() => {
                    if (!playable) return;
                    if (view.version === 'FLEX' && view.flexPowerAvailable && offersFlexChoice(card)) {
                      setFlexPrompt(card);
                      return;
                    }
                    onCommand({ type: 'PLAY_CARD', playerId: me, cardId: id });
                  }}
                >
                  <button
                    style={{ padding: 0, display: 'block' }}
                    disabled={!playable}
                    aria-label={`${describeCard(card, view.deckSide)}${
                      playable ? '' : ' — not playable'
                    }`}
                  >
                    <CardFace
                      card={card}
                      deckSide={view.deckSide}
                      showFlex={view.version === 'FLEX'}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {view.mayPass ? (
          <button className="btn btn-ghost" onClick={() => onCommand({ type: 'END_TURN', playerId: me })}>
            PASS
          </button>
        ) : null}

        {/*
          The grace countdown lives on the button itself, because the button is
          where the player is already looking. Without it the window was silent
          and about three quarters of a second long.
        */}
        <ClashButton
          armed={view.clashPending === me}
          deadline={clashDeadline}
          onCall={() => onCommand({ type: 'CALL_CLASH', playerId: me })}
        />
      </div>

      {/* Screen 8 — CLASH reminder */}
      {view.clashPending === me ? (
        <div className="scrim" style={{ background: 'transparent', pointerEvents: 'none' }}>
          <div className="modal clash-reminder" style={{ pointerEvents: 'auto', maxWidth: 340 }}>
            <span className="big">CLASH!</span>
            <p style={{ margin: '2px 0 14px' }}>
              You have 1 card left!
              {clashDeadline ? <ClashCountdownText deadline={clashDeadline} /> : null}
            </p>
            <button
              className="btn btn-gold"
              onClick={() => onCommand({ type: 'CALL_CLASH', playerId: me })}
            >
              CALL CLASH
            </button>
          </div>
        </div>
      ) : null}

      {/* Screen 7 — colour picker, plus target and swap choices */}
      {myChoice ? (
        <ChoiceModal view={view} onCommand={onCommand} />
      ) : null}

      {paused ? (
        <MatchSettings
          sound={sound}
          onSound={onSound}
          reducedMotion={reducedMotion}
          onReducedMotion={onReducedMotion}
          onRules={() => {
            setPaused(false);
            setRulesOpen(true);
          }}
          onLeave={onExit}
          onClose={() => setPaused(false)}
        />
      ) : null}

      {rulesOpen ? (
        <RulesSheet version={view.version} onClose={() => setRulesOpen(false)} />
      ) : null}

      {flexPrompt ? (
        <div className="scrim">
          <div className="modal">
            <h2 className="h2">USE FLEX POWER?</h2>
            <p className="dim" style={{ fontSize: 13 }}>
              {flexPrompt.kind === 'SKIP'
                ? 'Flex: skip every opponent and take another turn.'
                : 'Flex: every other player draws 1 instead.'}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => {
                  onCommand({ type: 'PLAY_CARD', playerId: me, cardId: flexPrompt.id });
                  setFlexPrompt(null);
                }}
              >
                STANDARD
              </button>
              <button
                className="btn btn-gold"
                style={{ flex: 1 }}
                onClick={() => {
                  onCommand({
                    type: 'PLAY_CARD',
                    playerId: me,
                    cardId: flexPrompt.id,
                    useFlex: true,
                  });
                  setFlexPrompt(null);
                }}
              >
                USE FLEX
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChoiceModal({
  view,
  onCommand,
}: {
  view: PlayerView;
  onCommand: (c: CommandInput) => void;
}) {
  const choice = view.awaitingChoice!;
  const me = view.you;

  if (choice.type === 'COLOR' || choice.type === 'DRAW_COLOR') {
    return (
      <div className="scrim">
        <div className="modal">
          <h2 className="h2">CHOOSE A COLOR</h2>
          {choice.type === 'DRAW_COLOR' ? (
            <p className="dim" style={{ fontSize: 13 }}>
              The next player draws until they match it.
            </p>
          ) : null}
          <div className="color-grid">
            {(choice.eligibleColors ?? []).map((c) => (
              <button
                key={c}
                className="color-choice"
                aria-label={COLOR_LABEL[c] ?? c}
                onClick={() => onCommand({ type: 'CHOOSE_COLOR', playerId: me, color: c })}
              >
                <span className="color-dot" style={{ background: COLOR_HEX[c] }} />
                <span className="color-name">{COLOR_LABEL[c] ?? c}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const isSwap = choice.type === 'SWAP_HAND';
  return (
    <div className="scrim">
      <div className="modal">
        <h2 className="h2">{isSwap ? 'SWAP HANDS WITH' : 'CHOOSE A TARGET'}</h2>
        <div className="target-grid">
          {(choice.eligibleTargets ?? []).map((id) => {
            const p = view.players.find((x) => x.id === id)!;
            const seatIndex = view.players.findIndex((x) => x.id === id);
            return (
              <button
                key={id}
                className="target-row"
                onClick={() =>
                  onCommand(
                    isSwap
                      ? { type: 'SWAP_HAND', playerId: me, targetId: id }
                      : { type: 'CHOOSE_TARGET', playerId: me, targetId: id },
                  )
                }
              >
                <img src={avatarFor(seatIndex)} alt="" />
                <span style={{ flex: 1, textAlign: 'left', fontWeight: 700 }}>{p.name}</span>
                <span className="dim">{p.handCount} cards</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TurnChip({ view }: { view: PlayerView }) {
  const active = view.players[view.activePlayerIndex];
  const isYou = active?.id === view.you;
  if (!active) return null;

  return (
    <div className={`turn-chip${isYou ? ' you' : ''}`}>
      <img className="avatar" src={avatarFor(view.activePlayerIndex)} alt="" />
      <div className="turn-chip-text">
        <div className="turn-chip-name">{isYou ? 'Your turn' : active.name}</div>
        <div className="dim turn-chip-meta">
          {/*
            Direction lives here rather than only on the felt ring, because that
            ring is hidden in landscape — which left no answer at all to "who
            plays after me" on a phone held sideways.
          */}
          <span
            className="turn-dir"
            aria-label={view.direction === 1 ? 'Play order: clockwise' : 'Play order: anticlockwise'}
          >
            {view.direction === 1 ? '↻' : '↺'}
          </span>{' '}
          {active.handCount} · {VERSION_META[view.version].title}
        </div>
      </div>
      {/* The countdown used to be a separate bar positioned under the chip,
          which collided with it whenever the mode name wrapped to two lines. */}
      {view.turn ? <TurnTimer turn={view.turn} you={view.you} /> : null}
    </div>
  );
}

/**
 * The Clash button, with the grace window drawn on it.
 *
 * `clashGraceMs` has been in the config since the first build and was read by
 * nothing. The engine rule is unchanged — the penalty still lands on the next
 * action at the table — but that action is now held back for the configured
 * window, and this is where the player can see how much of it is left.
 */
function ClashButton({
  armed,
  deadline,
  onCall,
}: {
  armed: boolean;
  deadline?: number | null;
  onCall: () => void;
}) {
  const remaining = useCountdown(armed ? deadline : null);
  const seconds = remaining === null ? null : Math.max(0, Math.ceil(remaining / 1000));

  return (
    <button
      className={`clash-button${armed ? ' armed' : ''}`}
      disabled={!armed}
      onClick={onCall}
      aria-label={seconds === null ? 'Call Clash' : `Call Clash, ${seconds} seconds left`}
    >
      <img src={asset('btn_clash')} alt="CLASH!" />
      {seconds !== null ? <span className="clash-countdown">{seconds}</span> : null}
    </button>
  );
}

function ClashCountdownText({ deadline }: { deadline: number }) {
  const remaining = useCountdown(deadline);
  if (remaining === null) return null;
  return <> Call it within {Math.max(0, Math.ceil(remaining / 1000))}s.</>;
}

/** Milliseconds left until `deadline`, ticking, or null when there is none. */
/**
 * Whether the hand runs off either edge, and how many cards are off the right.
 *
 * Re-measured on scroll, on resize, and whenever the hand size changes. The
 * count is cards whose right edge is past the container's, which is what "more
 * cards this way" actually means to a player.
 */
function useHandOverflow(
  ref: { current: HTMLDivElement | null },
  handSize: number,
): { left: boolean; right: number } {
  const [state, setState] = useState<{ left: boolean; right: number }>({ left: false, right: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const box = el.getBoundingClientRect();
      let hidden = 0;
      for (const slot of el.querySelectorAll('.card-slot')) {
        // Two pixels of tolerance, so a card flush with the edge is not counted.
        if (slot.getBoundingClientRect().right > box.right + 2) hidden += 1;
      }
      setState((prev) => {
        const left = el.scrollLeft > 2;
        return prev.left === left && prev.right === hidden ? prev : { left, right: hidden };
      });
    };

    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
    ro?.observe(el);
    globalThis.addEventListener?.('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      ro?.disconnect();
      globalThis.removeEventListener?.('resize', measure);
    };
  }, [ref, handSize]);

  return state;
}

function useCountdown(deadline?: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(
    deadline ? Math.max(0, deadline - Date.now()) : null,
  );

  useEffect(() => {
    if (!deadline) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(Math.max(0, deadline - Date.now()));
    tick();
    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, [deadline]);

  return remaining;
}

/**
 * Which seat a played card should fly from.
 *
 * Seats are placed by index around the felt, so the animation reuses the same
 * mapping rather than inventing a second one that could disagree with it.
 */
function flightOrigin(view: PlayerView, playerId: string): string {
  if (playerId === view.you) return 'from-hand';
  const opponents = view.players.filter((p) => p.id !== view.you);
  const slot = opponents.findIndex((p) => p.id === playerId);
  return ['from-left', 'from-top', 'from-right'][slot] ?? 'from-top';
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Ticking match clock, kept out of engine state so it cannot affect rules. */
export function useElapsed(active: boolean): number {
  const [t, setT] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      ref.current += 1;
      setT(ref.current);
    }, 1000);
    return () => clearInterval(id);
  }, [active]);
  useEffect(() => {
    if (!active) {
      ref.current = 0;
      setT(0);
    }
  }, [active]);
  return t;
}

export { CardBack };
