/**
 * Sessão ao vivo para o cliente Godot: fogo sob demanda, patrulha A*, frames.
 *
 * O ritmo do fogo aqui é deliberadamente mais lento que o tuning de aceite:
 * a sala de teste tem que deixar a propagação ser lida a olho, não num piscar.
 */

import { join } from 'node:path';
import { loadConfig } from '../config/load.js';
import { loadSlot, saveSlot } from '../persist/index.js';
import {
  advance,
  clearPath,
  createMover,
  findPath,
  isMoving,
  setPath,
  tilesPerMinute,
  type MoverState,
} from '../spatial/index.js';
import {
  ProtocolHub,
  startProtocolServer,
  DEFAULT_PORT,
  type ToolEffectId,
  type WorldDeltaPayload,
} from '../protocol/index.js';
import { describeTileLook } from '../perception/tile-look.js';
import { motionFromMover } from '../protocol/snapshot.js';
import {
  buildSpikeRoom,
  loadSpikeAgents,
  SPIKE_GRID,
  SPIKE_HEIGHT,
  SPIKE_WIDTH,
} from '../spike/room.js';
import { Simulation } from '../state/index.js';
import { ReactionMatrix } from '../substrate/matrix.js';
import { Substrate, TileReactiveBridge } from '../substrate/index.js';
import { World } from '../world/grid.js';
import { SimClock } from '../world/clock.js';
import { avoidBurningCost, pathNeedsRepath } from './mover-fire.js';

/** Intervalo real entre ticks na demo visual (~1 hop de fogo a cada poucos segundos). */
const DEMO_TICK_MS = 700;
/**
 * Chance efetiva da regra fire-spread na demo.
 * No JSON de aceite, `flammabilitySpeed` do pinho empurra 0.35 → ~0.68;
 * aqui removemos esse modificador e usamos chance baixa o bastante para
 * ~1 hop a cada poucos segundos reais (tick ~700ms).
 */
const DEMO_FIRE_SPREAD_CHANCE = 0.06;
/** Um único foco, canto interior — dá para ver a onda. */
const DEMO_IGNITE = { x: 1, y: 1 } as const;
/**
 * Velocidade visual na sala de teste. O tuning real (~168 tiles/min) atravessa
 * o mapa num único tick — aqui ~1 tile a cada 1–2 s em x1.
 */
const DEMO_MOVE_TILES_PER_MINUTE = 0.9;

export interface LiveServeHandle {
  readonly port: number;
  close(): Promise<void>;
}

