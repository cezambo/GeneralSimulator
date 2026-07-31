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
});
