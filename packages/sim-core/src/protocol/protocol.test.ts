import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { loadConfig } from '../config/index.js';
import { SimClock } from '../world/clock.js';
import { buildSpikeRoom, loadSpikeAgents } from '../spike/room.js';
import {
  MemorySink,
  PROTOCOL_VERSION,
  ProtocolHub,
  parseEnvelope,
  ProtocolError,
  startProtocolServer,
} from './index.js';

function hubComSala() {
  const cfg = loadConfig();
  const { sim, world } = buildSpikeRoom(cfg, 'proto-teste');
  const { lia, rui } = loadSpikeAgents();
  sim.state.agents[lia.id] = lia;
  sim.state.agents[rui.id] = rui;
  sim.state.clock.paused = false;
  sim.state.clock.speed = 1;
  const clock = new SimClock(sim.state.clock, {
    minutesPerTick: cfg.tuning.minutesPerTick,
    hoursPerDay: cfg.tuning.hoursPerDay,
    daysPerSeason: cfg.tuning.daysPerSeason,
    seasonsPerYear: cfg.tuning.seasonsPerYear,
    availableSpeeds: cfg.tuning.availableSpeeds,
  });
  const hub = new ProtocolHub({ sim, world, clock });
  return { hub, sim, world, clock };
}

describe('envelope', () => {
  it('recusa versão incompatível com erro explícito', () => {
    expect(() => parseEnvelope({ v: 99, type: 'x', seq: 1, simTime: 0, payload: {} })).toThrow(
      ProtocolError,
    );
    try {
      parseEnvelope({ v: 99, type: 'x', seq: 1, simTime: 0, payload: {} });
    } catch (e) {
      expect(e).toBeInstanceOf(ProtocolError);
      expect((e as ProtocolError).code).toBe('VERSION_MISMATCH');
    }
  });

  it('aceita v atual', () => {
    const e = parseEnvelope({
      v: PROTOCOL_VERSION,
      type: 'cmd.sim.setSpeed',
      seq: 1,
      simTime: 0,
      payload: { speed: 1 },
    });
    expect(e.type).toBe('cmd.sim.setSpeed');
  });
});

describe('ProtocolHub (X-007)', () => {
  it('conexão envia world.snapshot completo', () => {
    const { hub } = hubComSala();
    const c = new MemorySink('c1');
    hub.connect(c);
    const snap = c.last('world.snapshot');
    expect(snap).toBeDefined();
    const p = snap!.payload as {
      width: number;
      height: number;
      agents: { id: string }[];
      tiles: unknown[];
    };
    expect(p.width).toBe(5);
    expect(p.height).toBe(5);
    expect(p.tiles).toHaveLength(25);
    expect(p.agents.map((a) => a.id).sort()).toEqual(['ag_lia', 'ag_rui']);
  });

  it('desconectar e reconectar restaura a visão sem reiniciar o núcleo', () => {
    const { hub, clock } = hubComSala();
    const a = new MemorySink('a');
    hub.connect(a);
    hub.handleRaw('a', {
      v: 1,
      type: 'cmd.sim.setSpeed',
      seq: 1,
      simTime: clock.simTime,
      reqId: 'r1',
      payload: { speed: 2 },
    });
    expect(clock.speed).toBe(2);

    // Mutação no núcleo enquanto o cliente está fora.
    clock.tickMany(30);
    hub.disconnect('a');

    const b = new MemorySink('b');
    hub.connect(b);
    const snap = b.last('world.snapshot')!;
    const p = snap.payload as { clock: { simTime: number; speed: number } };
    expect(p.clock.simTime).toBe(30);
    expect(p.clock.speed).toBe(2);
    // O núcleo não foi recriado: mesmo hub, novo cliente, snapshot fresco.
    expect(hub.clientCount).toBe(1);
  });

  it('setMode construction pausa o relógio', () => {
    const { hub, clock } = hubComSala();
    const c = new MemorySink('c');
    hub.connect(c);
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.sim.setMode',
      seq: 1,
      simTime: 0,
      payload: { mode: 'construction' },
    });
    expect(hub.mode).toBe('construction');
    expect(clock.paused).toBe(true);
  });

  it('req.agent.detail devolve o agente ou NOT_FOUND', () => {
    const { hub } = hubComSala();
    const c = new MemorySink('c');
    hub.connect(c);
    c.clear();
    hub.handleRaw('c', {
      v: 1,
      type: 'req.agent.detail',
      seq: 1,
      simTime: 0,
      reqId: 'r-ag',
      payload: { agentId: 'ag_lia' },
    });
    expect(c.last('res.agent.detail')?.reqId).toBe('r-ag');

    c.clear();
    hub.handleRaw('c', {
      v: 1,
      type: 'req.agent.detail',
      seq: 2,
      simTime: 0,
      reqId: 'r-miss',
      payload: { agentId: 'ag_fantasma' },
    });
    const err = c.last('res.error')!;
    expect(err.reqId).toBe('r-miss');
    expect((err.payload as { code: string }).code).toBe('NOT_FOUND');
  });
});

describe('servidor WebSocket', () => {
  it('reconexão por WS recebe snapshot atualizado', async () => {
    const { hub, clock } = hubComSala();
    const server = await startProtocolServer({ hub, port: 0, host: '127.0.0.1' });
    const url = `ws://127.0.0.1:${server.port}?role=test`;
    try {
      const first = await onceSnapshot(url);
      expect((first.payload as { width: number }).width).toBe(5);

      clock.tickMany(10);

      const second = await onceSnapshot(url);
      expect((second.payload as { clock: { simTime: number } }).clock.simTime).toBe(10);
    } finally {
      await server.close();
    }
  });
});

function onceSnapshot(url: string): Promise<import('./types.js').Envelope> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('timeout esperando world.snapshot'));
    }, 3000);
    ws.on('message', (data) => {
      const env = parseEnvelope(data.toString());
      if (env.type === 'world.snapshot') {
        clearTimeout(timer);
        ws.close();
        resolve(env);
      }
    });
    ws.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}
