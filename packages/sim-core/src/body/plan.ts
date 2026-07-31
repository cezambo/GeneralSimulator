/**
 * O plano do corpo, compilado uma vez e compartilhado por todos os agentes.
 * B-001, B-002, B-048, B-051, B-054, B-061.
 *
 * A árvore vem de dado e nada aqui a conhece por nome. O que o código traz é
 * mecanismo: indexar, validar o que o dado sozinho não garante, e resolver as
 * constantes de classe.
 *
 * A compilação é por agente **zero** vezes: o plano é imutável e o estado de
 * cada agente é um vetor de tamanho fixo indexado pela mesma ordem (B-048).
 * Vinte agentes compartilham uma árvore só.
 */

export type PartClass = string;
export type Depth = 'outside' | 'inside';
export type AgingShape = 'linear' | 'accelerating' | 'threshold';

export interface AgingCurve {
  readonly onsetAge: number;
  readonly shape: AgingShape;
  readonly lossPerYear: number;
}

export interface PartTypeConstants {
  readonly nome: string;
  readonly regenPerDay: number;
  readonly regenCeiling: number;
  readonly toxicityPerDay: number;
  readonly radiationResistance: number;
  /** Fração de vida **acima** da qual o funcionamento é 1. Alta = perde função ao primeiro dano. */
  readonly sensitivity: number;
  /** Fração de vida em que o funcionamento chega a zero. **Menor = mais resiliente.** */
  readonly resilience: number;
  readonly vascularity: number;
  readonly aging: AgingCurve;
}

export interface PartDef {
  readonly id: string;
  readonly index: number;
  readonly nome: string;
  readonly parent: string | null;
  readonly parentIndex: number;
  readonly childIndices: readonly number[];
  readonly kind: PartClass;
  readonly materialId: string;
  readonly maxHealth: number;
  readonly coverage: number;
  readonly depth: Depth;
  readonly vital: boolean;
  readonly capacities: Readonly<Record<string, number>>;
  /** Constantes já resolvidas: classe, com as sobrescritas da parte por cima. */
  readonly constants: PartTypeConstants;
  readonly vascularity: number;
  readonly toxicityPerDay: number;
  readonly aging: AgingCurve;
}

export interface CapacitySource {
  readonly kind: 'part' | 'capacity';
  readonly id: string;
  readonly weight: number;
}

export interface PainPenalty {
  readonly floor: number;
  readonly divisor: number;
  readonly maxPenalty: number;
}

export interface CapacityRule {
  readonly id: string;
  readonly vital: boolean;
  readonly multipliedByConsciousness: boolean;
  readonly alsoAffectedBy: readonly string[];
  /** Só a consciência declara fontes explícitas; as demais derivam das partes que as servem. */
  readonly sources?: readonly CapacitySource[];
  readonly painPenalty?: PainPenalty;
  readonly unconsciousBelow?: number;
}

export interface SystemDef {
  readonly id: string;
  readonly nome: string;
  readonly capacities: readonly string[];
  readonly clearsToxicity: boolean;
}

export interface BodyPlanConfig {
  readonly root: string;
  readonly parts: Record<string, Record<string, unknown>>;
  readonly partTypes: Record<string, Record<string, unknown>>;
  readonly systems: Record<string, Record<string, unknown>>;
  readonly capacityRules: Record<string, Record<string, unknown>>;
}

/** Tolerância na soma das coberturas. O aceite de B-002 fala em tolerância declarada. */
const COVERAGE_TOLERANCE = 1e-6;

export class BodyPlan {
  readonly parts: readonly PartDef[];
  readonly rootIndex: number;
  readonly capacities: readonly string[];
  readonly rules: ReadonlyMap<string, CapacityRule>;
  readonly systems: readonly SystemDef[];
  readonly #byId: ReadonlyMap<string, PartDef>;
  /** Partes que servem cada capacidade, pré-computadas. B-012, B-015. */
  readonly #serving: ReadonlyMap<string, readonly { part: PartDef; weight: number }[]>;
  /** Ordem de avaliação: primeiro as que só dependem de parte, depois as derivadas. */
  readonly evaluationOrder: readonly string[];

