#!/usr/bin/env node
/**
 * Valida o alinhamento entre specs, prompts, schemas e configs.
 *
 * Implementa as três condições de L-020 / X-010:
 *   1. todo prompt declarado no registry existe no disco
 *   2. todo schema declarado no registry existe em llm-io.schema.json
 *   3. todo tipo e todo campo citado em prosa existe no schema associado
 *
 * A terceira é a que importa: as duas primeiras pegam arquivo faltando, e a
 * terceira pega a promessa que a prosa faz e o contrato não cumpre — que foi
 * como toda a deriva anterior entrou.
 *
 * Uso: node scripts/validate-contracts.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROMPTS_DIR = join(ROOT, 'prompts');
const SCHEMAS_DIR = join(ROOT, 'schemas');
const SPEC_DIR = join(ROOT, 'docs', 'spec');
const DOCS_DIR = join(ROOT, 'docs');
const CONFIG_DIR = join(ROOT, 'config');

const DEFS = '$defs';

let errors = 0;
let warnings = 0;
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`);
const fail = (m) => { console.error(`  ERRO  ${m}`); errors++; };
const warn = (m) => { console.warn(`  aviso ${m}`); warnings++; };
const ok = (m) => console.log(`  ok    ${m}`);

// Normaliza CRLF: em JavaScript o ponto de uma regex não casa \r, e todo
// padrão ancorado em fim de linha falharia silenciosamente sem isto.
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const readJson = (p) => JSON.parse(read(p));

/** Configs usam ora lista, ora objeto indexado por id. Normaliza para lista. */
const asList = (v) => (Array.isArray(v) ? v : Object.entries(v ?? {}).map(([id, o]) => ({ id, ...o })));

// ═══════════════════════════════════════════════════════════════════
// Carga
// ═══════════════════════════════════════════════════════════════════
const llmIo = readJson(join(SCHEMAS_DIR, 'llm-io.schema.json'));
const domain = readJson(join(SCHEMAS_DIR, 'domain.schema.json'));
const llmSchemaNames = new Set(Object.keys(llmIo[DEFS] || {}));
const domainTypeNames = new Set(Object.keys(domain[DEFS] || {}));

const registryPath = join(PROMPTS_DIR, 'prompt_registry.yaml');
const registryText = read(registryPath);

const specFiles = readdirSync(SPEC_DIR).filter((f) => /^SPEC-[A-Z]-.*\.md$/.test(f));
const specTexts = new Map(specFiles.map((f) => [f, read(join(SPEC_DIR, f))]));

const tuning = readJson(join(CONFIG_DIR, 'tuning.example.json'));

// ═══════════════════════════════════════════════════════════════════
// 1. Registry: prompts e schemas
// ═══════════════════════════════════════════════════════════════════
section('Registry');

const promptBlocks = registryText.split(/\n  (?=[a-z]+\.[a-z_.]+:)/);
const prompts = [];

for (const block of promptBlocks) {
  const idMatch = block.match(/^([a-z]+\.[a-z_.]+):/m);
  if (!idMatch) continue;
  const fileMatch = block.match(/^\s+file:\s+"([^"]+)"/m);
  const schemaMatch = block.match(/^\s+schema:\s+(\S+)/m);
  const tierMatch = block.match(/^\s+tier:\s+(\S+)/m);
  const statusMatch = block.match(/^\s+status:\s+(\S+)/m);
  const varsMatch = block.match(/^\s+variables:\s+\[([^\]]*)\]/m);
  prompts.push({
    id: idMatch[1],
    file: fileMatch?.[1] ?? null,
    schema: schemaMatch?.[1] === 'null' ? null : schemaMatch?.[1] ?? null,
    tier: tierMatch?.[1] ?? null,
    status: statusMatch?.[1] ?? null,
    variables: varsMatch ? varsMatch[1].split(',').map((v) => v.trim()).filter(Boolean) : [],
  });
}

ok(`${prompts.length} prompts declarados`);

const promptIds = new Set(prompts.map((p) => p.id));

