import { useEffect, useState } from 'react';
import type { TurnClock } from '@colorclash/shared';

/**
 * The countdown for the server's turn timer.
 *
 * This component displays a decision the server has already made. It never
 * decides anything: when it reaches zero it does not submit a command, it just
 * stops counting, and the server's own timer is what actually acts. That
 * separation is the point — a client that could act on its own clock could
 * also give itself more time by lying about the time.
 *
 * The snapshot carries the server's `now` alongside the deadline, so a device
 * with a badly-set clock still counts down correctly: the offset is measured
 * once, on arrival, and applied to every tick after.
 */
export function TurnTimer({ turn, you }: { turn: TurnClock; you: string }) {
  const [remaining, setRemaining] = useState(() => turn.deadline - turn.now);

  useEffect(() => {
    // Difference between this device's clock and the server's, at the moment
    // this snapshot arrived.
    const skew = Date.now() - turn.now;
    const tick = () => setRemaining(Math.max(0, turn.deadline - (Date.now() - skew)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [turn.deadline, turn.now]);

  const seconds = Math.ceil(remaining / 1000);
  const fraction = Math.max(0, Math.min(1, remaining / turn.timeoutMs));
  const mine = turn.playerId === you;
  // Urgency is a colour *and* a class name change, so it is not colour alone.
  const urgent = remaining <= 10_000;

  return (
    <div
      className={`turn-timer${mine ? ' mine' : ''}${urgent ? ' urgent' : ''}`}
      role="timer"
      aria-live={urgent && mine ? 'assertive' : 'off'}
      aria-label={
        mine ? `${seconds} seconds left in your turn` : `${seconds} seconds left in this turn`
      }
    >
      <div className="turn-timer-bar" style={{ width: `${fraction * 100}%` }} aria-hidden="true" />
      <span className="turn-timer-text">
        {mine ? 'YOUR TURN' : 'WAITING'} · {seconds}s
      </span>
    </div>
  );
}
