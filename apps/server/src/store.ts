import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PersistedRoom } from './room.js';

/**
 * Room persistence.
 *
 * Deliberately the smallest thing that answers the requirement: one JSON file
 * per live room, holding a seed and a command log. No database, no schema
 * migration, no connection to manage — because the engine is a deterministic
 * reducer, "save the match" and "save the inputs" are the same problem, and the
 * inputs are tiny.
 *
 * Writes go to a temporary file and are renamed into place, so a process that
 * dies mid-write leaves the previous good file rather than a truncated one.
 * Writes are also coalesced: a busy room produces a command every few hundred
 * milliseconds, and there is no value in touching the disk for each.
 */

/**
 * How recently a room must have been saved to be worth bringing back.
 *
 * Boot used to restore every file it found, including matches abandoned days
 * earlier — each one taking a room code and sitting in memory until the
 * ninety-second reaper cleared it. `savedAt` was already recorded and the
 * max-age parameter already existed; boot simply never used them.
 *
 * Two minutes: comfortably longer than the reaper's grace window, so a match
 * someone is actively trying to get back into survives a restart, and short
 * enough that nothing else does.
 */
export const RESTORE_MAX_AGE_MS = 2 * 60 * 1000;

export type StoreOptions = {
  dir: string;
  /** Minimum gap between two writes for the same room. */
  flushMs?: number;
};

export class RoomStore {
  private readonly dir: string;
  private readonly flushMs: number;
  private pending = new Map<string, PersistedRoom>();
  /*
   * Whatever this environment's setTimeout hands back, rather than a shape
   * copied from one of them. The offline shim returns `number & { unref?() }`
   * and @types/node returns `NodeJS.Timeout`, so hardcoding either makes the
   * file typecheck under one config and fail under the other.
   */
  private timer: (ReturnType<typeof setTimeout> & { unref?(): void }) | null = null;

  constructor(opts: StoreOptions) {
    this.dir = opts.dir;
    this.flushMs = opts.flushMs ?? 400;
    mkdirSync(this.dir, { recursive: true });
  }

  private fileFor(roomId: string): string {
    // Room ids are server-generated, but a path separator arriving here would
    // be a directory traversal, so the name is sanitised rather than trusted.
    return join(this.dir, `${roomId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
  }

  /** Queues a room for writing. Safe to call on every accepted command. */
  save(data: PersistedRoom): void {
    this.pending.set(data.roomId, data);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.flushMs);
    // A pending write must never hold the process open on shutdown.
    this.timer.unref?.();
  }

  flush(): void {
    for (const [roomId, data] of this.pending) {
      const file = this.fileFor(roomId);
      const tmp = `${file}.tmp`;
      try {
        writeFileSync(tmp, JSON.stringify(data));
        renameSync(tmp, file);
      } catch (e) {
        console.error(`Could not persist room ${roomId}:`, (e as Error).message);
      }
    }
    this.pending.clear();
  }

  remove(roomId: string): void {
    this.pending.delete(roomId);
    try {
      const file = this.fileFor(roomId);
      if (existsSync(file)) unlinkSync(file);
    } catch {
      // A room that cannot be deleted is reloaded on the next boot and then
      // reaped normally; that is a slow leak, not a failure worth crashing for.
    }
  }

  /**
   * Reads every saved room. A file that will not parse is reported and skipped
   * rather than taking the server down with it — one corrupt match should cost
   * one match.
   */
  loadAll(maxAgeMs = RESTORE_MAX_AGE_MS): PersistedRoom[] {
    if (!existsSync(this.dir)) return [];
    const out: PersistedRoom[] = [];
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue;
      const file = join(this.dir, name);
      try {
        const data = JSON.parse(readFileSync(file, 'utf8')) as PersistedRoom;
        if (Date.now() - (data.savedAt ?? 0) > maxAgeMs) {
          unlinkSync(file);
          continue;
        }
        out.push(data);
      } catch (e) {
        console.error(`Skipping unreadable room file ${name}: ${(e as Error).message}`);
      }
    }
    return out;
  }
}