  constructor(config: BodyPlanConfig) {
    const types = compileTypes(config.partTypes);
    const { parts, byId, rootIndex } = compileParts(config.parts, config.root, types);
    this.parts = parts;
    this.#byId = byId;
    this.rootIndex = rootIndex;

    assertCoverageSumsToOne(parts);

    const { rules, capacities } = compileRules(config.capacityRules, parts, byId);
    this.rules = rules;
    this.capacities = capacities;
    this.evaluationOrder = orderCapacities(rules, capacities);

    const serving = new Map<string, { part: PartDef; weight: number }[]>();
    for (const cap of capacities) serving.set(cap, []);
    for (const p of parts) {
      for (const [cap, weight] of Object.entries(p.capacities)) {
        serving.get(cap)!.push({ part: p, weight });
      }
    }
    this.#serving = serving;

    this.systems = compileSystems(config.systems, capacities);
  }

  part(id: string): PartDef {
    const p = this.#byId.get(id);
    if (!p) throw new Error(`parte desconhecida: "${id}"`);
    return p;
  }

  has(id: string): boolean {
    return this.#byId.has(id);
  }

  serving(capacity: string): readonly { part: PartDef; weight: number }[] {
    return this.#serving.get(capacity) ?? [];
  }

  /** Índices da parte e de toda a sua descendência, para a cascata de B-004. */
  subtreeOf(index: number): number[] {
    const out: number[] = [];
    const pilha = [index];
    while (pilha.length > 0) {
      const i = pilha.pop()!;
      out.push(i);
      pilha.push(...this.parts[i]!.childIndices);
    }
    return out;
  }

  /** O sistema que remove carga tóxica. B-059, B-060. */
  toxicityClearingSystem(): SystemDef | undefined {
    return this.systems.find((s) => s.clearsToxicity);
  }
}

function compileTypes(raw: Record<string, unknown>): Map<string, PartTypeConstants> {
  const out = new Map<string, PartTypeConstants>();
  for (const [id, valor] of Object.entries(raw)) {
    if (id.startsWith('_')) continue;
    const t = valor as Record<string, unknown>;
    const c: PartTypeConstants = {
      nome: String(t['nome'] ?? id),
      regenPerDay: num(t, 'regenPerDay', 0),
      regenCeiling: num(t, 'regenCeiling', 1),
      toxicityPerDay: num(t, 'toxicityPerDay', 0),
      radiationResistance: num(t, 'radiationResistance', 0),
      sensitivity: num(t, 'sensitivity', 1),
      resilience: num(t, 'resilience', 0),
      vascularity: num(t, 'vascularity', 1),
      aging: (t['aging'] as AgingCurve) ?? { onsetAge: 999, shape: 'linear', lossPerYear: 0 },
    };
    // Invertidas, a interpolação de B-055 cresceria com o dano: quanto mais
    // ferida a parte, mais ela entregaria. Nada no resto do sistema acusaria.
    if (c.sensitivity < c.resilience) {
      throw new Error(
        `classe de parte "${id}": sensibilidade (${c.sensitivity}) abaixo da resiliência (${c.resilience}). ` +
          `Invertidas, o funcionamento cresceria com o dano.`,
      );
    }
    out.set(id, c);
  }
  if (out.size === 0) throw new Error('nenhuma classe de parte declarada em partTypes');
  return out;
}

