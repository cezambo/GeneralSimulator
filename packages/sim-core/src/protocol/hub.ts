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
) => WorldDeltaPayload;

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
}

export class ProtocolHub {
  readonly #sim: Simulation;
  readonly #world: World;
  readonly #clock: SimClock;
  #mode: SimMode;
  readonly #motionOf: AgentMotionLookup | undefined;
  readonly #onAgentMove: AgentMoveHandler | undefined;
  readonly #onGeometryChanged: (() => void) | undefined;
  readonly #onToolApply: ToolApplyHandler | undefined;
  readonly #build: BuildHistory;
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
    this.#build = new BuildHistory(opts.sim, opts.world, opts.objects);
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
        const delta = this.#onToolApply(effect, cells);
        this.broadcastDelta(delta);
        if (env.reqId) {
          this.#sendTo(client, 'res.ok', { ok: true, effect, cells: cells.length }, env.reqId);
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
