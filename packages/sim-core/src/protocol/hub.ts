/**
 * Hub do protocolo: clientes, seq, snapshot na conexão, comandos. X-007.
 *
 * A rede fica fora — `ProtocolSink` envia bytes. Assim o teste de reconexão
 * não depende de porta real, e o servidor WebSocket só adapta o transporte.
 */

import type { Simulation } from '../state/index.js';
import type { ObjectDef } from '../types/domain.js';
import type { World } from '../world/grid.js';
import type { SimClock } from '../world/clock.js';
import { BuildHistory } from './build.js';
import { makeEnvelope, makeError, parseEnvelope, ProtocolError } from './envelope.js';
import {
  agentsUpdatePayload,
  buildWorldSnapshot,
  clockPayload,
  tileCellSnapshot,
  type AgentMotionLookup,
} from './snapshot.js';
import type {
  ClientRole,
  Envelope,
  SimMode,
  WorldDeltaPayload,
} from './types.js';

export interface ProtocolSink {
  readonly id: string;
  readonly role: ClientRole;
  send(msg: Envelope): void;
  /** Se ausente, recebe tudo. Godot filtra o que não tem representação visual. */
  readonly subscriptions?: ReadonlySet<string>;
}

export type AgentMoveHandler = (
  agentId: string,
  goal: { x: number; y: number },
) => { ok: true } | { ok: false; code: string; message: string };

/** Ferramentas GM em tempo real (água / apagar fogo). */
export type ToolEffectId = 'wet' | 'extinguish';

export type ToolApplyHandler = (
  effect: ToolEffectId,
  cells: readonly { x: number; y: number }[],
  /** Intensidade opcional do payload (0–100). */
  intensity?: number,
) => WorldDeltaPayload;

export type SaveLoadHandler = (slot: string) => void;

/** Reseed da sala demo (live-serve) — mapa limpo + foco de fogo de novo. */
export type ResetHandler = (opts?: { seed?: string }) => void;

export interface ProtocolHubOptions {
  readonly sim: Simulation;
  readonly world: World;
  readonly clock: SimClock;
  readonly mode?: SimMode;
  /** Trajetórias para `agents.update` / snapshot (§4.2). */
  readonly motionOf?: AgentMotionLookup;
  /** Clique-para-andar no cliente fino. */
  readonly onAgentMove?: AgentMoveHandler;
  /** Catálogo ObjectDef — necessário para placeObject. */
  readonly objects?: ReadonlyMap<string, ObjectDef>;
  /** Geometria mudou (parede/porta/móvel) — revalidar caminhos. */
  readonly onGeometryChanged?: () => void;
  /** Ferramentas de substrato fora do modo construção. */
  readonly onToolApply?: ToolApplyHandler;
  /** Persistência X-003 / U-013 — a sessão (live-serve) escreve o arquivo. */
  readonly onSave?: SaveLoadHandler;
  readonly onLoad?: SaveLoadHandler;
  /** Reinicia a sala demo sem derrubar o WebSocket. */
  readonly onReset?: ResetHandler;
}

export class ProtocolHub {
  #sim: Simulation;
  #world: World;
  #clock: SimClock;
  #mode: SimMode;
  readonly #motionOf: AgentMotionLookup | undefined;
  readonly #onAgentMove: AgentMoveHandler | undefined;
  readonly #onGeometryChanged: (() => void) | undefined;
  readonly #onToolApply: ToolApplyHandler | undefined;
  readonly #onSave: SaveLoadHandler | undefined;
  readonly #onLoad: SaveLoadHandler | undefined;
  readonly #onReset: ResetHandler | undefined;
  readonly #objects: ReadonlyMap<string, ObjectDef> | undefined;
  #build: BuildHistory;
  readonly #clients = new Map<string, ProtocolSink>();
  #seq = 0;
  /** Seq por cliente (mensagens inbound). */
  readonly #inboundSeq = new Map<string, number>();