// ═══════════════════════════════════════════════════════════════════
// 2. Vocabulário aposentado — varrido em TODO o repositório de texto
// ═══════════════════════════════════════════════════════════════════
section('Vocabulário aposentado');

const OBSOLETE_TIERS = ['utility', 'instinct', 'standard', 'deep', 'archivist', 'gm_fast', 'gm_deep', 'builder'];
const OBSOLETE_PROMPTS = [
  'thought_router', 'action_intent', 'goal_daily', 'goal_reactive', 'goal_seasonal',
  'goal_annual', 'evaluate_low', 'report_vs_log', 'memory_consolidation',
  'tactical_narration', 'tactical_choice', 'shout_propagation', 'system_rules',
];

const VALID_TIERS = ['compact', 'narrative', 'longform'];
for (const t of VALID_TIERS) {
  if (!registryText.includes(`tier: ${t}`)) warn(`nenhum prompt usa o tier ${t}`);
}

// Varre docs, prompts e configs — não só o registry. B14 passou por aqui.
const textTargets = [];
const collect = (dir, filter) => {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, f.name);
    if (f.isDirectory()) collect(full, filter);
    else if (filter(f.name)) textTargets.push(full);
  }
};
collect(DOCS_DIR, (n) => n.endsWith('.md'));
collect(PROMPTS_DIR, (n) => n.endsWith('.md') || n.endsWith('.yaml'));
collect(CONFIG_DIR, (n) => n.endsWith('.json') || n.endsWith('.md'));

// Dizer que algo foi removido não é usá-lo. Uma linha que nega, historia ou
// substitui o termo é exatamente a documentação que queremos ter, e sinalizá-la
// treinaria o leitor a ignorar o validador.
// Prefixos, sem fronteira à direita: "Removidos" e "Substituído" precisam casar.
const NEGATING = /(\bsem\b|removid|remoçã|remocã|não há|nao ha|não existe|substituíd|substituid|apagad|aposentad|órfã|orfã|orfa|histórico|historico|deixou de|em vez de|obsolet|⚑)/i;

const scanLines = (file) => {
  const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
  const lines = read(file).split('\n');
  return lines.map((line, i) => ({ rel, line, n: i + 1 }));
};

for (const file of textTargets) {
  for (const { rel, line, n } of scanLines(file)) {
    if (NEGATING.test(line)) continue;
    for (const t of OBSOLETE_TIERS) {
      // Só conta como tier quando aparece em posição de tier, não como palavra solta.
      if (new RegExp(`(tier|ROLE)[^\\n]{0,20}\\b${t}\\b|\`${t}\`\\s*[|,]`, 'i').test(line)) {
        fail(`${rel}:${n}: tier aposentado "${t}"`);
      }
    }
    for (const p of OBSOLETE_PROMPTS) {
      if (line.includes(p)) fail(`${rel}:${n}: referência a prompt aposentado "${p}"`);
    }
    if (/mem[óo]ria do GM/i.test(line)) warn(`${rel}:${n}: cita "memória do GM", que é não-objetivo declarado`);
  }
}
if (errors === 0) ok('nenhum termo aposentado em uso');

// ═══════════════════════════════════════════════════════════════════
// 3. Prompts: arquivo, schema, variáveis nos dois sentidos
// ═══════════════════════════════════════════════════════════════════
section('Prompts');

