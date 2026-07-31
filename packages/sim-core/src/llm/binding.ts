import { readFileSync } from 'node:fs';
import { configPath } from '../config/paths.js';
import type { PromptEntry, Tier } from './registry.js';

/**
 * Resolução de vínculo. L-004.
 *
 * Três níveis, do mais específico ao mais geral: exceção por prompt, vínculo do
 * preset ativo para aquele tier, e erro de **configuração** se nenhum resolver.
 *
 * Erro de configuração, não de execução: um tier sem vínculo tem de derrubar a
 * inicialização. Descobrir isso na chamada é descobrir no meio de uma rodada de
 * trinta dias, com metade dos agentes já tendo pensado.
 */

export interface Binding {
  readonly provider: string;
  readonly model: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface ProviderConfig {
  readonly type: string;
  readonly baseUrl: string;
  readonly apiKeyEnv: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface ModelsConfig {
  readonly activePreset: string;
  readonly providers: Readonly<Record<string, ProviderConfig>>;
  readonly presets: Readonly<Record<string, { description?: string; bindings: Record<Tier, Binding> }>>;
  readonly overrides: Readonly<Record<string, Binding>>;
  readonly routing: {
    readonly providerOrder?: readonly string[];
    readonly allowFallbacks?: boolean;
    readonly requireStructuredOutputs?: boolean;
    readonly catalogCacheMinutes?: number;
  };
  readonly budget: {
    readonly dailyUsdLimit: number;
    readonly perAgentPerSimDayCallLimit: number;
    readonly onExceed: string;
  };
  readonly cassettes: { readonly mode: string; readonly directory: string };
}

const TIERS: readonly Tier[] = ['compact', 'narrative', 'longform'];

let cached: ModelsConfig | undefined;

export function loadModelsConfig(force = false): ModelsConfig {
  if (cached && !force) return cached;

  const cfg = JSON.parse(readFileSync(configPath('models'), 'utf8')) as ModelsConfig;

  const preset = cfg.presets[cfg.activePreset];
  if (!preset) {
    throw new Error(
      `models.json: activePreset "${cfg.activePreset}" não existe. Presets: ${Object.keys(cfg.presets).join(', ')}`,
    );
  }
  for (const tier of TIERS) {
    const b = preset.bindings[tier];
    if (!b) throw new Error(`models.json: preset "${cfg.activePreset}" sem vínculo para o tier "${tier}"`);
    if (!cfg.providers[b.provider]) {
      throw new Error(`models.json: tier "${tier}" aponta para o provedor "${b.provider}", não declarado`);
    }
  }
  for (const [promptId, b] of Object.entries(cfg.overrides ?? {})) {
    if (!cfg.providers[b.provider]) {
      throw new Error(`models.json: exceção de "${promptId}" aponta para o provedor "${b.provider}", não declarado`);
    }
  }

  cached = cfg;
  return cfg;
}

export interface Resolved {
  readonly binding: Binding;
  readonly provider: ProviderConfig;
  readonly tier: Tier;
  /** De onde veio o vínculo. Vai para a chave de cassete e para o trace (L-021). */
  readonly source: 'override' | 'preset';
  readonly preset: string;
}

/**
 * @param tierOverride  Força um tier acima do que o prompt pede. É como
 *   L-004 exige que operação irreversível — decepar, destruir parte vital,
 *   transmutar — suba de tier independentemente do gatilho: quem chama sabe da
 *   gravidade, o registro do prompt não.
 */
export function resolveBinding(entry: PromptEntry, tierOverride?: Tier): Resolved {
  const cfg = loadModelsConfig();
  const tier = tierOverride ?? entry.tier;

  const override = cfg.overrides?.[entry.id];
  const base = override ?? cfg.presets[cfg.activePreset]!.bindings[tier];

  // Amostragem é do prompt, não do tier (L-003): foi confundir "qual modelo"
  // com "como amostrar" que produziu oito tiers colapsando em três modelos.
  // O vínculo traz o padrão; o registro do prompt tem a última palavra.
  const binding: Binding = {
    provider: base.provider,
    model: base.model,
    ...(entry.temperature ?? base.temperature) !== undefined
      ? { temperature: entry.temperature ?? base.temperature }
      : {},
    ...(entry.maxTokens ?? base.maxTokens) !== undefined
      ? { maxTokens: entry.maxTokens ?? base.maxTokens }
      : {},
    ...(entry.reasoningEffort ?? base.reasoningEffort) !== undefined
      ? { reasoningEffort: entry.reasoningEffort ?? base.reasoningEffort }
      : {},
  };

  return {
    binding,
    provider: cfg.providers[binding.provider]!,
    tier,
    source: override ? 'override' : 'preset',
    preset: cfg.activePreset,
  };
}