  constructor(opts: ProtocolHubOptions) {
    this.#sim = opts.sim;
    this.#world = opts.world;
    this.#clock = opts.clock;
    this.#mode = opts.mode ?? 'normal';
    this.#motionOf = opts.motionOf;
    this.#onAgentMove = opts.onAgentMove;
    this.#onGeometryChanged = opts.onGeometryChanged;
    this.#onToolApply = opts.onToolApply;
    this.#onSave = opts.onSave;
    this.#onLoad = opts.onLoad;
    this.#onReset = opts.onReset;
    this.#objects = opts.objects;
    this.#build = new BuildHistory(opts.sim, opts.world, opts.objects);
  }

  /**
   * Troca o trio sim/mundo/relógio após um load. Clientes já conectados
   * recebem snapshot novo via `broadcastSnapshot()`.
   */
  rebind(opts: { sim: Simulation; world: World; clock: SimClock }): void {
    this.#sim = opts.sim;
    this.#world = opts.world;
    this.#clock = opts.clock;
    this.#build = new BuildHistory(opts.sim, opts.world, this.#objects);
  }

  get clientCount(): number {
    return this.#clients.size;
  }

  get mode(): SimMode {
    return this.#mode;
  }

  /** Snapshot fresco para todos (ex.: depois de acender o fogo). */
  broadcastSnapshot(): void {
    this.broadcast(
      'world.snapshot',
      buildWorldSnapshot(this.#sim, this.#world, this.#clock, this.#mode, this.#motionOf),
    );
  }

  /**
   * Conecta e manda `world.snapshot` completo.
   * Reconexão = nova conexão: o cliente nunca precisa de delta acumulado. X-007.
   */
  connect(client: ProtocolSink): void {
    this.#clients.set(client.id, client);
    this.#inboundSeq.set(client.id, 0);
    this.#sendTo(
      client,
      'world.snapshot',
      buildWorldSnapshot(this.#sim, this.#world, this.#clock, this.#mode, this.#motionOf),
    );
  }

  disconnect(clientId: string): void {
    this.#clients.delete(clientId);
    this.#inboundSeq.delete(clientId);
  }

  /** Mensagem bruta do cliente (JSON string ou objeto). */
  handleRaw(clientId: string, raw: unknown): void {
    const client = this.#clients.get(clientId);
    if (!client) {
      throw new ProtocolError('NOT_CONNECTED', `cliente "${clientId}" não está conectado`);
    }
    let env: Envelope;
    try {
      env = parseEnvelope(raw);
    } catch (e) {
      const err = e instanceof ProtocolError ? e : new ProtocolError('BAD_ENVELOPE', String(e));
      this.#sendTo(client, 'res.error', { code: err.code, message: err.message }, envReqId(raw));
      return;
    }
    this.handleEnvelope(clientId, env);
  }

  handleEnvelope(clientId: string, env: Envelope): void {
    const client = this.#clients.get(clientId);
    if (!client) return;

    const last = this.#inboundSeq.get(clientId) ?? 0;
    if (env.seq <= last && last > 0) {
      // Seq repetido ou atrasado: ignora sem derrubar a sessão.
      return;
    }
    this.#inboundSeq.set(clientId, env.seq);

    try {
      this.#dispatch(client, env);
    } catch (e) {
      const err = e instanceof ProtocolError ? e : new ProtocolError('INTERNAL', String(e));
      this.#sendTo(client, 'res.error', { code: err.code, message: err.message }, env.reqId);
    }
  }

  /** Empurra relógio + agentes para todos (cadência do laço do núcleo). */
  pushFrame(): void {
    this.broadcast('clock.update', clockPayload(this.#clock));
    this.broadcast('agents.update', agentsUpdatePayload(this.#sim, this.#motionOf));
  }

  broadcastDelta(delta: WorldDeltaPayload): void {
    this.broadcast('world.delta', delta);
  }

  #afterGeometryEdit(delta: WorldDeltaPayload): void {
    this.broadcastDelta(delta);
    this.#onGeometryChanged?.();
  }

  broadcast(type: string, payload: unknown): void {
    for (const c of this.#clients.values()) {
      if (c.subscriptions && !receives(c.subscriptions, type)) continue;
      this.#sendTo(c, type, payload);
    }
  }

  #dispatch(client: ProtocolSink, env: Envelope): void {
    const p = (env.payload ?? {}) as Record<string, unknown>;
    switch (env.type) {
      case 'cmd.sim.setSpeed': {
        let speed = Number(p['speed']);
        // Protocolo cita 0|1|2|4|8; tuning declara 0|1|2|5|20. Mapeia os extras.
        if (speed === 4) speed = 5;
        if (speed === 8) speed = 20;
        try {
          this.#clock.setSpeed(speed);
        } catch (e) {
          throw new ProtocolError('BAD_SPEED', e instanceof Error ? e.message : String(e));
        }
        this.broadcast('clock.update', clockPayload(this.#clock));
        if (env.reqId) {
          this.#sendTo(client, 'res.ok', { ok: true }, env.reqId);
        }
        return;
      }
      case 'cmd.sim.setMode': {
        const mode = p['mode'];
        if (mode !== 'normal' && mode !== 'construction') {
          throw new ProtocolError('BAD_MODE', `modo inválido: ${String(mode)}`);
        }
        this.#mode = mode;
        // Construção pausa; sair retoma (PDF / protocolo §5.1).
        if (mode === 'construction') this.#clock.pause();
        else this.#clock.resume();
        this.broadcast(
          'world.snapshot',
          buildWorldSnapshot(this.#sim, this.#world, this.#clock, this.#mode, this.#motionOf),
        );
        this.broadcast('clock.update', clockPayload(this.#clock));
        if (env.reqId) this.#sendTo(client, 'res.ok', { ok: true, mode }, env.reqId);
        return;
      }
      case 'cmd.sim.save': {
        if (!this.#onSave) {
          throw new ProtocolError('UNSUPPORTED', 'cmd.sim.save não está ativo nesta sessão');
        }
        const slot = String(p['slot'] ?? 'demo');
        try {
          this.#onSave(slot);
        } catch (e) {
          throw new ProtocolError('SAVE_FAILED', e instanceof Error ? e.message : String(e));
        }
        if (env.reqId) this.#sendTo(client, 'res.ok', { ok: true, slot }, env.reqId);
        return;
      }
      case 'cmd.sim.load': {
        if (!this.#onLoad) {
          throw new ProtocolError('UNSUPPORTED', 'cmd.sim.load não está ativo nesta sessão');
        }
        const slot = String(p['slot'] ?? 'demo');
        try {
          this.#onLoad(slot);
        } catch (e) {
          throw new ProtocolError('LOAD_FAILED', e instanceof Error ? e.message : String(e));
        }
        if (env.reqId) this.#sendTo(client, 'res.ok', { ok: true, slot }, env.reqId);
        return;
      }
      case 'cmd.sim.reset': {
        if (!this.#onReset) {
          throw new ProtocolError('UNSUPPORTED', 'cmd.sim.reset não está ativo nesta sessão');
        }
        this.#mode = 'normal';
        const seed = p['seed'] !== undefined ? String(p['seed']) : undefined;
        try {
          this.#onReset(seed !== undefined ? { seed } : undefined);
        } catch (e) {
          throw new ProtocolError('RESET_FAILED', e instanceof Error ? e.message : String(e));
        }
        if (env.reqId) {
          this.#sendTo(client, 'res.ok', { ok: true, ...(seed !== undefined ? { seed } : {}) }, env.reqId);
        }
        return;
      }
      case 'cmd.build.paintTile': {
        if (this.#mode !== 'construction') {
          throw new ProtocolError('WRONG_MODE', 'paint só em modo construção');
        }
        const delta = this.#build.paintTiles(
          String(p['tileType'] ?? ''),
          String(p['materialId'] ?? ''),
          p['cells'],
        );
        this.#afterGeometryEdit(delta);
        if (env.reqId) {
          this.#sendTo(client, 'res.ok', { ok: true, painted: delta.tiles?.length ?? 0 }, env.reqId);
        }
        return;
      }
      case 'cmd.build.remove': {
        if (this.#mode !== 'construction') {
          throw new ProtocolError('WRONG_MODE', 'remove só em modo construção');
        }
        const target = String(p['target'] ?? 'tile');
        if (target === 'tile') {
          const delta = this.#build.removeTiles(p['cells']);
          this.#afterGeometryEdit(delta);
          if (env.reqId) {
            this.#sendTo(client, 'res.ok', { ok: true, removed: delta.tiles?.length ?? 0 }, env.reqId);
          }
          return;
        }
        if (target === 'object') {
          const objectId = p['objectId'] !== undefined ? String(p['objectId']) : undefined;
          const cells = Array.isArray(p['cells']) ? p['cells'] : [];
          const first = cells[0] as { x?: unknown; y?: unknown } | undefined;
          const cell =
            first && Number.isFinite(Number(first.x)) && Number.isFinite(Number(first.y))
              ? { x: Math.floor(Number(first.x)), y: Math.floor(Number(first.y)) }
              : undefined;
          const delta = this.#build.removeObject({
            ...(objectId ? { objectId } : {}),
            ...(cell ? { cell } : {}),
          });
          this.#afterGeometryEdit(delta);
          if (env.reqId) this.#sendTo(client, 'res.ok', { ok: true }, env.reqId);
          return;
        }
        throw new ProtocolError('BAD_TARGET', `target inválido: ${target}`);
      }
      case 'cmd.build.placeObject': {
        if (this.#mode !== 'construction') {
          throw new ProtocolError('WRONG_MODE', 'placeObject só em modo construção');
        }
        const objectDefId = String(p['objectDefId'] ?? '');
        const posRaw = p['pos'] as { x?: unknown; y?: unknown } | undefined;
        const x = Number(posRaw?.x);
        const y = Number(posRaw?.y);
        if (!objectDefId || !Number.isFinite(x) || !Number.isFinite(y)) {
          throw new ProtocolError('BAD_PLACE', 'placeObject exige objectDefId e pos');
        }
        const rotation = Number(p['rotation'] ?? 0);
        const delta = this.#build.placeObject(
          objectDefId,
          { x, y },
          Number.isFinite(rotation) ? rotation : 0,
        );
        this.#afterGeometryEdit(delta);
        if (env.reqId) {
          this.#sendTo(
            client,
            'res.ok',
            { ok: true, objectId: delta.objectsUpsert?.[0]?.id },
            env.reqId,
          );
        }
        return;
      }
      case 'cmd.build.moveObject': {
        if (this.#mode !== 'construction') {
          throw new ProtocolError('WRONG_MODE', 'moveObject só em modo construção');
        }
        const ref = objectRefFromPayload(p);
        const posRaw = p['pos'] as { x?: unknown; y?: unknown } | undefined;
        const x = Number(posRaw?.x);
        const y = Number(posRaw?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new ProtocolError('BAD_PLACE', 'moveObject exige pos {x,y}');
        }
        const delta = this.#build.moveObject(ref, { x, y });
        this.#afterGeometryEdit(delta);
        if (env.reqId) this.#sendTo(client, 'res.ok', { ok: true }, env.reqId);
        return;
      }
      case 'cmd.build.rotate': {
        if (this.#mode !== 'construction') {
          throw new ProtocolError('WRONG_MODE', 'rotate só em modo construção');
        }
        const ref = objectRefFromPayload(p);
        const degrees = Number(p['degrees'] ?? 90);
        if (!Number.isFinite(degrees)) {
          throw new ProtocolError('BAD_ROTATE', 'rotate exige degrees numérico');
        }
        const deltaMode = p['delta'] !== false;
        const delta = this.#build.rotateObject(ref, degrees, deltaMode);
        this.#afterGeometryEdit(delta);
        if (env.reqId) {
          this.#sendTo(
            client,
            'res.ok',
            { ok: true, rotation: delta.objectsUpsert?.[0]?.rotation },
            env.reqId,
          );
        }
        return;
      }
      case 'cmd.build.undo': {
        if (this.#mode !== 'construction') {
          throw new ProtocolError('WRONG_MODE', 'undo de construção só em modo construção');
        }
        const delta = this.#build.undo();
        this.#afterGeometryEdit(delta);
        if (env.reqId) this.#sendTo(client, 'res.ok', { ok: true }, env.reqId);
        return;
      }
      case 'cmd.build.redo': {
        if (this.#mode !== 'construction') {
          throw new ProtocolError('WRONG_MODE', 'redo de construção só em modo construção');
        }
        const delta = this.#build.redo();
        this.#afterGeometryEdit(delta);
        if (env.reqId) this.#sendTo(client, 'res.ok', { ok: true }, env.reqId);
        return;
      }
      case 'cmd.tool.apply': {
        if (!this.#onToolApply) {
          throw new ProtocolError('UNSUPPORTED', 'cmd.tool.apply não está ativo nesta sessão');
        }
        if (this.#mode === 'construction') {
          throw new ProtocolError('WRONG_MODE', 'ferramentas de substrato só em modo normal');
        }
        const effect = String(p['effect'] ?? '');
        if (effect !== 'wet' && effect !== 'extinguish') {
          throw new ProtocolError('BAD_EFFECT', `efeito de ferramenta inválido: ${effect}`);
        }
        const cellsRaw = Array.isArray(p['cells']) ? p['cells'] : [];
        const cells: { x: number; y: number }[] = [];
        for (const raw of cellsRaw) {
          const c = raw as { x?: unknown; y?: unknown };
          const x = Number(c?.x);
          const y = Number(c?.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            throw new ProtocolError('BAD_CELLS', 'cells exige {x,y} numéricos');
          }
          cells.push({ x: Math.floor(x), y: Math.floor(y) });
        }
        if (cells.length === 0) {
          throw new ProtocolError('BAD_CELLS', 'cmd.tool.apply exige cells');
        }
        let intensity: number | undefined;
        if (p['intensity'] !== undefined && p['intensity'] !== null) {
          const raw = Number(p['intensity']);
          if (!Number.isFinite(raw)) {
            throw new ProtocolError('BAD_INTENSITY', 'intensity exige número finito');
          }
          intensity = Math.max(0, Math.min(100, raw));
        }
        const delta = this.#onToolApply(effect, cells, intensity);
        this.broadcastDelta(delta);
        if (env.reqId) {
          this.#sendTo(
            client,
            'res.ok',
            { ok: true, effect, cells: cells.length, ...(intensity !== undefined ? { intensity } : {}) },
            env.reqId,
          );
        }
        return;
      }
      case 'cmd.world.toggleDoor': {
        if (this.#mode === 'construction') {
          throw new ProtocolError('WRONG_MODE', 'porta só alterna em modo normal');
        }
        const x = Math.floor(Number(p['x']));
        const y = Math.floor(Number(p['y']));
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new ProtocolError('BAD_CELL', 'toggleDoor exige x, y');
        }
        const gridId = this.#world.mainGridId;
        if (!this.#world.inBounds(gridId, x, y)) {
          throw new ProtocolError('OUT_OF_BOUNDS', `célula (${x},${y}) fora do mapa`);
        }
        const tile = this.#world.tileAt(gridId, x, y);
        if (tile.type !== 'door') {
          throw new ProtocolError('NOT_DOOR', `célula (${x},${y}) não é porta`);
        }
        const open = Boolean(tile.state?.isOpen);
        if (open) this.#world.closeDoor(gridId, x, y);
        else this.#world.openDoor(gridId, x, y);
        const after = this.#world.tileAt(gridId, x, y);
        this.#afterGeometryEdit({
          tiles: [tileCellSnapshot(this.#sim, this.#world, gridId, x, y)],
        });
        if (env.reqId) {
          this.#sendTo(
            client,
            'res.ok',
            { ok: true, isOpen: Boolean(after.state?.isOpen) },
            env.reqId,
          );
        }
        return;
      }
      case 'cmd.agent.move': {
        if (!this.#onAgentMove) {
          throw new ProtocolError('UNSUPPORTED', 'cmd.agent.move não está ativo nesta sessão');
        }
        if (this.#mode === 'construction') {
          throw new ProtocolError('WRONG_MODE', 'movimento bloqueado em modo construção');
        }
        const agentId = String(p['agentId'] ?? '');
        const x = Number(p['x']);
        const y = Number(p['y']);
        if (!agentId || !Number.isFinite(x) || !Number.isFinite(y)) {
          throw new ProtocolError('BAD_MOVE', 'cmd.agent.move exige agentId, x, y');
        }
        const result = this.#onAgentMove(agentId, { x: Math.floor(x), y: Math.floor(y) });
        if (!result.ok) {
          throw new ProtocolError(result.code, result.message);
        }
        this.pushFrame();
        if (env.reqId) this.#sendTo(client, 'res.ok', { ok: true, agentId }, env.reqId);
        return;
      }
      case 'req.world.region': {
        const snap = buildWorldSnapshot(
          this.#sim,
          this.#world,
          this.#clock,
          this.#mode,
          this.#motionOf,
        );
        this.#sendTo(client, 'res.world.region', snap, env.reqId);
        return;
      }
      case 'req.agent.detail': {
        const agentId = String(p['agentId'] ?? '');
        const agent = this.#sim.state.agents[agentId];
        if (!agent) {
          throw new ProtocolError('NOT_FOUND', `agente "${agentId}" não encontrado`);
        }
        this.#sendTo(client, 'res.agent.detail', agent, env.reqId);
        return;
      }
      default:
        throw new ProtocolError('UNKNOWN_TYPE', `tipo não suportado neste núcleo: ${env.type}`);
    }
  }

  #sendTo(client: ProtocolSink, type: string, payload: unknown, reqId?: string): void {
    this.#seq += 1;
    const msg = makeEnvelope(type, payload, {
      seq: this.#seq,
      simTime: this.#clock.simTime,
      ...(reqId !== undefined ? { reqId } : {}),
    });
    client.send(msg);
  }
}

