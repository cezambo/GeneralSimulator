import type { Binding, ProviderConfig } from './binding.js';

/**
 * Cliente de provedor. L-001, L-018.
 *
 * OpenRouter e APIs diretas atrás da mesma interface: trocar de provedor não
 * altera nenhum prompt nem nenhuma chamada do resto do sistema. Ambos falam o
 * dialeto de chat completions da OpenAI, então uma implementação serve aos dois
 * e o que muda é a URL base e o cabeçalho.
 */

export interface ChatRequest {
  readonly system: string;
  readonly user: string;
  readonly binding: Binding;
  /** Nome do schema, para pedir saída estruturada quando o provedor suporta. */
  readonly schemaName: string;
  readonly schema: Record<string, unknown>;
  readonly signal?: AbortSignal;
}

export interface ChatResponse {
  readonly raw: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUsd: number;
  readonly latencyMs: number;
}

export interface Provider {
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export class MissingApiKeyError extends Error {
  constructor(envName: string) {
    super(
      `variável de ambiente ${envName} ausente. A chave nunca vem de arquivo versionado (L-018); ` +
        `copie .env.example para .env e preencha.`,
    );
    this.name = 'MissingApiKeyError';
  }
}

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`provedor respondeu ${status}: ${body.slice(0, 400)}`);
    this.name = 'ProviderHttpError';
  }
  /** 429 e 5xx merecem nova tentativa; 4xx de requisição, não. L-017. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

export class OpenAiCompatibleProvider implements Provider {
  constructor(private readonly config: ProviderConfig) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    // A chave é lida a cada chamada, e não no construtor, para que a ausência
    // apareça com mensagem clara mesmo em modo replay, onde nenhum provedor
    // deveria ser construído — e para que preencher o .env passe a valer sem
    // reiniciar o processo.
    const apiKey = process.env[this.config.apiKeyEnv];
    if (!apiKey) throw new MissingApiKeyError(this.config.apiKeyEnv);

    const { binding } = req;
    const body: Record<string, unknown> = {
      model: binding.model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: req.schemaName, strict: true, schema: req.schema },
      },
    };
    if (binding.temperature !== undefined) body['temperature'] = binding.temperature;
    if (binding.maxTokens !== undefined) body['max_tokens'] = binding.maxTokens;
    if (binding.reasoningEffort !== undefined) body['reasoning'] = { effort: binding.reasoningEffort };
    // Pede o custo já calculado pelo provedor em vez de multiplicar tokens por
    // uma tabela local: preço embutido em código envelhece calado (L-010).
    body['usage'] = { include: true };

    const started = performance.now();
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(this.config.headers ?? {}),
      },
      body: JSON.stringify(body),
      ...(req.signal ? { signal: req.signal } : {}),
    });
    const latencyMs = Math.round(performance.now() - started);

    if (!res.ok) throw new ProviderHttpError(res.status, await res.text());

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    };
    const raw = json.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') {
      throw new Error(`provedor devolveu resposta sem conteúdo: ${JSON.stringify(json).slice(0, 300)}`);
    }

    return {
      raw,
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      costUsd: json.usage?.cost ?? 0,
      latencyMs,
    };
  }
}

export function makeProvider(config: ProviderConfig): Provider {
  switch (config.type) {
    case 'openrouter':
    case 'openai':
      return new OpenAiCompatibleProvider(config);
    default:
      throw new Error(`tipo de provedor não suportado: "${config.type}"`);
  }
}
