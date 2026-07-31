import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PROMPTS_DIR } from '../config/paths.js';
import type { PromptEntry } from './registry.js';
import { schemaFragmentFor } from './schemas.js';

/**
 * Renderização de prompt. L-008.
 *
 * Resolve `{{include:...}}`, substitui `{{variavel}}` e injeta o trecho do
 * schema de saída. Variável declarada e não fornecida é **erro**, nunca string
 * vazia — um buraco silencioso no contexto produz uma resposta plausível sobre
 * a coisa errada, que é o defeito mais caro de diagnosticar num corpo de
 * vinte e quatro prompts.
 */

const INCLUDE = /\{\{include:([^}]+)\}\}/g;
const VAR = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g;
const MAX_INCLUDE_DEPTH = 5;

export interface RenderedPrompt {
  readonly system: string;
  readonly user: string;
  /** Só as variáveis que o registro declara, na forma que entrou. Vira chave de cassete. */
  readonly resolvedVariables: Readonly<Record<string, string>>;
}

function resolveIncludes(text: string, depth = 0): string {
  if (depth > MAX_INCLUDE_DEPTH) {
    throw new Error(`inclusão aninhada além de ${MAX_INCLUDE_DEPTH} níveis — provável ciclo`);
  }
  return text.replace(INCLUDE, (_m, rel: string) => {
    const path = join(PROMPTS_DIR, rel.trim());
    if (!existsSync(path)) throw new Error(`fragmento incluído não existe: ${rel.trim()}`);
    return resolveIncludes(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'), depth + 1);
  });
}

/**
 * Separa o arquivo em system e user.
 *
 * O formato dos arquivos é markdown com cabeçalhos `## System` e
 * `## User Template`. Tudo acima do primeiro é documentação para quem edita, e
 * **não** vai para o modelo: as tabelas de metadados, o "por que este prompt é
 * crítico" e as notas de teste existem para o humano que ajusta o prompt entre
 * rodadas, e mandá-las junto seria pagar tokens para explicar ao modelo por que
 * ele está sendo chamado.
 */
function splitSections(text: string): { system: string; user: string } {
  const systemAt = text.search(/^## System\s*$/m);
  const userAt = text.search(/^## User Template\s*$/m);
  if (systemAt < 0) throw new Error('prompt sem seção "## System"');
  if (userAt < 0) throw new Error('prompt sem seção "## User Template"');
  if (userAt < systemAt) throw new Error('prompt com "## User Template" antes de "## System"');

  const system = text.slice(systemAt).replace(/^## System\s*\n/, '').slice(0, userAt - systemAt - 11);
  const afterUser = text.slice(userAt).replace(/^## User Template\s*\n/, '');
  // As notas de teste são para quem edita, não para o modelo.
  const notesAt = afterUser.search(/^## Notas de teste\s*$/m);
  const user = notesAt >= 0 ? afterUser.slice(0, notesAt) : afterUser;

  return { system: system.trim(), user: user.trim() };
}

function stripSeparators(s: string): string {
  return s.replace(/\n---\s*\n/g, '\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function renderPrompt(
  entry: PromptEntry,
  variables: Readonly<Record<string, unknown>>,
): RenderedPrompt {
  const path = join(PROMPTS_DIR, entry.file);
  if (!existsSync(path)) {
    throw new Error(`prompt "${entry.id}": arquivo ausente (${entry.file}) — status no registro: ${entry.status}`);
  }

  const raw = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const withIncludes = resolveIncludes(raw);
  const { system, user } = splitSections(withIncludes);

  // Toda variável declarada tem de ter sido fornecida. Fornecer a mais também é
  // erro, e por um motivo menos óbvio: variável extra não aparece no texto
  // renderizado, então ela não muda a chamada — mas quem a passou acredita que
  // mudou, e vai depurar a resposta procurando o efeito de um dado que nunca
  // chegou ao modelo.
  const faltando = entry.variables.filter((v) => variables[v] === undefined);
  if (faltando.length > 0) {
    throw new Error(
      `prompt "${entry.id}": variável declarada e não fornecida: ${faltando.join(', ')}`,
    );
  }
  const declaradas = new Set(entry.variables);
  const sobrando = Object.keys(variables).filter((k) => !declaradas.has(k));
  if (sobrando.length > 0) {
    throw new Error(
      `prompt "${entry.id}": variável fornecida e não declarada no registro: ${sobrando.join(', ')}`,
    );
  }

  const resolved: Record<string, string> = {};
  for (const name of entry.variables) {
    const v = variables[name];
    resolved[name] = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  }

  const substitute = (text: string): string =>
    text.replace(VAR, (m, name: string) => {
      const v = resolved[name];
      if (v === undefined) {
        // Placeholder no arquivo que o registro não declara. É defeito de
        // contrato, e o verificador já reclama dele — mas em execução também,
        // porque o registro pode ter sido editado sem rodar o verificador.
        throw new Error(
          `prompt "${entry.id}": arquivo usa {{${name}}}, ausente das variáveis do registro`,
        );
      }
      return v;
    });

  const corpo = stripSeparators(substitute(user));
  const userComSchema =
    entry.schema === null ? corpo : [corpo, '', schemaFragmentFor(entry.schema)].join('\n');

  return {
    system: stripSeparators(substitute(system)),
    user: userComSchema,
    resolvedVariables: resolved,
  };
}