function objectRefFromPayload(p: Record<string, unknown>): {
  objectId?: string;
  cell?: { x: number; y: number };
} {
  const objectId = p['objectId'] !== undefined ? String(p['objectId']) : undefined;
  const cells = Array.isArray(p['cells']) ? p['cells'] : [];
  const first = cells[0] as { x?: unknown; y?: unknown } | undefined;
  const cell =
    first && Number.isFinite(Number(first.x)) && Number.isFinite(Number(first.y))
      ? { x: Math.floor(Number(first.x)), y: Math.floor(Number(first.y)) }
      : undefined;
  if (!objectId && !cell) {
    throw new ProtocolError('BAD_TARGET', 'exige objectId ou cells[{x,y}]');
  }
  return {
    ...(objectId ? { objectId } : {}),
    ...(cell ? { cell } : {}),
  };
}

function receives(subs: ReadonlySet<string>, type: string): boolean {
  if (type === 'world.snapshot' || type.startsWith('res.')) return true;
  return subs.has(type);
}

function envReqId(raw: unknown): string | undefined {
  if (raw && typeof raw === 'object' && typeof (raw as { reqId?: unknown }).reqId === 'string') {
    return (raw as { reqId: string }).reqId;
  }
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw) as { reqId?: unknown };
      return typeof o.reqId === 'string' ? o.reqId : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Sink em memória para testes. */
export class MemorySink implements ProtocolSink {
  readonly received: Envelope[] = [];
  readonly subscriptions?: ReadonlySet<string>;

  constructor(
    readonly id: string,
    readonly role: ClientRole = 'test',
    subscriptions?: ReadonlySet<string>,
  ) {
    if (subscriptions !== undefined) this.subscriptions = subscriptions;
  }

  send(msg: Envelope): void {
    this.received.push(msg);
  }

  last(type?: string): Envelope | undefined {
    if (!type) return this.received[this.received.length - 1];
    for (let i = this.received.length - 1; i >= 0; i -= 1) {
      if (this.received[i]!.type === type) return this.received[i];
    }
    return undefined;
  }

  clear(): void {
    this.received.length = 0;
  }
}

export { makeError };
