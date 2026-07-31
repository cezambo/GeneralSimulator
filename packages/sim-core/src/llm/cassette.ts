import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cassetteDir } from '../config/paths.js';
import type { Resolved } from './binding.js';

/**
 * Cassetes: gravação e replay. L-013, L-014, X-002.
 *
 * A parte difícil não é gravar — é a **chave**. Ela define o que conta como "a
 * mesma chamada", e uma chave malfeita destrói a reprodutibilidade sem nunca
 * dar erro: ampla demais, duas chamadas diferentes colidem e o replay devolve a
 * resposta da outra; estreita demais, nada casa e o replay estrito falha ou o
 * híbrido gasta dinheiro repetindo o que já tinha.
 *
 * A chave é o hash de: identificador do prompt, variáveis renderizadas, modelo,
 * provedor e parâmetros de amostragem. É exatamente o conjunto que, mudando,
 * mudaria a resposta.
 */

export const CASSETTE_MODES = ['live', 'hybrid', 'replay'] as const;
export type CassetteMode = (typeof CASSETTE_MODES)[number];

export interface CassetteRecord {
  readonly key: string;
  readonly promptId: string;
  readonly model: string;
  readonly provider: string;
  readonly recordedAt: string;
  readonly request: { readonly system: string; readonly user: string };
  readonly response: { readonly raw: string; readonly parsed: unknown };
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly costUsd: number;
    readonly latencyMs: number;
    readonly repairAttempts: number;
  };
}

/**
 * Chave estável e insensível à ordem de escrita.
 *
 * As variáveis vão ordenadas por nome porque `{a, b}` e `{b, a}` produzem a
 * mesma chamada e precisam produzir a mesma chave — do contrário a ordem em que
 * quem chama montou o objeto passaria a ser parte da identidade da chamada, e
 * uma refatoração inocente invalidaria todos os cassetes gravados.
 *
 * O preset **não** entra: dois presets que apontam para o mesmo modelo com a
 * mesma amostragem produzem a mesma chamada, e separá-los faria trocar de
 * preset descartar gravações ainda válidas.
 */
export function cassetteKey(
  promptId: string,
  variables: Readonly<Record<string, string>>,
  resolved: Resolved,
): string {
  const { binding } = resolved;
  const material = JSON.stringify({
    promptId,
    variables: Object.keys(variables)
      .sort()
      .map((k) => [k, variables[k]]),
    provider: binding.provider,
    model: binding.model,
    temperature: binding.temperature ?? null,
    maxTokens: binding.maxTokens ?? null,
    reasoningEffort: binding.reasoningEffort ?? null,
  });
  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}

export class CassetteStore {
  readonly #dir: string;
  readonly mode: CassetteMode;

  constructor(mode: CassetteMode, dir = cassetteDir()) {
    // Modo desconhecido não pode passar. O comportamento de um modo inválido
    // aqui é "grava e relê tudo", que não parece defeito nenhum: as chamadas
    // respondem, os testes rodam, e a segunda chamada com as mesmas variáveis
    // silenciosamente recebe a resposta da primeira.
    if (!CASSETTE_MODES.includes(mode)) {
      throw new Error(`modo de cassete inválido: "${mode}". Use ${CASSETTE_MODES.join(', ')}.`);
    }
    this.mode = mode;
    this.#dir = dir;
  }

  #pathFor(promptId: string, key: string): string {
    // Uma pasta por prompt. Vinte e quatro pastas legíveis valem mais que um
    // diretório único com milhares de hashes quando alguém precisa olhar o que
    // um prompt específico andou respondendo.
    return join(this.#dir, promptId.replace(/\./g, '/'), `${key}.json`);
  }

  read(promptId: string, key: string): CassetteRecord | undefined {
    const path = this.#pathFor(promptId, key);
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, 'utf8')) as CassetteRecord;
  }

  write(record: CassetteRecord): void {
    const path = this.#pathFor(record.promptId, record.key);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(record, null, 2), 'utf8');
  }

  /**
   * O que fazer diante de um cassete ausente, por modo (L-014).
   *
   * O modo replay falha **explicitamente**. Cair na rede em silêncio quando
   * falta gravação é o pior comportamento possível: a rodada que devia custar
   * zero e reproduzir exatamente passa a custar dinheiro e a divergir, e
   * ninguém fica sabendo.
   */
  onMiss(promptId: string, key: string): 'call' | never {
    if (this.mode === 'replay') {
      throw new CassetteMissError(promptId, key);
    }
    return 'call';
  }

  shouldRecord(): boolean {
    return this.mode !== 'replay';
  }

  count(): number {
    if (!existsSync(this.#dir)) return 0;
    let n = 0;
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(dir, e.name));
        else if (e.name.endsWith('.json')) n++;
      }
    };
    walk(this.#dir);
    return n;
  }
}

export class CassetteMissError extends Error {
  constructor(
    readonly promptId: string,
    readonly key: string,
  ) {
    super(
      `modo replay: nenhum cassete para "${promptId}" (chave ${key}). ` +
        `Rode em hybrid para gravar, ou verifique se prompt, variáveis ou modelo mudaram desde a gravação.`,
    );
    this.name = 'CassetteMissError';
  }
}

export function modeFromEnv(fallback: CassetteMode = 'hybrid'): CassetteMode {
  const raw = process.env['SIM_LLM_MODE'];
  if (raw === 'live' || raw === 'hybrid' || raw === 'replay') return raw;
  if (raw !== undefined && raw !== '') {
    throw new Error(`SIM_LLM_MODE inválido: "${raw}". Use live, hybrid ou replay.`);
  }
  return fallback;
}
