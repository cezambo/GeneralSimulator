import { definitionOf, validateLlmOutput, LLM_IO, type ValidationResult } from '../schema/index.js';

export { schemaFragmentFor } from '../schema/index.js';
export type { ValidationResult };

export function schemaDefinition(name: string): Record<string, unknown> {
  return definitionOf(LLM_IO, name);
}

/** Valida uma resposta de LLM contra o schema declarado pelo prompt. L-007. */
export function validateAgainstSchema(name: string, value: unknown): ValidationResult {
  return validateLlmOutput(name, value);
}
