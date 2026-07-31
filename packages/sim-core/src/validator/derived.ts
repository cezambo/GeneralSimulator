import { domainSchema } from '../schema/index.js';

/**
 * O guarda de campo derivado. V-013, B-036.
 *
 * O Validador escreve **causas** — condição, material de parte, presença de
 * parte, substância — e nunca valores derivados: capacidade, dor total, sangue
 * total, temperatura corporal, estágio de condição, estado de vida.
 *
 * O motivo imediato é que escrever em campo derivado é apagado no recálculo
 * seguinte, e o sintoma é o pior tipo: nenhum erro, nenhuma mutação aplicada, e
 * um Validador que acha que matou alguém.
 *
 * O efeito colateral é melhor que o motivo. Para matar, ele precisa destruir uma
 * parte vital, então morte narrativa nasce com a mesma cadeia causal auditável
 * de qualquer outra.
 */

/**
 * Os nomes vêm do schema, e não de uma lista aqui.
 *
 * Duplicar a lista em código faria dela uma segunda fonte de verdade que
 * divergiria no primeiro campo derivado que alguém acrescentasse — e divergiria
 * em silêncio, deixando o campo novo desprotegido. `Condition.stage` era
 * exatamente esse caso: descrito como derivado na prosa e sem a marca.
 */
function collectDerivedNames(node: unknown, out: Set<string>): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectDerivedNames(item, out);
    return;
  }

  const obj = node as Record<string, unknown>;
  const props = obj['properties'];
  if (props && typeof props === 'object') {
    for (const [nome, def] of Object.entries(props as Record<string, unknown>)) {
      if (def && typeof def === 'object' && (def as Record<string, unknown>)['x-derived'] === true) {
        out.add(nome);
      }
    }
  }

  // Um `$defs` marcado no próprio objeto derruba o nome pelo qual ele é
  // referenciado, e não os campos de dentro: `Capacities` inteiro é derivado, e
  // o que precisa ser barrado é a chave `capacities` na mutação.
  const defs = obj['$defs'];
  if (defs && typeof defs === 'object') {
    for (const [nome, def] of Object.entries(defs as Record<string, unknown>)) {
      if (def && typeof def === 'object' && (def as Record<string, unknown>)['x-derived'] === true) {
        out.add(nome.charAt(0).toLowerCase() + nome.slice(1));
      }
    }
  }

  for (const valor of Object.values(obj)) collectDerivedNames(valor, out);
}

let cache: ReadonlySet<string> | undefined;

export function derivedFieldNames(): ReadonlySet<string> {
  if (!cache) {
    const nomes = new Set<string>();
    collectDerivedNames(domainSchema, nomes);
    cache = nomes;
  }
  return cache;
}

/**
 * Qualquer nome derivado citado em `changes`, em qualquer profundidade.
 *
 * Casa por nome de campo e não por caminho completo, o que é deliberadamente
 * grosseiro: `functioning` numa parte e `functioning` em qualquer outro lugar
 * caem os dois. O falso positivo custa uma mutação recusada com mensagem que
 * diz qual causa escrever no lugar, que é o que V-013 quer que aconteça de
 * qualquer forma; o falso negativo custa um campo derivado escrito em silêncio.
 */
export function findDerivedWrites(changes: unknown, path: string[] = []): string[] {
  if (changes === null || typeof changes !== 'object' || Array.isArray(changes)) return [];
  const derivados = derivedFieldNames();
  const achados: string[] = [];

  for (const [chave, valor] of Object.entries(changes as Record<string, unknown>)) {
    const caminho = [...path, chave];
    // Aceita tanto aninhamento quanto caminho pontuado: o modelo escreve as
    // duas formas, e barrar só uma delas seria barrar nenhuma.
    const segmentos = chave.split('.');
    if (segmentos.some((s) => derivados.has(s))) {
      achados.push(caminho.join('.'));
      continue;
    }
    achados.push(...findDerivedWrites(valor, caminho));
  }

  return achados;
}
