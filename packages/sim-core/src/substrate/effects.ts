import type { ReactiveTarget } from './target.js';

/**
 * O vocabulário fechado de efeitos. R-015, R-043, R-050.
 *
 * Fechado é o ponto: a matriz e o Validador invocam pelo **mesmo**
 * identificador e obtêm exatamente o mesmo comportamento. Se o Validador
 * pudesse descrever um efeito em prosa livre, a engine teria de interpretar
 * prosa a cada invocação, e "acender" viria diferente cada vez.
 *
 * O código implementa o mecanismo — pôr estado, tirar estado, mexer integridade,
 * trocar material — e o dado descreve o mundo (R-050). O que cada identificador
 * faz vive em `config/reactions.json`, não aqui.
 */

export const EFFECT_VOCABULARY = [
  'ignite',
  'extinguish',
  'wet',
  'dry',
  'freeze',
  'melt',
  'electrify',
  'shatter',
  'stain',
  'contaminate',
  'illuminate',
  'emit_gas',
  'smother',
  'corrode',
  'rot',
  'transmute',
] as const;

export type EffectId = (typeof EFFECT_VOCABULARY)[number];

const VOCABULARY = new Set<string>(EFFECT_VOCABULARY);

export function isEffectId(id: string): id is EffectId {
  return VOCABULARY.has(id);
}

export interface EffectDefinition {
  /** Nome em português, para exibição e para o Validador. R-015. */
  readonly nome: string;
  readonly aplica?: {
    readonly state?: string;
    readonly intensity?: number;
    readonly covering?: boolean;
    readonly gas?: boolean;
    readonly emitsLight?: boolean;
  };
  readonly remove?: readonly string[];
  readonly integrityDelta?: number;
  readonly setMaterial?: string;
}

export interface EffectApplication {
  readonly effect: EffectId;
  readonly target: ReactiveTarget;
  /** Intensidade de quem invocou, quando quer sobrepor o padrão do efeito. */
  readonly intensity?: number;
  /** Material de destino, obrigatório em `transmute`. */
  readonly materialId?: string;
  readonly sourceId?: string;
  readonly durationTicks?: number;
}

export interface EffectOutcome {
  readonly changed: boolean;
  readonly statesAdded: readonly string[];
  readonly statesRemoved: readonly string[];
  readonly integrityDelta: number;
  readonly materialChanged?: { readonly from: string; readonly to: string };
}

export class EffectCatalog {
  readonly #byId = new Map<EffectId, EffectDefinition>();

  constructor(definitions: Readonly<Record<string, EffectDefinition>>) {
    for (const [id, def] of Object.entries(definitions)) {
      if (!isEffectId(id)) {
        throw new Error(
          `efeito "${id}" está fora do vocabulário fechado de R-015. ` +
            `Acrescentar um efeito é mudança de engine, não de configuração.`,
        );
      }
      this.#byId.set(id, def);
    }
    const faltando = EFFECT_VOCABULARY.filter((e) => !this.#byId.has(e));
    if (faltando.length > 0) {
      // Faltar é tão grave quanto sobrar: uma regra da matriz pode citar
      // qualquer identificador do vocabulário, e descobrir a ausência no tick
      // em que a regra dispara é descobrir no meio de um incêndio.
      throw new Error(`efeitos do vocabulário sem definição em config: ${faltando.join(', ')}`);
    }
  }

  get(id: EffectId): EffectDefinition {
    return this.#byId.get(id)!;
  }

  /** Nome em português, para o resumo entregue ao Validador. R-015, R-042. */
  nameOf(id: EffectId): string {
    return this.get(id).nome;
  }

  /**
   * Aplica, e devolve o que de fato mudou.
   *
   * Devolver `changed: false` quando nada mudou não é detalhe: é o que impede
   * uma regra de chance 1,0 sobre um alvo que já está no estado final de
   * reentrar na fila de cascata para sempre. Fogo sobre o que já queima não é
   * um evento novo.
   */
  apply(app: EffectApplication): EffectOutcome {
    const def = this.get(app.effect);
    const t = app.target;

    const removidos: string[] = [];
    for (const tipo of def.remove ?? []) {
      const antes = t.states.length;
      t.states = t.states.filter((s) => s.type !== tipo);
      if (t.states.length !== antes) removidos.push(tipo);
    }

    const adicionados: string[] = [];
    const novoEstado = def.aplica?.state;
    if (novoEstado) {
      const intensidade = app.intensity ?? def.aplica?.intensity ?? 50;
      const existente = t.states.find((s) => s.type === novoEstado);
      if (existente) {
        // Reforça em vez de duplicar. Duas chamas no mesmo tile são uma chama
        // mais forte, e não duas entradas que decaem em paralelo.
        if (intensidade > existente.intensity) {
          existente.intensity = Math.min(100, intensidade);
          adicionados.push(novoEstado);
        }
      } else {
        t.states.push({
          type: novoEstado,
          intensity: Math.min(100, intensidade),
          ...(app.durationTicks !== undefined ? { remainingTicks: app.durationTicks } : {}),
          ...(app.sourceId ? { sourceId: app.sourceId } : {}),
        });
        adicionados.push(novoEstado);
      }
    }

    let deltaIntegridade = 0;
    if (def.integrityDelta !== undefined && t.integrity !== undefined) {
      const antes = t.integrity;
      t.integrity = Math.max(0, Math.min(100, antes + def.integrityDelta));
      deltaIntegridade = t.integrity - antes;
    }

    let materialTrocado: EffectOutcome['materialChanged'];
    if (def.setMaterial !== undefined) {
      const destino = def.setMaterial === '$param' ? app.materialId : def.setMaterial;
      if (!destino) {
        throw new Error(`efeito "${app.effect}" exige materialId, e nenhum foi passado`);
      }
      if (destino !== t.materialId) {
        materialTrocado = { from: t.materialId, to: destino };
        t.materialId = destino;
      }
    }

    if (def.aplica?.emitsLight) t.emitsLight = true;

    return {
      changed:
        adicionados.length > 0 ||
        removidos.length > 0 ||
        deltaIntegridade !== 0 ||
        materialTrocado !== undefined,
      statesAdded: adicionados,
      statesRemoved: removidos,
      integrityDelta: deltaIntegridade,
      ...(materialTrocado ? { materialChanged: materialTrocado } : {}),
    };
  }
}
