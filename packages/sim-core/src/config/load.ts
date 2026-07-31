/**
 * Carregador de configuração. X-008.
 *
 * Materiais, reações, corpo, condições, objetos e tuning vivem em `config/`,
 * não em código. Alterar um número de comportamento não exige recompilar.
 *
 * Chaves que começam com `_` são comentário e somem na carga — o arquivo de
 * exemplo pode ser verboso sem poluir o estado vivo.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BodyPlan, type BodyPlanConfig } from '../body/plan.js';
import { ConditionCatalog } from '../body/conditions.js';
import { InjuryMatrix } from '../body/injury.js';
import { validateDomain } from '../schema/index.js';
import { MaterialCatalog } from '../substrate/target.js';
import { ReactionMatrix, type ReactionRule } from '../substrate/matrix.js';
import type { Material, ObjectDef } from '../types/domain.js';
import { configPath } from './paths.js';

export interface TuningConfig {
  readonly metersPerTile: number;
  readonly minutesPerTick: number;
  readonly hoursPerDay: number;
  readonly daysPerSeason: number;
  readonly seasonsPerYear: number;
  readonly availableSpeeds: readonly number[];
  readonly coneAngleDeg: number;
  readonly visionRangeMeters: number;
  readonly hearingRangeMeters: number;
  readonly interactionRangeMeters: number;
  readonly baseSpeedMetersPerSecond: number;
  readonly minSpeedFactor: number;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface ModelPresetsFile {
  readonly activePreset: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface SimConfig {
  readonly materials: MaterialCatalog;
  readonly reactions: ReactionMatrix;
  readonly body: BodyPlan;
  readonly conditions: ConditionCatalog;
  readonly injury: InjuryMatrix;
  readonly objects: ReadonlyMap<string, ObjectDef>;
  readonly tuning: TuningConfig;
  readonly models: ModelPresetsFile;
  /** Impressão digital do conjunto carregado — vai no manifest do save. */
  readonly fingerprint: string;
  readonly sources: Readonly<Record<string, string>>;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Carrega o pacote completo a partir de `config/`.
 *
 * Usa o arquivo real quando existe, `.example` como reserva — um clone novo
 * roda sem passo de preparação.
 */
export function loadConfig(names?: {
  materials?: string;
  reactions?: string;
  body?: string;
  conditions?: string;
  objects?: string;
  tuning?: string;
  models?: string;
}): SimConfig {
  const sources = {
    materials: configPath(names?.materials ?? 'materials'),
    reactions: configPath(names?.reactions ?? 'reactions'),
    body: configPath(names?.body ?? 'body'),
    conditions: configPath(names?.conditions ?? 'conditions'),
    objects: configPath(names?.objects ?? 'objects'),
    tuning: configPath(names?.tuning ?? 'tuning'),
    models: configPath(names?.models ?? 'models'),
  };

  const materialsRaw = readJson(sources.materials);
  const reactionsRaw = readJson(sources.reactions);
  const bodyRaw = readJson(sources.body);
  const conditionsRaw = readJson(sources.conditions);
  const objectsRaw = readJson(sources.objects);
  const tuningRaw = readJson(sources.tuning);
  const modelsRaw = readJson(sources.models);

  const materials = loadMaterials(materialsRaw);
  const catalog = new MaterialCatalog(materials);

  const body = new BodyPlan(stripComments(bodyRaw) as BodyPlanConfig);
  assertBodyMaterials(body, catalog);

  const conditionsFile = stripComments(conditionsRaw) as {
    conditions: Record<string, Record<string, unknown>>;
    injuryMatrix: Record<string, unknown>[];
  };
  if (!conditionsFile.conditions || !conditionsFile.injuryMatrix) {
    throw new ConfigError('conditions: faltam "conditions" ou "injuryMatrix"');
  }
  const conditions = new ConditionCatalog(conditionsFile);
  const injury = new InjuryMatrix(conditionsFile.injuryMatrix);
  assertInjuryConditions(injury, conditions);

  const reactions = loadReactions(reactionsRaw, catalog);
  const objects = loadObjects(objectsRaw, catalog);
  const tuning = loadTuning(tuningRaw);
  const models = loadModels(modelsRaw);

  const fingerprint = fingerprintOf([
    sources.materials,
    sources.reactions,
    sources.body,
    sources.conditions,
    sources.objects,
    sources.tuning,
    sources.models,
  ]);

  return {
    materials: catalog,
    reactions,
    body,
    conditions,
    injury,
    objects,
    tuning,
    models,
    fingerprint,
    sources,
  };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new ConfigError(`falha ao ler ${path}: ${(e as Error).message}`);
  }
}

