/**
 * Matriz de lesão e seleção da parte atingida. B-020, B-021, B-052, B-056.
 *
 * A matriz é a mesma forma de regra de reescrita da matriz de reação, com o
 * mesmo `porque` obrigatório e a mesma proibição de nomear material por
 * identificador. A coluna do meio é etiqueta, sempre: ossos são frágeis porque
 * o catálogo diz que são, igual a vidro. É isso que faz um fêmur transmutado
 * em ferro mudar de comportamento sem que exista regra para ossos de ferro.
 */

import type { Rng } from '../rng/index.js';
import type { MaterialLookup, ReactiveTarget } from '../substrate/target.js';
import { termMatches } from '../substrate/target.js';
import type { BodyPartState, DamageType } from '../types/domain.js';
import type { BodyPlan, PartDef } from './plan.js';

/**
 * Sete tipos, e só sete. B-052.
 *
 * A enumeração canônica é a do schema de domínio, e esta é a lista em tempo de
 * execução que o carregador precisa para conferir a matriz. Não é uma segunda
 * cópia: o tipo acima vem do schema, e um tipo a mais ali quebra a compilação
 * aqui até a lista acompanhar. É essa quebra que garante que não divirjam.
 */
export const DAMAGE_TYPES: readonly DamageType[] = [
  'blunt',
  'cut',
  'pierce',
  'burn',
  'cold',
  'electric',
  'corrosion',
];

/** Dano que alcança o que está sob a camada externa sem precisar rompê-la antes. B-021. */
const PENETRATING: ReadonlySet<DamageType> = new Set<DamageType>(['pierce', 'cut', 'electric']);

export type BleedMode = 'byMaterial' | 'none';

export interface InjuryRule {
  readonly index: number;
  readonly damage: DamageType | '*';
  readonly material: string;
  readonly terms: readonly { readonly term: string; readonly negated: boolean }[];
  readonly condition: string | null;
  readonly bleed: BleedMode;
  readonly infectionChance: number;
  readonly fallback: string | undefined;
  readonly porque: string;
}

export interface InjuryTuning {
  /** Chance de o golpe descer um nível para dentro quando o caminho está aberto. B-021. */
  readonly penetrationChance: number;
  /** Chance de o alvo declarado pela ação ser o atingido, em vez do sorteio de cobertura. */
  readonly targetBias: number;
  /** Fração de vida abaixo da qual a camada externa deixa de proteger o que está dentro. */
  readonly compromisedBelow: number;
}

export const DEFAULT_INJURY_TUNING: InjuryTuning = {
  penetrationChance: 0.35,
  targetBias: 0.7,
  compromisedBelow: 0.4,
};

export class InjuryMatrix {
  readonly rules: readonly InjuryRule[];

  constructor(raw: readonly Record<string, unknown>[]) {
    this.rules = raw.map((r, index) => {
      const damage = String(r['damage']) as DamageType | '*';
      if (damage !== '*' && !DAMAGE_TYPES.includes(damage)) {
        throw new Error(`linha ${index} da matriz de lesão declara dano fora do vocabulário: "${damage}"`);
      }
      const material = String(r['material']);
      // O `porque` de cada linha é onde fica registrado de quem ela precisa vir
      // antes. A ordem é o custo de "a primeira que casa vence", e sem essa
      // nota uma linha nova posta no lugar errado morre calada.
      const porque = String(r['porque'] ?? '');
      if (porque.length === 0) {
        throw new Error(`linha ${index} da matriz de lesão sem campo "porque"`);
      }
      return {
        index,
        damage,
        material,
        terms: parseExpression(material),
        condition: (r['condition'] as string | null) ?? null,
        bleed: (r['bleed'] as BleedMode) ?? 'none',
        infectionChance: typeof r['infectionChance'] === 'number' ? r['infectionChance'] : 0,
        fallback: typeof r['fallback'] === 'string' ? r['fallback'] : undefined,
        porque,
      };
    });

    assertEveryDamageTypeReachesLivingTissue(this.rules);
  }

  /**
   * A primeira linha que casa vence. B-020.
   *
   * `#vital` na coluna do material é propriedade da **parte**, não da matéria —
   * fígado e bíceps são o mesmo tecido, e a linha que fala em perfuração de
   * órgão precisa distinguir os dois. Ele entra pelo mesmo canal de etiquetas
   * de evento que o substrato já usa, e não por uma segunda forma de casar.
   */
  match(damage: DamageType, target: ReactiveTarget, materials: MaterialLookup, partIsVital: boolean): InjuryRule | undefined {
    const eventTags = partIsVital ? new Set(['vital']) : new Set<string>();
    return this.rules.find((rule) => {
      if (rule.damage !== '*' && rule.damage !== damage) return false;
      return rule.terms.every(
        ({ term, negated }) => termMatches(term, target, materials, eventTags) !== negated,
      );
    });
  }
}

/**
 * Um tipo de dano sem linha que alcance tecido meramente vivo é uma agressão
 * que não resolve em nada — o pior desfecho possível, porque não falha, apenas
 * não acontece. Já aconteceu duas vezes neste arquivo. B-020, B-052.
 */
