/**
 * Contabilidade de custo e orçamento. L-016, L-006, C-007.
 *
 * Registra tokens, dólar, latência, reparos e origem em cassete, agregado por
 * sessão, por dia simulado e por agente. O gargalo declarado deste projeto não
 * é dólar, é chamada — por isso o teto que importa é de contagem.
 */

export interface CallRecord {
  readonly promptId: string;
  readonly agentId?: string;
  readonly simDay: number;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUsd: number;
  readonly latencyMs: number;
  readonly repairAttempts: number;
  readonly fromCassette: boolean;
}

/** Por que a chamada foi feita. Decide o que a reserva de crise protege (C-007). */
export type CallKind = 'batch' | 'grave_reactive' | 'ordinary';

export interface BudgetLimits {
  readonly perAgentPerSimDayCallLimit: number;
  readonly graveReactiveReserve: number;
  readonly batchCallLimit: number;
  readonly dailyUsdLimit: number;
}

export interface BudgetVerdict {
  readonly allowed: boolean;
  readonly reason?: string;
  /** Verdadeiro quando a chamada só passou por estar na reserva. Vai ao painel. */
  readonly usedReserve?: boolean;
}

interface AgentDayUsage {
  ordinary: number;
  graveReactive: number;
  batch: number;
}

export class Accounting {
  readonly #calls: CallRecord[] = [];
  readonly #usage = new Map<string, AgentDayUsage>();
  #degraded = new Map<string, { simDay: number; atSimTime: number }>();

  constructor(private readonly limits: BudgetLimits) {}

  #keyFor(agentId: string, simDay: number): string {
    return `${agentId}#${simDay}`;
  }

  #usageFor(agentId: string, simDay: number): AgentDayUsage {
    const key = this.#keyFor(agentId, simDay);
    let u = this.#usage.get(key);
    if (!u) {
      u = { ordinary: 0, graveReactive: 0, batch: 0 };
      this.#usage.set(key, u);
    }
    return u;
  }

  /**
   * Pode chamar? C-007.
   *
   * O lote tem teto próprio e **não** compete com o dia: se disputasse, o
   * agente que passou o dia conversando chegaria à noite sem saldo e perderia a
   * memória do dia, o Crivo e a apreciação das opiniões — o dia inteiro custaria
   * caro e não deixaria nada.
   *
   * E reativo grave tem reserva intocável. Ordenar a supressão só ajuda enquanto
   * sobra alguma coisa; num dia de crise o consumo vem todo de evento legítimo e
   * o agente atinge o teto por ter vivido demais, o que traria a degradação
   * exatamente quando B-031 e S-036 exigem cognição.
   */
  canCall(agentId: string, simDay: number, kind: CallKind): BudgetVerdict {
    if (this.totalCostUsd() >= this.limits.dailyUsdLimit) {
      return { allowed: false, reason: 'teto de gasto diário atingido' };
    }

    const u = this.#usageFor(agentId, simDay);

    if (kind === 'batch') {
      if (u.batch >= this.limits.batchCallLimit) {
        return { allowed: false, reason: 'teto do lote noturno atingido' };
      }
      return { allowed: true };
    }

    const teto = this.limits.perAgentPerSimDayCallLimit;
    const reserva = this.limits.graveReactiveReserve;
    const gastoNaoLote = u.ordinary + u.graveReactive;

    if (kind === 'grave_reactive') {
      if (gastoNaoLote >= teto) {
        return { allowed: false, reason: 'teto do dia atingido, reserva de crise inclusa' };
      }
      return { allowed: true, usedReserve: u.ordinary + u.graveReactive >= teto - reserva };
    }

    // Gatilho comum não encosta na reserva.
    if (u.ordinary + u.graveReactive >= teto - reserva) {
      return {
        allowed: false,
        reason: `teto do dia atingido para gatilho comum (${reserva} chamadas reservadas para reativo grave)`,
      };
    }
    return { allowed: true };
  }

  record(call: CallRecord, kind: CallKind, atSimTime?: number): void {
    this.#calls.push(call);
    if (call.agentId) {
      const u = this.#usageFor(call.agentId, call.simDay);
      if (kind === 'batch') u.batch++;
      else if (kind === 'grave_reactive') u.graveReactive++;
      else u.ordinary++;
    }
    void atSimTime;
  }

  /**
   * Marca o agente como degradado. L-006.
   *
   * Degradação é **sempre visível**: agente coerente mas inerte, sem aviso, é o
   * pior modo de falha deste projeto, porque parece que está funcionando.
   */
  markDegraded(agentId: string, simDay: number, atSimTime: number): void {
    if (!this.#degraded.has(`${agentId}#${simDay}`)) {
      this.#degraded.set(`${agentId}#${simDay}`, { simDay, atSimTime });
    }
  }

  degradedAgents(): ReadonlyMap<string, { simDay: number; atSimTime: number }> {
    return this.#degraded;
  }

  totalCostUsd(): number {
    return this.#calls.reduce((s, c) => s + c.costUsd, 0);
  }

  calls(): readonly CallRecord[] {
    return this.#calls;
  }

  summary(): {
    calls: number;
    fromCassette: number;
    costUsd: number;
    promptTokens: number;
    completionTokens: number;
    repairs: number;
  } {
    return {
      calls: this.#calls.length,
      fromCassette: this.#calls.filter((c) => c.fromCassette).length,
      costUsd: this.totalCostUsd(),
      promptTokens: this.#calls.reduce((s, c) => s + c.promptTokens, 0),
      completionTokens: this.#calls.reduce((s, c) => s + c.completionTokens, 0),
      repairs: this.#calls.reduce((s, c) => s + c.repairAttempts, 0),
    };
  }
}
