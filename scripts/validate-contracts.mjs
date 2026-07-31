#!/usr/bin/env node
/**
 * Valida alinhamento entre prompt_registry.yaml, arquivos .md e schemas.
 * Uso: node scripts/validate-contracts.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROMPTS_DIR = join(ROOT, 'prompts');
const SCHEMAS_DIR = join(ROOT, 'schemas');

let errors = 0;
let warnings = 0;

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`WARN: ${msg}`);
  warnings++;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

// ── Schemas ──────────────────────────────────────────────────────────
const llmIo = JSON.parse(readFileSync(join(SCHEMAS_DIR, 'llm-io.schema.json'), 'utf8'));
const schemaNames = new Set(Object.keys(llmIo.$defs || {}));

const forbiddenSchemas = ['thought_router_response', 'action_intent_response', 'goal_response', 'goal_reactive_response'];
for (const name of forbiddenSchemas) {
  if (schemaNames.has(name)) fail(`Schema obsoleto ainda presente: ${name}`);
}

// ── Registry ─────────────────────────────────────────────────────────
const registryPath = join(PROMPTS_DIR, 'prompt_registry.yaml');
const registryText = readFileSync(registryPath, 'utf8');

if (registryText.includes('system_rules')) {
  fail('prompt_registry.yaml ainda referencia system_rules');
}

if (registryText.includes('thought_router') || registryText.includes('action_intent')) {
  fail('prompt_registry.yaml ainda referencia pipeline colapsado (thought_router/action_intent)');
}

const obsoletePrompts = [
  'goal_daily', 'goal_reactive', 'goal_seasonal', 'goal_annual',
  'evaluate_low', 'combat.', 'report_vs_log', 'memory_consolidation',
  'tactical_narration', 'tactical_choice', 'shout_propagation',
];
for (const obs of obsoletePrompts) {
  if (registryText.includes(obs)) fail(`prompt_registry.yaml ainda lista prompt obsoleto: ${obs}`);
}

// Parse prompt entries
const promptBlocks = registryText.split(/\n  (?=[a-z]+\.[a-z_.]+:)/);
const prompts = [];

for (const block of promptBlocks) {
  const idMatch = block.match(/^([a-z]+\.[a-z_.]+):/m);
  if (!idMatch) continue;
  const id = idMatch[1];

  const fileMatch = block.match(/^\s+file:\s+"([^"]+)"/m);
  const schemaMatch = block.match(/^\s+schema:\s+(\S+)/m);
  const varsMatch = block.match(/^\s+variables:\s+\[([^\]]*)\]/m);

  prompts.push({
    id,
    file: fileMatch?.[1] ?? null,
    schema: schemaMatch?.[1] === 'null' ? null : schemaMatch?.[1] ?? null,
    variables: varsMatch
      ? varsMatch[1].split(',').map((v) => v.trim()).filter(Boolean)
      : [],
  });
}

ok(`${prompts.length} prompts no registry`);

// ── Tiers ────────────────────────────────────────────────────────────
const validTiers = ['compact', 'narrative', 'longform'];
for (const tier of validTiers) {
  if (!registryText.includes(`${tier}:`)) fail(`Tier ausente no registry: ${tier}`);
}

const obsoleteTiers = ['utility', 'instinct', 'standard', 'deep', 'archivist', 'gm_fast', 'gm_deep', 'builder'];
for (const tier of obsoleteTiers) {
  if (registryText.match(new RegExp(`tier:\\s+${tier}\\b`))) {
    fail(`Tier obsoleto ainda em uso: ${tier}`);
  }
}

// ── Per-prompt checks ────────────────────────────────────────────────
const snakeCaseVar = /_[a-z]/;

for (const p of prompts) {
  if (!p.file) {
    fail(`${p.id}: sem file declarado`);
    continue;
  }

  const filePath = join(PROMPTS_DIR, p.file);
  if (!existsSync(filePath)) {
    fail(`${p.id}: arquivo ausente ${p.file}`);
    continue;
  }

  const content = readFileSync(filePath, 'utf8');

  if (content.includes('system_rules.md')) {
    fail(`${p.id}: ainda inclui system_rules.md`);
  }

  for (const v of p.variables) {
    if (snakeCaseVar.test(v)) {
      fail(`${p.id}: variável snake_case no registry: ${v}`);
    }
  }

  // Variáveis do registry devem aparecer no template
  for (const v of p.variables) {
    const placeholder = `{{${v}}}`;
    if (!content.includes(placeholder)) {
      warn(`${p.id}: variável ${v} não encontrada no template`);
    }
  }

  if (p.schema && !schemaNames.has(p.schema)) {
    fail(`${p.id}: schema desconhecido ${p.schema}`);
  }
}

// ── Shared rules ─────────────────────────────────────────────────────
for (const rule of ['rules_universal.md', 'rules_agent.md', 'rules_gm.md']) {
  const p = join(PROMPTS_DIR, '_shared', rule);
  if (!existsSync(p)) fail(`Regra compartilhada ausente: ${rule}`);
  else ok(`_shared/${rule}`);
}

if (existsSync(join(PROMPTS_DIR, '_shared', 'system_rules.md'))) {
  fail('system_rules.md ainda existe — deveria ter sido removido');
}

// ── gm_response generalization ───────────────────────────────────────
const gmSchema = llmIo.$defs?.gm_response;
if (!gmSchema?.properties?.generalization) {
  fail('gm_response sem campo generalization');
} else {
  ok('gm_response.generalization presente');
}

// ── Summary ──────────────────────────────────────────────────────────
console.log('');
if (errors > 0) {
  console.error(`FALHOU: ${errors} erro(s), ${warnings} aviso(s)`);
  process.exit(1);
}
console.log(`PASSOU: 0 erros, ${warnings} aviso(s)`);
