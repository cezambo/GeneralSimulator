/**
 * Núcleo headless. X-001.
 *
 * Nada aqui importa renderização, e a regra não é honra: `tsconfig.base.json`
 * omite a lib "dom", então o compilador recusa antes de a convenção ser
 * esquecida. Se essa regra cair uma vez, o benefício da separação evapora
 * (02-ARQUITETURA seção 3).
 *
 * O mapa de módulos e quem é dono de cada um está em `src/README.md`.
 */

export { SeedRoot, hashString, type Rng } from './rng/index.js';
export * from './llm/index.js';
export * from './state/index.js';
export * from './perception/index.js';
export * from './cognition/context.js';
export { validateDomain, validateLlmOutput, definitionOf } from './schema/index.js';
export * from './types/domain.js';
