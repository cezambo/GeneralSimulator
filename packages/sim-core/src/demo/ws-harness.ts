/**
 * Harness WebSocket para a demo live-serve: helpers + cenários headless.
 * Agentes / CI verificam comportamento sem Godot.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { CHAIR_ID } from '../spike/room.js';
import { startLiveServe, type LiveServeHandle } from './live-serve.js';

const PKG_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
export const HARNESS_REPORT_PATH = join(PKG_ROOT, '.local', 'harness-report.json');

export type TileSnap = {
  x: number;
  y: number;
  type: string;
  materialId: string;
  state?: Record<string, unknown>;
  states?: { type: string; intensity: number }[];
  integrity?: number;
};

export type WorldView = {
  mode?: string;
  tiles: Map<string, TileSnap>;
  objects: {
    id: string;
    defId: string;
    pos: { x: number; y: number };
    states?: { type: string; intensity: number }[];
    integrity?: number;
  }[];
  agents: {
    id: string;
    pos: { x: number; y: number };
    motion?: { path: { x: number; y: number }[]; speed: number };
  }[];
};

export type EnvelopeMsg = {
  v: number;
  type: string;
  seq: number;
  simTime: number;
  reqId?: string;
  payload: Record<string, unknown>;
};

export interface ScenarioResult {
  name: string;
  ok: boolean;
  detail: string;
}

export interface HarnessReport {
  ok: boolean;
  failed: string[];
  startedAt: string;
  scenarios: ScenarioResult[];
}

type WaitPred = (env: EnvelopeMsg) => boolean;

export class HarnessClient {
  readonly ws: WebSocket;
  #seq = 0;
  #closed = false;
  #view: WorldView = { tiles: new Map(), objects: [], agents: [] };
  #waiters: { pred: WaitPred; resolve: (e: EnvelopeMsg) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }[] =
    [];
  #inbox: EnvelopeMsg[] = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on('message', (data) => {
      const env = JSON.parse(data.toString()) as EnvelopeMsg;
      this.#apply(env);
      this.#inbox.push(env);
      const pending = [...this.#waiters];
      for (const w of pending) {
        if (!w.pred(env)) continue;
        clearTimeout(w.timer);
        this.#waiters = this.#waiters.filter((x) => x !== w);
        w.resolve(env);
      }
    });
    ws.on('close', () => {
      this.#closed = true;
      for (const w of this.#waiters) {
        clearTimeout(w.timer);
        w.reject(new Error('websocket closed'));
      }
      this.#waiters = [];
    });
  }

  static connect(url: string, timeoutMs = 5000): Promise<HarnessClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`connect timeout: ${url}`));
      }, timeoutMs);
      ws.on('open', () => {
        clearTimeout(timer);
        resolve(new HarnessClient(ws));
      });
      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  get view(): WorldView {
    return this.#view;
  }

  latestSnapshot(): WorldView {
    return this.#view;
  }

  tileAt(x: number, y: number): TileSnap | undefined {
    return this.#view.tiles.get(`${x},${y}`);
  }

  hasState(x: number, y: number, type: string): boolean {
    return Boolean(this.tileAt(x, y)?.states?.some((s) => s.type === type && s.intensity > 0));
  }

  /** Intensidade do estado `type` na célula, ou 0 se ausente. */
  stateIntensity(x: number, y: number, type: string): number {
    const st = this.tileAt(x, y)?.states?.find((s) => s.type === type);
    return st && st.intensity > 0 ? st.intensity : 0;
  }

  burningCells(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const t of this.#view.tiles.values()) {
      if (t.states?.some((s) => s.type === 'burning' && s.intensity > 0)) {
        out.push({ x: t.x, y: t.y });
      }
    }
    return out;
  }

  sendCmd(type: string, payload: Record<string, unknown> = {}, reqId?: string): number {
    if (this.#closed) throw new Error('sendCmd after close');
    this.#seq += 1;
    const env = {
      v: 1,
      type,
      seq: this.#seq,
      simTime: 0,
      payload,
      ...(reqId ? { reqId } : {}),
    };
    this.ws.send(JSON.stringify(env));
    return this.#seq;
  }

  waitFor(typeOrPred: string | WaitPred, timeoutMs = 8000): Promise<EnvelopeMsg> {
    const pred: WaitPred =
      typeof typeOrPred === 'string' ? (e) => e.type === typeOrPred : typeOrPred;
    for (const env of this.#inbox) {
      if (pred(env)) return Promise.resolve(env);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiters = this.#waiters.filter((w) => w.timer !== timer);
        reject(new Error(`waitFor timeout (${timeoutMs}ms)`));
      }, timeoutMs);
      this.#waiters.push({ pred, resolve, reject, timer });
    });
  }

  async waitUntil(pred: () => boolean, timeoutMs = 8000, label = 'condition'): Promise<void> {
    const start = Date.now();
    if (pred()) return;
    while (Date.now() - start < timeoutMs) {
      try {
        await this.waitFor(() => pred(), Math.min(500, timeoutMs - (Date.now() - start)));
        if (pred()) return;
      } catch {
        if (pred()) return;
      }
    }
    throw new Error(`waitUntil timeout: ${label}`);
  }

  close(): void {
    if (!this.#closed) this.ws.close();
  }

  #apply(env: EnvelopeMsg): void {
    if (env.type === 'world.snapshot') {
      const p = env.payload as {
        mode?: string;
        tiles?: TileSnap[];
        objects?: WorldView['objects'];
        agents?: WorldView['agents'];
      };
      if (p.mode !== undefined) this.#view.mode = p.mode;
      else delete this.#view.mode;
      this.#view.tiles = new Map((p.tiles ?? []).map((t) => [`${t.x},${t.y}`, t]));
      this.#view.objects = p.objects ?? [];
      this.#view.agents = p.agents ?? [];
      return;
    }
    if (env.type === 'world.delta') {
      const p = env.payload as {
        tiles?: TileSnap[];
        objectsUpsert?: WorldView['objects'];
        objectsRemove?: string[];
        agents?: WorldView['agents'];
      };
      for (const t of p.tiles ?? []) this.#view.tiles.set(`${t.x},${t.y}`, t);
      if (p.objectsUpsert || p.objectsRemove) {
        const byId = new Map(this.#view.objects.map((o) => [o.id, o]));
        for (const o of p.objectsUpsert ?? []) byId.set(o.id, o);
        for (const id of p.objectsRemove ?? []) byId.delete(id);
        this.#view.objects = [...byId.values()];
      }
      if (p.agents) this.#view.agents = p.agents;
      return;
    }
    if (env.type === 'agents.update') {
      const p = env.payload as { agents?: WorldView['agents'] };
      if (p.agents) this.#view.agents = p.agents;
    }
  }
}

