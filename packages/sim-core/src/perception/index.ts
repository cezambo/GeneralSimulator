import type { PerceptibleFact } from '../types/domain.js';

/**
 * Montagem do relato de percepção. A-031, A-032, A-033.
 *
 * A engine colhe fatos, ordena por saliência, corta no orçamento e funde em
 * prosa. **Nenhuma chamada de LLM acontece entre o estado do mundo e o
 * relato**: filtrar percepção por um modelo pequeno era uma chamada por agente
 * por pensamento, dobrando o custo do sistema para produzir texto que a engine
 * já sabe escrever, e pondo não-determinismo na única parte do laço que precisa
 * ser reproduzível pelo cassete.
 */

export interface ReportBudget {
  /** `percepcao.orcamentoTokensRelatoPercepcao`. */
  readonly maxTokens: number;
  /** `percepcao.maxFatosNoRelato`. */
  readonly maxFacts: number;
}

export interface PerceptionReport {
  readonly text: string;
  readonly included: readonly PerceptibleFact[];
  readonly dropped: readonly PerceptibleFact[];
  readonly estimatedTokens: number;
}

/**
 * Estimativa de tokens, deliberadamente **pessimista**.
 *
 * Não há tokenizador aqui, e nem deveria haver: o roteador é agnóstico de
 * provedor (L-001) e cada família tokeniza diferente, então cravar um
 * tokenizador amarraria a montagem a um modelo. O que se pode escolher é o lado
 * do erro, e o lado seguro é superestimar — subestimar faz o relato passar do
 * orçamento sem ninguém notar, e quem corta passa a ser o provedor, no meio da
 * frase e sem critério de saliência nenhum.
 *
 * Três caracteres e meio por token, e não quatro: em português acentuado a
 * razão real fica abaixo de quatro na maioria dos tokenizadores, e quatro
 * subestimaria justamente onde o texto é mais denso.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Ordem total, e função apenas do conteúdo dos fatos.
 *
 * A camada declarada de A-032 é o critério principal. O que A-032 não resolve é
 * o desempate **dentro** de uma camada, e ele importa: quando uma camada só
 * cabe pela metade, alguém decide quais fatos dela sobrevivem.
 *
 * O desempate é por novidade e depois pelo próprio texto. Alfabético é
 * arbitrário de propósito — a alternativa natural seria a ordem em que os
 * fatos foram colhidos, e é exatamente ela que A-032 proíbe, porque depende de
 * qual estrutura o código varreu primeiro e faz duas execuções da mesma cena
 * divergirem. Ordem arbitrária e declarada é reproduzível; ordem "natural" e
 * emergente não é.
 */
function compareFacts(a: PerceptibleFact, b: PerceptibleFact): number {
  if (a.salienceTier !== b.salienceTier) return a.salienceTier - b.salienceTier;
  const na = a.isChange ? 0 : 1;
  const nb = b.isChange ? 0 : 1;
  if (na !== nb) return na - nb;
  return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
}

/**
 * Ordena, corta no orçamento e funde em prosa.
 *
 * O orçamento entra por parâmetro e não tem valor padrão no código. X-008 manda
 * número de comportamento vir de configuração, e um padrão embutido é a forma
 * mais comum de essa regra vazar: ele funciona, ninguém repara, e o valor de
 * `tuning.json` passa a ser decorativo.
 */
export function assemblePerceptionReport(
  facts: readonly PerceptibleFact[],
  budget: ReportBudget,
): PerceptionReport {
  const ordenados = [...facts].sort(compareFacts);

  const incluidos: PerceptibleFact[] = [];
  const cortados: PerceptibleFact[] = [];
  let texto = '';

  for (const fato of ordenados) {
    if (incluidos.length >= budget.maxFacts) {
      cortados.push(fato);
      continue;
    }
    const candidato = renderFacts([...incluidos, fato]);
    if (estimateTokens(candidato) > budget.maxTokens) {
      // Não interrompe o laço: um fato longo de camada 5 pode não caber
      // enquanto um curto de camada 6 ainda cabe, e parar no primeiro que
      // estourou desperdiçaria o resto do orçamento.
      cortados.push(fato);
      continue;
    }
    incluidos.push(fato);
    texto = candidato;
  }

  return {
    text: texto,
    included: incluidos,
    dropped: cortados,
    estimatedTokens: estimateTokens(texto),
  };
}

