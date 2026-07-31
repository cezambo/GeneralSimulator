import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Raiz do repositório, achada subindo até encontrar `schemas/`.
 *
 * Subir procurando um marcador, em vez de contar `..` a partir daqui, é o que
 * mantém isto funcionando quando o módulo roda de `src/` em desenvolvimento e
 * de `dist/` depois de compilado — os dois estão a profundidades diferentes.
 */
function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'schemas', 'domain.schema.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('raiz do repositório não encontrada: nenhum ancestral tem schemas/domain.schema.json');
}

export const REPO_ROOT = findRepoRoot();
export const SCHEMAS_DIR = join(REPO_ROOT, 'schemas');
export const PROMPTS_DIR = join(REPO_ROOT, 'prompts');
export const CONFIG_DIR = join(REPO_ROOT, 'config');

/**
 * Config real quando existe, `.example` como reserva.
 *
 * `config/README.md` diz que os `*.example.json` são referência versionada e os
 * reais ficam de fora. Cair no exemplo é o que faz um clone novo rodar sem
 * nenhum passo de preparação; sem isso, a primeira execução de quem clona falha
 * por arquivo ausente, o que é um jeito ruim de dar as boas-vindas.
 */
export function configPath(name: string): string {
  const real = join(CONFIG_DIR, `${name}.json`);
  if (existsSync(real)) return real;
  const example = join(CONFIG_DIR, `${name}.example.json`);
  if (existsSync(example)) return example;
  throw new Error(`config ausente: nem ${name}.json nem ${name}.example.json em config/`);
}

export function cassetteDir(): string {
  return resolve(REPO_ROOT, process.env['SIM_CASSETTE_DIR'] ?? 'cassettes');
}