export async function startLiveServe(opts?: {
  port?: number;
  fire?: boolean;
  seed?: string;
  /** Só para teste: acelera o intervalo real sem mudar a cadência espacial. */
  tickMs?: number;
  /** Intervalo de frame visual (movers + push). Default ~100ms na demo. */
  frameMs?: number;
}): Promise<LiveServeHandle> {
  const cfg = loadConfig();
  const withFire = opts?.fire ?? process.env['SIM_FIRE'] !== '0';
  const tickMs = opts?.tickMs ?? DEMO_TICK_MS;
  // Em testes com tickMs baixo, frame = tick; na demo, subpasso visual ~10 Hz.
  const frameMs = opts?.frameMs ?? (tickMs <= 120 ? tickMs : 100);
  let sessionSeed = opts?.seed ?? process.env['SIM_SEED'] ?? 'serve-v0';

  const calendar = {
    minutesPerTick: cfg.tuning.minutesPerTick,
    hoursPerDay: cfg.tuning.hoursPerDay,
    daysPerSeason: cfg.tuning.daysPerSeason,
    seasonsPerYear: cfg.tuning.seasonsPerYear,
    availableSpeeds: cfg.tuning.availableSpeeds,
  };

  // Matriz só desta sessão: propaga mais devagar sem alterar o JSON de aceite.
  const demoMatrix = new ReactionMatrix(
    cfg.reactions.rules.map((r) =>
      r.id === 'fire-spread'
        ? {
            ...r,
            chance: DEMO_FIRE_SPREAD_CHANCE,
            // Sem flammabilitySpeed: senão pinho (~1.1) estoura a chance de novo.
            modifiedBy: { wet: -0.9 },
          }
        : r,
    ),
    cfg.materials,
  );

  function makeSubstrate(s: Simulation): Substrate {
    return new Substrate({
      materials: cfg.materials,
      matrix: demoMatrix,
      effects: cfg.effects,
      rng: s.rng.stream('substrato'),
      tuning: {
        stateDecayPerTick: cfg.tuning.stateDecayPerTick * 0.25,
        maxActiveTargets: cfg.tuning.maxActiveTargets,
        thermalEquilibriumTolerance: cfg.tuning.thermalEquilibriumTolerance,
        maxCascadeStepsPerTick: 1,
        // Meio-termo: perda 4 (tuning) consome o foco em ~25 ticks e parte
        // o harness (door/wet); perda 1 + O₂ cheio nunca chega a cinza de
        // móvel. 2 ≈ 50 ticks de chama — dá para isolar porta e ainda ash.
        burnIntegrityLossPerTick: Math.min(cfg.tuning.burnIntegrityLossPerTick, 2),
        oxygenAmbient: cfg.tuning.oxygenAmbient,
        // Demo aberta sem difusão (R-023=V2): consumo 3 apaga o cluster cedo
        // demais. Suaviza para a chama cobrir os ~50 ticks de combustível.
        burnOxygenConsumePerTick: Math.min(cfg.tuning.burnOxygenConsumePerTick, 0.7),
        oxygenWeakenThreshold: cfg.tuning.oxygenWeakenThreshold,
        oxygenExtinguishThreshold: cfg.tuning.oxygenExtinguishThreshold,
        burnIntensityGrowthPerTick: cfg.tuning.burnIntensityGrowthPerTick,
        burnIntensityWeakenPerTick: cfg.tuning.burnIntensityWeakenPerTick,
        smokeFromOxygenConsume: Math.min(cfg.tuning.smokeFromOxygenConsume, 0.4),
        oxygenRecoveryPerTick: cfg.tuning.oxygenRecoveryPerTick,
      },
    });
  }

  let sim!: Simulation;
  let world!: World;
  let clock!: SimClock;
  let bridge!: TileReactiveBridge;
  let substrate!: Substrate;
  let liaId = 'ag_lia';
  let ruiId = 'ag_rui';
  const movers = new Map<string, MoverState>();
  /** Agentes com destino pedido pelo cliente — patrulha não sobrescreve. */
  const manualControl = new Set<string>();
  /** Último destino pedido — usado para recalcular quando a geometria muda. */
  const goals = new Map<string, { x: number; y: number }>();
  let fireLit = false;
  let started = false;
  let patrolCooldown = 0;
  let lastBurningLogged = -1;
  /** Acumula ms reais até fechar um tick de fogo/relógio. */
  let simAccMs = 0;

  function bootRoom(seed: string, pauseUntilClient: boolean): void {
    sessionSeed = seed;
    ({ sim, world } = buildSpikeRoom(cfg, seed));
    const { lia, rui } = loadSpikeAgents();
    liaId = lia.id;
    ruiId = rui.id;
    lia.vision = { angle: 100, range: 5 };
    rui.vision = { angle: 100, range: 5 };
    sim.state.agents[lia.id] = lia;
    sim.state.agents[rui.id] = rui;
    if (pauseUntilClient) {
      // Parte pausada até o primeiro cliente — o fogo não queima “nos bastidores”.
      sim.state.clock.paused = true;
      sim.state.clock.speed = 0;
    } else {
      sim.state.clock.paused = false;
      sim.state.clock.speed = 1;
    }
    clock = new SimClock(sim.state.clock, calendar);
    bridge = new TileReactiveBridge(sim, world, 20, cfg.objects);
    substrate = makeSubstrate(sim);
    movers.clear();
    movers.set(lia.id, createMover(SPIKE_GRID, lia.pos.x, lia.pos.y, lia.rotation));
    movers.set(rui.id, createMover(SPIKE_GRID, rui.pos.x, rui.pos.y, rui.rotation));
    manualControl.clear();
    goals.clear();
    fireLit = false;
    started = false;
    patrolCooldown = 0;
    lastBurningLogged = -1;
    simAccMs = 0;
  }

  bootRoom(sessionSeed, true);

  const saveDir = process.env['SIM_SAVE_DIR'] ?? join(process.cwd(), 'saves');

  const hub = new ProtocolHub({
    sim,
    world,
    clock,
    objects: cfg.objects,
    motionOf: (id) => {
      const m = movers.get(id);
      return m ? motionFromMover(m, clock.simTime) : undefined;
    },
    onAgentMove: (agentId, goal) => orderMove(agentId, goal.x, goal.y, true),
    onGeometryChanged: () => revalidatePaths(),
    onToolApply: (effect, cells, intensity) => applyTool(effect, cells, intensity),
    onSave: (slot) => {
      const path = saveSlot(saveDir, slot, sim.serialize());
      console.log(JSON.stringify({ event: 'saved', slot, path }));
    },
    onLoad: (slot) => {
      const json = loadSlot(saveDir, slot);
      sim = Simulation.deserialize(json);
      world = new World({
        sim,
        scale: { metersPerTile: cfg.tuning.metersPerTile },
      });
      clock = new SimClock(sim.state.clock, calendar);
      bridge = new TileReactiveBridge(sim, world, 20, cfg.objects);
      substrate = makeSubstrate(sim);
      rehydrateSubstrate();
      rebuildMoversFromAgents();
      hub.rebind({ sim, world, clock });
      // Não reacende o foco inicial — o save já tem o fogo (ou a cinza).
      fireLit = true;
      started = true;
      hub.broadcastSnapshot();
      hub.pushFrame();
      console.log(JSON.stringify({ event: 'loaded', slot, simTime: clock.simTime }));
    },
    onReset: (resetOpts) => {
      const seed = resetOpts?.seed ?? sessionSeed;
      // Clientes já ligados: não fica pausado — o timer reacende o fogo no próximo frame.
      bootRoom(seed, hub.clientCount === 0);
      hub.rebind({ sim, world, clock });
      hub.broadcastSnapshot();
      hub.pushFrame();
      console.log(
        JSON.stringify({
          event: 'reset',
          seed,
          fire: withFire,
          clients: hub.clientCount,
          simTime: clock.simTime,
        }),
      );
    },
  });
  const port = opts?.port ?? Number(process.env['SIM_PORT'] ?? DEFAULT_PORT);
  const server = await startProtocolServer({ hub, port, host: '0.0.0.0' });

  console.log(
    JSON.stringify({
      listening: `ws://127.0.0.1:${server.port}`,
      bind: '0.0.0.0',
      fire: withFire,
      tickMs,
      frameMs,
      fireSpreadChance: DEMO_FIRE_SPREAD_CHANCE,
      note: 'um tile acende ao conectar; movers em subpasso visual',
    }),
  );

  const timer = setInterval(() => {
    // Espera o primeiro cliente antes de qualquer tick.
    if (hub.clientCount === 0) return;

    if (!started) {
      started = true;
      clock.setSpeed(1);
      if (withFire && !fireLit) {
        const t = bridge.targetAt(SPIKE_GRID, DEMO_IGNITE.x, DEMO_IGNITE.y);
        // Intensidade moderada: calor na vizinhança sobe sem auto-ignição térmica imediata.
        substrate.invoke('ignite', t, { simTime: clock.simTime, world: bridge }, { intensity: 55 });
        // Cascata de contacto acende móvel na mesma célula, se houver.
        bridge.commit();
        fireLit = true;
        hub.broadcastSnapshot();
        console.log(
          JSON.stringify({
            event: 'fire_ignited',
            at: [[DEMO_IGNITE.x, DEMO_IGNITE.y]],
            intensity: 55,
          }),
        );
      }
      // Patrulha inicial (só se o jogador ainda não mandou ninguém).
      if (!manualControl.has(liaId)) orderMove(liaId, SPIKE_WIDTH - 3, SPIKE_HEIGHT - 3, false);
      if (!manualControl.has(ruiId)) orderMove(ruiId, 2, 2, false);
      // Um frame só com o foco: não espalha no mesmo instante do acender.
      hub.pushFrame();
      return;
    }

    if (clock.paused || clock.speed === 0) {
      hub.pushFrame();
      return;
    }

    const speedFactor = Math.max(1, Math.min(clock.speed, 3));
    // Subpasso: em tickMs=700 / frameMs=100 → 1/7 de minuto sim por frame em x1.
    const minutes = (frameMs / tickMs) * speedFactor;
    stepMovers(minutes);

    let dirtyTiles: { x: number; y: number; gridId: string }[] = [];
    const objectsUpsert: NonNullable<WorldDeltaPayload['objectsUpsert']>[number][] = [];
    const objectsRemove: string[] = [];
    simAccMs += frameMs * speedFactor;
    while (simAccMs >= tickMs) {
      simAccMs -= tickMs;
      clock.tick();
      substrate.tick({ simTime: clock.simTime, world: bridge });
      const committed = bridge.commit();
      dirtyTiles = dirtyTiles.concat(committed.tiles);
      objectsUpsert.push(...committed.objectsUpsert);
      objectsRemove.push(...committed.objectsRemove);
      patrolCooldown -= 1;
      if (patrolCooldown <= 0) {
        patrolCooldown = 45;
        const liaM = movers.get(liaId)!;
        const ruiM = movers.get(ruiId)!;
        if (!manualControl.has(liaId) && !isMoving(liaM)) {
          orderMove(liaId, Math.floor(ruiM.x), Math.floor(ruiM.y), false);
        }
        if (!manualControl.has(ruiId) && !isMoving(ruiM)) {
          orderMove(ruiId, Math.floor(liaM.x), Math.floor(liaM.y), false);
        }
      }
    }

    const burning = countBurning();
    if (burning !== lastBurningLogged) {
      lastBurningLogged = burning;
      console.log(JSON.stringify({ event: 'fire_status', burning, simTime: clock.simTime }));
    }

    if (dirtyTiles.length > 0 || objectsUpsert.length > 0 || objectsRemove.length > 0) {
      const uniq = new Map<string, { x: number; y: number; gridId: string }>();
      for (const d of dirtyTiles) uniq.set(`${d.gridId}:${d.x},${d.y}`, d);
      const objById = new Map(objectsUpsert.map((o) => [o.id, o]));
      hub.broadcastDelta({
        ...(uniq.size > 0
          ? { tiles: [...uniq.values()].map((d) => cellPayload(d.gridId, d.x, d.y)) }
          : {}),
        ...(objById.size > 0 ? { objectsUpsert: [...objById.values()] } : {}),
        ...(objectsRemove.length > 0 ? { objectsRemove: [...new Set(objectsRemove)] } : {}),
      });
      // Parede que virou escombro (ou porta queimada) reabre caminhos.
      revalidatePaths();
    }
    hub.pushFrame();
  }, frameMs);

  function countBurning(): number {
    let n = 0;
    for (let y = 0; y < SPIKE_HEIGHT; y += 1) {
      for (let x = 0; x < SPIKE_WIDTH; x += 1) {
        const o = sim.overlayAt(SPIKE_GRID, x, y);
        if (o?.states?.some((s) => s.type === 'burning' && s.intensity > 0)) n += 1;
      }
    }
    return n;
  }

  /** Reativa tiles/objetos com estado/temperatura depois de um load. */
  function rehydrateSubstrate(): void {
    const grid = world.grid(SPIKE_GRID);
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const o = sim.overlayAt(SPIKE_GRID, x, y);
        if (!o) continue;
        const hasState = (o.states?.length ?? 0) > 0;
        const hasTemp = o.temperature !== undefined;
        const damaged = o.integrity !== undefined && o.integrity < 100;
        if (hasState || hasTemp || damaged) {
          substrate.activate(bridge.targetAt(SPIKE_GRID, x, y));
        }
      }
    }
    for (const obj of Object.values(sim.state.objects)) {
      const hasState = (obj.states?.length ?? 0) > 0;
      const hasTemp = obj.temperature !== undefined;
      const damaged = obj.integrity !== undefined && obj.integrity < 100;
      if (hasState || hasTemp || damaged) {
        substrate.activate(bridge.objectTarget(obj));
      }
    }
  }

  function rebuildMoversFromAgents(): void {
    movers.clear();
    goals.clear();
    manualControl.clear();
    for (const agent of Object.values(sim.state.agents)) {
      movers.set(
        agent.id,
        createMover(SPIKE_GRID, agent.pos.x, agent.pos.y, agent.rotation ?? 0),
      );
    }
  }

  function cellPayload(gridId: string, x: number, y: number) {
    const t = world.tileAt(gridId, x, y);
    const o = sim.overlayAt(gridId, x, y);
    const states = o?.states?.length
      ? o.states.map((s) => ({ type: s.type, intensity: s.intensity }))
      : ([] as { type: string; intensity: number }[]);
    const objects = Object.values(sim.state.objects)
      .filter((obj) => Math.floor(obj.pos.x) === x && Math.floor(obj.pos.y) === y)
      .map((obj) => ({ defId: obj.defId }));
    const look = describeTileLook({
      type: t.type,
      materialId: t.materialId,
      states,
      ...(o?.integrity !== undefined ? { integrity: o.integrity } : {}),
      ...(o?.temperature !== undefined ? { temperature: o.temperature } : {}),
      ...(t.state && Object.keys(t.state).length > 0 ? { state: { ...t.state } } : {}),
      ...(objects.length > 0 ? { objects } : {}),
    });
    return {
      x,
      y,
      type: t.type,
      materialId: t.materialId,
      ...(t.state && Object.keys(t.state).length > 0 ? { state: { ...t.state } } : {}),
      states,
      ...(o?.integrity !== undefined ? { integrity: o.integrity } : {}),
      ...(o?.temperature !== undefined ? { temperature: o.temperature } : {}),
      look,
    };
  }

  function orderMove(
    agentId: string,
    gx: number,
    gy: number,
    fromPlayer: boolean,
  ): { ok: true } | { ok: false; code: string; message: string } {
    const agent = sim.state.agents[agentId];
    const mover = movers.get(agentId);
    if (!agent || !mover) {
      return { ok: false, code: 'NOT_FOUND', message: `agente "${agentId}" sem mover` };
    }
    if (!world.inBounds(SPIKE_GRID, gx, gy)) {
      return { ok: false, code: 'OUT_OF_BOUNDS', message: `célula (${gx},${gy}) fora do mapa` };
    }
    if (world.blocksMovementAt(SPIKE_GRID, gx, gy)) {
      return { ok: false, code: 'BLOCKED', message: 'destino bloqueado' };
    }
    const start = {
      gridId: SPIKE_GRID,
      x: Math.floor(mover.x),
      y: Math.floor(mover.y),
    };
    // Ortogonal + evita chamas (Infinity). Sem desvio: NO_PATH → caller pausa.
    const path = findPath(world, start, { gridId: SPIKE_GRID, x: gx, y: gy }, {
      connectivity: 4,
      cost: avoidBurningCost,
    });
    if (!path.found || path.path.length === 0) {
      return { ok: false, code: 'NO_PATH', message: `sem caminho até (${gx},${gy})` };
    }
    const natural = tilesPerMinute(
      agent.biology.capacities?.moving ?? 1,
      {
        baseSpeedMetersPerSecond: cfg.tuning.baseSpeedMetersPerSecond,
        minSpeedFactor: cfg.tuning.minSpeedFactor,
      },
      world.scale,
    );
    setPath(mover, path.path, Math.min(DEMO_MOVE_TILES_PER_MINUTE, natural));
    goals.set(agentId, { x: gx, y: gy });
    if (fromPlayer) manualControl.add(agentId);
    return { ok: true };
  }

  /** Recalcula (ou pausa) caminhos cortados por parede ou fogo novo. */
  function revalidatePaths(): void {
    for (const [id, m] of movers) {
      if (!isMoving(m) || !pathNeedsRepath(world, m)) continue;
      const goal = goals.get(id);
      if (!goal) {
        clearPath(m);
        continue;
      }
      const fromPlayer = manualControl.has(id);
      const result = orderMove(id, goal.x, goal.y, fromPlayer);
      // Sem rota livre de fogo: pausa; patrulha / próximo dirty tenta de novo.
      if (!result.ok) clearPath(m);
    }
  }

  function applyTool(
    effect: ToolEffectId,
    cells: readonly { x: number; y: number }[],
    intensity?: number,
  ): WorldDeltaPayload {
    const ctx = { simTime: clock.simTime, world: bridge };
    // Default histórico: wet ~90 (soak). Intensity explícita cobre wet e extinguish.
    const invokeOpts =
      intensity !== undefined
        ? { intensity }
        : effect === 'wet'
          ? { intensity: 90 }
          : {};
    const touched: ReturnType<typeof bridge.targetAt>[] = [];
    for (const c of cells) {
      if (!world.inBounds(SPIKE_GRID, c.x, c.y)) continue;
      const t = bridge.targetAt(SPIKE_GRID, c.x, c.y);
      substrate.invoke(effect, t, ctx, invokeOpts);
      touched.push(t);
      // Móvel na mesma célula também molha/apaga (R-007 / ocupantes).
      for (const occ of bridge.occupantsOf(t)) {
        substrate.invoke(effect, occ, ctx, invokeOpts);
        touched.push(occ);
      }
    }
    // Só contínua nos tiles tocados: burning+wet → extinguish no mesmo clique.
    // Um tick() completo espalhava fogo / consumia paredes noutros sítios —
    // sintoma: "apaguei aqui e o fogo moveu / outra célula apagou".
    substrate.settleContinuous(touched, ctx);
    const committed = bridge.commit();
    const uniq = new Map<string, { x: number; y: number; gridId: string }>();
    for (const d of committed.tiles) uniq.set(`${d.gridId}:${d.x},${d.y}`, d);
    for (const c of cells) {
      if (!world.inBounds(SPIKE_GRID, c.x, c.y)) continue;
      uniq.set(`${SPIKE_GRID}:${c.x},${c.y}`, { gridId: SPIKE_GRID, x: c.x, y: c.y });
    }
    return {
      tiles: [...uniq.values()].map((d) => cellPayload(d.gridId, d.x, d.y)),
      ...(committed.objectsUpsert.length > 0 ? { objectsUpsert: committed.objectsUpsert } : {}),
      ...(committed.objectsRemove.length > 0 ? { objectsRemove: committed.objectsRemove } : {}),
    };
  }

  function stepMovers(minutes: number): void {
    if (minutes <= 0) return;
    for (const [id, m] of movers) {
      if (m.waypointIndex < 0) continue;
      if (pathNeedsRepath(world, m)) {
        const goal = goals.get(id);
        if (goal) {
          const result = orderMove(id, goal.x, goal.y, manualControl.has(id));
          if (!result.ok) clearPath(m);
        } else {
          clearPath(m);
        }
        if (!isMoving(m)) continue;
      }
      const beforeX = m.x;
      const beforeY = m.y;
      advance(m, minutes);
      const a = sim.state.agents[id];
      if (a) {
        a.pos = { x: m.x, y: m.y };
        const dx = m.x - beforeX;
        const dy = m.y - beforeY;
        if (dx * dx + dy * dy > 1e-8) {
          m.rotationDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
          a.rotation = m.rotationDeg;
        } else {
          a.rotation = m.rotationDeg;
        }
      }
      if (!isMoving(m) && manualControl.has(id)) {
        // Chegou: libera de novo para patrulha automática.
        manualControl.delete(id);
      }
    }
  }

  return {
    port: server.port,
    close: async () => {
      clearInterval(timer);
      await server.close();
    },
  };
}
