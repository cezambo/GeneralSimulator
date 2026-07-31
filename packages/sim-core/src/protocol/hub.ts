/**
 * Hub do protocolo: clientes, seq, snapshot na conexão, comandos. X-007.
 *
 * A rede fica fora — `ProtocolSink` envia bytes. Assim o teste de reconexão
 * não depende de porta real, e o servidor WebSocket só adapta o transporte.
 */

import type { Simulation } from '../state/index.js';
import type { World } from '../world/grid.js';
import type { SimClock } from '../world/clock.js';
import { makeEnvelope, makeError, parseEnvelope, ProtocolError } from './envelope.js';
import { agentsUpdatePayload, buildWorldSnapshot, clockPayload } from './snapshot.js';
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

export interface ProtocolHubOptions {
  readonly sim: Simulation;
  readonly world: World;
  readonly clock: SimClock;
  readonly mode?: SimMode;
}

export class ProtocolHub {
  readonly #sim: Simulation;
  readonly #world: World;
  readonly #clock: SimClock;
  #mode: SimMode;
  readonly #clients = new Map<string, ProtocolSink>();
  #seq = 0;
  /** Seq por cliente (mensagens inbound). */
  readonly #inboundSeq = new Map<string, number>();

  constructor(opts: ProtocolHubOptions) {
    this.#sim = opts.sim;
    this.#world = opts.world;
    this.#clock = opts.clock;
    this.#mode = opts.mode ?? 'normal';
  }

  get clientCount(): number {
    return this.#clients.size;
  }

  get mode(): SimMode {
    return this.#mode;
  }

  /**
   * Conecta e manda `world.snapshot` completo.
   * Reconexão = nova conexão: o cliente nunca precisa de delta acumulado. X-007.
   */
  connect(client: ProtocolSink): void {
    this.#clients.set(client.id, client);
    this.#inboundSeq.set(client.id, 0);
    this.#sendTo(client, 'world.snapshot', buildWorldSnapshot(this.#sim, this.#world, this.#clock, this.#mode));
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
    this.broadcast('agents.update', agentsUpdatePayload(this.#sim));
  }

  broadcastDelta(delta: WorldDeltaPayload): void {
    this.broadcast('world.delta', delta);
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
        // Construção pausa automaticamente (PDF / protocolo §5.1).
        if (mode === 'construction') this.#clock.pause();
        this.broadcast('world.snapshot', buildWorldSnapshot(this.#sim, this.#world, this.#clock, this.#mode));
        if (env.reqId) this.#sendTo(client, 'res.ok', { ok: true, mode }, env.reqId);
        return;
      }
      case 'req.world.region': {
        const snap = buildWorldSnapshot(this.#sim, this.#world, this.#clock, this.#mode);
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
