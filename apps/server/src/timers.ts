/**
 * The room's only access to time.
 *
 * `MatchRoom` was written with no timers on purpose, so that every reconnect,
 * duplicate and stale-command case could be unit-tested without waiting for a
 * clock. Two features now genuinely need one — paced bot turns and the
 * authoritative turn timer — so instead of reaching for `setTimeout` inside the
 * room, the room takes this interface.
 *
 * The default is `INLINE_TIMERS`, which runs callbacks immediately. That keeps
 * every existing test synchronous and unchanged, and means a room built without
 * a scheduler behaves exactly as it did before this file existed. Production
 * passes `REAL_TIMERS`; tests that care about timing pass `FakeTimers`.
 */

export type TimerHandle = unknown;

export interface Timers {
  set(fn: () => void, ms: number): TimerHandle;
  clear(handle: TimerHandle): void;
  now(): number;
}

/** Runs everything at once. The historical behaviour, and the test default. */
export const INLINE_TIMERS: Timers = {
  set(fn) {
    fn();
    return null;
  },
  clear() {},
  now: () => Date.now(),
};

export const REAL_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

/**
 * A clock a test drives by hand. Nothing fires until `advance` is called, so a
 * test for a 30-second turn timer runs in microseconds and never flakes.
 */
export class FakeTimers implements Timers {
  private current = 0;
  private next = 1;
  private queue = new Map<number, { at: number; fn: () => void }>();

  set(fn: () => void, ms: number): TimerHandle {
    const id = this.next++;
    this.queue.set(id, { at: this.current + ms, fn });
    return id;
  }

  clear(handle: TimerHandle): void {
    if (typeof handle === 'number') this.queue.delete(handle);
  }

  now(): number {
    return this.current;
  }

  /** Moves the clock forward, firing due callbacks in scheduled order. */
  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      const due = [...this.queue.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      this.queue.delete(id);
      this.current = timer.at;
      timer.fn();
    }
    this.current = target;
  }

  get pending(): number {
    return this.queue.size;
  }
}
