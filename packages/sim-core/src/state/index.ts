import { SeedRoot } from '../rng/index.js';
import { validateDomain } from '../schema/index.js';
import { TileLayers } from '../world/tile-layers.js';
import type { Grid, SimulationState, TileOverlay, TileType } from '../types/domain.js';

/**
 * O estado raiz e o par salvar/carregar. X-003, X-001.
 *
 * A decisão que governa este módulo: **o estado vivo já é a forma salva**, e
 * salvar é serializá-lo sem projeção. Montar um objeto de save a partir do
 * estado parece mais limpo e é a origem do defeito clássico — acrescenta-se um
 * campo ao estado, esquece-se de acrescentá-lo à projeção, e a perda aparece
 * dias depois num carregamento, sem erro nenhum.
 *
 * Duas coisas fogem à regra porque não têm representação eficiente em JSON: as
 * camadas densas de tile e a posição dos geradores. As duas são pequenas, ficam
 * confinadas a `commit()` e têm teste próprio de ida e volta — que é o preço de
 * abrir a exceção, e o motivo de ela não se espalhar.
 */

export const SAVE_VERSION = 1;
export const ENGINE_VERSION = '0.0.0';

export interface CreateOptions {
  readonly seed: string;
  readonly preset: string;
  readonly promptsVersion?: string;
  readonly configFingerprint?: string;
  readonly scenarioName?: string;
  readonly mainGrid: {
    readonly id?: string;
    readonly width: number;
    readonly height: number;
    readonly defaultType: TileType;
    readonly defaultMaterialId: string;
    readonly defaultBaseHeight?: number;
  };
}

export class Simulation {
  readonly state: SimulationState;
  readonly rng: SeedRoot;
  readonly layers = new Map<string, TileLayers>();

  private constructor(state: SimulationState, rng: SeedRoot) {
    this.state = state;
    this.rng = rng;
    for (const l of state.tileLayers) {
      this.layers.set(l.gridId, TileLayers.fromJSON(l));
    }
  }

  static create(opts: CreateOptions): Simulation {
    const gridId = opts.mainGrid.id ?? 'main';
    const grid: Grid = {
      id: gridId,
      width: opts.mainGrid.width,
      height: opts.mainGrid.height,
      alignment: 'aligned',
      zLevel: 0,
    };
    const layers = TileLayers.create(gridId, opts.mainGrid.width, opts.mainGrid.height, {
      type: opts.mainGrid.defaultType,
      materialId: opts.mainGrid.defaultMaterialId,
      ...(opts.mainGrid.defaultBaseHeight !== undefined
        ? { baseHeight: opts.mainGrid.defaultBaseHeight }
        : {}),
    });

    const state: SimulationState = {
      saveVersion: SAVE_VERSION,
      manifest: {
        seed: opts.seed,
        preset: opts.preset,
        promptsVersion: opts.promptsVersion ?? 'desconhecida',
        engineVersion: ENGINE_VERSION,
        ...(opts.configFingerprint ? { configFingerprint: opts.configFingerprint } : {}),
        ...(opts.scenarioName ? { scenarioName: opts.scenarioName } : {}),
        savedAtSimTime: 0,
      },
      clock: { simTime: 0, speed: 1, paused: true, day: 1, season: 1, year: 1 },
      grids: [grid],
      tileLayers: [layers.toJSON()],
      tileOverlays: { [gridId]: {} },
      objects: {},
      agents: {},
      rngCursors: [],
      nextIds: {},
    };

    return new Simulation(state, new SeedRoot(opts.seed));
  }

  get mainGridId(): string {
    const first = this.state.grids[0];
    if (!first) throw new Error('estado sem nenhum grid');
    return first.id;
  }

  layersOf(gridId: string): TileLayers {
    const l = this.layers.get(gridId);
    if (!l) throw new Error(`grid "${gridId}" não tem camadas de tile`);
    return l;
  }