for (const p of prompts) {
  if (!p.file) { fail(`${p.id}: sem file declarado`); continue; }
  const filePath = join(PROMPTS_DIR, p.file);

  if (!existsSync(filePath)) {
    if (p.status === 'falta') warn(`${p.id}: arquivo ainda não escrito (${p.file}) — status: falta`);
    else fail(`${p.id}: arquivo ausente ${p.file} (status: ${p.status ?? 'não declarado'})`);
    continue;
  }

  const content = read(filePath);

  for (const v of p.variables) {
    if (/_[a-z]/.test(v)) fail(`${p.id}: variável snake_case no registry: ${v}`);
    if (!content.includes(`{{${v}}}`)) fail(`${p.id}: variável ${v} declarada no registry e ausente do template`);
  }

  // Sentido inverso: L-008 diz que variável não fornecida é erro, então toda
  // variável do template precisa estar declarada.
  const inTemplate = new Set([...content.matchAll(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g)].map((m) => m[1]));
  for (const v of inTemplate) {
    if (!p.variables.includes(v)) fail(`${p.id}: variável {{${v}}} usada no template e não declarada no registry`);
  }

  if (p.schema && !llmSchemaNames.has(p.schema)) fail(`${p.id}: schema desconhecido ${p.schema}`);

  // Terceira condição: campo citado em prosa existe no schema de saída.
  if (p.schema && llmIo[DEFS][p.schema]) {
    const schemaProps = collectPropertyNames(llmIo[DEFS][p.schema]);
    const body = content.replace(/\{\{[^}]*\}\}/g, ' ');
    const cited = new Set([...body.matchAll(/`([a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+)`/g)].map((m) => m[1]));
    for (const c of cited) {
      const head = c.split('.')[0];
      const leaf = c.split('.').pop();
      // Só cobra caminhos que se anunciam como do próprio schema de saída.
      if (head === p.schema || schemaProps.has(head)) {
        if (!schemaProps.has(leaf)) fail(`${p.id}: prosa cita \`${c}\`, ausente de ${p.schema}`);
      }
    }
  }
}
ok('prompts verificados');

function collectPropertyNames(node, acc = new Set(), depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return acc;
  if (node.properties) for (const k of Object.keys(node.properties)) { acc.add(k); collectPropertyNames(node.properties[k], acc, depth + 1); }
  if (node.items) collectPropertyNames(node.items, acc, depth + 1);
  for (const key of ['oneOf', 'anyOf', 'allOf']) if (Array.isArray(node[key])) for (const s of node[key]) collectPropertyNames(s, acc, depth + 1);
  return acc;
}

// ═══════════════════════════════════════════════════════════════════
// 4. Specs: integridade de identificadores e dependências
// ═══════════════════════════════════════════════════════════════════
section('Specs — identificadores');

const allReqs = new Map(); // id -> { file, deps, prompts, title }
for (const [file, text] of specTexts) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^###\s+([A-Z]-\d{3})\s+[—–-]\s+(.+)$/);
    if (!h) continue;
    const [, id, title] = h;
    if (allReqs.has(id)) fail(`${id} definido duas vezes (${allReqs.get(id).file} e ${file})`);
    const meta = lines[i + 1] ?? '';
    const deps = (meta.match(/dep:\s*([^·]+)/)?.[1] ?? '')
      .split(',').map((d) => d.trim()).filter((d) => /^[A-Z]-\d{3}$/.test(d));
    const usedPrompts = [...meta.matchAll(/`([a-z]+\.[a-z_.]+)`/g)].map((m) => m[1]);
    allReqs.set(id, { file, deps, prompts: usedPrompts, title });
  }
}
ok(`${allReqs.size} requisitos em ${specFiles.length} specs`);