export async function withLiveServe<T>(
  opts: { fire?: boolean; seed?: string; tickMs?: number; frameMs?: number } | undefined,
  fn: (ctx: { port: number; url: string; handle: LiveServeHandle }) => Promise<T>,
): Promise<T> {
  const prevFire = process.env['SIM_FIRE'];
  if (opts?.fire === false) process.env['SIM_FIRE'] = '0';
  else if (opts?.fire === true) process.env['SIM_FIRE'] = '1';

  let handle: LiveServeHandle | undefined;
  try {
    handle = await startLiveServe({
      port: 0,
      ...(opts?.fire !== undefined ? { fire: opts.fire } : {}),
      ...(opts?.seed !== undefined ? { seed: opts.seed } : {}),
      tickMs: opts?.tickMs ?? 40,
      frameMs: opts?.frameMs ?? opts?.tickMs ?? 40,
    });
    const url = `ws://127.0.0.1:${handle.port}`;
    return await fn({ port: handle.port, url, handle });
  } finally {
    if (handle) await handle.close();
    if (prevFire === undefined) delete process.env['SIM_FIRE'];
    else process.env['SIM_FIRE'] = prevFire;
  }
}

export async function connectClient(url: string): Promise<HarnessClient> {
  return HarnessClient.connect(url);
}

export function writeHarnessReport(report: HarnessReport, path = HARNESS_REPORT_PATH): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2), 'utf8');
  return path;
}

export type HarnessScenario = {
  name: string;
  run: () => Promise<string>;
};