/**
 * Remove chaves `_…` em qualquer profundidade.
 *
 * O README manda a engine ignorá-las; se vazassem para o estado, o save
 * carregaria comentários e o Ajv recusaria campos extras.
 */
export function stripComments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripComments);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith('_')) continue;
      out[k] = stripComments(v);
    }
    return out;
  }
  return value;
}

function loadMaterials(raw: unknown): Material[] {
  const root = stripComments(raw) as { materials?: Record<string, Record<string, unknown>> };
  if (!root.materials || typeof root.materials !== 'object') {
    throw new ConfigError('materials: objeto "materials" ausente');
  }
  const list: Material[] = [];
  for (const [id, body] of Object.entries(root.materials)) {
    const material = { id, ...body } as Material;
    const check = validateDomain('Material', material);
    if (!check.valid) {
      throw new ConfigError(`material "${id}": ${check.message}`);
    }
    list.push(material);
  }
  if (list.length === 0) throw new ConfigError('materials: catálogo vazio');
  return list;
}

function loadObjects(raw: unknown, materials: MaterialCatalog): Map<string, ObjectDef> {
  const root = stripComments(raw) as { objects?: Record<string, Record<string, unknown>> };
  if (!root.objects || typeof root.objects !== 'object') {
    throw new ConfigError('objects: objeto "objects" ausente');
  }
  const map = new Map<string, ObjectDef>();
  for (const [id, body] of Object.entries(root.objects)) {
    const def = { id, ...body } as ObjectDef;
    if (def.id !== id) {
      throw new ConfigError(`objeto "${id}": campo id diverge da chave ("${def.id}")`);
    }
    const check = validateDomain('ObjectDef', def);
    if (!check.valid) {
      throw new ConfigError(`objeto "${id}": ${check.message}`);
    }
    if (!materials.has(def.materialId)) {
      throw new ConfigError(`objeto "${id}": material desconhecido "${def.materialId}"`);
    }
    // O-020: as duas descrições não podem ser idênticas — senão a crença
    // individual morre, porque ver o objeto revela tudo.
    if (
      def.sensoryDescription &&
      def.functionalDescription &&
      def.sensoryDescription.trim() === def.functionalDescription.trim()
    ) {
      throw new ConfigError(
        `objeto "${id}": sensoryDescription e functionalDescription são idênticas (O-020)`,
      );
    }
    map.set(id, def);
  }
  return map;
}

function loadReactions(raw: unknown, materials: MaterialCatalog): ReactionMatrix {
  const root = stripComments(raw) as { reactions?: Record<string, unknown>[] };
  if (!Array.isArray(root.reactions)) {
    throw new ConfigError('reactions: array "reactions" ausente');
  }
  const rules: ReactionRule[] = root.reactions.map((r, i) => {
    const id = typeof r['id'] === 'string' ? r['id'] : `reaction_${i}`;
    const when = r['when'] as ReactionRule['when'];
    const inn = r['in'] as [string, string];
    if (!Array.isArray(inn) || inn.length !== 2) {
      throw new ConfigError(`reação "${id}": "in" precisa de exatamente dois termos`);
    }
    if (typeof r['porque'] !== 'string' || (r['porque'] as string).length === 0) {
      throw new ConfigError(`reação "${id}": campo "porque" obrigatório`);
    }
    return {
      id,
      when,
      in: [String(inn[0]), String(inn[1])],
      effect: r['effect'] as ReactionRule['effect'],
      chance: Number(r['chance'] ?? 0),
      porque: String(r['porque']),
      ...(r['modifiedBy'] ? { modifiedBy: r['modifiedBy'] as Record<string, number> } : {}),
      ...(r['propagates'] ? { propagates: String(r['propagates']) } : {}),
      ...(r['threshold'] ? { threshold: r['threshold'] as Record<string, string> } : {}),
    };
  });
  return new ReactionMatrix(rules, materials);
}

