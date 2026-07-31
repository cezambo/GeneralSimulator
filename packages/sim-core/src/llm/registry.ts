import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { PROMPTS_DIR } from '../config/paths.js';

/**
 * O registro de prompts. L-002.
 *
 * Cada entrada declara tier, capacidades e parâmetros de amostragem, e **nunca**
 * declara modelo: qual modelo é decisão do vínculo do preset (L-004), resolvida
 * na hora. Trocar o modelo de todos os pensamentos corriqueiros tem de ser
 * editar um campo, sem tocar em prompt nenhum.
 */

export type Tier = 'compact' | 'narrative' | 'longform';
export type PromptStatus = 'ok' | 'rascunho' | 'falta';

export interface PromptEntry {
  readonly id: string;
  readonly file: string;
  readonly tier: Tier;
  readonly fallbackTier?: Tier;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly reasoningEffort?: 'low' | 'medium' | 'high';
  /**
   * Nome do schema de saída, ou `null` para laço agêntico com tool calls.
   *
   * `generation.world_builder` (W-042) é o caso: ele não devolve um documento e
   * sim uma sequência de chamadas de ferramenta, então não há forma única
   * contra a qual validar. `null` é declaração explícita disso, e não descuido
   * — quem esquecer o campo recebe erro.
   */
  readonly schema: string | null;
  readonly status: PromptStatus;
  readonly prioridade?: string;
  readonly description?: string;
  readonly variables: readonly string[];
}

const TIERS = new Set<Tier>(['compact', 'narrative', 'longform']);

let cached: Map<string, PromptEntry> | undefined;

export function loadRegistry(force = false): Map<string, PromptEntry> {
  if (cached && !force) return cached;

  const raw = parseYaml(readFileSync(join(PROMPTS_DIR, 'prompt_registry.yaml'), 'utf8')) as Record<
    string,
    unknown
  >;
  const prompts = (raw['prompts'] ?? {}) as Record<string, Record<string, unknown>>;

  const out = new Map<string, PromptEntry>();
  for (const [id, body] of Object.entries(prompts)) {
    if (!body || typeof body !== 'object') continue;

    const tier = body['tier'] as Tier;
    // L-003: os três tiers cobrem todos os prompts. Um tier desconhecido no
    // registro é erro de inicialização e não de execução, porque descobrir isso
    // na chamada significa descobrir no meio de uma rodada de trinta dias.
    if (!TIERS.has(tier)) {
      throw new Error(`registro: prompt "${id}" declara tier "${String(tier)}", fora de compact/narrative/longform`);
    }
    if (!('schema' in body)) {
      throw new Error(`registro: prompt "${id}" sem campo schema. Use null se for laço de tool calls.`);
    }
    if (body['schema'] !== null && typeof body['schema'] !== 'string') {
      throw new Error(`registro: prompt "${id}" com schema de tipo inesperado`);
    }
    if ('model' in body || 'provider' in body) {
      throw new Error(`registro: prompt "${id}" cita modelo ou provedor — L-002 proíbe, quem decide é o vínculo`);
    }

    const entry: Record<string, unknown> = {
      id,
      file: body['file'],
      tier,
      schema: body['schema'],
      status: (body['status'] as PromptStatus) ?? 'falta',
      variables: (body['variables'] as string[]) ?? [],
    };
    for (const k of ['fallbackTier', 'temperature', 'maxTokens', 'reasoningEffort', 'prioridade', 'description']) {
      if (body[k] !== undefined) entry[k] = body[k];
    }
    out.set(id, entry as unknown as PromptEntry);
  }

  cached = out;
  return out;
}

export function getPrompt(id: string): PromptEntry {
  const entry = loadRegistry().get(id);
  if (!entry) throw new Error(`prompt desconhecido: "${id}"`);
  return entry;
}
