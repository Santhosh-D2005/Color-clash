/**
 * Minimal ambient declarations for the Node APIs this repository actually uses.
 *
 * The project is deliberately dependency-free so it can be typechecked and
 * tested on an offline machine. If you `npm install` in a networked
 * environment, `@types/node` supersedes this file — add "node" to the `types`
 * array in tsconfig.json and delete it.
 */

declare module 'node:fs' {
  export function readdirSync(path: string): string[];
  export function statSync(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
    size: number;
  };
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readFileSync(path: string): Uint8Array;
  export function writeFileSync(path: string, data: string | Uint8Array): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function existsSync(path: string): boolean;
  export function copyFileSync(src: string, dest: string): void;
  export function renameSync(from: string, to: string): void;
  export function unlinkSync(path: string): void;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function dirname(p: string): string;
  export function basename(p: string, ext?: string): string;
  export function extname(p: string): string;
  export function relative(from: string, to: string): string;
}

declare module 'node:url' {
  export function pathToFileURL(path: string): { href: string };
  export function fileURLToPath(url: string | { href: string }): string;
}

declare module 'node:crypto' {
  export function randomUUID(): string;
  export function randomBytes(size: number): { toString(enc: string): string };
  export function createHash(algorithm: string): {
    update(data: string): { digest(enc: string): string };
  };
}

declare module 'node:stream' {
  export type Duplex = {
    write(data: string | Uint8Array): boolean;
    end(): void;
    destroy(): void;
    on(event: string, cb: (...args: never[]) => void): Duplex;
  };
}

declare class Buffer extends Uint8Array {
  static alloc(size: number): Buffer;
  static from(data: string, enc?: string): Buffer;
  static from(data: Uint8Array): Buffer;
  static concat(list: Buffer[]): Buffer;
  static byteLength(s: string): number;
  subarray(start?: number, end?: number): Buffer;
  toString(enc?: string): string;
  readUInt16BE(offset: number): number;
  readUInt32BE(offset: number): number;
  writeUInt16BE(value: number, offset: number): number;
  writeUInt32BE(value: number, offset: number): number;
  write(text: string, offset?: number): number;
}

declare module 'node:http' {
  export type IncomingMessage = {
    url?: string;
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    on(event: string, cb: (...args: never[]) => void): void;
  };
  export type ServerResponse = {
    writeHead(status: number, headers?: Record<string, string>): void;
    end(body?: string | Uint8Array): void;
    setHeader(name: string, value: string): void;
  };
  import type { Duplex } from 'node:stream';
  export type Server = {
    listen(port: number, cb?: () => void): Server;
    on(event: 'upgrade', cb: (req: IncomingMessage, socket: Duplex) => void): Server;
    on(event: string, cb: (...args: never[]) => void): Server;
    close(cb?: () => void): void;
  };
  export function createServer(
    handler: (req: IncomingMessage, res: ServerResponse) => void,
  ): Server;
}

declare module 'node:child_process' {
  export function execFileSync(
    file: string,
    args?: string[],
    // `shell` matters on Windows: Node refuses to spawn a .cmd through
    // execFile without it (CVE-2024-27980), so tools/build-single-file.ts
    // passes it. The shim has to know the field exists or the offline
    // typecheck rejects correct code.
    options?: { stdio?: string; cwd?: string; shell?: boolean },
  ): Buffer;
}

declare module 'node:events' {
  export class EventEmitter {
    on(event: string, listener: (...args: never[]) => void): this;
    off(event: string, listener: (...args: never[]) => void): this;
    emit(event: string, ...args: unknown[]): boolean;
  }
}

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  cwd(): string;
  platform: string;
  on(event: string, cb: (...args: never[]) => void): void;
};

declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  info(...args: unknown[]): void;
};

/**
 * Node's timer handle is an object with `unref`, not the browser's number.
 * Typed as the intersection so the same call compiles for both targets.
 */
type TimerId = number & { unref?(): void };
declare const setTimeout: (cb: () => void, ms?: number) => TimerId;
declare const clearTimeout: (handle: TimerId) => void;
declare const setInterval: (cb: () => void, ms?: number) => TimerId;
declare const clearInterval: (handle: TimerId) => void;

interface ImportMeta {
  url: string;
  dirname: string;
  filename: string;
}
