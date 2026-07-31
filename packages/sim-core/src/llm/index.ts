import { loadModelsConfig, resolveBinding, type Binding, type Resolved } from './binding.js';
import { CassetteStore, cassetteKey, modeFromEnv, type CassetteMode } from './cassette.js';
import { getPrompt, type PromptEntry, type Tier } from './registry.js';
import { renderPrompt, type RenderedPrompt } from './render.js';
import { schemaDefinition, validateAgainstSchema } from './schemas.js';
import { makeProvider, type Provider } from './provider.js';
import { Accounting, type CallKind, type BudgetLimits } from './accounting.js';

export * from './registry.js';
export * from './binding.js';
export * from './cassette.js';
export * from './accounting.js';
export { renderPrompt } from './render.js';
export { validateAgainstSchema, schemaFragmentFor } from './schemas.js';

const MAX_REPAIRS = 2;

export interface CallOptions {
  readonly agentId?: string;
  readonly simDay?: number;
  readonly kind?: CallKind;
  /** Sobe o tier. L-004: operação irreversível exige tier alto seja qual for o gatilho. */
  readonly tierOverride?: Tier;
  readonly signal?: AbortSignal;
}

export interface CallResult<T> {
  readonly value: T;
  readonly fromCassette: boolean;
  readonly repairAttempts: number;
  readonly model: string;
  readonly costUsd: number;
  readonly latencyMs: number;
  /** Trace inspecionável. L-021. */
  readonly trace: { readonly rendered: RenderedPrompt; readonly raw: string };
}

/** Falha após esgotar o reparo. Quem chamou resolve por caminho degradado. L-007. */
export class SchemaRepairFailed extends Error {
  constructor(
    readonly promptId: string,
    readonly lastRaw: string,
    readonly lastError: string,
  ) {
    super(`prompt "${promptId}": resposta inválida após ${MAX_REPAIRS} reparos. Última falha: ${lastError}`);
    this.name = 'SchemaRepairFailed';
  }
}

/** Orçamento estourado. Não é erro de sistema: é degradação, e é visível. L-006. */
export class BudgetExceeded extends Error {
  constructor(
    readonly agentId: string,
    readonly reason: string,
  ) {
    super(`orçamento de "${agentId}": ${reason}`);
    this.name = 'BudgetExceeded';
  }
}

export class LlmRouter {
  readonly cassettes: CassetteStore;
  readonly accounting: Accounting;
  readonly #providers = new Map<string, Provider>();
  readonly #providerFactory: (resolved: Resolved) => Provider;

  constructor(
    opts: {
      mode?: CassetteMode;
      limits?: Partial<BudgetLimits>;
      /**
       * Substitui o cliente de rede. Existe para teste: o laço de reparo
       * (L-007) só é exercitável com um provedor que devolva resposta inválida
       * sob comando, e depender da rede para isso tornaria o teste caro e não
       * determinístico — o oposto do que X-011 pede.
       */
      providerFactory?: (resolved: Resolved) => Provider;
      /**
       * Onde ficam os cassetes. Existe para teste, pelo mesmo motivo que
       * `providerFactory`: sem isso, dois testes que chamam o mesmo prompt com
       * as mesmas variáveis compartilham a gravação, e o segundo recebe a
       * resposta do primeiro sem que nada acuse.
       */
      cassetteDir?: string;
    } = {},
  ) {
    const cfg = loadModelsConfig();
    this.#providerFactory = opts.providerFactory ?? ((r) => makeProvider(r.provider));
    this.cassettes = new CassetteStore(
      opts.mode ?? modeFromEnv(cfg.cassettes.mode as CassetteMode),
      opts.cassetteDir,
    );
    this.accounting = new Accounting({
      perAgentPerSimDayCallLimit: cfg.budget.perAgentPerSimDayCallLimit,
      graveReactiveReserve: 4,
      batchCallLimit: 6,
      dailyUsdLimit: cfg.budget.dailyUsdLimit,
      ...opts.limits,
    });
  }