/** Molhar célula em chamas: apaga ali; wet não teleporta fogo. */
async function scenarioWetNoTeleport(): Promise<string> {
  return withLiveServe({ fire: true, seed: 'harness-wet', tickMs: 35 }, async ({ url }) => {
    const c = await connectClient(url);
    try {
      await c.waitFor('world.snapshot');
      await c.waitUntil(() => c.hasState(1, 1, 'burning'), 12000, 'foco em (1,1)');
      const before = new Set(c.burningCells().map((p) => `${p.x},${p.y}`));
      c.sendCmd('cmd.tool.apply', { effect: 'wet', cells: [{ x: 1, y: 1 }] }, 'wet1');
      await c.waitFor((e) => e.type === 'res.ok' && e.reqId === 'wet1');
      // Delta imediato: célula molhada sem burning; sem novos focos “mágicos”.
      await c.waitUntil(() => c.hasState(1, 1, 'wet') && !c.hasState(1, 1, 'burning'), 4000, 'apagou (1,1)');
      const afterImmediate = new Set(c.burningCells().map((p) => `${p.x},${p.y}`));
      for (const key of afterImmediate) {
        if (key === '1,1') throw new Error('burning ainda em (1,1) após wet');
        if (!before.has(key)) {
          throw new Error(`wet teleportou fogo para ${key}`);
        }
      }
      // Um pouco de tempo: a célula molhada não reacende sozinha já.
      await sleep(400);
      if (c.hasState(1, 1, 'burning')) throw new Error('(1,1) reacendeu após wet');
      return `apagou (1,1); burning antes=${before.size} depois=${c.burningCells().length}`;
    } finally {
      c.close();
    }
  });
}

/** Porta fechada isola; abrir permite A→B (via paint + toggleDoor). */
async function scenarioDoorBlocksThenOpens(): Promise<string> {
  return withLiveServe({ fire: true, seed: 'harness-door', tickMs: 30 }, async ({ url }) => {
    const c = await connectClient(url);
    try {
      await c.waitFor('world.snapshot');
      // Pausa antes do alastramento: monta corredor A(1,1)–porta(2,1)–B(3,1).
      c.sendCmd('cmd.sim.setMode', { mode: 'construction' }, 'm1');
      await c.waitUntil(() => c.view.mode === 'construction', 5000, 'construction');

      const stoneWalls = [
        { x: 1, y: 2 },
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 4, y: 1 },
        { x: 4, y: 2 },
      ];
      c.sendCmd(
        'cmd.build.paintTile',
        { tileType: 'wall', materialId: 'pedra', cells: stoneWalls },
        'paintW',
      );
      await c.waitFor((e) => e.type === 'res.ok' && e.reqId === 'paintW');
      c.sendCmd(
        'cmd.build.paintTile',
        { tileType: 'door', materialId: 'pinho', cells: [{ x: 2, y: 1 }] },
        'paintD',
      );
      await c.waitFor((e) => e.type === 'res.ok' && e.reqId === 'paintD');
      c.sendCmd(
        'cmd.build.paintTile',
        { tileType: 'floor', materialId: 'pinho', cells: [{ x: 3, y: 1 }] },
        'paintB',
      );
      await c.waitFor((e) => e.type === 'res.ok' && e.reqId === 'paintB');

      c.sendCmd('cmd.sim.setMode', { mode: 'normal' }, 'm2');
      await c.waitUntil(() => c.view.mode === 'normal', 5000, 'normal');

      // Paint abre a porta — fecha para o teste de isolamento.
      const door = c.tileAt(2, 1);
      if (door?.type !== 'door') throw new Error('porta não pintada em (2,1)');
      if (door.state?.isOpen) {
        c.sendCmd('cmd.world.toggleDoor', { x: 2, y: 1 }, 'closeD');
        await c.waitFor((e) => e.type === 'res.ok' && e.reqId === 'closeD');
      }
      await c.waitUntil(() => c.tileAt(2, 1)?.state?.isOpen !== true, 3000, 'porta fechada');

      await c.waitUntil(() => c.hasState(1, 1, 'burning'), 12000, 'A a arder');
      // Janela curta: com tickMs baixo, ~100 ticks consomem o piso — não esperar demais.
      const closedDeadline = Date.now() + 900;
      while (Date.now() < closedDeadline) {
        if (c.hasState(3, 1, 'burning') || c.hasState(2, 1, 'burning')) {
          throw new Error('fogo saltou com porta fechada');
        }
        await sleep(80);
      }
      if (!c.hasState(1, 1, 'burning')) {
        throw new Error('foco em A apagou antes de abrir a porta');
      }

      c.sendCmd('cmd.world.toggleDoor', { x: 2, y: 1 }, 'openD');
      await c.waitFor((e) => e.type === 'res.ok' && e.reqId === 'openD');
      // Porta ou B — propaga pela aresta aberta.
      await c.waitUntil(
        () => c.hasState(2, 1, 'burning') || c.hasState(3, 1, 'burning'),
        15000,
        'fogo atravessa porta aberta',
      );
      const crossed = c.hasState(3, 1, 'burning') ? 'B(3,1)' : 'porta(2,1)';
      return `fechada bloqueia; aberta alcança ${crossed}`;
    } finally {
      c.close();
    }
  });
}