function assertEveryDamageTypeReachesLivingTissue(rules: readonly InjuryRule[]): void {
  const orfaos = DAMAGE_TYPES.filter(
    (d) =>
      !rules.some(
        (r) =>
          r.damage === d &&
          r.condition !== null &&
          r.terms.length === 1 &&
          r.terms[0]!.term === '#living' &&
          !r.terms[0]!.negated,
      ),
  );
  if (orfaos.length > 0) {
    throw new Error(
      `tipos de dano sem linha que case com tecido comum: ${orfaos.join(', ')}. ` +
        `Uma agressão desse tipo resolveria em nada, sem erro (B-052).`,
    );
  }
}

function parseExpression(expr: string): { term: string; negated: boolean }[] {
  return expr
    .split('&')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => (t.startsWith('!') ? { term: t.slice(1), negated: true } : { term: t, negated: false }));
}

export interface HitSelection {
  readonly part: PartDef;
  /** O caminho até ela, de fora para dentro, para o log causal. */
  readonly path: readonly string[];
}

/**
 * Qual parte o golpe atinge. B-021.
 *
 * Sorteio pela cobertura, com viés quando a ação declara alvo. Partes internas
 * só são alcançadas quando a camada externa já está comprometida ou quando o
 * dano é penetrante — é por isso que o olho pende da cabeça e não do crânio,
 * porque atrás do crânio ele seria inatingível por um golpe comum.
 */
export function selectHitPart(
  plan: BodyPlan,
  states: readonly BodyPartState[],
  damage: DamageType,
  rng: Rng,
  options: { readonly declaredTarget?: string; readonly tuning?: InjuryTuning } = {},
): HitSelection | undefined {
  const tuning = options.tuning ?? DEFAULT_INJURY_TUNING;
  const porId = new Map(states.map((s) => [s.partId, s]));
  const viva = (p: PartDef): boolean => {
    const s = porId.get(p.id);
    return !(s?.missing === true || s?.destroyed === true);
  };

  let entrada: PartDef | undefined;
  if (options.declaredTarget && plan.has(options.declaredTarget) && rng.chance(tuning.targetBias)) {
    const alvo = plan.part(options.declaredTarget);
    if (viva(alvo)) return { part: alvo, path: pathTo(plan, alvo) };
  }

  const externas = plan.parts.filter((p) => p.depth === 'outside' && p.coverage > 0 && viva(p));
  if (externas.length === 0) return undefined;
  entrada = rouletteByCoverage(externas, rng);
  if (!entrada) return undefined;

  const path = [entrada.id];
  let corrente = entrada;
  for (;;) {
    const internas = corrente.childIndices
      .map((i) => plan.parts[i]!)
      .filter((p) => p.depth === 'inside' && viva(p));
    if (internas.length === 0) break;

    const s = porId.get(corrente.id);
    const frac = corrente.maxHealth > 0 && s ? s.health / corrente.maxHealth : 1;
    const comprometida = frac < tuning.compromisedBelow;
    if (!PENETRATING.has(damage) && !comprometida) break;
    if (!rng.chance(tuning.penetrationChance)) break;

    const escolhida = rouletteByWeight(internas, (p) => p.maxHealth, rng);
    if (!escolhida) break;
    corrente = escolhida;
    path.push(corrente.id);
  }

  return { part: corrente, path };
}

/**
 * A taxa de sangramento de uma lesão. B-017, B-056.
 *
 * O material dá a base — carne sangra, osso quase não — e a vascularização da
 * parte dá a diferença entre dois órgãos do mesmo tecido, que é o que o
 * catálogo, por desenho, não pode saber: ele não sabe se o que está na frente
 * é um fígado ou um cérebro.
 */
export function bleedRateFor(
  part: PartDef,
  materialId: string,
  materials: MaterialLookup,
  conditionBleedPerSeverity: number,
  severity: number,
  mode: BleedMode,
): number {
  if (mode === 'none' || conditionBleedPerSeverity === 0) return 0;
  const fator = materials.get(materialId).numeric?.bleedFactor ?? 0;
  return conditionBleedPerSeverity * severity * fator * part.vascularity;
}

function pathTo(plan: BodyPlan, part: PartDef): string[] {
  const path: string[] = [];
  let corrente: PartDef | undefined = part;
  while (corrente) {
    path.unshift(corrente.id);
    corrente = corrente.parentIndex >= 0 ? plan.parts[corrente.parentIndex] : undefined;
  }
  return path;
}

function rouletteByCoverage(parts: readonly PartDef[], rng: Rng): PartDef | undefined {
  return rouletteByWeight(parts, (p) => p.coverage, rng);
}

function rouletteByWeight<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T | undefined {
  const total = items.reduce((t, i) => t + weight(i), 0);
  if (total <= 0) return undefined;
  let alvo = rng.next() * total;
  for (const item of items) {
    alvo -= weight(item);
    if (alvo <= 0) return item;
  }
  return items[items.length - 1];
}