  #providerFor(resolved: Resolved): Provider {
    let p = this.#providers.get(resolved.binding.provider);
    if (!p) {
      p = this.#providerFactory(resolved);
      this.#providers.set(resolved.binding.provider, p);
    }
    return p;
  }

  async call<T = unknown>(
    promptId: string,
    variables: Readonly<Record<string, unknown>>,
    options: CallOptions = {},
  ): Promise<CallResult<T>> {
    const entry: PromptEntry = getPrompt(promptId);
    // Prompt de tool calls não tem resposta única contra a qual validar, e
    // atravessar este caminho devolveria o texto do primeiro turno como se
    // fosse o resultado do laço inteiro.
    if (entry.schema === null) {
      throw new Error(
        `prompt "${promptId}" é laço de tool calls (schema null) e não passa por call(). Use o executor agêntico.`,
      );
    }
    const resolved = resolveBinding(entry, options.tierOverride);
    const rendered = renderPrompt(entry, variables);
    const key = cassetteKey(promptId, rendered.resolvedVariables, resolved);

    const cached = this.cassettes.read(promptId, key);
    if (cached) {
      // Cassete não consome orçamento: não houve chamada. Contabilizar replay
      // como gasto faria uma rodada de custo zero degradar agentes.
      this.accounting.record(
        {
          promptId,
          ...(options.agentId ? { agentId: options.agentId } : {}),
          simDay: options.simDay ?? 0,
          model: resolved.binding.model,
          promptTokens: cached.usage.promptTokens,
          completionTokens: cached.usage.completionTokens,
          costUsd: 0,
          latencyMs: 0,
          repairAttempts: 0,
          fromCassette: true,
        },
        options.kind ?? 'ordinary',
      );
      return {
        value: cached.response.parsed as T,
        fromCassette: true,
        repairAttempts: 0,
        model: cached.model,
        costUsd: 0,
        latencyMs: 0,
        trace: { rendered, raw: cached.response.raw },
      };
    }

    this.cassettes.onMiss(promptId, key);

    if (options.agentId) {
      const verdict = this.accounting.canCall(
        options.agentId,
        options.simDay ?? 0,
        options.kind ?? 'ordinary',
      );
      if (!verdict.allowed) {
        this.accounting.markDegraded(options.agentId, options.simDay ?? 0, Date.now());
        throw new BudgetExceeded(options.agentId, verdict.reason ?? 'teto atingido');
      }
    }

    const result = await this.#callWithRepair<T>(entry, entry.schema, resolved, rendered, options.signal);

    if (this.cassettes.shouldRecord()) {
      this.cassettes.write({
        key,
        promptId,
        model: resolved.binding.model,
        provider: resolved.binding.provider,
        recordedAt: new Date().toISOString(),
        request: { system: rendered.system, user: rendered.user },
        response: { raw: result.raw, parsed: result.value },
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          costUsd: result.costUsd,
          latencyMs: result.latencyMs,
          repairAttempts: result.repairAttempts,
        },
      });
    }

    this.accounting.record(
      {
        promptId,
        ...(options.agentId ? { agentId: options.agentId } : {}),
        simDay: options.simDay ?? 0,
        model: resolved.binding.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
        repairAttempts: result.repairAttempts,
        fromCassette: false,
      },
      options.kind ?? 'ordinary',
    );

    return {
      value: result.value,
      fromCassette: false,
      repairAttempts: result.repairAttempts,
      model: resolved.binding.model,
      costUsd: result.costUsd,
      latencyMs: result.latencyMs,
      trace: { rendered, raw: result.raw },
    };
  }

  /**
   * Chamada com validação e até dois reparos. L-007.
   *
   * O reparo é **condicional**: só acontece quando a validação falha, então não
   * custa nada no caminho feliz. Foi por isso que ele venceu a alternativa de
   * pedir a um modelo menor que preenchesse o formulário — aquela pagava uma
   * chamada extra em toda resposta para resolver um problema que aparece em
   * poucas.
   */
  async #callWithRepair<T>(
    entry: PromptEntry,
    schemaName: string,
    resolved: Resolved,
    rendered: RenderedPrompt,
    signal?: AbortSignal,
  ): Promise<{
    value: T;
    raw: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    latencyMs: number;
    repairAttempts: number;
  }> {
    const provider = this.#providerFor(resolved);
    const schema = schemaDefinition(schemaName);

    let user = rendered.user;
    let promptTokens = 0;
    let completionTokens = 0;
    let costUsd = 0;
    let latencyMs = 0;
    let lastRaw = '';
    let lastError = '';

    for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
      const res = await provider.chat({
        system: rendered.system,
        user,
        binding: resolved.binding,
        schemaName,
        schema,
        ...(signal ? { signal } : {}),
      });

      promptTokens += res.promptTokens;
      completionTokens += res.completionTokens;
      costUsd += res.costUsd;
      latencyMs += res.latencyMs;
      lastRaw = res.raw;

      const parsed = tryParseJson(res.raw);
      if (parsed.ok) {
        const check = validateAgainstSchema(schemaName, parsed.value);
        if (check.valid) {
          return {
            value: parsed.value as T,
            raw: res.raw,
            promptTokens,
            completionTokens,
            costUsd,
            latencyMs,
            repairAttempts: attempt,
          };
        }
        lastError = check.message ?? 'inválido';
      } else {
        lastError = parsed.error;
      }

      user = repairPrompt(rendered.user, lastRaw, lastError);
    }

    throw new SchemaRepairFailed(entry.id, lastRaw, lastError);
  }
}

/**
 * Aceita a cerca de código que modelo pequeno insiste em pôr apesar da
 * instrução. Rejeitar por causa da cerca gastaria um reparo inteiro para
 * corrigir formatação, e não conteúdo.
 */
function tryParseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch (e) {
    return { ok: false, error: `JSON inválido: ${(e as Error).message}` };
  }
}

function repairPrompt(originalUser: string, badResponse: string, error: string): string {
  return [
    originalUser,
    '',
    '---',
    '',
    'Sua resposta anterior foi rejeitada pela validação:',
    '',
    badResponse.slice(0, 1500),
    '',
    'Problemas encontrados:',
    error,
    '',
    'Responda de novo, apenas com o JSON corrigido. Não explique o erro.',
  ].join('\n');
}

export type { Binding, Resolved, CallKind, BudgetLimits };
