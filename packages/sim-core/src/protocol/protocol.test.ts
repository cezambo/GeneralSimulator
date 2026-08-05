import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { loadConfig } from '../config/index.js';
import { startLiveServe, type LiveServeHandle } from '../demo/live-serve.js';
import { SimClock } from '../world/clock.js';
import { buildSpikeRoom, loadSpikeAgents } from '../spike/room.js';
import {
  MemorySink,
  PROTOCOL_VERSION,
  ProtocolHub,
  parseEnvelope,
  ProtocolError,
  startProtocolServer,
  type ToolEffectId,
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
  const hub = new ProtocolHub({ sim, world, clock, objects: cfg.objects });
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
    expect(p.width).toBe(14);
    expect(p.height).toBe(12);
    expect(p.tiles).toHaveLength(14 * 12);
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

  it('req.agent.detail devolve o agente + percepção ou NOT_FOUND', () => {
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
    const detail = c.last('res.agent.detail')!;
    expect(detail.reqId).toBe('r-ag');
    const detailPayload = detail.payload as {
      agent: { id: string };
      perception: { agentId: string; report: string; included: unknown[] };
    };
    expect(detailPayload.agent.id).toBe('ag_lia');
    expect(detailPayload.perception.agentId).toBe('ag_lia');

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

  it('req.agent.perception devolve fatos quando há fogo e agente no cone', () => {
    const { hub, sim, world } = hubComSala();
    const lia = sim.state.agents['ag_lia']!;
    const rui = sim.state.agents['ag_rui']!;
    lia.pos = { x: 2.5, y: 2.5 };
    lia.rotation = 90;
    lia.vision = { angle: 120, range: 8 };
    rui.pos = { x: 2.5, y: 5.5 };
    rui.rotation = 270;
    const g = world.mainGridId;
    sim.overlayAt(g, 2, 4, true).states = [{ type: 'burning', intensity: 75 }];
    sim.overlayAt(g, 2, 4, true).temperature = 350;

    const c = new MemorySink('c');
    hub.connect(c);
    c.clear();
    hub.handleRaw('c', {
      v: 1,
      type: 'req.agent.perception',
      seq: 1,
      simTime: 0,
      reqId: 'r-perc',
      payload: { agentId: 'ag_lia' },
    });
    const res = c.last('res.agent.perception')!;
    expect(res.reqId).toBe('r-perc');
    const p = res.payload as {
      agentId: string;
      facingDeg: number;
      vision: { angle: number; range: number };
      ranges: { visionTiles: number; visionMeters: number; hearingMeters: number };
      report: string;
      included: { text: string; salienceTier: number; sense: string }[];
      notable: { kind: string }[];
      visible: { agents: { id: string }[]; objects: unknown[] };
    };
    expect(p.agentId).toBe('ag_lia');
    expect(p.facingDeg).toBe(90);
    expect(p.vision.range).toBe(8);
    expect(p.included.length).toBeGreaterThan(0);
    expect(p.report.length).toBeGreaterThan(0);
    expect(p.notable.some((n) => n.kind === 'burning')).toBe(true);
    expect(p.visible.agents.some((a) => a.id === 'ag_rui')).toBe(true);
    expect(p.report).toMatch(/chamas|queimando/i);
  });

  it('cmd.build.paintTile e undo só em construção', () => {
    const { hub, world } = hubComSala();
    const c = new MemorySink('c');
    hub.connect(c);
    c.clear();
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.build.paintTile',
      seq: 1,
      simTime: 0,
      payload: { tileType: 'wall', materialId: 'pedra', cells: [{ x: 2, y: 2 }] },
    });
    expect((c.last('res.error')!.payload as { code: string }).code).toBe('WRONG_MODE');

    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.sim.setMode',
      seq: 2,
      simTime: 0,
      payload: { mode: 'construction' },
    });
    c.clear();
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.build.paintTile',
      seq: 3,
      simTime: 0,
      reqId: 'paint1',
      payload: { tileType: 'wall', materialId: 'pedra', cells: [{ x: 2, y: 2 }] },
    });
    expect(c.last('res.ok')?.reqId).toBe('paint1');
    expect(world.tileAt(world.mainGridId, 2, 2).type).toBe('wall');
    const delta = c.last('world.delta')!;
    expect((delta.payload as { tiles: { type: string }[] }).tiles[0]!.type).toBe('wall');

    c.clear();
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.build.undo',
      seq: 4,
      simTime: 0,
      reqId: 'undo1',
      payload: {},
    });
    expect(c.last('res.ok')?.reqId).toBe('undo1');
    expect(world.tileAt(world.mainGridId, 2, 2).type).toBe('floor');

    c.clear();
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.build.redo',
      seq: 5,
      simTime: 0,
      reqId: 'redo1',
      payload: {},
    });
    expect(c.last('res.ok')?.reqId).toBe('redo1');
    expect(world.tileAt(world.mainGridId, 2, 2).type).toBe('wall');
  });

  it('cmd.build.remove tile apaga parede', () => {
    const { hub, world } = hubComSala();
    const c = new MemorySink('c');
    hub.connect(c);
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.sim.setMode',
      seq: 1,
      simTime: 0,
      payload: { mode: 'construction' },
    });
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.build.paintTile',
      seq: 2,
      simTime: 0,
      payload: { tileType: 'wall', materialId: 'pedra', cells: [{ x: 5, y: 5 }] },
    });
    expect(world.tileAt(world.mainGridId, 5, 5).type).toBe('wall');
    c.clear();
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.build.remove',
      seq: 3,
      simTime: 0,
      payload: { target: 'tile', cells: [{ x: 5, y: 5 }] },
    });
    expect(world.tileAt(world.mainGridId, 5, 5)).toMatchObject({ type: 'floor', materialId: 'pinho' });
    expect((c.last('world.delta')!.payload as { tiles: { type: string }[] }).tiles[0]!.type).toBe(
      'floor',
    );
  });

  it('cmd.build.placeObject e remove object', () => {
    const { hub, sim } = hubComSala();
    const c = new MemorySink('c');
    hub.connect(c);
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.sim.setMode',
      seq: 1,
      simTime: 0,
      payload: { mode: 'construction' },
    });
    c.clear();
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.build.placeObject',
      seq: 2,
      simTime: 0,
      reqId: 'place1',
      payload: { objectDefId: 'cadeira_madeira', pos: { x: 4, y: 4 } },
    });
    expect(c.last('res.ok')?.reqId).toBe('place1');
    const delta = c.last('world.delta')!;
    const id = (delta.payload as { objectsUpsert: { id: string }[] }).objectsUpsert[0]!.id;
    expect(sim.state.objects[id]?.defId).toBe('cadeira_madeira');

    c.clear();
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.build.remove',
      seq: 3,
      simTime: 0,
      payload: { target: 'object', objectId: id },
    });
    expect(sim.state.objects[id]).toBeUndefined();
    expect((c.last('world.delta')!.payload as { objectsRemove: string[] }).objectsRemove).toContain(
      id,
    );
  });

  it('cmd.tool.apply chama o handler e emite world.delta', () => {
    let applied:
      | { effect: string; cells: { x: number; y: number }[]; intensity?: number }
      | undefined;
    let geomCalls = 0;
    const cfg = loadConfig();
    const { sim, world } = buildSpikeRoom(cfg, 'proto-tool');
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
    const hub = new ProtocolHub({
      sim,
      world,
      clock,
      onGeometryChanged: () => {
        geomCalls += 1;
      },
      onToolApply: (effect, cells, intensity) => {
        applied = { effect, cells: [...cells], intensity };
        return {
          tiles: cells.map((c) => ({
            x: c.x,
            y: c.y,
            type: 'floor',
            materialId: 'pinho',
            states: [{ type: 'wet', intensity: intensity ?? 90 }],
          })),
        };
      },
    });
    const c = new MemorySink('c');
    hub.connect(c);
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.sim.setMode',
      seq: 1,
      simTime: 0,
      payload: { mode: 'construction' },
    });
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.build.paintTile',
      seq: 2,
      simTime: 0,
      payload: { tileType: 'wall', materialId: 'pedra', cells: [{ x: 2, y: 2 }] },
    });
    expect(geomCalls).toBe(1);

    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.sim.setMode',
      seq: 3,
      simTime: 0,
      payload: { mode: 'normal' },
    });
    c.clear();
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.tool.apply',
      seq: 4,
      simTime: 0,
      reqId: 'wet1',
      payload: { effect: 'wet', cells: [{ x: 1, y: 1 }] },
    });
    expect(applied).toEqual({ effect: 'wet', cells: [{ x: 1, y: 1 }], intensity: undefined });
    expect(c.last('res.ok')?.reqId).toBe('wet1');
    const delta = c.last('world.delta')!.payload as {
      tiles: { states?: { type: string }[] }[];
    };
    expect(delta.tiles[0]!.states?.some((s) => s.type === 'wet')).toBe(true);

    c.clear();
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.tool.apply',
      seq: 5,
      simTime: 0,
      reqId: 'wetLight',
      payload: { effect: 'wet', cells: [{ x: 3, y: 3 }], intensity: 15 },
    });
    expect(applied).toEqual({ effect: 'wet', cells: [{ x: 3, y: 3 }], intensity: 15 });
    expect(c.last('res.ok')?.payload).toMatchObject({ ok: true, intensity: 15 });
    const lightDelta = c.last('world.delta')!.payload as {
      tiles: { states?: { type: string; intensity: number }[] }[];
    };
    expect(lightDelta.tiles[0]!.states).toEqual([{ type: 'wet', intensity: 15 }]);

    const accepted: ToolEffectId[] = ['extinguish', 'ignite', 'smoke', 'dry'];
    for (let i = 0; i < accepted.length; i += 1) {
      const effect = accepted[i]!;
      c.clear();
      hub.handleRaw('c', {
        v: 1,
        type: 'cmd.tool.apply',
        seq: 6 + i,
        simTime: 0,
        reqId: `fx-${effect}`,
        payload: { effect, cells: [{ x: 2, y: 2 }], intensity: 50 },
      });
      expect(applied).toEqual({ effect, cells: [{ x: 2, y: 2 }], intensity: 50 });
      expect(c.last('res.ok')?.reqId).toBe(`fx-${effect}`);
      expect(c.last('res.error')).toBeUndefined();
    }

    c.clear();
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.tool.apply',
      seq: 20,
      simTime: 0,
      reqId: 'badFx',
      payload: { effect: 'teleport', cells: [{ x: 1, y: 1 }] },
    });
    expect(c.last('res.error')?.payload).toMatchObject({ code: 'BAD_EFFECT' });
  });

  it('cmd.sim.save e load chamam handlers', () => {
    const calls: string[] = [];
    const cfg = loadConfig();
    const { sim, world } = buildSpikeRoom(cfg, 'proto-save');
    const clock = new SimClock(sim.state.clock, {
      minutesPerTick: cfg.tuning.minutesPerTick,
      hoursPerDay: cfg.tuning.hoursPerDay,
      daysPerSeason: cfg.tuning.daysPerSeason,
      seasonsPerYear: cfg.tuning.seasonsPerYear,
      availableSpeeds: cfg.tuning.availableSpeeds,
    });
    const hub = new ProtocolHub({
      sim,
      world,
      clock,
      onSave: (slot) => {
        calls.push(`save:${slot}`);
      },
      onLoad: (slot) => {
        calls.push(`load:${slot}`);
      },
    });
    const c = new MemorySink('c');
    hub.connect(c);
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.sim.save',
      seq: 1,
      simTime: 0,
      reqId: 's1',
      payload: { slot: 'demo' },
    });
    expect(c.last('res.ok')?.reqId).toBe('s1');
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.sim.load',
      seq: 2,
      simTime: 0,
      reqId: 'l1',
      payload: { slot: 'demo' },
    });
    expect(c.last('res.ok')?.reqId).toBe('l1');
    expect(calls).toEqual(['save:demo', 'load:demo']);
  });

  it('cmd.sim.reset chama handler e volta a modo normal', () => {
    const calls: string[] = [];
    const cfg = loadConfig();
    const { sim, world } = buildSpikeRoom(cfg, 'proto-reset');
    const clock = new SimClock(sim.state.clock, {
      minutesPerTick: cfg.tuning.minutesPerTick,
      hoursPerDay: cfg.tuning.hoursPerDay,
      daysPerSeason: cfg.tuning.daysPerSeason,
      seasonsPerYear: cfg.tuning.seasonsPerYear,
      availableSpeeds: cfg.tuning.availableSpeeds,
    });
    const hub = new ProtocolHub({
      sim,
      world,
      clock,
      mode: 'construction',
      onReset: (opts) => {
        calls.push(`reset:${opts?.seed ?? '-'}`);
      },
    });
    const c = new MemorySink('c');
    hub.connect(c);
    expect(hub.mode).toBe('construction');
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.sim.reset',
      seq: 1,
      simTime: 0,
      reqId: 'r1',
      payload: { seed: 'fresh-1' },
    });
    expect(c.last('res.ok')?.reqId).toBe('r1');
    expect(hub.mode).toBe('normal');
    expect(calls).toEqual(['reset:fresh-1']);
  });

  it('cmd.world.toggleDoor abre e fecha e notifica geometria', () => {
    let geomCalls = 0;
    const cfg = loadConfig();
    const { sim, world } = buildSpikeRoom(cfg, 'proto-door');
    const clock = new SimClock(sim.state.clock, {
      minutesPerTick: cfg.tuning.minutesPerTick,
      hoursPerDay: cfg.tuning.hoursPerDay,
      daysPerSeason: cfg.tuning.daysPerSeason,
      seasonsPerYear: cfg.tuning.seasonsPerYear,
      availableSpeeds: cfg.tuning.availableSpeeds,
    });
    const hub = new ProtocolHub({
      sim,
      world,
      clock,
      onGeometryChanged: () => {
        geomCalls += 1;
      },
    });
    const doorX = Math.floor(world.grid(world.mainGridId).width / 2);
    // Sala spike nasce com a porta aberta.
    expect(world.blocksMovementAt(world.mainGridId, doorX, 0)).toBe(false);

    const c = new MemorySink('c');
    hub.connect(c);
    c.clear();
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.world.toggleDoor',
      seq: 1,
      simTime: 0,
      reqId: 'door1',
      payload: { x: doorX, y: 0 },
    });
    expect(c.last('res.ok')?.reqId).toBe('door1');
    expect(world.blocksMovementAt(world.mainGridId, doorX, 0)).toBe(true);
    expect(geomCalls).toBe(1);

    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.world.toggleDoor',
      seq: 2,
      simTime: 0,
      payload: { x: doorX, y: 0 },
    });
    expect(world.blocksMovementAt(world.mainGridId, doorX, 0)).toBe(false);
    expect(geomCalls).toBe(2);
  });

  it('cmd.agent.move chama o handler e empurra agents.update com motion', () => {
    let moved: { id: string; x: number; y: number } | undefined;
    const cfg = loadConfig();
    const { sim, world } = buildSpikeRoom(cfg, 'proto-move');
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
    const hub = new ProtocolHub({
      sim,
      world,
      clock,
      motionOf: (id) =>
        id === lia.id
          ? { path: [{ x: 3.5, y: 3.5 }], speed: 10, etaSimTime: 5 }
          : undefined,
      onAgentMove: (agentId, goal) => {
        moved = { id: agentId, x: goal.x, y: goal.y };
        return { ok: true };
      },
    });
    const c = new MemorySink('c');
    hub.connect(c);
    c.clear();
    hub.handleRaw('c', {
      v: 1,
      type: 'cmd.agent.move',
      seq: 1,
      simTime: 0,
      reqId: 'r-move',
      payload: { agentId: lia.id, x: 3, y: 3 },
    });
    expect(moved).toEqual({ id: lia.id, x: 3, y: 3 });
    expect(c.last('res.ok')?.reqId).toBe('r-move');
    const upd = c.last('agents.update')!;
    const agents = (upd.payload as { agents: { id: string; motion?: { path: unknown[] } }[] }).agents;
    const liaUp = agents.find((a) => a.id === lia.id);
    expect(liaUp?.motion?.path).toHaveLength(1);
  });
});

