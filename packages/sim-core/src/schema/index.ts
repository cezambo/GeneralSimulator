import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { SCHEMAS_DIR } from '../config/paths.js';

/**
 * Validação contra os schemas. X-009, X-010.
 *
 * `schemas/` é fonte única: daqui saem os tipos gerados, a validação em runtime
 * e o trecho de schema injetado no prompt. Um só Ajv serve aos dois arquivos,
 * porque `llm-io` referencia `domain` e instâncias separadas não resolveriam a
 * referência entre elas.
 */

export const DOMAIN = 'domain.schema.json';
export const LLM_IO = 'llm-io.schema.json';

function readSchema(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(SCHEMAS_DIR, name), 'utf8')) as Record<string, unknown>;
}

const schemas: Record<string, Record<string, unknown>> = {
  [DOMAIN]: readSchema(DOMAIN),
  [LLM_IO]: readSchema(LLM_IO),
};

/** O schema de domínio cru, para quem precisa ler marcações e não validar. V-013. */
export const domainSchema: Record<string, unknown> = schemas[DOMAIN]!;

let ajv: Ajv2020 | undefined;
const compiled = new Map<string, ValidateFunction>();

function getAjv(): Ajv2020 {
  if (ajv) return ajv;
  ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
  addFormats(ajv as never);
  ajv.addSchema(schemas[DOMAIN]!, DOMAIN);
  ajv.addSchema(schemas[LLM_IO]!, LLM_IO);
  return ajv;
}

export function definitionOf(file: string, name: string): Record<string, unknown> {
  const defs = (schemas[file]?.['$defs'] ?? {}) as Record<string, unknown>;
  const def = defs[name];
  if (!def) throw new Error(`definição desconhecida: "${name}" (ausente de ${file})`);
  return def as Record<string, unknown>;
}

export interface ValidationResult {
  readonly valid: boolean;
  /** Mensagem já formatada. Vai ao modelo no passe de reparo (L-007) e ao usuário na carga. */
  readonly message?: string;
}

function validate(file: string, name: string, value: unknown): ValidationResult {
  const chave = `${file}#${name}`;
  let v = compiled.get(chave);
  if (!v) {
    definitionOf(file, name);
    v = getAjv().compile({ $ref: `${file}#/$defs/${name}` });
    compiled.set(chave, v);
  }
  if (v(value)) return { valid: true };
  return { valid: false, message: formatErrors(v.errors ?? []) };
}

export function validateDomain(name: string, value: unknown): ValidationResult {
  return validate(DOMAIN, name, value);
}

export function validateLlmOutput(name: string, value: unknown): ValidationResult {
  return validate(LLM_IO, name, value);
}

/**
 * Erros do Ajv em texto curto e acionável.
 *
 * O texto vai de volta ao modelo no passe de reparo, então precisa dizer onde e
 * o quê em poucas palavras. Despejar o objeto de erro cru gasta centenas de
 * tokens descrevendo palavra-chave de schema, e um tier compact se perde no
 * despejo em vez de consertar o campo.
 */
function formatErrors(errors: readonly ErrorObject[]): string {
  const linhas = errors.slice(0, 8).map((e) => {
    const onde = e.instancePath || '(raiz)';
    if (e.keyword === 'additionalProperties') {
      return `${onde}: campo não previsto "${String((e.params as { additionalProperty?: string }).additionalProperty)}"`;
    }
    if (e.keyword === 'required') {
      return `${onde}: falta o campo obrigatório "${String((e.params as { missingProperty?: string }).missingProperty)}"`;
    }
    if (e.keyword === 'enum') {
      const vals = (e.params as { allowedValues?: unknown[] }).allowedValues ?? [];
      return `${onde}: valor fora do permitido. Use um de: ${vals.map(String).join(', ')}`;
    }
    return `${onde}: ${e.message ?? 'inválido'}`;
  });
  return linhas.join('\n') + (errors.length > 8 ? `\n(e mais ${errors.length - 8})` : '');
}

/**
 * O trecho de schema injetado no prompt. L-008.
 *
 * Vai podado, e não o arquivo inteiro: as descrições em português dentro dos
 * `$defs` são notas de projeto que explicam por que o campo existe e citam
 * requisitos, e nada disso ajuda o modelo a preencher o formulário — só gasta
 * contexto e convida a citar requisito na resposta.
 */
export function schemaFragmentFor(name: string): string {
  return [
    'Responda **apenas** com JSON válido nesta forma, sem cerca de código e sem texto em volta:',
    '',
    '```json',
    JSON.stringify(stripDescriptions(definitionOf(LLM_IO, name)), null, 2),
    '```',
  ].join('\n');
}

function stripDescriptions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripDescriptions);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'description' || k === '$comment') continue;
      out[k] = stripDescriptions(v);
    }
    return out;
  }
  return node;
}
