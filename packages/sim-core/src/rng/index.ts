/**
 * Aleatoriedade semeada. X-004.
 *
 * A simulação inteira precisa ser reproduzível: mesma semente, mesma partida.
 * Isso vale para a matriz de reação (R-050, "tudo em dado"), para a resolução
 * probabilística de consequência do Validador, e para qualquer desempate.
 *
 * O ponto não óbvio é que UM gerador global não basta, mesmo semeado. Se todo
 * mundo puxa da mesma sequência, a ordem de consumo vira parte do estado: basta
 * alguém acrescentar uma jogada de dado no substrato para que todos os sorteios
 * cognitivos depois dela mudem, e uma partida gravada deixa de reproduzir por
 * causa de uma mudança que não tinha nada a ver com cognição.
 *
 * Por isso cada consumidor tem um fluxo nomeado, derivado da semente-mestra por
 * hash do nome. Fluxos são independentes: acrescentar um não perturba nenhum
 * outro, e uma mudança no substrato não move o dado do Validador.
 */

/** Mistura um inteiro de 32 bits. Passo de avanço do mulberry32. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a de 32 bits. Determinístico entre plataformas, que é o único requisito. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** Nome do fluxo, para inspeção e log causal (X-005). */
  readonly stream: string;
  /** Real em [0, 1). */
  next(): number;
  /** Inteiro em [min, max], extremos incluídos. */
  int(min: number, max: number): number;
  /** Verdadeiro com a probabilidade dada. `chance(0)` é sempre falso; `chance(1)`, sempre verdadeiro. */
  chance(probability: number): boolean;
  /** Um item da lista. Lança se a lista estiver vazia, porque devolver undefined esconderia o erro. */
  pick<T>(items: readonly T[]): T;
  /** Embaralhamento Fisher-Yates numa cópia. */
  shuffle<T>(items: readonly T[]): T[];
}

function makeRng(stream: string, seed: number): Rng {
  const next = mulberry32(seed);
  return {
    stream,
    next,
    int(min, max) {
      if (max < min) throw new RangeError(`int(${min}, ${max}): máximo abaixo do mínimo`);
      return min + Math.floor(next() * (max - min + 1));
    },
    chance(probability) {
      if (probability <= 0) return false;
      if (probability >= 1) return true;
      return next() < probability;
    },
    pick(items) {
      if (items.length === 0) throw new RangeError(`pick em lista vazia no fluxo "${stream}"`);
      return items[Math.floor(next() * items.length)]!;
    },
    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}

/**
 * Raiz da aleatoriedade da partida. Guarda a semente-mestra e entrega um
 * gerador independente por fluxo nomeado.
 *
 * Nomes de fluxo são convenção, não enum, porque regra provisória promovida em
 * execução (V-024) pode precisar do próprio dado, e um enum fechado exigiria
 * mudar código para acomodar uma regra que nasceu de dado.
 */
export class SeedRoot {
  readonly seed: number;
  readonly #streams = new Map<string, Rng>();

  constructor(seed: number | string) {
    this.seed = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  }

  /**
   * O gerador daquele fluxo. Chamar duas vezes com o mesmo nome devolve o mesmo
   * objeto, e não um novo gerador reiniciado — reiniciar devolveria a mesma
   * sequência a cada chamada, que é o defeito mais silencioso possível: tudo
   * parece aleatório e nada varia.
   */
  stream(name: string): Rng {
    let rng = this.#streams.get(name);
    if (!rng) {
      rng = makeRng(name, (this.seed ^ hashString(name)) >>> 0);
      this.#streams.set(name, rng);
    }
    return rng;
  }

  /** Fluxos já abertos, em ordem de abertura. Diagnóstico. */
  openStreams(): string[] {
    return [...this.#streams.keys()];
  }
}
