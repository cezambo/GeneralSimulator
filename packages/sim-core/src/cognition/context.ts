import { estimateTokens } from '../perception/index.js';

/**
 * Montagem do contexto de pensamento. C-002.
 *
 * Mesma mecânica da percepção — ordenar, cortar no orçamento, fundir — com uma
 * diferença que é o ponto do requisito: **duas seções não são cortáveis**. A
 * rotina entra sempre, sem exceção, e o auto-entendimento entra sempre que
 * existe. São curtos, e são justamente o que ancora o agente quando o resto do
 * bloco foi omitido por saliência: um agente sem rotina e sem noção de si, num
 * momento em que tudo o mais foi cortado, não é um agente com pouco contexto —
 * é um agente sem identidade, que responde como um narrador genérico.
 */

export interface ContextSection {
  readonly id: string;
  /** Cabeçalho curto. Ausente significa parágrafo solto. */
  readonly title?: string;
  readonly text: string;
  /** Nunca cortada. C-002: rotina sempre; auto-entendimento sempre que existe. */
  readonly pinned?: boolean;
  /** Menor entra primeiro e cai por último. */
  readonly priority: number;
}

export interface ContextResult {
  readonly text: string;
  readonly includedIds: readonly string[];
  readonly droppedIds: readonly string[];
  readonly estimatedTokens: number;
}

export class ContextBudgetTooSmall extends Error {
  constructor(
    readonly pinnedTokens: number,
    readonly budget: number,
  ) {
    super(
      `as seções que C-002 declara não-cortáveis somam ${pinnedTokens} tokens e o orçamento é ${budget}. ` +
        `Aumente cognicao.orcamentoTokensContextoPensamento ou encurte a rotina — cortar uma delas violaria o requisito em silêncio.`,
    );
    this.name = 'ContextBudgetTooSmall';
  }
}

/**
 * @param budget  Vem de `tuning.json`. Sem padrão no código, por X-008.
 */
export function assembleThoughtContext(
  sections: readonly ContextSection[],
  budget: number,
): ContextResult {
  const presentes = sections.filter((s) => s.text.trim().length > 0);
  const fixas = presentes.filter((s) => s.pinned);
  const opcionais = presentes.filter((s) => !s.pinned);

  const custoFixas = estimateTokens(renderSections(sortSections(fixas)));
  if (custoFixas > budget) {
    // Estourar por causa das fixas é erro de configuração, e precisa aparecer
    // como erro. A alternativa — cortar uma fixa e seguir — cumpriria o
    // orçamento violando a promessa de C-002, e ninguém descobriria.
    throw new ContextBudgetTooSmall(custoFixas, budget);
  }

  const escolhidas = [...fixas];
  const cortadas: string[] = [];

  for (const s of sortSections(opcionais)) {
    const tentativa = [...escolhidas, s];
    if (estimateTokens(renderSections(sortSections(tentativa))) > budget) {
      cortadas.push(s.id);
      continue;
    }
    escolhidas.push(s);
  }

  const ordenadas = sortSections(escolhidas);
  const texto = renderSections(ordenadas);
  return {
    text: texto,
    includedIds: ordenadas.map((s) => s.id),
    droppedIds: cortadas,
    estimatedTokens: estimateTokens(texto),
  };
}

/**
 * Ordem de leitura por prioridade, com o identificador como desempate.
 *
 * O desempate pelo identificador existe pelo mesmo motivo que na percepção:
 * sem ele, duas seções de mesma prioridade sairiam na ordem em que quem chamou
 * montou o vetor, e o bloco deixaria de ser função só do conteúdo.
 */
function sortSections(sections: readonly ContextSection[]): ContextSection[] {
  return [...sections].sort((a, b) =>
    a.priority !== b.priority ? a.priority - b.priority : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

function renderSections(sections: readonly ContextSection[]): string {
  return sections
    .map((s) => (s.title ? `${s.title}\n${s.text.trim()}` : s.text.trim()))
    .join('\n\n');
}
