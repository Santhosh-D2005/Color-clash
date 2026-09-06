import { createServer, type IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
import type { Duplex } from 'node:stream';

/**
 * A minimal RFC 6455 WebSocket server.
 *
 * The repository ships with zero runtime dependencies so the whole stack can be
 * built and tested offline. This file is the only place that speaks the wire
 * protocol; swapping it for the `ws` package later means replacing this module
 * and nothing else — `server.ts` only uses the `WsConnection` interface below.
 *
 * Scope: text frames, ping/pong, close, client-masked payloads and continuation
 * frames. It does not implement permessage-deflate or extensions.
 */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export type WsConnection = {
  id: string;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', cb: (data: string) => void): void;
  on(event: 'close', cb: () => void): void;
  readonly open: boolean;
};

type Handlers = {
  message: Array<(data: string) => void>;
  close: Array<() => void>;
};

export type WsServer = {
  listen(port: number, cb?: () => void): void;
  onConnection(cb: (conn: WsConnection, req: IncomingMessage) => void): void;
  /** Serves static files for the client build, if a resolver is supplied. */
  onHttp(cb: (url: string) => { body: string | Uint8Array; type: string } | undefined): void;
  close(): void;
};

export function createWsServer(): WsServer {
  let connectionCb: ((conn: WsConnection, req: IncomingMessage) => void) | undefined;
  let httpCb: ((url: string) => { body: string | Uint8Array; type: string } | undefined) | undefined;
  let counter = 0;

  const http = createServer((req, res) => {
    const hit = httpCb?.(req.url ?? '/');
    if (!hit) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': hit.type });
    res.end(hit.body);
  });

  http.on('upgrade', (req: IncomingMessage, socket: Duplex) => {
    const key = req.headers['sec-websocket-key'];
    if (typeof key !== 'string') {
      socket.destroy();
      return;
    }
    const accept = createHash('sha1')
      .update(key + GUID)
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );

    const handlers: Handlers = { message: [], close: [] };
    let open = true;
    let buffer = Buffer.alloc(0);
    // Continuation-frame accumulator.
    let fragments: Buffer[] = [];

    const conn: WsConnection = {
      id: `c${++counter}`,
      get open() {
        return open;
      },
      send(data: string) {
        if (!open) return;
        socket.write(encodeFrame(Buffer.from(data, 'utf8'), 0x1));
      },
      close(code = 1000, reason = '') {
        if (!open) return;
        const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
        payload.writeUInt16BE(code, 0);
        payload.write(reason, 2);
        socket.write(encodeFrame(payload, 0x8));
        open = false;
        socket.end();
      },
      on(event: 'message' | 'close', cb: never) {
        if (event === 'message') handlers.message.push(cb as unknown as (d: string) => void);
        else handlers.close.push(cb as unknown as () => void);
      },
    };

    const finish = () => {
      if (!open) return;
      open = false;
      for (const cb of handlers.close) cb();
    };

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const frame = decodeFrame(buffer);
        if (!frame) break;
        buffer = buffer.subarray(frame.size);

        switch (frame.opcode) {
          case 0x0: // continuation
            fragments.push(frame.payload);
            if (frame.fin) {
              const text = Buffer.concat(fragments).toString('utf8');
              fragments = [];
              for (const cb of handlers.message) cb(text);
            }
            break;
          case 0x1: // text
            if (frame.fin) {
              const text = frame.payload.toString('utf8');
              for (const cb of handlers.message) cb(text);
            } else {
              fragments = [frame.payload];
            }
            break;
          case 0x8: // close
            conn.close();
            finish();
            return;
          case 0x9: // ping
            socket.write(encodeFrame(frame.payload, 0xa));
            break;
          case 0xa: // pong
            break;
          default:
            break;
        }
      }
    });

    socket.on('close', finish);
    socket.on('error', finish);

    connectionCb?.(conn, req);
  });

  return {
    listen(port, cb) {
      http.listen(port, cb);
    },
    onConnection(cb) {
      connectionCb = cb;
    },
    onHttp(cb) {
      httpCb = cb;
    },
    close() {
      http.close();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Framing                                                             */
/* ------------------------------------------------------------------ */

export function encodeFrame(payload: Buffer, opcode: number): Buffer {
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  header[0] = 0x80 | opcode; // FIN + opcode
  return Buffer.concat([header, payload]);
}

type DecodedFrame = { fin: boolean; opcode: number; payload: Buffer; size: number };

export function decodeFrame(buf: Buffer): DecodedFrame | undefined {
  if (buf.length < 2) return undefined;
  const first = buf[0]!;
  const second = buf[1]!;
  const fin = (first & 0x80) !== 0;
  const opcode = first & 0x0f;
  const masked = (second & 0x80) !== 0;
  let length = second & 0x7f;
  let offset = 2;

  if (length === 126) {
    if (buf.length < offset + 2) return undefined;
    length = buf.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buf.length < offset + 8) return undefined;
    // Payloads above 2^32 are refused rather than silently truncated.
    const high = buf.readUInt32BE(offset);
    if (high !== 0) throw new Error('WS frame too large');
    length = buf.readUInt32BE(offset + 4);
    offset += 8;
  }

  const maskLength = masked ? 4 : 0;
  if (buf.length < offset + maskLength + length) return undefined;

  let payload: Buffer;
  if (masked) {
    const mask = buf.subarray(offset, offset + 4);
    payload = Buffer.from(buf.subarray(offset + 4, offset + 4 + length));
    for (let i = 0; i < payload.length; i++) payload[i] = payload[i]! ^ mask[i % 4]!;
  } else {
    payload = Buffer.from(buf.subarray(offset, offset + length));
  }

  return { fin, opcode, payload, size: offset + maskLength + length };
}