for (const [id, r] of allReqs) {
  for (const d of r.deps) {
    if (!allReqs.has(d)) fail(`${id} (${r.file}) depende de ${d}, que não existe`);
  }
  for (const pid of r.prompts) {
    if (!promptIds.has(pid)) fail(`${id} (${r.file}) cita o prompt ${pid}, ausente do registry`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. Terceira condição, lado das specs: tipo citado existe no domínio
// ═══════════════════════════════════════════════════════════════════
section('Specs — tipos citados');

// Nomes em PascalCase que aparecem entre crases numa spec devem ser tipos reais.
// Falsos positivos conhecidos ficam aqui, e a lista curta é intencional: cada
// entrada é uma exceção que alguém teve que justificar.
const NOT_A_TYPE = new Set(['README', 'SPEC', 'JSON', 'PDF', 'LLM', 'GM', 'UI', 'API', 'CPU', 'TypeScript', 'GDScript', 'OpenRouter', 'WebSocket', 'Godot', 'React', 'Node']);

for (const [file, text] of specTexts) {
  const cited = new Set();
  for (const m of text.matchAll(/[Cc]onforme\s+`([A-Za-z_][A-Za-z0-9_]*)`/g)) cited.add(m[1]);
  for (const m of text.matchAll(/`([A-Z][a-z]+(?:[A-Z][a-z0-9]+)+)`/g)) cited.add(m[1]);

  for (const c of cited) {
    if (NOT_A_TYPE.has(c)) continue;
    if (domainTypeNames.has(c) || llmSchemaNames.has(c)) continue;
    fail(`${file}: cita o tipo \`${c}\`, ausente de domain.schema.json e llm-io.schema.json`);
  }

  // Schemas de saída citados em prosa
  for (const m of text.matchAll(/`([a-z][a-z0-9_]*_response)`/g)) {
    if (!llmSchemaNames.has(m[1])) fail(`${file}: cita o schema \`${m[1]}\`, ausente de llm-io.schema.json`);
  }
}
ok('tipos citados nas specs conferidos');

// ═══════════════════════════════════════════════════════════════════
// 6. Números: o que a spec diz estar em tuning precisa estar em tuning
// ═══════════════════════════════════════════════════════════════════
section('Números ajustáveis');

const tuningLeaves = new Set();
(function walk(o, path = []) {
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('$') || k.startsWith('_')) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, [...path, k]);
    else tuningLeaves.add(k);
  }
})(tuning);
ok(`${tuningLeaves.size} parâmetros em tuning.example.json`);