/** Caminho evita burning, ou motion some quando o fogo tapa a rota. */
async function scenarioMoverAvoidsOrClears(): Promise<string> {
  return withLiveServe({ fire: true, seed: 'harness-mover', tickMs: 35 }, async ({ url }) => {
    const c = await connectClient(url);
    try {
      await c.waitFor('world.snapshot');
      await c.waitUntil(() => c.hasState(1, 1, 'burning'), 12000, 'fogo');

      // Destino longe: se houver desvio, o path não pisa chamas.
      c.sendCmd('cmd.agent.move', { agentId: 'ag_lia', x: 10, y: 8 }, 'mv1');
      const res = await c.waitFor(
        (e) => (e.type === 'res.ok' || e.type === 'res.error') && e.reqId === 'mv1',
        5000,
      );

      if (res.type === 'res.error') {
        // Sem caminho livre de fogo — ok (bloqueio).
        const code = String(res.payload['code'] ?? '');
        return `move rejeitado (${code || 'err'}) com fogo activo`;
      }

      await c.waitUntil(() => {
        const lia = c.view.agents.find((a) => a.id === 'ag_lia');
        return Boolean(lia?.motion?.path && lia.motion.path.length > 0);
      }, 5000, 'motion');

      const lia = c.view.agents.find((a) => a.id === 'ag_lia')!;
      const path = lia.motion!.path;
      const burning = new Set(c.burningCells().map((p) => `${p.x},${p.y}`));
      const stepsOnFire = path.filter((p) => burning.has(`${p.x},${p.y}`));
      // Pode incluir a célula actual se o agente já estiver no fogo; só waypoints futuros.
      const futureOnFire = stepsOnFire.slice(1);
      if (futureOnFire.length === 0) {
        return `path len=${path.length} evita burning`;
      }

      // Se o path ainda atravessa fogo, espera repath/clear.
      await c.waitUntil(() => {
        const a = c.view.agents.find((x) => x.id === 'ag_lia');
        const p = a?.motion?.path ?? [];
        if (p.length === 0) return true;
        const burn = new Set(c.burningCells().map((cell) => `${cell.x},${cell.y}`));
        return !p.slice(1).some((step) => burn.has(`${step.x},${step.y}`));
      }, 10000, 'repath ou clear');
      const after = c.view.agents.find((a) => a.id === 'ag_lia');
      const p2 = after?.motion?.path ?? [];
      if (p2.length === 0) return 'motion cleared quando fogo bloqueou';
      return `repath sem burning (len=${p2.length})`;
    } finally {
      c.close();
    }
  });
}

/** Parede pintada + wet: continua parede com wet. */
async function scenarioPaintedWallWet(): Promise<string> {
  return withLiveServe({ fire: false, seed: 'harness-wall-wet', tickMs: 40 }, async ({ url }) => {
    const c = await connectClient(url);
    try {
      await c.waitFor('world.snapshot');
      c.sendCmd('cmd.sim.setMode', { mode: 'construction' }, 'c1');
      await c.waitUntil(() => c.view.mode === 'construction', 5000, 'construction');
      c.sendCmd(
        'cmd.build.paintTile',
        { tileType: 'wall', materialId: 'pedra', cells: [{ x: 4, y: 4 }] },
        'pw',
      );
      await c.waitFor((e) => e.type === 'res.ok' && e.reqId === 'pw');
      await c.waitUntil(() => c.tileAt(4, 4)?.type === 'wall', 3000, 'wall');
      c.sendCmd('cmd.sim.setMode', { mode: 'normal' }, 'c2');
      await c.waitUntil(() => c.view.mode === 'normal', 5000, 'normal');
      c.sendCmd('cmd.tool.apply', { effect: 'wet', cells: [{ x: 4, y: 4 }] }, 'wetW');
      await c.waitFor((e) => e.type === 'res.ok' && e.reqId === 'wetW');
      await c.waitUntil(() => c.hasState(4, 4, 'wet'), 4000, 'wet');
      const t = c.tileAt(4, 4);
      if (!t || t.type !== 'wall' || t.materialId !== 'pedra') {
        throw new Error(`esperava wall/pedra, got ${t?.type}/${t?.materialId}`);
      }
      if (c.hasState(4, 4, 'burning')) throw new Error('wet não deveria acender');
      return 'wall+pedra+wet em (4,4)';
    } finally {
      c.close();
    }
  });
}

