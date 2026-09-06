import type { MatchStats, Standing } from '@colorclash/shared';
import { asset, avatarFor } from '../assets/index.js';

/**
 * Screens 9 and 10 — winner reveal and match summary.
 * §9.1 Score/Result: "Winner, reason, statistics, rematch".
 *
 * Both take a `ResultSource` rather than a `GameState`, because an online
 * client never holds authoritative state — it holds a `PlayerView`. Both
 * shapes satisfy this one, so there is a single pair of result screens for
 * local and online play.
 */
export type ResultSource = {
  players: Array<{ id: string; name: string }>;
  winnerId?: string;
  stats: MatchStats;
  /** The viewing player, so "YOU WIN!" only shows for the actual winner. */
  you: string;
};

export function WinnerScreen({
  state,
  standings,
  onContinue,
  onMenu,
}: {
  state: ResultSource;
  standings: Standing[];
  onContinue: () => void;
  onMenu: () => void;
}) {
  const winner = state.players.find((p) => p.id === state.winnerId);
  const winnerIndex = state.players.findIndex((p) => p.id === state.winnerId);
  const youWon = state.winnerId === state.you;
  const top = standings[0];
  const winnerStanding = standings.find((s) => s.playerId === state.winnerId);
  /*
   * Being knocked out used to look exactly like winning: same gold sunburst,
   * same confetti, same crown. Three tones instead of one — celebration only
   * when you actually won, a plain result when someone else did, and a
   * deliberately flat one when you were eliminated.
   */
  const eliminated = standings.find((s) => s.playerId === state.you)?.eliminated ?? false;
  const tone = youWon ? 'won' : eliminated ? 'out' : 'lost';

  /*
   * The player's own result.
   *
   * This screen used to name the winner and nothing else: you finished a round
   * and it told you about somebody else. Worse, the coin and gem figures sat
   * directly under the winner's name, so the rewards you had just earned read
   * as theirs. Your placement and score come first now; the winner reveal
   * follows it.
   */
  const yourIndex = standings.findIndex((s) => s.playerId === state.you);
  const yours = yourIndex >= 0 ? standings[yourIndex] : undefined;
  const coins = youWon ? 100 : 25;
  const gems = youWon ? 50 : 10;

  const rewards = (
    <div className="rewards">
      <span>
        <img src={asset('icon_coin')} alt="Coins" />+{coins}
      </span>
      <span>
        <img src={asset('icon_gem')} alt="Gems" />+{gems}
      </span>
    </div>
  );

  return (
    <div className={`screen win bg-win tone-${tone}`}>
      {youWon ? (
        <>
          <div
            className="confetti-l"
            style={{ backgroundImage: `url(${asset('confetti')})` }}
            aria-hidden="true"
          />
          <div
            className="confetti-r"
            style={{ backgroundImage: `url(${asset('confetti')})` }}
            aria-hidden="true"
          />
        </>
      ) : null}

      {youWon ? (
        <img className="win-banner" src={asset('banner_youwin')} alt="You win!" />
      ) : (
        <h1 className="h1 result-heading">{eliminated ? 'YOU WERE ELIMINATED' : 'ROUND OVER'}</h1>
      )}

      {/*
        When you won, the portrait below is you and the rewards under it are
        plainly yours, so the reveal says it all. When you did not, your own
        result comes first and the winner follows.
      */}
      {!youWon && yours ? (
        <section className="you-result" aria-label="Your result">
          <div className="you-place">
            <span className="you-place-value">{ordinal(yourIndex + 1)}</span>
            <span className="you-place-label">
              of {standings.length}
              {yours.eliminated ? ' · out' : ''}
            </span>
          </div>
          <div className="you-lines">
            <b className="you-score">{scoreLine(yours, false)}</b>
            <span className="dim you-sub">{subLine(yours, false)}</span>
          </div>
          {rewards}
        </section>
      ) : null}

      <div className="win-portrait">
        {/* The crown belongs to whoever won; it was being shown to the loser too. */}
        {youWon ? <img className="crown" src={asset('crown_winner')} alt="" /> : null}
        <img
          className="avatar"
          src={youWon ? asset('avatar_winner') : avatarFor(Math.max(winnerIndex, 0))}
          alt=""
        />
      </div>
      <div className="win-ribbon">{winner?.name ?? 'Winner'}</div>

      {youWon ? rewards : null}

      <div className="dim" style={{ fontSize: 13 }}>
        {winnerStanding
          ? `${winner?.name ?? 'Winner'} banked ${winnerStanding.banked ?? winnerStanding.score} points`
          : top
            ? `${top.name} leads on ${top.score}`
            : null}
      </div>

      <div className="footer-actions" style={{ width: '100%', maxWidth: 420, paddingBottom: 0 }}>
        <button className="btn btn-blue" onClick={onMenu}>
          MAIN MENU
        </button>
        <button className="btn btn-gold" onClick={onContinue}>
          SUMMARY
        </button>
      </div>
    </div>
  );
}

