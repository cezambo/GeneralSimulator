import type { Covering, Material, TransientState } from '../types/domain.js';

/**
 * A visão uniforme sobre o que reage. R-015, R-001, B-003.
 *
 * Tile, objeto e parte de corpo entram pela mesma porta, e isso não é
 * conveniência de implementação: é o requisito. R-015 diz que todo efeito
 * aceita as três espécies de alvo e que **não há vocabulário separado para o
 * corpo**, porque o corpo é feito dos mesmos materiais. Molhar molha os três,
 * corroer corrói os três, e transmutar troca o material de uma parede pelo
 * mesmo caminho que troca o de um fêmur.
 *
 * Escrever `ignite` uma vez para tile e outra para parte de corpo seria escrever
 * duas vezes a mesma coisa e descobrir, meses depois, que uma das duas ganhou um
 * comportamento que a outra não tem.
 */

export type TargetKind = 'tile' | 'object' | 'body_part';

export interface ReactiveTarget {
  readonly id: string;
  readonly kind: TargetKind;
  /** Onde está, para vizinhança e log. Ausente em parte de corpo, que se move junto do dono. */
  readonly gridId?: string;
  /** Célula corrente — mutável em objetos que se deslocam (móvel arrastado). */
  x?: number;
  y?: number;

  materialId: string;
  states: TransientState[];
  coverings?: Covering[];
  /**
   * Temperatura própria. `undefined` significa **em equilíbrio com o ambiente**.
   *
   * A distinção entre indefinido e igual ao ambiente é o que faz R-008 caber:
   * um tile em equilíbrio não guarda temperatura, não entra no laço térmico e
   * lê como ambiente. Ele só passa a existir como entidade térmica quando algo
   * cria diferença ali, e some de novo quando reconverge.
   */
  temperature?: number;
  integrity?: number;
  /**
   * Oxigênio local 0–100. `undefined` = ambiente cheio (esparso, como temperatura).
   * V1: fogo consome; fumaça correlaciona. Sem difusão de gás (R-023 = V2).
   */
  oxygen?: number;
  /** Só o que o Validador pode trocar. `transmute` escreve aqui. */
  emitsLight?: boolean;
}

export interface MaterialLookup {
  get(materialId: string): Material;
  has(materialId: string): boolean;
}

/**
 * Catálogo em memória. O carregador de arquivo é de X-008 e vive noutro lugar;
 * o substrato só precisa saber consultar.
 */
export class MaterialCatalog implements MaterialLookup {
  readonly #byId = new Map<string, Material>();

  constructor(materials: readonly Material[]) {
    for (const m of materials) {
      if (this.#byId.has(m.id)) throw new Error(`material duplicado no catálogo: "${m.id}"`);
      this.#byId.set(m.id, m);
    }
  }

  get(materialId: string): Material {
    const m = this.#byId.get(materialId);
    if (!m) throw new Error(`material desconhecido: "${materialId}"`);
    return m;
  }

  has(materialId: string): boolean {
    return this.#byId.has(materialId);
  }

  all(): readonly Material[] {
    return [...this.#byId.values()];
  }
}

export function hasState(target: ReactiveTarget, type: string): boolean {
  return target.states.some((s) => s.type === type && s.intensity > 0);
}

export function stateOf(target: ReactiveTarget, type: string): TransientState | undefined {
  return target.states.find((s) => s.type === type);
}

/**
 * Etiquetas derivadas do estado corrente, e não do material.
 *
 * `#ignitionSource` é o caso que obriga a existirem: R-018 define fonte de
 * ignição como "qualquer entidade com chama desprotegida", que é uma condição
 * de estado e não uma propriedade da matéria. Sem etiqueta derivada, a regra
 * teria de listar tocha, vela, lamparina e fogueira — e um objeto inventado
 * pelo usuário em execução (W-034) ficaria de fora, contra R-001.
 */
export function derivedTags(target: ReactiveTarget): Set<string> {
  const tags = new Set<string>();
  if (hasState(target, 'burning')) tags.add('ignitionSource');
  if (hasState(target, 'electrified')) tags.add('energized');
  if (hasState(target, 'wet')) tags.add('damp');
  return tags;
}

/**
 * Um termo de regra casa com o alvo?
 *
 * Três formas, nesta ordem: `*` casa com tudo; `#etiqueta` procura nas
 * derivadas, nas etiquetas do material, nas propriedades booleanas e nas
 * etiquetas do próprio evento; nome solto é estado transiente.
 *
 * Propriedade booleana e etiqueta livre são consultadas no mesmo espaço de
 * propósito. `#inflammable` é propriedade canônica e `#oily` é etiqueta livre,
 * e quem escreve a regra não deveria precisar saber em qual das duas gavetas o
 * catálogo guardou cada uma.
 */
export function termMatches(
  term: string,
  target: ReactiveTarget,
  materials: MaterialLookup,
  eventTags?: ReadonlySet<string>,
): boolean {
  if (term === '*') return true;

  if (term.startsWith('#')) {
    const tag = term.slice(1);
    if (eventTags?.has(tag)) return true;
    if (derivedTags(target).has(tag)) return true;
    const m = materials.get(target.materialId);
    if (m.tags?.includes(tag)) return true;
    const props = (m.properties ?? {}) as Record<string, boolean | undefined>;
    return props[tag] === true;
  }

  return hasState(target, term);
}