/** Móvel consumido deixa cinza/carvão (se o foco o alcançar a tempo). */
async function scenarioFurnitureAsh(): Promise<string> {
  return withLiveServe({ fire: true, seed: 'harness-ash', tickMs: 25 }, async ({ url }) => {
    const c = await connectClient(url);
    try {
      await c.waitFor('world.snapshot');
      c.sendCmd('cmd.sim.setMode', { mode: 'construction' }, 'a1');
      await c.waitUntil(() => c.view.mode === 'construction', 5000, 'construction');
      c.sendCmd(
        'cmd.build.moveObject',
        { objectId: CHAIR_ID, pos: { x: 1.5, y: 1.5 } },
        'moveChair',
      );
      await c.waitFor((e) => e.type === 'res.ok' && e.reqId === 'moveChair');
      c.sendCmd('cmd.sim.setMode', { mode: 'normal' }, 'a2');
      await c.waitUntil(() => c.view.mode === 'normal', 5000, 'normal');
      await c.waitUntil(() => c.hasState(1, 1, 'burning'), 12000, 'fogo');

      await c.waitUntil(() => !c.view.objects.some((o) => o.id === CHAIR_ID), 20000, 'cadeira consumida');
      await c.waitUntil(() => {
        const mat = c.tileAt(1, 1)?.materialId;
        return mat === 'cinza' || mat === 'carvao' || mat === 'lascas';
      }, 8000, 'resíduo no chão');
      const mat = c.tileAt(1, 1)!.materialId;
      return `cadeira removida; resíduo ${mat} em (1,1)`;
    } finally {
      c.close();
    }
  });
}

/**
 * Poça (I alto via cmd.tool.apply, default ~90) resiste re-ignição; sob calor
 * a fase alta dura mais que a fase baixa. Comparação directa I=15 vs I=90
 * está em `wet-light-vs-heavy-under-heat`.
 */
async function scenarioWetHighResistsReignition(): Promise<string> {
  return withLiveServe({ fire: true, seed: 'harness-wet-hi', tickMs: 30 }, async ({ url }) => {
    const c = await connectClient(url);
    try {
      await c.waitFor('world.snapshot');
      await c.waitUntil(() => c.hasState(1, 1, 'burning'), 12000, 'foco em (1,1)');

      // Vizinho a arder = fonte de calor depois de molhar o foco.
      const nbrs: [number, number][] = [
        [2, 1],
        [1, 2],
        [0, 1],
        [1, 0],
      ];
      const nbrDeadline = Date.now() + 9000;
      let hasNeighborFire = false;
      while (Date.now() < nbrDeadline) {
        hasNeighborFire = nbrs.some(([x, y]) => c.hasState(x, y, 'burning'));
        if (hasNeighborFire) break;
        await sleep(80);
      }

      c.sendCmd('cmd.tool.apply', { effect: 'wet', cells: [{ x: 1, y: 1 }] }, 'wetHi');
      await c.waitFor((e) => e.type === 'res.ok' && e.reqId === 'wetHi');
      await c.waitUntil(
        () => c.hasState(1, 1, 'wet') && !c.hasState(1, 1, 'burning'),
        4000,
        'apagou com wet',
      );

      const i0 = c.stateIntensity(1, 1, 'wet');
      if (i0 < 70) throw new Error(`esperava wet alto (I≥70), got ${i0}`);

      let highMs = 0;
      let lowMs = 0;
      let sawLow = false;
      let last = Date.now();
      const deadline = last + 22000;

      while (Date.now() < deadline) {
        const now = Date.now();
        const dt = now - last;
        last = now;
        const iw = c.stateIntensity(1, 1, 'wet');

        // Enquanto a poça ainda é “alta”, não pode reacender.
        if (iw >= 40 && c.hasState(1, 1, 'burning')) {
          throw new Error(`re-ignição com wet ainda I=${iw}`);
        }

        if (iw >= 50) highMs += dt;
        else if (iw > 0 && iw < 25) {
          sawLow = true;
          lowMs += dt;
        }

        if (iw <= 0 && (sawLow || highMs > 0)) break;
        await sleep(40);
      }

      if (highMs < 350) {
        throw new Error(`fase alta do wet durou só ${highMs}ms (I0=${i0})`);
      }

      // Com calor de vizinho, a fase baixa deve ser bem mais curta que a alta.
      if (hasNeighborFire && sawLow && lowMs > 0) {
        if (highMs < lowMs * 1.5) {
          throw new Error(
            `fase alta (${highMs}ms) não durou mais que baixa (${lowMs}ms) sob calor`,
          );
        }
        return `I0=${i0}; highMs=${highMs} > lowMs=${lowMs} (vizinho a arder)`;
      }

      return `I0=${i0}; wet alto ${highMs}ms sem re-ignição${hasNeighborFire ? ' (com calor vizinho)' : ''}`;
    } finally {
      c.close();
    }
  });
}