/**
 * Prosa a partir dos fatos, agrupada por camada.
 *
 * A ordem de leitura é a mesma da saliência, e isso é escolha. Poderia ser
 * ordem narrativa — lugar, ambiente, gente — que soa melhor, mas L-019 diz que
 * os prompts são escritos para o tier mais fraco, e modelo fraco atende ao
 * começo do bloco. O que importa mais tem de ser lido primeiro, e não ficar
 * bonito no meio.
 */
function renderFacts(facts: readonly PerceptibleFact[]): string {
  const porCamada = new Map<number, string[]>();
  for (const f of facts) {
    const lista = porCamada.get(f.salienceTier) ?? [];
    lista.push(f.text.trim());
    porCamada.set(f.salienceTier, lista);
  }
  return [...porCamada.keys()]
    .sort((a, b) => a - b)
    .map((tier) => porCamada.get(tier)!.map(ensureSentence).join(' '))
    .join(' ');
}

function ensureSentence(s: string): string {
  return /[.!?…]$/.test(s) ? s : `${s}.`;
}

/**
 * O que o relato nunca pode conter. A-033.
 *
 * Roda sempre, e não só em teste. Um vazamento aqui não quebra nada de forma
 * visível: o relato continua legível e o agente continua decidindo. O que ele
 * apaga é a mentira, a dedução e a formação de opinião de uma vez, porque não
 * há o que descobrir sobre alguém cujo interior chega junto da aparência — e um
 * defeito que só se manifesta como "a simulação ficou sem graça" é um defeito
 * que ninguém encontra.
 */
export function assertNoLeaks(text: string, facts: readonly PerceptibleFact[]): void {
  const problemas: string[] = [];

  for (const f of facts) {
    if (f.sourceId && text.includes(f.sourceId)) {
      problemas.push(`identificador interno "${f.sourceId}" no relato`);
    }
  }
  const decimal = text.match(/\d+[.,]\d+/);
  if (decimal) problemas.push(`número cru de simulação ("${decimal[0]}")`);

  const marcado = text.match(/[#_]\d+\b/);
  if (marcado) problemas.push(`identificador interno ("${marcado[0]}")`);

  const coordenada = text.match(/\(\s*-?\d+\s*,\s*-?\d+\s*\)/);
  if (coordenada) problemas.push(`coordenada ("${coordenada[0]}")`);

  if (problemas.length > 0) {
    throw new PerceptionLeak(problemas, text);
  }
}

export class PerceptionLeak extends Error {
  constructor(
    readonly problems: readonly string[],
    readonly text: string,
  ) {
    super(
      `percepção vazou o que A-033 proíbe: ${problems.join('; ')}. ` +
        `Relato: ${text.slice(0, 200)}`,
    );
    this.name = 'PerceptionLeak';
  }
}

/**
 * Colhedor de fatos. Cada domínio registra o seu.
 *
 * A interface existe antes dos colhedores porque é ela que faz o aceite de
 * A-031 ser verificável: "para cada sistema de SPEC-R existe pelo menos uma
 * frase correspondente" só é conferível se houver uma lista de quem contribui.
 */
export interface PerceptionContributor {
  readonly name: string;
  collect(ctx: PerceptionContext): PerceptibleFact[];
}

export interface PerceptionContext {
  readonly agentId: string;
  readonly gridId: string;
  readonly simTime: number;
}

export class PerceptionPipeline {
  readonly #contributors: PerceptionContributor[] = [];

  register(c: PerceptionContributor): this {
    if (this.#contributors.some((x) => x.name === c.name)) {
      throw new Error(`colhedor de percepção duplicado: "${c.name}"`);
    }
    this.#contributors.push(c);
    return this;
  }

  contributors(): readonly string[] {
    return this.#contributors.map((c) => c.name);
  }

  /**
   * Colhe de todos e monta. A ordem de registro não influencia o resultado,
   * porque a ordenação é função só do conteúdo — e é isso que permite acrescentar
   * um colhedor sem reordenar o relato de todo mundo.
   */
  run(ctx: PerceptionContext, budget: ReportBudget): PerceptionReport {
    const fatos = this.#contributors.flatMap((c) => c.collect(ctx));
    const relato = assemblePerceptionReport(fatos, budget);
    assertNoLeaks(relato.text, relato.included);
    return relato;
  }
}
