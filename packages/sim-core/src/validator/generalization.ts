import { EFFECT_VOCABULARY, OCCASIONS } from '../substrate/index.js';
import type { FormulaBinding, ProvisionalRule } from '../types/domain.js';

/**
 * Promoção generalizada. V-021, V-022, V-023, V-040, R-046.
 *
 * Ao inventar causação nova, o Validador decide também se aquele julgamento
 * generaliza. É o mecanismo que faz o custo cair ao longo da partida em vez de
 * ficar constante: cada regra promovida é uma chamada que deixa de existir para
 * sempre.
 *
 * O contrato inteiro deste módulo é uma frase: **não existe caminho pelo qual
 * uma regra malformada entre na matriz**. Proposta que não cabe no vocabulário
 * fechado do seu domínio cai para caso único, sem erro de execução (V-023).
 */

export type RuleDomain = 'substrate' | 'body' | 'social' | 'cognition' | 'community' | 'object';

export interface GeneralizationProposal {
  readonly verdict: 'systemic' | 'one_off';
  readonly domain?: string;
  readonly rule?: Record<string, unknown>;
  readonly reasoning: string;
}

export interface GeneralizationOutcome {
  readonly verdict: 'systemic' | 'one_off';
  readonly rule?: ProvisionalRule;
  /**
   * Por que caiu para caso único, quando caiu apesar de proposta como sistêmica.
   *
   * Guardado e não descartado: uma proposta que cai sempre pelo mesmo motivo é
   * sinal de prompt mal escrito, e é a diferença entre ajustar o prompt e
   * concluir que o modelo não generaliza.
   */
  readonly demotionReason?: string;
}

export interface GeneralizationContext {
  readonly simTime: number;
  readonly judgmentId: string;
  readonly nextRuleId: () => string;
  /** Moldes declarados em `config/formulas.json`, com os parâmetros que cada um admite. V-040. */
  readonly formulaTemplates?: ReadonlyMap<string, readonly string[]>;
  /** Operações biológicas de B-037, para o vocabulário do domínio `body`. */
  readonly bodyOperations?: ReadonlySet<string>;
  /** Teto de regras provisórias vivas. V-027. */
  readonly liveRuleCount: number;
  readonly maxLiveRules: number;
}

const DOMINIOS = new Set<RuleDomain>([
  'substrate',
  'body',
  'social',
  'cognition',
  'community',
  'object',
]);

/**
 * Valida a proposta e, passando, devolve a regra provisória pronta para entrar
 * viva. Falhando, devolve caso único com o motivo.
 *
 * Nunca lança. Um julgamento cujo apêndice de generalização está torto continua
 * sendo um julgamento válido sobre o que aconteceu agora — derrubar a mediação
 * inteira por causa do apêndice seria trocar um custo pequeno por um travamento.
 */
export function resolveGeneralization(
  proposal: GeneralizationProposal,
  ctx: GeneralizationContext,
): GeneralizationOutcome {
  if (proposal.verdict === 'one_off') return { verdict: 'one_off' };

  const demote = (motivo: string): GeneralizationOutcome => ({
    verdict: 'one_off',
    demotionReason: motivo,
  });

  // O teto vem antes da forma. V-027 existe para conter proliferação, e uma
  // regra bem formada além do teto é exatamente o caso que ele precisa conter —
  // conferir a forma primeiro deixaria a mensagem culpar o vocabulário por um
  // limite que não tem nada a ver com ele.
  if (ctx.liveRuleCount >= ctx.maxLiveRules) {
    return demote(
      `teto de ${ctx.maxLiveRules} regras provisórias vivas atingido; revise alguma no painel antes de promover outra`,
    );
  }

  if (!proposal.domain || !DOMINIOS.has(proposal.domain as RuleDomain)) {
    return demote(`domínio ausente ou desconhecido: ${String(proposal.domain)}`);
  }
  if (!proposal.rule || typeof proposal.rule !== 'object') {
    return demote('veredito sistêmico sem corpo de regra');
  }

  const erro = validateRuleBody(proposal.domain as RuleDomain, proposal.rule, ctx);
  if (erro) return demote(erro);

  const corpo = normalizeRuleBody(proposal.rule);

  return {
    verdict: 'systemic',
    rule: {
      id: ctx.nextRuleId(),
      domain: proposal.domain as RuleDomain,
      state: 'provisional',
      rule: corpo,
      fireCount: 0,
      proposedAtSimTime: ctx.simTime,
      sourceJudgmentId: ctx.judgmentId,
      reasoning: proposal.reasoning,
    } as ProvisionalRule,
  };
}

/**
 * O vocabulário fechado, domínio a domínio. V-022.
 *
 * O Validador nunca inventa primitiva nova de engine: ele combina as que
 * existem. Um efeito, uma operação ou um alvo fora da lista do seu domínio
 * derruba a proposta.
 */