/** cmd.tool.apply extinguish: remove burning na célula alvo. */
async function scenarioExtinguishClearsBurning(): Promise<string> {
  return withLiveServe({ fire: true, seed: 'harness-extinguish', tickMs: 35 }, async ({ url }) => {
    const c = await connectClient(url);
    try {
      await c.waitFor('world.snapshot');
      await c.waitUntil(() => c.hasState(1, 1, 'burning'), 12000, 'foco em (1,1)');
      c.sendCmd('cmd.tool.apply', { effect: 'extinguish', cells: [{ x: 1, y: 1 }] }, 'ext1');
      await c.waitFor((e) => e.type === 'res.ok' && e.reqId === 'ext1');
      await c.waitUntil(() => !c.hasState(1, 1, 'burning'), 4000, 'apagou burning');
      if (c.hasState(1, 1, 'burning')) throw new Error('burning ainda em (1,1) após extinguish');
      return 'extinguish limpou burning em (1,1)';
    } finally {
      c.close();
    }
  });
}

/**
 * payload.intensity no cmd.tool.apply: orvalho (15) vs poça (90) sob calor do foco.
 * Após N ticks com (1,1) a arder, o leve seca e o pesado permanece wet.
 */
async function scenarioWetLightVsHeavyUnderHeat(): Promise<string> {
  return withLiveServe({ fire: true, seed: 'harness-wet-intensity', tickMs: 30 }, async ({ url }) => {
    const c = await connectClient(url);
    try {
      await c.waitFor('world.snapshot');
      await c.waitUntil(() => c.hasState(1, 1, 'burning'), 12000, 'foco em (1,1)');

      // Pouco calor no foco — sem esperar tanto que o fogo engula os vizinhos.
      await sleep(350);
      if (!c.hasState(1, 1, 'burning')) {
        throw new Error('foco (1,1) apagou antes de aplicar wet');
      }

      // Vizinhos preferidos; se já ardem, afasta 1 tile (ainda sob influência do foco).
      let light = { x: 2, y: 1 };
      let heavy = { x: 1, y: 2 };
      if (c.hasState(light.x, light.y, 'burning')) light = { x: 3, y: 1 };
      if (c.hasState(heavy.x, heavy.y, 'burning')) heavy = { x: 1, y: 3 };
      for (const cell of [light, heavy]) {
        if (!c.hasState(cell.x, cell.y, 'burning')) continue;
        const rid = `ex-${cell.x}-${cell.y}`;
        c.sendCmd('cmd.tool.apply', { effect: 'extinguish', cells: [cell] }, rid);
        await c.waitFor((e) => e.type === 'res.ok' && e.reqId === rid);
        await c.waitUntil(
          () => !c.hasState(cell.x, cell.y, 'burning'),
          4000,
          `apagou alvo (${cell.x},${cell.y})`,
        );
      }

      c.sendCmd(
        'cmd.tool.apply',
        { effect: 'wet', intensity: 15, cells: [light] },
        'wetLight',
      );
      await c.waitFor((e) => e.type === 'res.ok' && e.reqId === 'wetLight');
      c.sendCmd(
        'cmd.tool.apply',
        { effect: 'wet', intensity: 90, cells: [heavy] },
        'wetHeavy',
      );
      await c.waitFor((e) => e.type === 'res.ok' && e.reqId === 'wetHeavy');

      await c.waitUntil(() => c.hasState(light.x, light.y, 'wet'), 5000, 'wet leve');
      await c.waitUntil(() => c.hasState(heavy.x, heavy.y, 'wet'), 5000, 'wet pesado');

      const iLight0 = c.stateIntensity(light.x, light.y, 'wet');
      const iHeavy0 = c.stateIntensity(heavy.x, heavy.y, 'wet');
      if (iLight0 <= 0 || iLight0 > 35) {
        throw new Error(`wet leve I0=${iLight0}, esperava ~15`);
      }
      if (iHeavy0 < 70) {
        throw new Error(`wet pesado I0=${iHeavy0}, esperava ~90`);
      }

      // N ticks sob calor do foco (substrate: I≈15 some cedo; I≈90 aguenta).
      const nTicks = 14;
      const deadline = Date.now() + nTicks * 30 + 200;
      while (Date.now() < deadline) {
        if (!c.hasState(1, 1, 'burning') && c.burningCells().length === 0) {
          throw new Error('sem fonte de calor durante a comparação');
        }
        await sleep(40);
      }

      const lightWet = c.hasState(light.x, light.y, 'wet');
      const heavyWet = c.hasState(heavy.x, heavy.y, 'wet');
      const iHeavy = c.stateIntensity(heavy.x, heavy.y, 'wet');
      if (lightWet) {
        throw new Error(
          `wet leve ainda presente após ~${nTicks} ticks (I=${c.stateIntensity(light.x, light.y, 'wet')})`,
        );
      }
      if (!heavyWet) {
        throw new Error(`wet pesado evaporou cedo demais após ~${nTicks} ticks`);
      }
      return `I0 light=${iLight0} heavy=${iHeavy0}; após ~${nTicks} ticks light seco, heavy I=${iHeavy}`;
    } finally {
      c.close();
    }
  });
}

