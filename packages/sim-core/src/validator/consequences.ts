import type { SeedRoot } from '../rng/index.js';
import type { WorldMutation } from '../types/domain.js';

/**
 * Consequência com probabilidade, resolvida pela engine. V-038, V-039.
 *
 * O modelo estima; quem sorteia é a engine, semeada. Um modelo que também
 * sorteasse destruiria o replay e não seria mais barato: a rolagem precisa ser
 * recalculável a partir da mesma semente para que o cassete reproduza a partida
 * inteira, e não só as respostas.
 */

export interface ProposedConsequence {
  readonly description: string;
  readonly probability: number;
  readonly mutations: readonly WorldMutation[];
  readonly exclusiveGroup?: string;
}

export interface ResolvedConsequence {
  readonly description: string;
  readonly probability: number;
  readonly occurred: boolean;
  readonly mutations: readonly WorldMutation[];
  readonly exclusiveGroup?: string;
}

export interface ConsequenceResolution {
  readonly outcomes: readonly ResolvedConsequence[];
  readonly mutations: readonly WorldMutation[];
  /** Nome do fluxo semeado, para a trilha de auditoria. V-029, V-039. */
  readonly rollSeed: string;
  readonly rejections: readonly string[];
}

export interface RollKey {
  readonly simTime: number;
  readonly agentId: string;
  readonly actionId: string;
}

/**
 * A semente da rolagem.
 *
 * Deriva da semente da partida combinada com hora simulada, agente e ação, o
 * que dá duas propriedades ao mesmo tempo: a rolagem é reproduzível, e é
 * reproduzível **isoladamente**. Puxar de um fluxo compartilhado do Validador
 * também seria determinístico, mas exigiria ter passado por todas as rolagens
 * anteriores para chegar nesta — e depurar uma consequência do dia vinte
 * significaria reexecutar dezenove dias.
 */
export function rollStreamName(key: RollKey): string {
  return `validador:roll:${key.simTime}:${key.agentId}:${key.actionId}`;
}

/**
 * Resolve os desfechos propostos.
 *
 * Grupo exclusivo: as probabilidades somam cem e apenas um ocorre. Sem grupo:
 * cada um é avaliado de forma independente.
 *
 * Um grupo cuja soma não fecha cem é **rejeitado inteiro**, e não normalizado.
 * Normalizar em silêncio faria a estimativa errada do modelo virar
 * comportamento plausível, e o defeito nunca apareceria; rejeitar deixa o
 * desfecho certo das mutações valer e registra o problema onde ele pode ser
 * lido.
 */
export function resolveConsequences(
  proposals: readonly ProposedConsequence[],
  seedRoot: SeedRoot,
  key: RollKey,
): ConsequenceResolution {
  const nomeDoFluxo = rollStreamName(key);
  const rejeicoes: string[] = [];

  if (proposals.length === 0) {
    return { outcomes: [], mutations: [], rollSeed: nomeDoFluxo, rejections: [] };
  }

  const rng = seedRoot.derive(nomeDoFluxo);
  const resolvidos: ResolvedConsequence[] = [];

  // Ordem fixa por descrição dentro de cada bloco: a ordem do array vem do
  // modelo, e dois cassetes do mesmo julgamento podem trazê-la trocada sem que
  // nada de fato tenha mudado. Deixar a ordem do modelo decidir qual desfecho
  // consome qual dado faria o replay divergir por reordenação cosmética.
  const independentes = proposals
    .filter((c) => !c.exclusiveGroup)
    .sort((a, b) => cmp(a.description, b.description));

  const grupos = new Map<string, ProposedConsequence[]>();
  for (const c of proposals) {
    if (!c.exclusiveGroup) continue;
    const lista = grupos.get(c.exclusiveGroup) ?? [];
    lista.push(c);
    grupos.set(c.exclusiveGroup, lista);
  }

  for (const nome of [...grupos.keys()].sort(cmp)) {
    const membros = grupos.get(nome)!.sort((a, b) => cmp(a.description, b.description));
    const soma = membros.reduce((t, c) => t + c.probability, 0);
    if (soma !== 100) {
      rejeicoes.push(
        `grupo exclusivo "${nome}" soma ${soma} em vez de 100; nenhum dos seus ${membros.length} desfechos foi sorteado`,
      );
      for (const m of membros) {
        resolvidos.push({ ...m, occurred: false, mutations: m.mutations });
      }
      continue;
    }

    const sorteio = rng.int(1, 100);
    let acumulado = 0;
    let escolhido: ProposedConsequence | undefined;
    for (const m of membros) {
      acumulado += m.probability;
      if (!escolhido && sorteio <= acumulado) escolhido = m;
    }
    for (const m of membros) {
      resolvidos.push({ ...m, occurred: m === escolhido });
    }
  }

  for (const c of independentes) {
    resolvidos.push({ ...c, occurred: rng.int(1, 100) <= c.probability });
  }

  return {
    outcomes: resolvidos,
    mutations: resolvidos.filter((o) => o.occurred).flatMap((o) => [...o.mutations]),
    rollSeed: nomeDoFluxo,
    rejections: rejeicoes,
  };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