describe('servidor WebSocket', () => {
  it('reconexão por WS recebe snapshot atualizado', async () => {
    const { hub, clock } = hubComSala();
    const server = await startProtocolServer({ hub, port: 0, host: '127.0.0.1' });
    const url = `ws://127.0.0.1:${server.port}?role=test`;
    try {
      const first = await onceSnapshot(url);
      expect((first.payload as { width: number }).width).toBe(14);

      clock.tickMany(10);

      const second = await onceSnapshot(url);
      expect((second.payload as { clock: { simTime: number } }).clock.simTime).toBe(10);
    } finally {
      await server.close();
    }
  });
});

describe('live-serve cmd.tool.apply', () => {
  let handle: LiveServeHandle | undefined;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined;
    }
  });

  it('ignite, smoke, wet e extinguish alteram estados na célula', async () => {
    handle = await startLiveServe({ port: 0, fire: false, seed: 'proto-tools', tickMs: 40 });
    const url = `ws://127.0.0.1:${handle.port}`;

    const result = await new Promise<{
      ignited: boolean;
      smoky: boolean;
      wet: boolean;
      extinguished: boolean;
    }>((resolve, reject) => {
      const ws = new WebSocket(url);
      let seq = 0;
      let phase:
        | 'boot'
        | 'ignite'
        | 'smoke'
        | 'wet'
        | 'extinguish'
        | 'done' = 'boot';
      const out = {
        ignited: false,
        smoky: false,
        wet: false,
        extinguished: false,
      };
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`timeout tools phase=${phase}`));
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

      const cellAt = (
        tiles: { x: number; y: number; states?: { type: string; intensity: number }[] }[] | undefined,
        x: number,
        y: number,
      ) => tiles?.find((t) => t.x === x && t.y === y);

      const has = (
        tiles: { x: number; y: number; states?: { type: string; intensity: number }[] }[] | undefined,
        x: number,
        y: number,
        type: string,
      ) => Boolean(cellAt(tiles, x, y)?.states?.some((s) => s.type === type && s.intensity > 0));

      ws.on('message', (data) => {
        const env = JSON.parse(data.toString()) as {
          type: string;
          reqId?: string;
          payload: {
            tiles?: { x: number; y: number; states?: { type: string; intensity: number }[] }[];
            code?: string;
          };
        };

        if (env.type === 'world.snapshot' && phase === 'boot') {
          // Célula longe do foco demo (1,1): chão livre.
          send('cmd.tool.apply', { effect: 'ignite', cells: [{ x: 4, y: 4 }], intensity: 70 }, 'ig1');
          phase = 'ignite';
          return;
        }

        if (env.type === 'world.delta' && phase === 'ignite') {
          if (!has(env.payload.tiles, 4, 4, 'burning')) return;
          out.ignited = true;
          send('cmd.tool.apply', { effect: 'smoke', cells: [{ x: 5, y: 5 }], intensity: 55 }, 'sm1');
          phase = 'smoke';
          return;
        }

        if (env.type === 'world.delta' && phase === 'smoke') {
          if (!has(env.payload.tiles, 5, 5, 'smoky')) return;
          out.smoky = true;
          send('cmd.tool.apply', { effect: 'wet', cells: [{ x: 4, y: 4 }] }, 'w1');
          phase = 'wet';
          return;
        }

        if (env.type === 'world.delta' && phase === 'wet') {
          const burning = has(env.payload.tiles, 4, 4, 'burning');
          const wet = has(env.payload.tiles, 4, 4, 'wet');
          // wet + settleContinuous pode apagar no mesmo clique.
          if (!wet && burning) return;
          out.wet = wet || !burning;
          send(
            'cmd.tool.apply',
            { effect: 'extinguish', cells: [{ x: 4, y: 4 }], intensity: 80 },
            'ex1',
          );
          phase = 'extinguish';
          return;
        }

        if (env.type === 'world.delta' && phase === 'extinguish') {
          const burning = has(env.payload.tiles, 4, 4, 'burning');
          if (burning) return;
          out.extinguished = true;
          phase = 'done';
          clearTimeout(timer);
          ws.close();
          resolve(out);
        }

        if (env.type === 'res.error') {
          clearTimeout(timer);
          ws.close();
          reject(new Error(`res.error ${env.reqId}: ${env.payload.code}`));
        }
      });
      ws.on('error', reject);
    });

    expect(result.ignited).toBe(true);
    expect(result.smoky).toBe(true);
    expect(result.wet).toBe(true);
    expect(result.extinguished).toBe(true);
  }, 20000);
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