/** cmd.sim.reset: sala limpa + foco de fogo de novo em (1,1). */
async function scenarioSimResetFreshFire(): Promise<string> {
  return withLiveServe({ fire: true, seed: 'harness-reset', tickMs: 35 }, async ({ url }) => {
    const c = await connectClient(url);
    try {
      await c.waitFor('world.snapshot');
      await c.waitUntil(() => c.hasState(1, 1, 'burning'), 12000, 'fogo inicial');

      // Suja a sala: parede em (5,5) que o reset deve apagar.
      c.sendCmd('cmd.sim.setMode', { mode: 'construction' }, 'r1');
      await c.waitUntil(() => c.view.mode === 'construction', 5000, 'construction');
      c.sendCmd(
        'cmd.build.paintTile',
        { tileType: 'wall', materialId: 'pedra', cells: [{ x: 5, y: 5 }] },
        'paintDirty',
      );
      await c.waitFor((e) => e.type === 'res.ok' && e.reqId === 'paintDirty');
      await c.waitUntil(() => c.tileAt(5, 5)?.type === 'wall', 3000, 'parede suja');

      c.sendCmd('cmd.sim.reset', {}, 'reset1');
      const res = await c.waitFor(
        (e) => (e.type === 'res.ok' || e.type === 'res.error') && e.reqId === 'reset1',
        5000,
      );
      if (res.type === 'res.error') {
        const code = String(res.payload['code'] ?? '');
        throw new Error(`cmd.sim.reset rejeitado (${code || 'err'})`);
      }

      await c.waitUntil(() => {
        const dirty = c.tileAt(5, 5);
        // Sala fresca: já não é a parede pintada; modo normal.
        return dirty?.type !== 'wall' && c.view.mode === 'normal';
      }, 8000, 'sala limpa após reset');

      await c.waitUntil(() => c.hasState(1, 1, 'burning'), 12000, 'fogo em (1,1) após reset');

      const focus = c.tileAt(1, 1);
      if (!focus) throw new Error('sem tile em (1,1) após reset');
      return `reset ok; (5,5)=${c.tileAt(5, 5)?.type ?? '?'} mode=${c.view.mode}; fogo (1,1)`;
    } finally {
      c.close();
    }
  });
}

