/**
 * Catálogo de condições. B-006, B-007, B-008, B-010.
 *
 * Uma unidade só: ferimento, doença, cicatriz, prótese, efeito de substância,
 * condição crônica, estado mental. Um tipo, um laço, um caminho de
 * serialização — e por isso acrescentar tuberculose custa uma entrada de dado.
 */

export type Cadence = 'static' | 'slow' | 'fast';

export const CADENCES: readonly Cadence[] = ['static', 'slow', 'fast'];

export interface StageDef {
  readonly index: number;
  readonly minSeverity: number;
  readonly nome: string;
  readonly pain: number;
  readonly partEfficiency: number | undefined;
  readonly capacityOffsets: Readonly<Record<string, number>>;
  readonly capacityMax: Readonly<Record<string, number>>;
  readonly lifeThreatening: boolean;
  readonly cognitive: readonly string[];
}

export interface LeavesOnHeal {
  readonly condition: string;
  readonly chance: number;
  readonly ifSeverityAbove: number;
}

export interface ConditionDef {
  readonly id: string;
  readonly nome: string;
  readonly cadence: Cadence;
  readonly wholeBody: boolean;
  readonly permanent: boolean;
  readonly visible: boolean;
  readonly progressPerDay: number;
  readonly recoveryPerDay: number | undefined;
  /** Severidade governada por outro escalar; a progressão declarada não se aplica. */
  readonly drivenBy: string | undefined;
  readonly lethalAt: number | undefined;
  readonly bleedRateBySeverity: number;
  readonly infectable: boolean;
  readonly infectionChanceMultiplier: number;
  readonly leavesOnHeal: LeavesOnHeal | undefined;
  readonly stages: readonly StageDef[];
  /** Modificadores fora de estágio, que é como as estáticas se declaram. */
  readonly base: StageDef;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface ConditionCatalogConfig {
  readonly conditions: Record<string, Record<string, unknown>>;
  readonly injuryMatrix: readonly Record<string, unknown>[];
}

export class ConditionCatalog {
  readonly #defs: ReadonlyMap<string, ConditionDef>;

  constructor(config: ConditionCatalogConfig) {
    const defs = new Map<string, ConditionDef>();
    for (const [id, valor] of Object.entries(config.conditions)) {
      if (id.startsWith('_')) continue;
      defs.set(id, compile(id, valor));
    }
    this.#defs = defs;

    for (const def of defs.values()) {
      const deixa = def.leavesOnHeal;
      if (deixa && !defs.has(deixa.condition)) {
        throw new Error(
          `condição "${def.id}" deixa "${deixa.condition}" ao curar, e essa condição não existe`,
        );
      }
    }
  }

  get(id: string): ConditionDef {
    const d = this.#defs.get(id);
    if (!d) throw new Error(`condição desconhecida: "${id}"`);
    return d;
  }

  has(id: string): boolean {
    return this.#defs.has(id);
  }

  ids(): string[] {
    return [...this.#defs.keys()].sort();
  }
}

/**
 * O estágio ativo é o de maior `minSeverity` que a severidade alcança. B-008.
 *
 * Sem interpolação, de propósito: é a comparação que produz o comportamento
 * não-linear — uma gripe que era incômodo vira ameaça ao cruzar um limiar.
 * Severidade abaixo do primeiro limiar declarado não ativa estágio nenhum, e é
 * assim que a intoxicação de B-059 existe sem se manifestar.
 */
export function stageFor(def: ConditionDef, severity: number): StageDef | undefined {
  let ativo: StageDef | undefined;
  for (const s of def.stages) {
    if (severity >= s.minSeverity) ativo = s;
    else break;
  }
  return ativo;
}

/** Os modificadores correntes: os de base, com os do estágio ativo por cima. */
export function effectiveModifiers(def: ConditionDef, severity: number): StageDef {
  const estagio = stageFor(def, severity);
  if (!estagio) return def.base;
  return {
    ...estagio,
    pain: estagio.pain || def.base.pain,
    partEfficiency: estagio.partEfficiency ?? def.base.partEfficiency,
    capacityOffsets: { ...def.base.capacityOffsets, ...estagio.capacityOffsets },
    capacityMax: { ...def.base.capacityMax, ...estagio.capacityMax },
  };
}

function compile(id: string, raw: Record<string, unknown>): ConditionDef {
  const cadence = raw['cadence'] as Cadence | undefined;
  // O verificador de contratos já cobra isto no dado, e o carregador cobra de
  // novo porque uma condição sem cadência não tem laço a que pertencer: ela
  // não seria avaliada nem recusada, apenas existiria parada.
  if (!cadence || !CADENCES.includes(cadence)) {
    throw new Error(`condição "${id}" sem cadência declarada válida (static, slow ou fast)`);
  }

  const stages = ((raw['stages'] as Record<string, unknown>[]) ?? []).map((s, index) =>
    compileStage(s, index),
  );
  for (let i = 1; i < stages.length; i += 1) {
    if (stages[i]!.minSeverity <= stages[i - 1]!.minSeverity) {
      throw new Error(
        `condição "${id}": estágios fora de ordem crescente de severidade — ` +
          `"${stages[i]!.nome}" não vem depois de "${stages[i - 1]!.nome}"`,
      );
    }
  }

  return {
    id,
    nome: String(raw['nome'] ?? id),
    cadence,
    wholeBody: raw['wholeBody'] === true,
    permanent: raw['permanent'] === true,
    visible: raw['visible'] === true,
    progressPerDay: typeof raw['progressPerDay'] === 'number' ? raw['progressPerDay'] : 0,
    recoveryPerDay: typeof raw['recoveryPerDay'] === 'number' ? raw['recoveryPerDay'] : undefined,
    drivenBy: typeof raw['drivenBy'] === 'string' ? raw['drivenBy'] : undefined,
    lethalAt: typeof raw['lethalAt'] === 'number' ? raw['lethalAt'] : undefined,
    bleedRateBySeverity:
      typeof raw['bleedRateBySeverity'] === 'number' ? raw['bleedRateBySeverity'] : 0,
    infectable: raw['infectable'] === true,
    infectionChanceMultiplier:
      typeof raw['infectionChanceMultiplier'] === 'number'
        ? raw['infectionChanceMultiplier']
        : 1,
    leavesOnHeal: compileLeaves(raw['leavesOnHeal']),
    stages,
    base: compileStage(raw, -1),
    raw,
  };
}

function compileStage(s: Record<string, unknown>, index: number): StageDef {
  return {
    index,
    minSeverity: typeof s['minSeverity'] === 'number' ? s['minSeverity'] : 0,
    nome: String(s['nome'] ?? ''),
    pain: typeof s['pain'] === 'number' ? s['pain'] : 0,
    partEfficiency: typeof s['partEfficiency'] === 'number' ? s['partEfficiency'] : undefined,
    capacityOffsets: (s['capacityOffsets'] as Record<string, number>) ?? {},
    capacityMax: (s['capacityMax'] as Record<string, number>) ?? {},
    lifeThreatening: s['lifeThreatening'] === true,
    cognitive: (s['cognitive'] as string[]) ?? [],
  };
}

function compileLeaves(raw: unknown): LeavesOnHeal | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const l = raw as Record<string, unknown>;
  return {
    condition: String(l['condition']),
    chance: typeof l['chance'] === 'number' ? l['chance'] : 1,
    ifSeverityAbove: typeof l['ifSeverityAbove'] === 'number' ? l['ifSeverityAbove'] : 0,
  };
}
