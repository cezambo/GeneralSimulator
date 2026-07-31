/**
 * Servidor WebSocket na porta do protocolo. 05-PROTOCOLO.md §2.
 */

import { WebSocketServer, type WebSocket } from 'ws';
import type { ProtocolHub } from './hub.js';
import { DEFAULT_PORT, type ClientRole, type Envelope } from './types.js';

export interface ProtocolServerOptions {
  readonly hub: ProtocolHub;
  readonly port?: number;
  readonly host?: string;
}

export interface ProtocolServer {
  readonly port: number;
  close(): Promise<void>;
}

let nextClient = 1;

export function startProtocolServer(opts: ProtocolServerOptions): Promise<ProtocolServer> {
  const requested = opts.port ?? DEFAULT_PORT;
  const host = opts.host ?? '127.0.0.1';

  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port: requested, host });
    const sockets = new Map<string, WebSocket>();

    wss.on('error', reject);

    wss.on('listening', () => {
      const addr = wss.address();
      const port = typeof addr === 'object' && addr ? addr.port : requested;
      resolve({
        port,
        close: () =>
          new Promise((res, rej) => {
            for (const [id, ws] of sockets) {
              opts.hub.disconnect(id);
              ws.close();
            }
            sockets.clear();
            wss.close((err) => (err ? rej(err) : res()));
          }),
      });
    });

    wss.on('connection', (ws, req) => {
      const id = `ws_${nextClient++}`;
      const role = roleFromUrl(req.url) ?? 'godot';
      sockets.set(id, ws);

      const sink = {
        id,
        role,
        send(msg: Envelope) {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
        },
      };
      opts.hub.connect(sink);

      ws.on('message', (data) => {
        const text = typeof data === 'string' ? data : data.toString('utf8');
        try {
          opts.hub.handleRaw(id, text);
        } catch (e) {
          ws.send(
            JSON.stringify({
              v: 1,
              type: 'res.error',
              seq: 0,
              simTime: 0,
              payload: { code: 'INTERNAL', message: String(e) },
            }),
          );
        }
      });

      ws.on('close', () => {
        opts.hub.disconnect(id);
        sockets.delete(id);
      });
    });
  });
}

function roleFromUrl(url: string | undefined): ClientRole | undefined {
  if (!url) return undefined;
  try {
    const q = new URL(url, 'ws://localhost').searchParams.get('role');
    if (q === 'godot' || q === 'panel' || q === 'test') return q;
  } catch {
    /* ignore */
  }
  return undefined;
}