/** cmd.tool.apply ignite: põe burning num piso (sem foco automático da demo). */
async function scenarioToolIgniteSetsBurning(): Promise<string> {
  return withLiveServe({ fire: false, seed: 'harness-tool-ignite', tickMs: 40 }, async ({ url }) => {
    const c = await connectClient(url);
    try {
      await c.waitFor('world.snapshot');
      const cell = { x: 4, y: 4 };
      const tile = c.tileAt(cell.x, cell.y);
      if (!tile || tile.type !== 'floor') {
        throw new Error(`esperava floor em (${cell.x},${cell.y}), got ${tile?.type ?? 'none'}`);
      }
      if (c.hasState(cell.x, cell.y, 'burning')) {
        throw new Error(`(${cell.x},${cell.y}) já burning antes do ignite (fire=false)`);
      }

      c.sendCmd('cmd.tool.apply', { effect: 'ignite', cells: [cell] }, 'ign1');
      const res = await c.waitFor(
        (e) => (e.type === 'res.ok' || e.type === 'res.error') && e.reqId === 'ign1',
        5000,
      );
      if (res.type === 'res.error') {
        const code = String(res.payload['code'] ?? '');
        throw new Error(`ignite rejeitado (${code || 'err'})`);
      }

      await c.waitUntil(() => c.hasState(cell.x, cell.y, 'burning'), 4000, 'burning após ignite');
      const i = c.stateIntensity(cell.x, cell.y, 'burning');
      return `ignite → burning I=${i} em (${cell.x},${cell.y}) floor`;
    } finally {
      c.close();
    }
  });
}

/**
 * cmd.tool.apply smoke: adiciona smoky (wrapper de protocolo → estado smoky;
 * não há effectId `smoke` no vocabulário R-015).
 */
async function scenarioToolSmokeAddsSmoky(): Promise<string> {
  return withLiveServe({ fire: false, seed: 'harness-tool-smoke', tickMs: 40 }, async ({ url }) => {
    const c = await connectClient(url);
    try {
      await c.waitFor('world.snapshot');
      const cell = { x: 5, y: 5 };
      const tile = c.tileAt(cell.x, cell.y);
      if (!tile || tile.type !== 'floor') {
        throw new Error(`esperava floor em (${cell.x},${cell.y}), got ${tile?.type ?? 'none'}`);
      }
      if (c.hasState(cell.x, cell.y, 'smoky')) {
        throw new Error(`(${cell.x},${cell.y}) já smoky antes do smoke`);
      }

      c.sendCmd('cmd.tool.apply', { effect: 'smoke', cells: [cell] }, 'smk1');
      const res = await c.waitFor(
        (e) => (e.type === 'res.ok' || e.type === 'res.error') && e.reqId === 'smk1',
        5000,
      );
      if (res.type === 'res.error') {
        const code = String(res.payload['code'] ?? '');
        throw new Error(`smoke rejeitado (${code || 'err'})`);
      }

      await c.waitUntil(() => c.hasState(cell.x, cell.y, 'smoky'), 4000, 'smoky após smoke');
      const i = c.stateIntensity(cell.x, cell.y, 'smoky');
      return `smoke → smoky I=${i} em (${cell.x},${cell.y})`;
    } finally {
      c.close();
    }
  });
}

export const HARNESS_SCENARIOS: HarnessScenario[] = [
  { name: 'wet-no-teleport', run: scenarioWetNoTeleport },
  { name: 'door-blocks-then-opens', run: scenarioDoorBlocksThenOpens },
  { name: 'mover-avoids-or-clears', run: scenarioMoverAvoidsOrClears },
  { name: 'painted-wall-wet', run: scenarioPaintedWallWet },
  { name: 'furniture-ash', run: scenarioFurnitureAsh },
  { name: 'wet-high-resists-reignition', run: scenarioWetHighResistsReignition },
  { name: 'extinguish-clears-burning', run: scenarioExtinguishClearsBurning },
  { name: 'wet-light-vs-heavy-under-heat', run: scenarioWetLightVsHeavyUnderHeat },
  { name: 'sim-reset-fresh-fire', run: scenarioSimResetFreshFire },
  { name: 'tool-ignite-sets-burning', run: scenarioToolIgniteSetsBurning },
  { name: 'tool-smoke-adds-smoky', run: scenarioToolSmokeAddsSmoky },
];

export async function runHarnessScenarios(
  scenarios: HarnessScenario[] = HARNESS_SCENARIOS,
): Promise<HarnessReport> {
  const startedAt = new Date().toISOString();
  const results: ScenarioResult[] = [];
  for (const s of scenarios) {
    try {
      const detail = await s.run();
      results.push({ name: s.name, ok: true, detail });
    } catch (err) {
      results.push({
        name: s.name,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const failed = results.filter((r) => !r.ok).map((r) => r.name);
  return { ok: failed.length === 0, failed, startedAt, scenarios: results };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