function validateRuleBody(
  domain: RuleDomain,
  rule: Record<string, unknown>,
  ctx: GeneralizationContext,
): string | undefined {
  const formula = (rule['formula'] ?? (rule['effect'] as Record<string, unknown>)?.['formula']) as
    | FormulaBinding
    | undefined;
  if (formula) return validateFormula(formula, ctx);

  switch (domain) {
    case 'substrate': {
      const efeito = leaf(rule, 'effect');
      const ocasiao = leaf(rule, 'when');
      if (!efeito || !EFFECT_VOCABULARY.includes(efeito as never)) {
        return `efeito "${String(efeito)}" fora do vocabulário fechado de R-015`;
      }
      if (!ocasiao || !OCCASIONS.includes(ocasiao as never)) {
        return `ocasião "${String(ocasiao)}" fora das cinco de R-013`;
      }
      const chance = numberLeaf(rule, 'chance');
      if (chance === undefined || chance <= 0 || chance > 1) {
        return 'regra de substrato precisa de chance entre 0 e 1';
      }
      return undefined;
    }
    case 'body': {
      const operacao = leaf(rule, 'operation');
      if (!operacao) return 'regra de corpo precisa nomear a operação';
      if (ctx.bodyOperations && !ctx.bodyOperations.has(operacao)) {
        return `operação "${operacao}" fora do vocabulário de B-037`;
      }
      return undefined;
    }
    case 'social':
      return leaf(rule, 'perceptTemplate') ? undefined : 'regra social precisa de perceptTemplate';
    case 'cognition':
      return leaf(rule, 'topic') && leaf(rule, 'stance')
        ? undefined
        : 'regra de cognição precisa de tópico e stance';
    case 'community':
      return leaf(rule, 'lawTemplate') ? undefined : 'regra de comunidade precisa de lawTemplate';
    case 'object': {
      // O `defId` é o que amarra a regra a um molde, e sem ele a promoção não
      // tem onde ser materializada como ItemRule. V-041.
      if (!leaf(rule, 'defId')) return 'regra de objeto precisa do defId do molde alvo';
      const efeito = leaf(rule, 'effect');
      if (efeito && !EFFECT_VOCABULARY.includes(efeito as never)) {
        return `efeito "${efeito}" fora do vocabulário fechado de R-015`;
      }
      return leaf(rule, 'trigger') ? undefined : 'regra de objeto precisa de gatilho de uso';
    }
  }
}

/**
 * Molde de fórmula. V-040.
 *
 * O Validador escolhe entre moldes declarados e preenche constantes; ele não
 * escreve expressão. Modelo escrevendo expressão que passa a rodar na engine não
 * seria auditável, não seria determinístico e não teria como ser impedido de
 * estar errado.
 */
function validateFormula(formula: FormulaBinding, ctx: GeneralizationContext): string | undefined {
  if (!ctx.formulaTemplates) return 'nenhum catálogo de moldes carregado';
  const declarados = ctx.formulaTemplates.get(formula.templateId);
  if (!declarados) return `molde de fórmula inexistente: "${formula.templateId}"`;

  const permitidos = new Set(declarados);
  const intrusos = Object.keys(formula.parameters ?? {}).filter((p) => !permitidos.has(p));
  if (intrusos.length > 0) {
    return `parâmetros não declarados pelo molde "${formula.templateId}": ${intrusos.join(', ')}`;
  }
  const faltando = declarados.filter((p) => formula.parameters?.[p] === undefined);
  if (faltando.length > 0) {
    return `molde "${formula.templateId}" exige os parâmetros: ${faltando.join(', ')}`;
  }
  return undefined;
}

/**
 * O schema exige `condition` no corpo da regra, e o modelo escreve a condição
 * achatada tantas vezes quanto aninhada. Normalizar aqui, e não recusar, é o que
 * evita gastar um passe de reparo com uma diferença de forma que não muda o
 * conteúdo de nada.
 */
function normalizeRuleBody(rule: Record<string, unknown>): ProvisionalRule['rule'] {
  const condicaoDeclarada = rule['condition'];
  const condition =
    condicaoDeclarada && typeof condicaoDeclarada === 'object'
      ? (condicaoDeclarada as Record<string, unknown>)
      : pick(rule, ['when', 'in', 'trigger', 'topic', 'operation', 'partSelector', 'defId']);

  const effect =
    rule['effect'] && typeof rule['effect'] === 'object'
      ? (rule['effect'] as Record<string, unknown>)
      : pick(rule, ['effect', 'chance', 'outcome', 'stance', 'relationBias', 'lawTemplate']);

  const out: Record<string, unknown> = { condition };
  if (Object.keys(effect).length > 0) out['effect'] = effect;
  if (rule['formula']) out['formula'] = rule['formula'];
  if (typeof rule['description'] === 'string') out['description'] = rule['description'];
  return out as ProvisionalRule['rule'];
}

function pick(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (source[k] !== undefined) out[k] = source[k];
  return out;
}

/** Lê a chave no corpo ou dentro de `condition`/`effect`, que é onde o modelo alterna. */
function leaf(rule: Record<string, unknown>, key: string): string | undefined {
  for (const escopo of [rule, rule['condition'], rule['effect']]) {
    if (escopo && typeof escopo === 'object') {
      const v = (escopo as Record<string, unknown>)[key];
      if (typeof v === 'string') return v;
    }
  }
  return undefined;
}

function numberLeaf(rule: Record<string, unknown>, key: string): number | undefined {
  for (const escopo of [rule, rule['condition'], rule['effect']]) {
    if (escopo && typeof escopo === 'object') {
      const v = (escopo as Record<string, unknown>)[key];
      if (typeof v === 'number') return v;
    }
  }
  return undefined;
}