const MEDALS = ['medal_1', 'medal_2', 'medal_3'] as const;

export function SummaryScreen({
  state,
  standings,
  onMenu,
  onPlayAgain,
}: {
  state: ResultSource;
  standings: Standing[];
  onMenu: () => void;
  onPlayAgain: () => void;
}) {
  const stats = state.stats;
  const duration = stats.endedAt && stats.startedAt ? stats.endedAt - stats.startedAt : 0;

  return (
    <div className="screen bg-menu">
      <div className="rule-title">
        <h1 className="h1">MATCH SUMMARY</h1>
      </div>

      <div className="summary-body">
        {/*
          Scores used to be shown as the raw cumulative total, which for every
          player except the winner is a negative number: "-95" reads as a fine,
          not a result. The engine still calculates exactly the same values —
          this shows the two facts underneath them instead. What the winner
          banked, and what everyone else was still holding.
        */}
        <section className="panel standings" aria-label="Standings">
          {standings.map((s, i) => {
            const seatIndex = state.players.findIndex((p) => p.id === s.playerId);
            const won = s.playerId === state.winnerId;
            return (
              <div
                className={`standing${i === 0 ? ' first' : ''}${
                  s.playerId === state.you ? ' you' : ''
                }`}
                key={s.playerId}
              >
                {/*
                  Every row carries its position. The top three used to show a
                  medal *instead* of a number, so the first visible rank on the
                  screen was "4" — which, next to a points column sorted by a
                  value that is not shown, read as a sorting bug.
                */}
                <span className="standing-rank">
                  {i < 3 ? <img className="medal" src={asset(MEDALS[i]!)} alt="" /> : null}
                  <span className="rank">{i + 1}</span>
                </span>
                <img className="avatar" src={avatarFor(Math.max(seatIndex, 0))} alt="" />
                <span className="standing-name">
                  {s.name}
                  {s.eliminated ? <span className="dim"> · out</span> : null}
                </span>
                <span className="standing-result">
                  <b className={won ? 'score won' : 'score'}>{scoreLine(s, won)}</b>
                  <span className="dim standing-sub">{subLine(s, won)}</span>
                </span>
                {i === 0 ? <img src={asset('icon_trophy')} alt="" style={{ width: 18 }} /> : null}
              </div>
            );
          })}
        </section>

        <section className="panel stat-panel" aria-label="Round details">
          <div className="setting-label" style={{ paddingBottom: 8 }}>
            Round details
          </div>
          <div className="stat-row">
            <span>Cards Played</span>
            <b>{stats.cardsPlayed}</b>
          </div>
          <div className="stat-row">
            <span>Action Cards Played</span>
            <b>{stats.actionCardsPlayed}</b>
          </div>
          <div className="stat-row">
            <span>Clash Calls</span>
            <b>{stats.clashCalls}</b>
          </div>
          <div className="stat-row">
            <span>Penalties Drawn</span>
            <b>{stats.penaltiesDrawn}</b>
          </div>
          <div className="stat-row">
            <span>Time Taken</span>
            <b>{formatDuration(duration)}</b>
          </div>
        </section>
      </div>

      <div className="footer-actions">
        <button className="btn btn-blue" onClick={onMenu}>
          MAIN MENU
        </button>
        <button className="btn btn-gold" onClick={onPlayAgain}>
          PLAY AGAIN
        </button>
      </div>
    </div>
  );
}

/**
 * The headline number on a standings row.
 *
 * Both halves used to end in "pts" and mean opposite things: the winner's was
 * points *gained*, everyone else's was points still stuck in hand, where lower
 * is better. The only thing separating them was a leading plus sign, so a
 * player reading down the column had no way to know the scale inverts after
 * the first row. The unit now says which it is.
 */
function scoreLine(s: Standing, won: boolean): string {
  if (won) return s.banked !== undefined ? `+${s.banked} earned` : `${s.score} earned`;
  if (s.handValue !== undefined) return `${s.handValue} in hand`;
  return `${s.score} in hand`;
}

/** "1st", "2nd", "3rd", "4th". */
function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/**
 * The quieter second line: what those points were, in cards.
 *
 * The cumulative match total used to be here. It was misleading — PLAY AGAIN
 * starts a fresh match with scores at zero, so the "total" was always just this
 * round restated as a negative. Chaining rounds is a separate piece of work;
 * until it exists, the number is not shown.
 */
function subLine(s: Standing, won: boolean): string {
  if (won) return 'banked from every other hand';
  if (s.handValue === undefined) return '';
  return s.cardsLeft === 1 ? '1 card left' : `${s.cardsLeft} cards left`;
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