function compileParts(
  raw: Record<string, Record<string, unknown>>,
  root: string,
  types: Map<string, PartTypeConstants>,
): { parts: PartDef[]; byId: Map<string, PartDef>; rootIndex: number } {
  const ids = Object.keys(raw).filter((k) => !k.startsWith('_'));
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  if (!indexOf.has(root)) throw new Error(`raiz declarada "${root}" não existe em parts`);

  const filhos = new Map<string, number[]>(ids.map((id) => [id, []]));
  for (const id of ids) {
    const pai = raw[id]!['parent'] as string | null;
    if (pai === null || pai === undefined) continue;
    if (!indexOf.has(pai)) throw new Error(`parte "${id}" pende de "${pai}", que não existe`);
    filhos.get(pai)!.push(indexOf.get(id)!);
  }

  const parts: PartDef[] = ids.map((id, index) => {
    const r = raw[id]!;
    const kind = String(r['kind'] ?? 'flesh');
    const base = types.get(kind);
    if (!base) throw new Error(`parte "${id}" declara classe desconhecida: "${kind}"`);

    // Sobrescrita da parte vence a constante da classe. B-054.
    const constants: PartTypeConstants = {
      ...base,
      ...(r['regenPerDay'] !== undefined ? { regenPerDay: Number(r['regenPerDay']) } : {}),
      ...(r['regenCeiling'] !== undefined ? { regenCeiling: Number(r['regenCeiling']) } : {}),
      ...(r['sensitivity'] !== undefined ? { sensitivity: Number(r['sensitivity']) } : {}),
      ...(r['resilience'] !== undefined ? { resilience: Number(r['resilience']) } : {}),
      ...(r['radiationResistance'] !== undefined
        ? { radiationResistance: Number(r['radiationResistance']) }
        : {}),
    };

    return {
      id,
      index,
      nome: String(r['nome'] ?? id),
      parent: (r['parent'] as string | null) ?? null,
      parentIndex: r['parent'] ? indexOf.get(r['parent'] as string)! : -1,
      childIndices: filhos.get(id)!,
      kind,
      materialId: String(r['materialId'] ?? ''),
      maxHealth: num(r, 'maxHealth', 0),
      coverage: num(r, 'coverage', 0),
      depth: (r['depth'] as Depth) ?? 'outside',
      vital: r['vital'] === true,
      capacities: (r['capacities'] as Record<string, number>) ?? {},
      constants,
      vascularity: r['vascularity'] !== undefined ? Number(r['vascularity']) : constants.vascularity,
      toxicityPerDay:
        r['toxicityPerDay'] !== undefined ? Number(r['toxicityPerDay']) : constants.toxicityPerDay,
      aging: (r['aging'] as AgingCurve) ?? constants.aging,
    };
  });

  const byId = new Map(parts.map((p) => [p.id, p]));
  return { parts, byId, rootIndex: indexOf.get(root)! };
}

/**
 * A soma das coberturas externas é 1 **exatamente**. B-002.
 *
 * É o defeito mais barato de introduzir e mais caro de encontrar deste
 * documento: um total diferente de 1 enviesa a seleção de parte atingida sem
 * produzir sintoma nenhum. Ninguém percebe que o torso passou a ser acertado
 * 3% mais do que devia — só depois de mil golpes, e ainda assim só se alguém
 * estiver contando.
 */
function assertCoverageSumsToOne(parts: readonly PartDef[]): void {
  const soma = parts.filter((p) => p.depth === 'outside').reduce((t, p) => t + p.coverage, 0);
  if (Math.abs(soma - 1) > COVERAGE_TOLERANCE) {
    throw new Error(
      `a soma das coberturas externas é ${soma.toFixed(6)} e precisa ser 1. ` +
        `Ao mexer numa cobertura, tire a diferença de outra no mesmo passo (B-002).`,
    );
  }
  const internaComCobertura = parts.filter((p) => p.depth === 'inside' && p.coverage > 0);
  if (internaComCobertura.length > 0) {
    throw new Error(
      `partes internas com cobertura: ${internaComCobertura.map((p) => p.id).join(', ')}. ` +
        `Parte interna é alcançada por B-021, não pelo sorteio de cobertura.`,
    );
  }
}

