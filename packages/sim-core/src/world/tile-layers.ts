import type { GridTileLayers, TileType } from '../types/domain.js';

/**
 * As três camadas que toda célula sempre tem. W-058.
 *
 * Densas em memória porque não existe célula sem tipo, sem material e sem
 * altura de solo — e o custo é o que W-058 aceita de propósito, já que um grid
 * maior multiplica memória e não CPU. Codificadas por repetição no save porque
 * um grid recém-gerado é quase todo a mesma coisa: 262 mil posições cabem em
 * algumas dezenas de números, sem perda.
 *
 * Tipo e material vão por paleta: guardar o índice em vez da string é o que faz
 * a camada caber num inteiro pequeno em vez de num vetor de 262 mil strings
 * repetidas.
 */
export class TileLayers {
  readonly gridId: string;
  readonly width: number;
  readonly height: number;

  #type: Uint16Array;
  #material: Uint16Array;
  // Float64 e não Float32: a altura entra como número de JSON e X-003 exige que
  // salvar e carregar devolva o estado idêntico campo a campo. Em Float32, 0,1
  // volta como 0,10000000149011612 e a igualdade quebra por arredondamento —
  // dois megabytes por grid é o preço de não ter esse tipo de falha.
  #baseHeight: Float64Array;

  #typePalette: TileType[];
  #materialPalette: string[];

  private constructor(
    gridId: string,
    width: number,
    height: number,
    typePalette: TileType[],
    materialPalette: string[],
  ) {
    this.gridId = gridId;
    this.width = width;
    this.height = height;
    const n = width * height;
    this.#type = new Uint16Array(n);
    this.#material = new Uint16Array(n);
    this.#baseHeight = new Float64Array(n);
    this.#typePalette = typePalette;
    this.#materialPalette = materialPalette;
  }

  static create(
    gridId: string,
    width: number,
    height: number,
    defaults: { type: TileType; materialId: string; baseHeight?: number },
  ): TileLayers {
    const l = new TileLayers(gridId, width, height, [defaults.type], [defaults.materialId]);
    if (defaults.baseHeight) l.#baseHeight.fill(defaults.baseHeight);
    return l;
  }

  #index(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      throw new RangeError(`célula (${x}, ${y}) fora do grid "${this.gridId}" (${this.width}×${this.height})`);
    }
    return y * this.width + x;
  }

  typeAt(x: number, y: number): TileType {
    return this.#typePalette[this.#type[this.#index(x, y)]!]!;
  }

  materialAt(x: number, y: number): string {
    return this.#materialPalette[this.#material[this.#index(x, y)]!]!;
  }

  baseHeightAt(x: number, y: number): number {
    return this.#baseHeight[this.#index(x, y)]!;
  }

  setTypeAt(x: number, y: number, type: TileType): void {
    this.#type[this.#index(x, y)] = intern(this.#typePalette, type);
  }

  setMaterialAt(x: number, y: number, materialId: string): void {
    this.#material[this.#index(x, y)] = intern(this.#materialPalette, materialId);
  }

  setBaseHeightAt(x: number, y: number, h: number): void {
    this.#baseHeight[this.#index(x, y)] = h;
  }

  /**
   * A forma salva. As paletas são recompactadas para conter apenas o que está
   * em uso, na ordem de primeira aparição na varredura.
   *
   * Recompactar não é economia — é **canonicidade**. Sem ela, um material que
   * existiu e foi todo substituído deixaria uma entrada morta na paleta, e dois
   * mundos de conteúdo idêntico salvariam diferente conforme a história de
   * edição de cada um. O teste de ida e volta de X-003 compara campo a campo, e
   * comparação campo a campo exige uma só forma para um só conteúdo.
   */
  toJSON(): GridTileLayers {
    const type = compactAndEncode(this.#type, this.#typePalette);
    const material = compactAndEncode(this.#material, this.#materialPalette);
    return {
      gridId: this.gridId,
      width: this.width,
      height: this.height,
      typePalette: type.palette as TileType[],
      materialPalette: material.palette,
      typeRuns: type.runs,
      materialRuns: material.runs,
      baseHeightRuns: encodeRuns(this.#baseHeight),
    };
  }

  static fromJSON(data: GridTileLayers): TileLayers {
    const l = new TileLayers(data.gridId, data.width, data.height, [...data.typePalette], [
      ...data.materialPalette,
    ]);
    const n = data.width * data.height;
    decodeRunsInto(data.typeRuns, l.#type, n, `typeRuns de "${data.gridId}"`);
    decodeRunsInto(data.materialRuns, l.#material, n, `materialRuns de "${data.gridId}"`);
    decodeRunsInto(data.baseHeightRuns, l.#baseHeight, n, `baseHeightRuns de "${data.gridId}"`);
    return l;
  }
}

function intern<T>(palette: T[], value: T): number {
  const at = palette.indexOf(value);
  if (at >= 0) return at;
  palette.push(value);
  return palette.length - 1;
}

function compactAndEncode(
  indices: Uint16Array,
  palette: readonly string[],
): { palette: string[]; runs: number[] } {
  const remap = new Map<number, number>();
  const novaPaleta: string[] = [];
  const runs: number[] = [];

  let atual = -1;
  let contagem = 0;
  for (let i = 0; i < indices.length; i++) {
    const antigo = indices[i]!;
    let novo = remap.get(antigo);
    if (novo === undefined) {
      novo = novaPaleta.length;
      remap.set(antigo, novo);
      const nome = palette[antigo];
      if (nome === undefined) throw new Error(`índice de paleta ${antigo} sem entrada correspondente`);
      novaPaleta.push(nome);
    }
    if (novo === atual) {
      contagem++;
    } else {
      if (contagem > 0) runs.push(atual, contagem);
      atual = novo;
      contagem = 1;
    }
  }
  if (contagem > 0) runs.push(atual, contagem);

  return { palette: novaPaleta, runs };
}

function encodeRuns(values: Float64Array): number[] {
  const runs: number[] = [];
  let atual = NaN;
  let contagem = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v === atual) {
      contagem++;
    } else {
      if (contagem > 0) runs.push(atual, contagem);
      atual = v;
      contagem = 1;
    }
  }
  if (contagem > 0) runs.push(atual, contagem);
  return runs;
}

/**
 * Decodifica conferindo que a soma das contagens é exatamente a área do grid.
 *
 * A conferência é o ponto. Uma sequência truncada preenche parte do vetor e
 * deixa o resto em zero, que é um tipo de tile válido e um material válido —
 * meio mapa viraria chão silenciosamente. O erro precisa aparecer na carga.
 */
function decodeRunsInto(
  runs: readonly number[],
  target: Uint16Array | Float64Array,
  expected: number,
  label: string,
): void {
  if (runs.length % 2 !== 0) {
    throw new Error(`${label}: número ímpar de entradas, e elas são pares de valor e contagem`);
  }
  let at = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const valor = runs[i]!;
    const quantas = runs[i + 1]!;
    if (!Number.isInteger(quantas) || quantas <= 0) {
      throw new Error(`${label}: contagem inválida (${quantas}) na posição ${i + 1}`);
    }
    if (at + quantas > expected) {
      throw new Error(`${label}: as contagens somam mais que as ${expected} células do grid`);
    }
    target.fill(valor, at, at + quantas);
    at += quantas;
  }
  if (at !== expected) {
    throw new Error(`${label}: as contagens somam ${at}, e o grid tem ${expected} células`);
  }
}
