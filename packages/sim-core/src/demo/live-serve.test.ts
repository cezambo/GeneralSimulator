import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startLiveServe, type LiveServeHandle } from './live-serve.js';

function countBurning(tiles: { states?: { type: string }[] }[]): number {
  return tiles.filter((t) => t.states?.some((s) => s.type === 'burning')).length;
}

describe('live serve (Godot)', () => {
  let handle: LiveServeHandle | undefined;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined;
    }
  });

  it('só acende o fogo depois do cliente conectar', async () => {
    handle = await startLiveServe({ port: 0, fire: true, seed: 'live-test', tickMs: 40 });
    const url = `ws://127.0.0.1:${handle.port}`;

    const result = await new Promise<{ emptyFirst: boolean; sawFire: boolean }>((resolve, reject) => {
      const ws = new WebSocket(url);
      let emptyFirst = false;
      let sawFire = false;
      const timer = setTimeout(() => {
        ws.close();
        resolve({ emptyFirst, sawFire });
      }, 6000);

      ws.on('message', (data) => {
        const env = JSON.parse(data.toString()) as {
          type: string;
          payload: { tiles?: { states?: { type: string }[] }[] };
        };
        if (env.type !== 'world.snapshot' && env.type !== 'world.delta') return;
        const burning = countBurning(env.payload.tiles ?? []);
        if (burning === 0 && env.type === 'world.snapshot' && !sawFire) emptyFirst = true;
        if (burning > 0) {
          sawFire = true;
          clearTimeout(timer);
          ws.close();
          resolve({ emptyFirst, sawFire });
        }
      });
      ws.on('error', reject);
    });

    expect(result.emptyFirst).toBe(true);
    expect(result.sawFire).toBe(true);
  }, 15000);

  it('começa num tile e só depois se espalha', async () => {
    handle = await startLiveServe({ port: 0, fire: true, seed: 'live-spread', tickMs: 30 });
    const url = `ws://127.0.0.1:${handle.port}`;

    const result = await new Promise<{ firstBurning: number; laterBurning: number }>(
      (resolve, reject) => {
        const ws = new WebSocket(url);
        let firstBurning = 0;
        let laterBurning = 0;
        const timer = setTimeout(() => {
          ws.close();
          resolve({ firstBurning, laterBurning });
        }, 12000);

        ws.on('message', (data) => {
          const env = JSON.parse(data.toString()) as {
            type: string;
            payload: { tiles?: { states?: { type: string }[] }[] };
          };
          if (env.type !== 'world.snapshot' && env.type !== 'world.delta') return;
          const n = countBurning(env.payload.tiles ?? []);
          if (n === 0) return;
          if (firstBurning === 0) {
            firstBurning = n;
            return;
          }
          if (n > firstBurning) {
            laterBurning = n;
            clearTimeout(timer);
            ws.close();
            resolve({ firstBurning, laterBurning });
          }
        });
        ws.on('error', reject);
      },
    );

    expect(result.firstBurning).toBe(1);
    expect(result.laterBurning).toBeGreaterThan(1);
  }, 20000);

  it('cmd.agent.move coloca motion no agents.update', async () => {
    handle = await startLiveServe({ port: 0, fire: false, seed: 'live-move', tickMs: 40 });
    const url = `ws://127.0.0.1:${handle.port}`;

    const motion = await new Promise<{ pathLen: number }>((resolve, reject) => {
      const ws = new WebSocket(url);
      let seq = 0;
      let moved = false;
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('timeout move'));
      }, 8000);

      ws.on('message', (data) => {
        const env = JSON.parse(data.toString()) as {
          type: string;
          payload: {
            agents?: { id: string; motion?: { path: unknown[] } }[];
          };
        };
        if (env.type === 'world.snapshot' && !moved) {
          seq += 1;
          ws.send(
            JSON.stringify({
              v: 1,
              type: 'cmd.agent.move',
              seq,
              simTime: 0,
              payload: { agentId: 'ag_lia', x: 3, y: 3 },
            }),
          );
          moved = true;
          return;
        }
        if (env.type !== 'agents.update') return;
        const lia = env.payload.agents?.find((a) => a.id === 'ag_lia');
        if (lia?.motion?.path && lia.motion.path.length > 0) {
          clearTimeout(timer);
          ws.close();
          resolve({ pathLen: lia.motion.path.length });
        }
      });
      ws.on('error', reject);
    });

    expect(motion.pathLen).toBeGreaterThan(0);
  }, 15000);

  it('save e load restauram parede pintada', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'live-save-'));
    const prev = process.env['SIM_SAVE_DIR'];
    process.env['SIM_SAVE_DIR'] = dir;
    try {
      handle = await startLiveServe({ port: 0, fire: false, seed: 'live-saveload', tickMs: 40 });
      const url = `ws://127.0.0.1:${handle.port}`;

      const ok = await new Promise<boolean>((resolve, reject) => {
        const ws = new WebSocket(url);
        let seq = 0;
        let phase: 'boot' | 'painted' | 'saved' | 'cleared' | 'check' = 'boot';
        const timer = setTimeout(() => {
          ws.close();
          reject(new Error('timeout saveload'));
        }, 12000);

        const send = (type: string, payload: Record<string, unknown>, reqId?: string) => {
          seq += 1;
          ws.send(
            JSON.stringify({
              v: 1,
              type,
              seq,
              simTime: 0,
              payload,
              ...(reqId ? { reqId } : {}),
            }),
          );
        };

        ws.on('message', (data) => {
          const env = JSON.parse(data.toString()) as {
            type: string;
            reqId?: string;
            payload: { tiles?: { x: number; y: number; type: string }[]; mode?: string };
          };
          if (env.type === 'world.snapshot' && phase === 'boot') {
            send('cmd.sim.setMode', { mode: 'construction' });
            phase = 'painted';
            return;
          }
          if (env.type === 'world.snapshot' && env.payload.mode === 'construction' && phase === 'painted') {
            send('cmd.build.paintTile', {
              tileType: 'wall',
              materialId: 'pedra',
              cells: [{ x: 4, y: 4 }],
            });
            return;
          }
          if (env.type === 'world.delta' && phase === 'painted') {
            const t = env.payload.tiles?.find((c) => c.x === 4 && c.y === 4);
            if (t?.type !== 'wall') return;
            send('cmd.sim.save', { slot: 'demo' }, 'save1');
            phase = 'saved';
            return;
          }
          if (env.type === 'res.ok' && env.reqId === 'save1' && phase === 'saved') {
            send('cmd.build.paintTile', {
              tileType: 'floor',
              materialId: 'pinho',
              cells: [{ x: 4, y: 4 }],
            });
            return;
          }
          if (env.type === 'world.delta' && phase === 'saved') {
            const t = env.payload.tiles?.find((c) => c.x === 4 && c.y === 4);
            if (t?.type !== 'floor') return;
            send('cmd.sim.load', { slot: 'demo' }, 'load1');
            phase = 'cleared';
            return;
          }
          if (env.type === 'world.snapshot' && phase === 'cleared') {
            const t = env.payload.tiles?.find((c) => c.x === 4 && c.y === 4);
            clearTimeout(timer);
            ws.close();
            resolve(t?.type === 'wall');
          }
        });
        ws.on('error', reject);
      });

      expect(ok).toBe(true);
    } finally {
      if (prev === undefined) delete process.env['SIM_SAVE_DIR'];
      else process.env['SIM_SAVE_DIR'] = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);
});