function compileRules(
  raw: Record<string, unknown>,
  parts: readonly PartDef[],
  byId: ReadonlyMap<string, PartDef>,
): { rules: Map<string, CapacityRule>; capacities: string[] } {
  // O conjunto de capacidades é a união do que as partes servem e do que as
  // regras nomeiam. Uma capacidade que existe só na regra continua existindo,
  // valendo zero — e é assim que se descobre que ninguém a serve.
  const nomes = new Set<string>();
  for (const p of parts) for (const c of Object.keys(p.capacities)) nomes.add(c);
  for (const k of Object.keys(raw)) if (!k.startsWith('_')) nomes.add(k);

  const rules = new Map<string, CapacityRule>();
  for (const cap of nomes) {
    const r = (raw[cap] ?? {}) as Record<string, unknown>;
    const fontes = r['sources'] as Record<string, number> | undefined;
    rules.set(cap, {
      id: cap,
      vital: r['vital'] === true,
      multipliedByConsciousness: r['multipliedByConsciousness'] === true,
      alsoAffectedBy: (r['alsoAffectedBy'] as string[]) ?? [],
      ...(fontes
        ? {
            sources: Object.entries(fontes).map(([id, weight]) => ({
              // Uma fonte é parte ou é capacidade, e a diferença se resolve
              // pelo catálogo, não por convenção de nome. Errar isso silencia:
              // uma capacidade lida como parte inexistente valeria zero.
              kind: byId.has(id) ? ('part' as const) : ('capacity' as const),
              id,
              weight,
            })),
          }
        : {}),
      ...(r['painPenalty'] ? { painPenalty: r['painPenalty'] as PainPenalty } : {}),
      ...(r['unconsciousBelow'] !== undefined
        ? { unconsciousBelow: Number(r['unconsciousBelow']) }
        : {}),
    });
  }

  for (const regra of rules.values()) {
    for (const fonte of regra.sources ?? []) {
      if (fonte.kind === 'capacity' && !rules.has(fonte.id)) {
        throw new Error(
          `capacidade "${regra.id}" tem fonte "${fonte.id}", que não é parte nem capacidade conhecida`,
        );
      }
    }
  }

  return { rules, capacities: [...nomes].sort() };
}

/**
 * A ordem em que as capacidades podem ser calculadas.
 *
 * Duas fases, e não um resolvedor de grafo genérico: primeiro as que dependem
 * só de parte, depois as que citam outras capacidades. É o suficiente porque o
 * desenho só tem um nível de dependência — a consciência lê bombeamento,
 * respiração e filtragem, e é ela que multiplica movimento, manipulação e fala.
 *
 * O ciclo é conferido aqui porque ele não daria erro em execução: uma
 * capacidade que se lê a si mesma através de outra produziria um número, e o
 * número seria estável, e estaria errado.
 */
function orderCapacities(
  rules: ReadonlyMap<string, CapacityRule>,
  capacities: readonly string[],
): string[] {
  const derivadas = new Set<string>();
  for (const cap of capacities) {
    if ((rules.get(cap)?.sources ?? []).some((f) => f.kind === 'capacity')) derivadas.add(cap);
  }

  for (const cap of derivadas) {
    for (const fonte of rules.get(cap)!.sources!) {
      if (fonte.kind !== 'capacity') continue;
      const alvo = rules.get(fonte.id)!;
      if (derivadas.has(fonte.id)) {
        throw new Error(
          `ciclo de capacidade: "${cap}" lê "${fonte.id}", que também deriva de outra capacidade`,
        );
      }
      if (alvo.multipliedByConsciousness || alvo.alsoAffectedBy.includes(cap)) {
        throw new Error(
          `ciclo de capacidade: "${cap}" lê "${fonte.id}", que por sua vez é multiplicada por "${cap}"`,
        );
      }
    }
  }

  return [...capacities.filter((c) => !derivadas.has(c)), ...[...derivadas].sort()];
}

function compileSystems(
  raw: Record<string, unknown>,
  capacities: readonly string[],
): SystemDef[] {
  const conhecidas = new Set(capacities);
  const out: SystemDef[] = [];
  for (const [id, valor] of Object.entries(raw)) {
    if (id.startsWith('_')) continue;
    const s = valor as Record<string, unknown>;
    const caps = (s['capacities'] as string[]) ?? [];
    for (const c of caps) {
      if (!conhecidas.has(c)) {
        throw new Error(`sistema "${id}" cita a capacidade "${c}", que não existe`);
      }
    }
    out.push({
      id,
      nome: String(s['nome'] ?? id),
      capacities: caps,
      clearsToxicity: s['clearsToxicity'] === true,
    });
  }
  return out;
}

function num(source: Record<string, unknown>, key: string, fallback: number): number {
  const v = source[key];
  return typeof v === 'number' ? v : fallback;
}
