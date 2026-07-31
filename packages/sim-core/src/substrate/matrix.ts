import { isEffectId, type EffectId } from './effects.js';
import { termMatches, type MaterialLookup, type ReactiveTarget } from './target.js';

/**
 * A matriz de reação. R-012, R-013, R-003.
 *
 * Uma reação é duas entradas, duas saídas, uma probabilidade e uma ocasião. A
 * probabilidade **é** a taxa: não há sistema de velocidade separado, e é isso
 * que mantém o arquivo legível por quem ajusta.
 */

export type Occasion = 'continuous' | 'neighborhood' | 'contact' | 'immersion' | 'entry';

export const OCCASIONS: readonly Occasion[] = [
  'continuous',
  'neighborhood',
  'contact',
  'immersion',
  'entry',
];

export interface ReactionRule {
  readonly id: string;
  readonly when: Occasion;
  /** Dois termos: quem age e sobre quem. Etiqueta, estado ou `*`. */
  readonly in: readonly [string, string];
  readonly effect: EffectId;
  readonly chance: number;
  readonly modifiedBy?: Readonly<Record<string, number>>;
  readonly propagates?: string;
  readonly threshold?: Readonly<Record<string, string>>;
  /** Obrigatório: tem dois leitores, o humano que ajusta e o Validador (R-042). */
  readonly porque: string;
}

export class ReactionMatrix {
  readonly #byOccasion = new Map<Occasion, ReactionRule[]>();
  readonly rules: readonly ReactionRule[];

  constructor(rules: readonly ReactionRule[], materials: MaterialLookup) {
    for (const r of rules) {
      if (!r.porque || r.porque.trim().length === 0) {
        throw new Error(`reação "${r.id}" sem campo porque — R-012 o exige, e ele vai ao Validador`);
      }
      if (!OCCASIONS.includes(r.when)) {
        throw new Error(`reação "${r.id}" com ocasião desconhecida: "${r.when}"`);
      }
      if (r.in.length !== 2) {
        throw new Error(`reação "${r.id}" precisa de exatamente dois termos em "in"`);
      }
      // Efeito conferido no carregamento, e não no tick em que a regra dispara.
      // A alternativa é descobrir a grafia errada no meio de um incêndio, e o
      // sintoma seria fogo que não se propaga — não um erro.
      if (!isEffectId(r.effect)) {
        throw new Error(
          `reação "${r.id}" cita o efeito "${r.effect}", fora do vocabulário fechado de R-015`,
        );
      }
      assertRuleOfThrees(r, materials);
    }
    // Ordena por identificador, e não pela ordem do arquivo. Duas regras podem
    // casar com o mesmo par, e a ordem em que são avaliadas consome dados do
    // fluxo semeado — deixar isso depender de onde alguém colou a regra nova no
    // JSON faria uma edição cosmética mudar toda a partida gravada (R-047).
    this.rules = [...rules].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const occasion of OCCASIONS) {
      this.#byOccasion.set(occasion, this.rules.filter((r) => r.when === occasion));
    }
  }

  for(occasion: Occasion): readonly ReactionRule[] {
    return this.#byOccasion.get(occasion) ?? [];
  }

  /**
   * Regras cujo primeiro termo casa com quem age e o segundo com quem recebe.
   *
   * A ordem dos dois termos é significativa e não é simétrica: `["burning",
   * "#inflammable"]` diz que o que queima acende o que é inflamável, não o
   * contrário. Tentar casar nas duas direções pareceria mais tolerante e
   * produziria absurdo — madeira "acendendo" a chama.
   */
  match(
    actor: ReactiveTarget,
    receiver: ReactiveTarget,
    occasion: Occasion,
    materials: MaterialLookup,
    eventTags?: ReadonlySet<string>,
  ): ReactionRule[] {
    return this.for(occasion).filter(
      (r) =>
        termMatches(r.in[0], actor, materials, eventTags) &&
        termMatches(r.in[1], receiver, materials, eventTags),
    );
  }
}

/**
 * A regra dos três. R-003.
 *
 * Elemento altera material, elemento altera elemento, e **material nunca altera
 * material**. A terceira é a que impede a explosão combinatória: sem ela, o
 * espaço de regras é quadrático no número de materiais.
 *
 * A verificação é no carregamento, porque uma regra proibida não dá erro em
 * execução — ela simplesmente funciona, e o arquivo cresce até ninguém mais
 * conseguir prever o que ele faz.
 *
 * Isto não proíbe que dois objetos interajam: pedra ainda quebra vidro. Impacto
 * é física resolvida por escalar, e entra pela etiqueta de evento `#impact`, que
 * não é material nenhum.
 */
function assertRuleOfThrees(rule: ReactionRule, materials: MaterialLookup): void {
  const [a, b] = rule.in;
  if (isMaterialTerm(a, materials) && isMaterialTerm(b, materials)) {
    throw new Error(
      `reação "${rule.id}" tem material dos dois lados ("${a}" e "${b}"). ` +
        `R-003: material não altera material — é preciso um elemento no meio, ou é física por escalar.`,
    );
  }
}

/**
 * O termo designa matéria estável?
 *
 * `*` e nome de estado não designam. Etiqueta designa quando **todo** material
 * que a carrega é de categoria `material`: uma etiqueta que alcança pelo menos
 * um elemento é caminho legítimo para a regra, e barrá-la puniria o autor por
 * uma etiqueta genérica demais em vez de por uma regra errada.
 */
function isMaterialTerm(term: string, materials: MaterialLookup): boolean {
  if (term === '*' || !term.startsWith('#')) return false;
  const tag = term.slice(1);

  const alcancados = ('all' in materials ? (materials as { all(): { id: string }[] }).all() : [])
    .map((m) => materials.get(m.id))
    .filter((m) => {
      const props = (m.properties ?? {}) as Record<string, boolean | undefined>;
      return m.tags?.includes(tag) === true || props[tag] === true;
    });

  if (alcancados.length === 0) return false;
  return alcancados.every((m) => m.category === 'material');
}