function loadTuning(raw: unknown): TuningConfig {
  const root = stripComments(raw) as Record<string, unknown>;
  const tempo = (root['tempo'] ?? {}) as Record<string, unknown>;
  const mundo = (root['mundo'] ?? {}) as Record<string, unknown>;
  const percepcao = (root['percepcao'] ?? {}) as Record<string, unknown>;
  const movimento = (root['movimento'] ?? {}) as Record<string, unknown>;

  const metersPerTile = num(mundo, 'metrosPorTile', 0.5);
  if (metersPerTile <= 0) throw new ConfigError('tuning.mundo.metrosPorTile deve ser positivo');

  const speeds = (tempo['velocidadesDisponiveis'] as number[]) ?? [0, 1, 2, 5, 20];
  if (!speeds.includes(0)) {
    throw new ConfigError('tuning.tempo.velocidadesDisponiveis precisa incluir 0 (pausa)');
  }

  return {
    metersPerTile,
    minutesPerTick: num(tempo, 'minutosPorTick', 1),
    hoursPerDay: num(tempo, 'horasPorDia', 24),
    daysPerSeason: num(tempo, 'diasPorEstacao', 15),
    seasonsPerYear: num(tempo, 'estacoesPorAno', 4),
    availableSpeeds: speeds,
    coneAngleDeg: num(percepcao, 'coneVisaoGraus', 110),
    visionRangeMeters: num(percepcao, 'alcanceVisaoMetros', 30),
    hearingRangeMeters: num(percepcao, 'raioAudicaoMetros', 20),
    interactionRangeMeters: num(percepcao, 'alcanceInteracaoMetros', 1.5),
    baseSpeedMetersPerSecond: num(movimento, 'velocidadeBaseMetrosPorSegundo', 1.4),
    minSpeedFactor: num(movimento, 'fatorVelocidadeMinimoPorMobilidade', 0.15),
    raw: root,
  };
}

function loadModels(raw: unknown): ModelPresetsFile {
  const root = stripComments(raw) as Record<string, unknown>;
  const active = root['activePreset'];
  if (typeof active !== 'string' || active.length === 0) {
    throw new ConfigError('models: activePreset ausente');
  }
  const presets = root['presets'] as Record<string, unknown> | undefined;
  if (!presets || !(active in presets)) {
    throw new ConfigError(`models: preset ativo "${active}" não existe em presets`);
  }
  return { activePreset: active, raw: root };
}

function assertBodyMaterials(body: BodyPlan, materials: MaterialCatalog): void {
  for (const p of body.parts) {
    if (!p.materialId) continue;
    if (!materials.has(p.materialId)) {
      throw new ConfigError(`parte "${p.id}": material desconhecido "${p.materialId}"`);
    }
  }
}

function assertInjuryConditions(injury: InjuryMatrix, conditions: ConditionCatalog): void {
  for (const rule of injury.rules) {
    if (rule.condition === null) continue;
    if (!conditions.has(rule.condition)) {
      throw new ConfigError(
        `matriz de lesão linha ${rule.index}: condição "${rule.condition}" não existe`,
      );
    }
  }
}

function fingerprintOf(paths: readonly string[]): string {
  const h = createHash('sha256');
  for (const p of paths) {
    h.update(p);
    h.update('\0');
    h.update(readFileSync(p));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

function num(obj: Record<string, unknown>, key: string, fallback: number): number {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
