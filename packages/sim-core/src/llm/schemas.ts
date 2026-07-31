import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { SCHEMAS_DIR } from '../config/paths.js';

/**
 * Validação de resposta contra o schema declarado. L-007, X-009.
 *
 * `schemas/` é fonte única (02-ARQUITETURA seção 9): daqui saem os tipos
 * gerados, a validação em runtime e o trecho injetado no prompt. Prompt nenhum
 * define JSON inline, e é por isso que o modelo e o validador não podem
 * discordar sobre a forma esperada — os dois leem o mesmo arquivo.
 */

const DOMAIN = 'domain.schema.json';
const LLM_IO = 'llm-io.schema.json';

function readSchema(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(SCHEMAS_DIR, name), 'utf8')) as Record<string, unknown>;
}

const llmIo = readSchema(LLM_IO);
const domain = readSchema(DOMAIN);

let ajv: Ajv2020 | undefined;
const compiled = new Map<string, ValidateFunction>();

function getAjv(): Ajv2020 {
  if (ajv) return ajv;
  ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
  addFormats(ajv as never);
  // llm-io referencia domain por caminho relativo; os dois precisam estar
  // registrados sob o mesmo nome que o $ref usa.
  ajv.addSchema(domain, DOMAIN);
  ajv.addSchema(llmIo, LLM_IO);
  return ajv;
}

export function schemaDefinition(name: string): Record<string, unknown> {
  const defs = (llmIo['$defs'] ?? {}) as Record<string, unknown>;
  const def = defs[name];
  if (!def) throw new Error(`schema de saída desconhecido: "${name}" (ausente de ${LLM_IO})`);
  return def as Record<string, unknown>;
}

function validatorFor(name: string): ValidateFunction {
  let v = compiled.get(name);
  if (!v) {
    v = getAjv().compile({ $ref: `${LLM_IO}#/$defs/${name}` });
    compiled.set(name, v);
  }
  return v;
}

export interface ValidationResult {
  readonly valid: boolean;
  /** Mensagem já formatada para voltar ao modelo no passe de reparo (L-007). */
  readonly message?: string;
}

export function validateAgainstSchema(name: string, value: unknown): ValidationResult {
  const validate = validatorFor(name);
  if (validate(value)) return { valid: true };
  return { valid: false, message: formatErrors(validate.errors ?? []) };
}

/**
 * Erros do Ajv em texto curto e acionável.
 *
 * O texto vai de volta ao modelo no passe de reparo, então ele precisa dizer
 * **onde** e **o quê** em poucas palavras. Despejar o objeto de erro cru gasta
 * centenas de tokens descrevendo palavra-chave de schema, e um tier compact
 * costuma se perder no despejo em vez de consertar o campo.
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
  const extra = errors.length > 8 ? `\n(e mais ${errors.length - 8})` : '';
  return linhas.join('\n') + extra;
}

/**
 * O trecho de schema injetado no prompt (L-008).
 *
 * Vai o schema podado, e não o arquivo inteiro: as descrições em português
 * dentro dos `$defs` são notas de projeto que explicam *por que* o campo existe
 * e citam requisitos, e nada disso ajuda o modelo a preencher o formulário —
 * só gasta contexto e convida a citar requisito na resposta.
 */
export function schemaFragmentFor(name: string): string {
  const podado = stripDescriptions(schemaDefinition(name));
  return [
    'Responda **apenas** com JSON válido nesta forma, sem cerca de código e sem texto em volta:',
    '',
    '```json',
    JSON.stringify(podado, null, 2),
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