// Prompt não pode carregar número de comportamento — X-008.
for (const p of prompts) {
  if (!p.file) continue;
  const fp = join(PROMPTS_DIR, p.file);
  if (!existsSync(fp)) continue;
  const body = read(fp).replace(/\{\{[^}]*\}\}/g, ' ');
  for (const m of body.matchAll(/[<>≥≤]\s*(\d+(?:\.\d+)?)|\b(?:acima de|abaixo de|no máximo|no mínimo|limitad[oa] a)\s+(\d+)/gi)) {
    warn(`${p.id}: número de comportamento embutido na prosa ("${m[0].trim()}") — X-008 manda vir de tuning`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 7. Configs: coerência interna e contra o vocabulário do domínio
// ═══════════════════════════════════════════════════════════════════
section('Configs');

const damageTypes = new Set(domain[DEFS].DamageType.enum);

// Corpo: a cobertura precisa somar 1, senão a seleção de parte atingida enviesa.
const body = readJson(join(CONFIG_DIR, 'body.example.json'));
const bodyParts = asList(body.parts);
const coverageSum = bodyParts.reduce((s, p) => s + (p.coverage ?? 0), 0);
if (Math.abs(coverageSum - 1) > 0.0005) {
  fail(`body.example.json: soma de coverage é ${coverageSum.toFixed(4)}, deveria ser 1.0000`);
} else ok('soma de coverage do corpo é 1.0000');

const bodyPartIds = new Set(bodyParts.map((p) => p.id));
for (const p of bodyParts) {
  if (p.parent && !bodyPartIds.has(p.parent)) fail(`body.example.json: ${p.id}.parent aponta para "${p.parent}", que não existe`);
}

// Matriz de lesão: tipo de dano precisa estar no vocabulário fechado, e toda
// condição produzida precisa estar declarada.
const conditions = readJson(join(CONFIG_DIR, 'conditions.example.json'));
const conditionIds = new Set(asList(conditions.conditions).map((c) => c.id));
const seenDamage = new Set();
const matrixRows = asList(conditions.injuryMatrix);
for (const row of matrixRows) {
  const dt = row.damageType ?? row.damage;
  // '*' é o curinga da regra de fallback, não um tipo de dano.
  if (dt && dt !== '*') {
    seenDamage.add(dt);
    if (!damageTypes.has(dt)) fail(`conditions.example.json: matriz usa dano "${dt}", fora do vocabulário DamageType`);
  }
  const produced = row.condition ?? row.conditionId ?? row.produces;
  if (produced && !conditionIds.has(produced)) {
    fail(`conditions.example.json: matriz produz a condição "${produced}", que não está declarada`);
  }
}
// Totalidade: um dano sem regra é uma agressão que não resolve em nada.
for (const dt of damageTypes) {
  if (!seenDamage.has(dt)) fail(`conditions.example.json: nenhuma regra da matriz cobre o dano "${dt}" — uma agressão desse tipo não produziria ferimento`);
}

// Reações: material e efeito citados precisam existir.
const materials = readJson(join(CONFIG_DIR, 'materials.example.json'));
const materialIds = new Set(asList(materials.materials).concat(asList(materials.elements)).map((m) => m.id));
const reactions = readJson(join(CONFIG_DIR, 'reactions.example.json'));
const effectIds = new Set(asList(reactions.effects).map((e) => (typeof e === 'string' ? e : e.id)));

const checkMaterialRef = (val, where) => {
  if (typeof val !== 'string' || val.startsWith('#') || val.startsWith('@')) return;
  if (!materialIds.has(val)) fail(`reactions.example.json: ${where} referencia "${val}", ausente do catálogo de materiais`);
};
for (const r of asList(reactions.reactions)) {
  const label = r.id ?? r.porque ?? r.description ?? '?';
  checkMaterialRef(r.into, `regra "${String(label).slice(0, 40)}" (into)`);
  if (r.effect && effectIds.size && !effectIds.has(r.effect)) {
    fail(`reactions.example.json: regra usa o efeito "${r.effect}", não declarado em effects`);
  }
}
for (const t of asList(reactions.injuryTriggers)) {
  const inj = t.injury ?? {};
  if (inj.condition && !conditionIds.has(inj.condition)) {
    fail(`reactions.example.json: gatilho "${t.id}" produz a condição "${inj.condition}", não declarada em conditions`);
  }
  if (inj.damageType && !damageTypes.has(inj.damageType)) {
    fail(`reactions.example.json: gatilho "${t.id}" usa dano "${inj.damageType}", fora do vocabulário DamageType`);
  }
}
for (const m of asList(materials.materials).concat(asList(materials.elements))) {
  for (const k of ['rubbleMaterialId', 'meltsTo', 'freezesTo', 'boilsTo', 'burnsTo']) {
    if (m[k] && !materialIds.has(m[k])) fail(`materials.example.json: ${m.id}.${k} aponta para "${m[k]}", ausente do catálogo`);
  }
  for (const k of Object.keys(m.damageResistance ?? {})) {
    if (!damageTypes.has(k)) fail(`materials.example.json: ${m.id}.damageResistance usa "${k}", fora do vocabulário DamageType`);
  }
}
ok('configs conferidos contra o catálogo');

// ═══════════════════════════════════════════════════════════════════
// 8. Fragmentos compartilhados e invariantes pontuais
// ═══════════════════════════════════════════════════════════════════
section('Invariantes');

for (const rule of ['rules_universal.md', 'rules_agent.md', 'rules_gm.md']) {
  if (!existsSync(join(PROMPTS_DIR, '_shared', rule))) fail(`regra compartilhada ausente: ${rule}`);
}
if (existsSync(join(PROMPTS_DIR, '_shared', 'system_rules.md'))) fail('system_rules.md ainda existe — foi substituído pelos três fragmentos');

if (!llmIo[DEFS]?.gm_response?.properties?.generalization) fail('gm_response sem campo generalization');

for (const t of ['ConversationInstance', 'ProvisionalRule', 'CommunityGoal', 'PlausibilityRegistry', 'RawImpression', 'ThoughtTrigger', 'DamageType']) {
  if (!domainTypeNames.has(t)) fail(`tipo ausente de domain.schema.json: ${t}`);
}
ok('invariantes verificadas');

// ═══════════════════════════════════════════════════════════════════
console.log('');
if (errors > 0) {
  console.error(`FALHOU: ${errors} erro(s), ${warnings} aviso(s)`);
  process.exit(1);
}
console.log(`PASSOU: 0 erros, ${warnings} aviso(s)`);