  /**
   * A sobreposição da célula, criada sob demanda.
   *
   * Sob demanda porque célula ausente é célula intacta (W-058): materializar
   * uma entrada vazia a cada leitura encheria o save de objetos `{}` e faria a
   * memória crescer com a área do mapa, que é exatamente o que W-058 evita.
   */
  overlayAt(gridId: string, x: number, y: number, create: true): TileOverlay;
  overlayAt(gridId: string, x: number, y: number, create?: false): TileOverlay | undefined;
  overlayAt(gridId: string, x: number, y: number, create = false): TileOverlay | undefined {
    const porGrid = (this.state.tileOverlays[gridId] ??= {});
    const chave = `${x},${y}`;
    let o = porGrid[chave];
    if (!o && create) {
      o = {};
      porGrid[chave] = o;
    }
    return o;
  }

  /**
   * Descarta sobreposições que ficaram vazias.
   *
   * Uma poça que evapora e um fogo que apaga deixam a entrada para trás, e sem
   * varrer isso o número de células com sobreposição só cresce — o depósito
   * passaria a crescer com o que já aconteceu em vez de com o que está
   * acontecendo, que é o defeito que X-017 nomeia.
   */
  pruneOverlays(): number {
    let removidas = 0;
    for (const porGrid of Object.values(this.state.tileOverlays)) {
      for (const [chave, o] of Object.entries(porGrid)) {
        if (isEmptyOverlay(o)) {
          delete porGrid[chave];
          removidas++;
        }
      }
    }
    return removidas;
  }

  nextId(prefix: string): string {
    const n = (this.state.nextIds[prefix] ?? 0) + 1;
    this.state.nextIds[prefix] = n;
    return `${prefix}_${n}`;
  }

  /** Traz para o estado o que vive fora dele entre os saves. */
  commit(): void {
    this.state.tileLayers = [...this.layers.values()].map((l) => l.toJSON());
    this.state.rngCursors = this.rng.cursors();
    this.state.manifest = { ...this.state.manifest, savedAtSimTime: this.state.clock.simTime };
  }

  toJSON(): SimulationState {
    this.commit();
    // Cópia profunda: devolver a referência viva faria o objeto salvo continuar
    // mudando junto com a simulação, e um save escrito em disco depois de mais
    // alguns ticks não seria o momento que se pediu para salvar.
    return structuredClone(this.state);
  }

  serialize(): string {
    return JSON.stringify(this.toJSON());
  }

  static fromJSON(data: unknown): Simulation {
    const state = data as SimulationState;

    // Versão antes de qualquer outra coisa: um save de formato incompatível
    // falharia a validação de schema com uma lista de campos desconhecidos, o
    // que manda o usuário depurar campos quando o problema é a versão. X-015.
    if (typeof state?.saveVersion !== 'number') {
      throw new SaveLoadError('arquivo não parece um save: não declara saveVersion');
    }
    if (state.saveVersion !== SAVE_VERSION) {
      throw new SaveLoadError(
        `save de versão ${state.saveVersion}; esta engine lê versão ${SAVE_VERSION}. ` +
          `Nenhum estado foi carregado.`,
      );
    }

    const check = validateDomain('SimulationState', state);
    if (!check.valid) {
      // Recusar inteiro, e não carregar o que deu. X-015: nunca carrega
      // parcialmente. Estado meio carregado é pior que save recusado, porque
      // roda por um tempo antes de dar errado num lugar que não tem relação
      // com o campo que faltava.
      throw new SaveLoadError(`save inválido, nada foi carregado:\n${check.message ?? ''}`);
    }

    const rng = new SeedRoot(state.manifest.seed);
    rng.restoreCursors(state.rngCursors);
    return new Simulation(state, rng);
  }

  static deserialize(json: string): Simulation {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      throw new SaveLoadError(`save ilegível: ${(e as Error).message}`);
    }
    return Simulation.fromJSON(parsed);
  }
}

export class SaveLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveLoadError';
  }
}

function isEmptyOverlay(o: TileOverlay): boolean {
  for (const v of Object.values(o)) {
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && v !== null && Object.keys(v).length === 0) continue;
    return false;
  }
  return true;
}

export { TileLayers } from '../world/tile-layers.js';
