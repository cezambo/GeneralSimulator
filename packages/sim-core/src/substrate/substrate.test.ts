import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { SeedRoot } from '../rng/index.js';
import { configPath } from '../config/paths.js';
import { Substrate, type SubstrateTuning, type WorldView } from './index.js';
import { MaterialCatalog, type ReactiveTarget } from './target.js';
import { ReactionMatrix, type ReactionRule } from './matrix.js';
import { EffectCatalog } from './effects.js';
import type { Material } from '../types/domain.js';

// ── Catálogo real, para que o teste morra quando o arquivo mudar ─────────
const reactionsFile = JSON.parse(readFileSync(configPath('reactions'), 'utf8')) as {
  effects: Record<string, { nome: string }>;
  reactions: ReactionRule[];
};
const materialsFile = JSON.parse(readFileSync(configPath('materials'), 'utf8')) as {
  materials: Material[] | Record<string, Material>;
};
const materialsList = Array.isArray(materialsFile.materials)
  ? materialsFile.materials
  : Object.entries(materialsFile.materials).map(([id, m]) => ({ id, ...m }));

const TUNING: SubstrateTuning = {
  stateDecayPerTick: 0.02,
  maxActiveTargets: 512,
  thermalEquilibriumTolerance: 0.5,
  maxCascadeStepsPerTick: 4,
  burnIntegrityLossPerTick: 4,
  // Fixtures antigos assumem chama estável; atmosfera V1 fica nos testes dedicados.
  burnOxygenConsumePerTick: 0,
  burnIntensityGrowthPerTick: 0,
  burnIntensityWeakenPerTick: 0,
  smokeFromOxygenConsume: 0,
};

function material(id: string, over: Partial<Material> = {}): Material {
  return {
    id,
    name: id,
    category: 'material',
    description: id,
    properties: {},
    numeric: { specificHeat: 2 },
    ...over,
  } as Material;
}

const FIXTURE_MATERIALS = new MaterialCatalog([
  material('madeira', {
    properties: { inflammable: true, organic: true },
    numeric: { specificHeat: 2, flammabilitySpeed: 0.5 },
    thermal: { ignitePoint: 300 },
  }),
  material('pedra', { properties: {}, numeric: { specificHeat: 8 } }),
  material('ferro', { properties: { conductive: true }, numeric: { specificHeat: 4 } }),
  material('gelo', {
    category: 'element',
    properties: {},
    numeric: { specificHeat: 1 },
    thermal: { meltPoint: 1 },
  }),
  material('agua', {
    category: 'element',
    properties: {},
    tags: ['liquid'],
    numeric: { specificHeat: 1 },
    thermal: { freezePoint: 0, boilPoint: 100 },
  }),
  material('carne', { properties: { organic: true }, tags: ['creature', 'living'], numeric: { specificHeat: 3 } }),
  material('acido', { category: 'element', properties: { corrosive: true }, numeric: { specificHeat: 1 } }),
]);

const FIXTURE_EFFECTS = new EffectCatalog(reactionsFile.effects as never);

function alvo(id: string, materialId: string, over: Partial<ReactiveTarget> = {}): ReactiveTarget {
  return { id, kind: 'tile', materialId, states: [], integrity: 100, gridId: 'main', ...over };
}

/** Mundo de teste: vizinhança e ocupação declaradas à mão. */
class FakeWorld implements WorldView {
  neighbors = new Map<string, ReactiveTarget[]>();
  occupants = new Map<string, ReactiveTarget[]>();
  ambient = 20;
  neighborsOf(t: ReactiveTarget) {
    return this.neighbors.get(t.id) ?? [];
  }
  occupantsOf(t: ReactiveTarget) {
    return this.occupants.get(t.id) ?? [];
  }
  ambientTemperature() {
    return this.ambient;
  }
}

function makeSubstrate(rules: ReactionRule[], seed = 'sub') {
  const matrix = new ReactionMatrix(rules, FIXTURE_MATERIALS);
  return new Substrate({
    materials: FIXTURE_MATERIALS,
    matrix,
    effects: FIXTURE_EFFECTS,
    rng: new SeedRoot(seed).stream('substrato'),
    tuning: TUNING,
  });
}

const REGRA_FOGO_VIZINHO: ReactionRule = {
  id: 'fire-spread',
  when: 'neighborhood',
  in: ['burning', '#inflammable'],
  effect: 'ignite',
  chance: 1,
  porque: 'Fogo salta para vizinhos inflamáveis.',
};

const REGRA_AGUA_APAGA: ReactionRule = {
  id: 'water-douses-fire',
  when: 'contact',
  in: ['burning', 'wet'],
  effect: 'extinguish',
  chance: 1,
  porque: 'Água apaga fogo.',
};

const REGRA_AGUA_APAGA_SOAK: ReactionRule = {
  id: 'water-douses-fire-soak',
  when: 'continuous',
  in: ['burning', 'wet'],
  effect: 'extinguish',
  chance: 1,
  porque: 'Tile encharcado em chamas apaga no mesmo lugar.',
};

describe('vocabulário fechado de efeitos (R-015)', () => {
  it('o catálogo real cobre o vocabulário inteiro', () => {
    expect(() => new EffectCatalog(reactionsFile.effects as never)).not.toThrow();
  });

  // Acrescentar um efeito e mudanca de engine, nao de configuracao: o Validador
  // invoca pelo identificador, e um identificador que a engine nao conhece nao
  // teria comportamento nenhum.
  it('efeito fora do vocabulário é recusado no carregamento', () => {
    const comExtra = { ...reactionsFile.effects, teleportar: { nome: 'teleportar' } };
    expect(() => new EffectCatalog(comExtra as never)).toThrow(/vocabulário fechado/);
  });

  it('vocabulário incompleto também é recusado', () => {
    const semIgnite = { ...reactionsFile.effects };
    delete (semIgnite as Record<string, unknown>)['ignite'];
    expect(() => new EffectCatalog(semIgnite as never)).toThrow(/ignite/);
  });

  it('cada efeito tem nome em português para o Validador', () => {
    expect(FIXTURE_EFFECTS.nameOf('ignite')).toBe('acender');
    expect(FIXTURE_EFFECTS.nameOf('transmute')).toBe('transmutar');
  });
});

describe('a regra dos três (R-003)', () => {
  // Sem ela o espaco de regras e quadratico no numero de materiais.
  it('regra com material dos dois lados é recusada, com os dois nomes', () => {
    const proibida: ReactionRule = {
      id: 'pedra-vs-madeira',
      when: 'contact',
      in: ['#inflammable', '#organic'],
      effect: 'ignite',
      chance: 1,
      porque: 'Inventado.',
    };
    expect(() => new ReactionMatrix([proibida], FIXTURE_MATERIALS)).toThrow(/R-003/);
  });

  it('elemento contra material passa', () => {
    expect(() => new ReactionMatrix([REGRA_FOGO_VIZINHO], FIXTURE_MATERIALS)).not.toThrow();
  });

  // Impacto e fisica por escalar, e entra por etiqueta de evento: pedra ainda
  // quebra vidro.
  it('etiqueta de evento não conta como material', () => {
    const impacto: ReactionRule = {
      id: 'impact-shatter',
      when: 'contact',
      in: ['#impact', '#fragile'],
      effect: 'shatter',
      chance: 1,
      porque: 'Frágil se estilhaça.',
    };
    expect(() => new ReactionMatrix([impacto], FIXTURE_MATERIALS)).not.toThrow();
  });

  it('regra sem porque é recusada', () => {
    const sem = { ...REGRA_FOGO_VIZINHO, porque: '' };
    expect(() => new ReactionMatrix([sem], FIXTURE_MATERIALS)).toThrow(/porque/);
  });

  it('a matriz real do projeto carrega inteira', () => {
    const catalogo = new MaterialCatalog(materialsList);
    expect(() => new ReactionMatrix(reactionsFile.reactions, catalogo)).not.toThrow();
  });
});

describe('casamento de termos (R-001)', () => {
  let s: Substrate;
  let w: FakeWorld;
  beforeEach(() => {
    s = makeSubstrate([REGRA_FOGO_VIZINHO]);
    w = new FakeWorld();
  });

  // Um objeto inventado em execucao participa de todos os sistemas no instante
  // em que recebe suas etiquetas, sem ninguem escrever uma linha de regra.
  it('material novo com a etiqueta certa pega fogo sem regra nova', () => {
    const materiais = new MaterialCatalog([
      ...FIXTURE_MATERIALS.all(),
      material('plastico_inventado', { properties: { inflammable: true }, numeric: { specificHeat: 1 } }),
    ]);
    const engine = new Substrate({
      materials: materiais,
      matrix: new ReactionMatrix([REGRA_FOGO_VIZINHO], materiais),
      effects: FIXTURE_EFFECTS,
      rng: new SeedRoot('x').stream('substrato'),
      tuning: TUNING,
    });
    const fonte = alvo('a', 'madeira', { states: [{ type: 'burning', intensity: 80 }] });
    const novo = alvo('b', 'plastico_inventado');
    w.neighbors.set('a', [novo]);
    engine.activate(fonte);
    engine.tick({ simTime: 0, world: w });
    expect(novo.states.some((st) => st.type === 'burning')).toBe(true);
  });

  // Lado nao e simetrico: madeira nao "acende" a chama.
  it('a ordem dos dois termos importa', () => {
    const madeira = alvo('m', 'madeira');
    const fogo = alvo('f', 'madeira', { states: [{ type: 'burning', intensity: 80 }] });
    w.neighbors.set('m', [fogo]);
    s.activate(madeira);
    s.tick({ simTime: 0, world: w });
    expect(madeira.states).toHaveLength(0);
  });

  it('pedra ao lado do fogo não acende', () => {
    const fogo = alvo('f', 'madeira', { states: [{ type: 'burning', intensity: 80 }] });
    const pedra = alvo('p', 'pedra');
    w.neighbors.set('f', [pedra]);
    s.activate(fogo);
    s.tick({ simTime: 0, world: w });
    expect(pedra.states).toHaveLength(0);
  });
});

describe('conjunto ativo (X-013, R-049)', () => {
  it('mapa sem nada ativo custa zero avaliações', () => {
    const s = makeSubstrate([REGRA_FOGO_VIZINHO]);
    expect(s.tick({ simTime: 0, world: new FakeWorld() }).evaluated).toBe(0);
  });

  // Sem isto, um tile que ja esfriou continuaria sendo visitado para sempre.
  it('alvo sem estado e em equilíbrio sai do conjunto', () => {
    const s = makeSubstrate([]);
    const t = alvo('t', 'pedra', { states: [{ type: 'wet', intensity: 1 }] });
    s.activate(t);
    s.tick({ simTime: 0, world: new FakeWorld() });
    expect(s.isActive('t')).toBe(false);
  });

  it('alvo com estado forte continua', () => {
    const s = makeSubstrate([]);
    const t = alvo('t', 'pedra', { states: [{ type: 'wet', intensity: 90 }] });
    s.activate(t);
    s.tick({ simTime: 0, world: new FakeWorld() });
    expect(s.isActive('t')).toBe(true);
  });

  it('quem recebe efeito entra no conjunto sozinho', () => {
    const s = makeSubstrate([REGRA_FOGO_VIZINHO]);
    const w = new FakeWorld();
    const fogo = alvo('f', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    const vizinho = alvo('v', 'madeira');
    w.neighbors.set('f', [vizinho]);
    s.activate(fogo);
    s.tick({ simTime: 0, world: w });
    expect(s.isActive('v')).toBe(true);
  });
});

describe('temperatura esparsa (R-008, R-009)', () => {
  it('num mapa sem fonte de calor o laço térmico visita zero entidades', () => {
    const s = makeSubstrate([]);
    expect(s.tick({ simTime: 0, world: new FakeWorld() }).evaluated).toBe(0);
  });

  it('temperatura indefinida significa ambiente, e não zero', () => {
    const s = makeSubstrate([]);
    const t = alvo('t', 'pedra');
    s.activate(t);
    s.tick({ simTime: 0, world: new FakeWorld() });
    expect(t.temperature).toBeUndefined();
  });

  it('quem reconverge volta a não guardar temperatura', () => {
    const s = makeSubstrate([]);
    const t = alvo('t', 'gelo', { temperature: 20.3 });
    s.activate(t);
    s.tick({ simTime: 0, world: new FakeWorld() });
    expect(t.temperature).toBeUndefined();
    expect(s.isActive('t')).toBe(false);
  });

  // Calor especifico alto significa mudar devagar: pedra demora, ar nao.
  it('calor específico diferente leva números de tick proporcionalmente diferentes', () => {
    const s = makeSubstrate([]);
    const w = new FakeWorld();
    const rapido = alvo('r', 'gelo', { temperature: 100 });
    const lento = alvo('l', 'pedra', { temperature: 100 });
    s.activate(rapido);
    s.activate(lento);
    s.tick({ simTime: 0, world: w });
    expect(Math.abs(100 - (rapido.temperature ?? 20))).toBeGreaterThan(
      Math.abs(100 - (lento.temperature ?? 20)),
    );
  });

  // Gelo aquecido vira agua sem que exista reacao ligando fogo a gelo.
  it('cruzar o limiar dispara a transição sem regra na matriz', () => {
    const s = makeSubstrate([]);
    const gelo = alvo('g', 'gelo', { temperature: 40, states: [{ type: 'frozen', intensity: 80 }] });
    s.activate(gelo);
    s.tick({ simTime: 0, world: new FakeWorld() });
    expect(gelo.states.some((st) => st.type === 'frozen')).toBe(false);
    expect(gelo.states.some((st) => st.type === 'wet')).toBe(true);
  });

  it('calor residual sozinho não acende — precisa de chama em contato', () => {
    const s = makeSubstrate([]);
    const m = alvo('m', 'madeira', { temperature: 400 });
    s.activate(m);
    s.tick({ simTime: 0, world: new FakeWorld() });
    expect(m.states.some((st) => st.type === 'burning')).toBe(false);
  });

  it('acima do ignitePoint com vizinho em chama auto-acende por limiar', () => {
    const s = makeSubstrate([]);
    const w = new FakeWorld();
    const fonte = alvo('f', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    const m = alvo('m', 'madeira', { temperature: 400 });
    w.neighbors.set('m', [fonte]);
    w.neighbors.set('f', [m]);
    s.activate(fonte);
    s.activate(m);
    s.tick({ simTime: 0, world: w });
    expect(m.states.some((st) => st.type === 'burning')).toBe(true);
  });

  it('madeira molhada não auto-acende só por temperatura', () => {
    const s = makeSubstrate([]);
    const m = alvo('m', 'madeira', {
      temperature: 400,
      states: [{ type: 'wet', intensity: 90 }],
    });
    s.activate(m);
    s.tick({ simTime: 0, world: new FakeWorld() });
    // Poça (I alto) ainda está molhada após um tick a 400 °C — bloqueia ignição.
    expect(m.states.some((st) => st.type === 'burning')).toBe(false);
    expect(m.states.some((st) => st.type === 'wet')).toBe(true);
    expect(m.states.find((st) => st.type === 'wet')!.intensity).toBeGreaterThan(70);
  });

  // Bug: após molhar/apagar, a poça seca com T ainda ≥ ignitePoint e o limiar
  // reacendia sozinho — combustão espontânea. Sem vizinho em chama, não.
  it('após apagar e secar quente, não reacende sem vizinho em chama', () => {
    const s = makeSubstrate([REGRA_AGUA_APAGA_SOAK]);
    const w = new FakeWorld();
    const t = alvo('t', 'madeira', {
      temperature: 400,
      states: [
        { type: 'burning', intensity: 90 },
        { type: 'wet', intensity: 90 },
      ],
    });
    s.activate(t);
    s.tick({ simTime: 0, world: w });
    expect(t.states.some((st) => st.type === 'burning')).toBe(false);
    expect(t.states.some((st) => st.type === 'wet')).toBe(true);

    // Mantém quente enquanto a poça seca — sem vizinho em chama, limiar não reacende.
    let secouEm = -1;
    for (let i = 1; i < 100; i++) {
      t.temperature = 400;
      s.activate(t);
      s.tick({ simTime: i, world: w });
      expect(t.states.some((st) => st.type === 'burning')).toBe(false);
      if (secouEm < 0 && !t.states.some((st) => st.type === 'wet')) secouEm = i;
    }
    expect(secouEm).toBeGreaterThan(0);
    expect(t.states.some((st) => st.type === 'burning')).toBe(false);
  });

  it('após secar quente, vizinho em chama pode reacender', () => {
    // Sem regra de matriz: só limiar + chama em contato (caminho do bug).
    const s = makeSubstrate([]);
    const w = new FakeWorld();
    const t = alvo('t', 'madeira', {
      temperature: 400,
      states: [{ type: 'wet', intensity: 18 }],
    });
    const vizinho = alvo('v', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    w.neighbors.set('t', [vizinho]);
    w.neighbors.set('v', [t]);
    s.activate(t);
    s.activate(vizinho);

    let secou = false;
    for (let i = 0; i < 40; i++) {
      t.temperature = 400;
      s.tick({ simTime: i, world: w });
      if (!t.states.some((st) => st.type === 'wet')) secou = true;
      // Enquanto molhado, limiar não acende mesmo com vizinho em chama.
      if (!secou) expect(t.states.some((st) => st.type === 'burning')).toBe(false);
      if (t.states.some((st) => st.type === 'burning')) break;
    }
    expect(secou).toBe(true);
    expect(t.states.some((st) => st.type === 'burning')).toBe(true);
  });

  // R-009 / R-018: ferver não é wipe instantâneo — ritmo ∝ 1/I². Poça (I≈90)
  // sobrevive muitos ticks a 400 °C; orvalho (I≈15) some cedo. Ambiente só
  // decai o base lento.
  it('poça a ~400 °C dura bem mais que orvalho; no ambiente a poça permanece', () => {
    const world = new FakeWorld();

    const sLight = makeSubstrate([]);
    const light = alvo('light', 'pedra', {
      temperature: 400,
      states: [{ type: 'wet', intensity: 15 }],
    });
    sLight.activate(light);
    let ticksLight = 0;
    for (let i = 0; i < 40; i++) {
      light.temperature = 400;
      sLight.tick({ simTime: i, world });
      ticksLight++;
      if (!light.states.some((st) => st.type === 'wet')) break;
    }
    expect(ticksLight).toBeLessThanOrEqual(2);

    const sHeavy = makeSubstrate([]);
    const heavy = alvo('heavy', 'pedra', {
      temperature: 400,
      states: [{ type: 'wet', intensity: 90 }],
    });
    sHeavy.activate(heavy);
    let ticksHeavy = 0;
    for (let i = 0; i < 80; i++) {
      heavy.temperature = 400;
      sHeavy.tick({ simTime: i, world });
      ticksHeavy++;
      if (!heavy.states.some((st) => st.type === 'wet')) break;
    }
    expect(ticksHeavy).toBeGreaterThan(ticksLight * 5);
    expect(ticksHeavy).toBeGreaterThan(15);

    const sCold = makeSubstrate([]);
    const cold = alvo('cold', 'pedra', {
      states: [{ type: 'wet', intensity: 90 }],
    });
    sCold.activate(cold);
    for (let i = 0; i < 3; i++) sCold.tick({ simTime: i, world: new FakeWorld() });
    expect(cold.states.find((st) => st.type === 'wet')!.intensity).toBeGreaterThan(80);

    for (let i = 3; i < 20; i++) sCold.tick({ simTime: i, world: new FakeWorld() });
    expect(cold.states.some((st) => st.type === 'wet')).toBe(true);
  });

  it('wet presente bloqueia re-ignição térmica mesmo após vários ticks quentes', () => {
    const s = makeSubstrate([]);
    const m = alvo('m', 'madeira', {
      temperature: 400,
      states: [{ type: 'wet', intensity: 90 }],
    });
    s.activate(m);
    for (let i = 0; i < 12; i++) {
      m.temperature = 400;
      s.tick({ simTime: i, world: new FakeWorld() });
      expect(m.states.some((st) => st.type === 'wet')).toBe(true);
      expect(m.states.some((st) => st.type === 'burning')).toBe(false);
    }
  });

  it('água ainda apaga fogo antes de evaporar no mesmo tick', () => {
    const s = makeSubstrate([REGRA_AGUA_APAGA_SOAK]);
    const t = alvo('t', 'madeira', {
      temperature: 400,
      states: [
        { type: 'burning', intensity: 90 },
        { type: 'wet', intensity: 90 },
      ],
    });
    s.activate(t);
    s.tick({ simTime: 0, world: new FakeWorld() });
    expect(t.states.some((st) => st.type === 'burning')).toBe(false);
    expect(t.states.some((st) => st.type === 'smoky')).toBe(true);
  });

  it('temperatura fixa é imune à convergência', () => {
    const materiais = new MaterialCatalog([
      ...FIXTURE_MATERIALS.all(),
      material('lava', { numeric: { specificHeat: 1 }, thermal: { fixedTemperature: 1200 } }),
    ]);
    const s = new Substrate({
      materials: materiais,
      matrix: new ReactionMatrix([], materiais),
      effects: FIXTURE_EFFECTS,
      rng: new SeedRoot('x').stream('substrato'),
      tuning: TUNING,
    });
    const lava = alvo('lava1', 'lava', { temperature: 1200 });
    s.activate(lava);
    s.tick({ simTime: 0, world: new FakeWorld() });
    expect(lava.temperature).toBe(1200);
  });

  it('uma fogueira aquece o vizinho', () => {
    const s = makeSubstrate([]);
    const w = new FakeWorld();
    const fogo = alvo('f', 'pedra', { states: [{ type: 'burning', intensity: 90 }] });
    const vizinho = alvo('v', 'pedra');
    w.neighbors.set('f', [vizinho]);
    s.activate(fogo);
    s.tick({ simTime: 0, world: w });
    expect(vizinho.temperature).toBeGreaterThan(20);
  });

  // R-008: alvo térmico = média(ambiente, contatos). Cluster quente retém calor;
  // tile isolado esfria só contra o ambiente — o sumidouro não pode dominar sozinho.
  it('cluster quente esfria mais devagar que tile isolado à mesma temperatura', () => {
    const s = makeSubstrate([]);
    const w = new FakeWorld();
    const isolado = alvo('iso', 'pedra', { temperature: 400 });
    const a = alvo('a', 'pedra', { temperature: 400 });
    const b = alvo('b', 'pedra', { temperature: 400 });
    const c = alvo('c', 'pedra', { temperature: 400 });
    const d = alvo('d', 'pedra', { temperature: 400 });
    const centro = alvo('centro', 'pedra', { temperature: 400 });
    w.neighbors.set('centro', [a, b, c, d]);
    w.neighbors.set('a', [centro]);
    w.neighbors.set('b', [centro]);
    w.neighbors.set('c', [centro]);
    w.neighbors.set('d', [centro]);
    for (const t of [isolado, a, b, c, d, centro]) s.activate(t);
    s.tick({ simTime: 0, world: w });
    const tIso = isolado.temperature ?? 20;
    const tCentro = centro.temperature ?? 20;
    expect(tCentro).toBeGreaterThan(tIso);
    // Isolado: alvo = 20 → Δ = (20-400)/8 = -47.5 → ~352.5
    expect(tIso).toBeCloseTo(352.5, 5);
    // Centro com 4 vizinhos a 400: alvo = (20+400*4)/5 = 324 → Δ = (324-400)/8 = -9.5 → 390.5
    expect(tCentro).toBeCloseTo(390.5, 5);
  });

  it('tile em chama sobe a centenas de °C (não estaciona ~90)', () => {
    const s = makeSubstrate([]);
    const w = new FakeWorld();
    const fogo = alvo('f', 'madeira', { states: [{ type: 'burning', intensity: 55 }] });
    w.neighbors.set('f', []);
    s.activate(fogo);
    for (let i = 0; i < 8; i += 1) s.tick({ simTime: i, world: w });
    // I=55 → ambient+200+55*7 = 605 °C
    expect(fogo.temperature).toBeGreaterThan(400);
    expect(fogo.temperature).toBeLessThanOrEqual(620);
  });

  it('móvel inflamável na célula vizinha acende por fire-spread', () => {
    const s = makeSubstrate([REGRA_FOGO_VIZINHO]);
    const w = new FakeWorld();
    const chao = alvo('chao', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    const cadeira = alvo('cadeira', 'madeira', { kind: 'object' });
    w.neighbors.set('chao', [alvo('viz', 'pedra')]);
    w.occupants.set('viz', [cadeira]);
    s.activate(chao);
    s.tick({ simTime: 0, world: w });
    expect(cadeira.states.some((st) => st.type === 'burning')).toBe(true);
  });
});

describe('propagação e cadência (R-016, R-017)', () => {
  // Deixar a propagacao encadear dentro do tick faria o fogo atravessar o mapa
  // inteiro num tick, e a cadencia espacial de R-016 deixaria de existir.
  it('o fogo anda um vizinho por tick, e não a fileira inteira', () => {
    const s = makeSubstrate([REGRA_FOGO_VIZINHO]);
    const w = new FakeWorld();
    const a = alvo('a', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    const b = alvo('b', 'madeira');
    const c = alvo('c', 'madeira');
    w.neighbors.set('a', [b]);
    w.neighbors.set('b', [c]);
    s.activate(a);
    s.tick({ simTime: 0, world: w });
    expect(b.states.some((st) => st.type === 'burning')).toBe(true);
    expect(c.states.some((st) => st.type === 'burning')).toBe(false);

    s.tick({ simTime: 1, world: w });
    expect(c.states.some((st) => st.type === 'burning')).toBe(true);
  });

  // Agua sobre piso condutivo com cabo energizado eletrifica a poca inteira e
  // fere quem estiver nela, sem que nenhuma regra descreva o cenario.
  it('cadeia emergente atravessa quem divide a célula, dentro do tick', () => {
    const cadeia: ReactionRule[] = [
      {
        id: 'electrified-puddle',
        when: 'contact',
        in: ['electrified', 'wet'],
        effect: 'electrify',
        chance: 1,
        porque: 'Poça energizada eletrifica por inteiro.',
      },
      {
        id: 'shock-creature',
        when: 'contact',
        in: ['electrified', '#creature'],
        effect: 'contaminate',
        chance: 1,
        porque: 'Choque atinge quem está na poça.',
      },
    ];
    const s = makeSubstrate(cadeia);
    const w = new FakeWorld();
    const cabo = alvo('cabo', 'ferro');
    const poca = alvo('poca', 'agua', { states: [{ type: 'wet', intensity: 80 }] });
    const pessoa = alvo('pessoa', 'carne', { kind: 'object' });
    w.occupants.set('cabo', [poca]);
    w.occupants.set('poca', [pessoa]);

    s.invoke('electrify', cabo, { simTime: 0, world: w });
    expect(poca.states.some((st) => st.type === 'electrified')).toBe(true);
    expect(pessoa.states.some((st) => st.type === 'contaminated')).toBe(true);
  });

  // O teto nao e otimizacao: uma regra mal escrita prenderia o tick num laco.
  it('cadeia circular para no teto em vez de travar', () => {
    const circular: ReactionRule[] = [
      { id: 'a-molha', when: 'contact', in: ['electrified', '*'], effect: 'wet', chance: 1, porque: 'x' },
      { id: 'b-eletrifica', when: 'contact', in: ['wet', '*'], effect: 'electrify', chance: 1, porque: 'y' },
    ];
    const s = makeSubstrate(circular);
    const w = new FakeWorld();
    const um = alvo('um', 'ferro', { states: [{ type: 'electrified', intensity: 50 }] });
    const dois = alvo('dois', 'ferro');
    w.occupants.set('um', [dois]);
    w.occupants.set('dois', [um]);
    expect(() => s.invoke('electrify', um, { simTime: 0, world: w })).not.toThrow();
  });
});

describe('fronteira com o Validador (R-043, R-044)', () => {
  // O aceite: engine_effect com ignite produz comportamento subsequente
  // identico ao de uma ignicao disparada pela matriz.
  it('o efeito invocado pelo Validador é indistinguível do da matriz', () => {
    const porMatriz = makeSubstrate([REGRA_FOGO_VIZINHO]);
    const w1 = new FakeWorld();
    const fonte = alvo('f', 'madeira', { states: [{ type: 'burning', intensity: 60 }] });
    const alvoMatriz = alvo('x', 'madeira');
    w1.neighbors.set('f', [alvoMatriz]);
    porMatriz.activate(fonte);
    porMatriz.tick({ simTime: 0, world: w1 });

    const porValidador = makeSubstrate([REGRA_FOGO_VIZINHO]);
    const alvoValidador = alvo('x', 'madeira');
    porValidador.invoke('ignite', alvoValidador, { simTime: 0, world: new FakeWorld() });

    // Compara comportamento, e não proveniência: o estado nascido da matriz
    // guarda de quem veio, e o nascido do Validador não tem de quem vir. O que
    // R-043 promete é que o que acontece a seguir é o mesmo.
    const comportamento = (t: ReactiveTarget) =>
      t.states.map((st) => ({ type: st.type, intensity: st.intensity }));
    expect(comportamento(alvoValidador)).toEqual(comportamento(alvoMatriz));
  });

  it('efeito fora do vocabulário é recusado com mensagem', () => {
    const s = makeSubstrate([]);
    expect(() => s.invoke('teleportar', alvo('t', 'pedra'), { simTime: 0, world: new FakeWorld() })).toThrow(
      /vocabulário fechado/,
    );
  });

  // Invocar sobre algo que a matriz ja resolveria aplica o efeito duas vezes, e
  // o sintoma nao e erro: e uma cortina que pega fogo com o dobro da
  // intensidade e ninguem sabe por que.
  it('o Validador consegue perguntar se a matriz já resolve', () => {
    const s = makeSubstrate([REGRA_FOGO_VIZINHO]);
    const tocha = alvo('t', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    const cortina = alvo('c', 'madeira');
    expect(s.alreadyModelled(tocha, cortina, 'ignite')?.id).toBe('fire-spread');
  });

  it('e a resposta é negativa quando não há caminho modelado', () => {
    const s = makeSubstrate([REGRA_FOGO_VIZINHO]);
    const gravetos = alvo('g', 'madeira');
    const maos = alvo('m', 'carne');
    expect(s.alreadyModelled(maos, gravetos, 'ignite')).toBeUndefined();
  });

  it('o atrito que nenhuma regra cobre é justamente o caso de invocar', () => {
    const s = makeSubstrate([REGRA_FOGO_VIZINHO]);
    const gravetos = alvo('g', 'madeira');
    s.invoke('ignite', gravetos, { simTime: 0, world: new FakeWorld() }, {
      intensity: 15,
      rationale: 'esfregou com força e velocidade',
    });
    expect(gravetos.states[0]).toMatchObject({ type: 'burning', intensity: 15 });
  });
});

describe('determinismo (R-047)', () => {
  const cena = (seed: string) => {
    const s = makeSubstrate([{ ...REGRA_FOGO_VIZINHO, chance: 0.5 }], seed);
    const w = new FakeWorld();
    const fogo = alvo('a', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    const vizinhos = ['b', 'c', 'd', 'e'].map((id) => alvo(id, 'madeira'));
    w.neighbors.set('a', vizinhos);
    s.activate(fogo);
    for (let i = 0; i < 3; i++) s.tick({ simTime: i, world: w });
    return s.causalLog;
  };

  it('mesma semente produz log idêntico', () => {
    expect(JSON.stringify(cena('igual'))).toBe(JSON.stringify(cena('igual')));
  });

  it('semente diferente produz cadeia diferente', () => {
    expect(JSON.stringify(cena('um'))).not.toBe(JSON.stringify(cena('dois')));
  });

  // A ordem de insercao do Map e deterministica mas depende da sequencia de
  // eventos que ativou cada alvo: a mesma cena alcancada por caminhos
  // diferentes consumiria o fluxo em ordem diferente.
  it('a ordem em que os alvos foram ativados não muda o resultado', () => {
    const montar = (ordem: string[]) => {
      const s = makeSubstrate([{ ...REGRA_FOGO_VIZINHO, chance: 0.5 }], 'fixa');
      const w = new FakeWorld();
      const mapa = new Map(
        ['a', 'b', 'c'].map((id) => [
          id,
          alvo(id, 'madeira', id === 'a' ? { states: [{ type: 'burning', intensity: 90 }] } : {}),
        ]),
      );
      w.neighbors.set('a', [mapa.get('b')!, mapa.get('c')!]);
      for (const id of ordem) s.activate(mapa.get(id)!);
      s.tick({ simTime: 0, world: w });
      return JSON.stringify(s.causalLog);
    };
    expect(montar(['c', 'b', 'a'])).toBe(montar(['a', 'b', 'c']));
  });
});

describe('log causal (R-048, X-005)', () => {
  it('todo efeito registra a regra que o causou', () => {
    const s = makeSubstrate([REGRA_FOGO_VIZINHO]);
    const w = new FakeWorld();
    const fogo = alvo('a', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    const b = alvo('b', 'madeira');
    w.neighbors.set('a', [b]);
    s.activate(fogo);
    s.tick({ simTime: 42, world: w });

    const entrada = s.causalLog.find((e) => e.targetId === 'b');
    expect(entrada).toMatchObject({
      simTime: 42,
      effect: 'ignite',
      targetKind: 'tile',
      cause: { kind: 'matrix_rule', ref: 'fire-spread', actorId: 'a' },
    });
  });

  it('a invocação do Validador se distingue da regra da matriz', () => {
    const s = makeSubstrate([]);
    s.invoke('ignite', alvo('g', 'madeira'), { simTime: 5, world: new FakeWorld() }, {
      rationale: 'atrito',
    });
    expect(s.causalLog[0]?.cause).toMatchObject({ kind: 'validator', ref: 'atrito' });
  });

  it('o limiar térmico aparece como causa própria', () => {
    // Sem regra de matriz: só o limiar R-009, com chama em contato exigida.
    const s = makeSubstrate([]);
    const w = new FakeWorld();
    const fonte = alvo('f', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    const m = alvo('m', 'madeira', { temperature: 400 });
    w.neighbors.set('m', [fonte]);
    w.neighbors.set('f', [m]);
    s.activate(fonte);
    s.activate(m);
    s.tick({ simTime: 3, world: w });
    const entrada = s.causalLog.find((e) => e.targetId === 'm' && e.effect === 'ignite');
    expect(entrada?.cause).toMatchObject({ kind: 'time', ref: 'ignitePoint' });
  });

  // Registrar efeito que nao mudou nada encheria a janela de retencao de X-017
  // com nao-eventos.
  it('efeito que não muda nada não vira linha de log', () => {
    const s = makeSubstrate([]);
    const jaQueima = alvo('j', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    s.invoke('ignite', jaQueima, { simTime: 0, world: new FakeWorld() }, { intensity: 10 });
    expect(s.causalLog).toHaveLength(0);
  });

  it('dado um tile queimado, dá para reconstruir a cadeia até a origem', () => {
    const s = makeSubstrate([REGRA_FOGO_VIZINHO]);
    const w = new FakeWorld();
    const a = alvo('a', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    const b = alvo('b', 'madeira');
    const c = alvo('c', 'madeira');
    w.neighbors.set('a', [b]);
    w.neighbors.set('b', [c]);
    s.activate(a);
    s.tick({ simTime: 0, world: w });
    s.tick({ simTime: 1, world: w });

    const deC = s.causalLog.find((e) => e.targetId === 'c');
    const deB = s.causalLog.find((e) => e.targetId === 'b');
    expect(deC?.cause.actorId).toBe('b');
    expect(deB?.cause.actorId).toBe('a');
  });
});

describe('estados e decaimento (R-004)', () => {
  it('o mesmo alvo aceita três estados e cada um decai no seu ritmo', () => {
    const s = makeSubstrate([]);
    const t = alvo('t', 'pedra', {
      states: [
        { type: 'wet', intensity: 80 },
        { type: 'frozen', intensity: 50 },
        { type: 'stained', intensity: 90, remainingTicks: 2 },
      ],
    });
    s.activate(t);
    s.tick({ simTime: 0, world: new FakeWorld() });
    expect(t.states).toHaveLength(3);
    expect(t.states.find((x) => x.type === 'wet')!.intensity).toBe(78);
    expect(t.states.find((x) => x.type === 'stained')!.remainingTicks).toBe(1);
  });

  it('estado com duração vencida some', () => {
    const s = makeSubstrate([]);
    const t = alvo('t', 'pedra', { states: [{ type: 'wet', intensity: 90, remainingTicks: 1 }] });
    s.activate(t);
    s.tick({ simTime: 0, world: new FakeWorld() });
    expect(t.states).toHaveLength(0);
  });

  // Duas chamas no mesmo tile sao uma chama mais forte, e nao duas entradas
  // decaindo em paralelo.
  it('efeito repetido reforça em vez de duplicar', () => {
    const s = makeSubstrate([]);
    const t = alvo('t', 'madeira');
    const w = new FakeWorld();
    s.invoke('ignite', t, { simTime: 0, world: w }, { intensity: 30 });
    s.invoke('ignite', t, { simTime: 0, world: w }, { intensity: 70 });
    expect(t.states).toHaveLength(1);
    expect(t.states[0]!.intensity).toBe(70);
  });

  it('água apaga fogo por contato e deixa fumaça', () => {
    const s = makeSubstrate([REGRA_AGUA_APAGA]);
    const w = new FakeWorld();
    const tocha = alvo('t', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    const molhado = alvo('p', 'agua', { states: [{ type: 'wet', intensity: 90 }] });
    s.contact(tocha, molhado, { simTime: 0, world: w });
    expect(molhado.states.some((x) => x.type === 'smoky')).toBe(true);
  });

  it('água no mesmo tile apaga fogo por contínua (soak)', () => {
    const s = makeSubstrate([REGRA_AGUA_APAGA_SOAK]);
    const w = new FakeWorld();
    const t = alvo('t', 'madeira', {
      states: [
        { type: 'burning', intensity: 90 },
        { type: 'wet', intensity: 90 },
      ],
    });
    s.activate(t);
    s.tick({ simTime: 0, world: w });
    expect(t.states.some((x) => x.type === 'burning')).toBe(false);
    expect(t.states.some((x) => x.type === 'smoky')).toBe(true);
  });
});

describe('modificadores (R-012)', () => {
  // Lido como multiplicador, -0,8 ainda acenderia madeira encharcada quase uma
  // vez em cinco.
  it('modificador negativo forte impede o efeito em vez de só reduzi-lo', () => {
    const regra: ReactionRule = {
      ...REGRA_FOGO_VIZINHO,
      chance: 0.9,
      modifiedBy: { wet: -0.9 },
    };
    const s = makeSubstrate([regra], 'mod');
    const w = new FakeWorld();
    const fogo = alvo('a', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    const encharcado = alvo('b', 'madeira', { states: [{ type: 'wet', intensity: 100 }] });
    w.neighbors.set('a', [encharcado]);
    s.activate(fogo);
    for (let i = 0; i < 20; i++) {
      // Reencharca a cada tick: sem isto o teste mediria a secagem, e não o
      // modificador — a madeira seca dois pontos por tick e volta a acender,
      // que é o comportamento certo e não o que está sob teste aqui.
      encharcado.states.find((x) => x.type === 'wet')!.intensity = 100;
      s.tick({ simTime: i, world: w });
    }
    expect(encharcado.states.some((x) => x.type === 'burning')).toBe(false);
  });

  // A secagem é o outro lado da mesma moeda, e vale ter por escrito.
  // Poça alta demora (fator não-linear); eventualmente seca e o fogo pega.
  it('mas a madeira encharcada acaba secando e aí acende', () => {
    const regra: ReactionRule = { ...REGRA_FOGO_VIZINHO, chance: 0.9, modifiedBy: { wet: -0.9 } };
    const s = makeSubstrate([regra], 'seca');
    const w = new FakeWorld();
    const fogo = alvo('a', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    const encharcado = alvo('b', 'madeira', { states: [{ type: 'wet', intensity: 100 }] });
    w.neighbors.set('a', [encharcado]);
    s.activate(fogo);
    let chegouAPegar = false;
    for (let i = 0; i < 80; i++) {
      s.tick({ simTime: i, world: w });
      if (encharcado.states.some((x) => x.type === 'burning')) chegouAPegar = true;
    }
    expect(chegouAPegar).toBe(true);
  });

  it('modificador que não se aplica é ignorado, e não vira zero', () => {
    const regra: ReactionRule = { ...REGRA_FOGO_VIZINHO, chance: 1, modifiedBy: { windToward: -1 } };
    const s = makeSubstrate([regra]);
    const w = new FakeWorld();
    const fogo = alvo('a', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    const b = alvo('b', 'madeira');
    w.neighbors.set('a', [b]);
    s.activate(fogo);
    s.tick({ simTime: 0, world: w });
    expect(b.states.some((x) => x.type === 'burning')).toBe(true);
  });

  it('smoky no receptor zera a chance efetiva de fire-spread (modifiedBy)', () => {
    const regra: ReactionRule = {
      ...REGRA_FOGO_VIZINHO,
      chance: 0.4,
      modifiedBy: { smoky: -0.45 },
    };
    const s = makeSubstrate([regra], 'smoky-spread');
    const w = new FakeWorld();
    const fogo = alvo('a', 'madeira', { states: [{ type: 'burning', intensity: 90 }] });
    const fumacento = alvo('b', 'madeira', { states: [{ type: 'smoky', intensity: 100 }] });
    w.neighbors.set('a', [fumacento]);
    s.activate(fogo);
    // Um tick: 0.4 + (−0.45)×1 = 0. Sem laço longo — calor residual
    // poderia cruzar ignitePoint e acender por limiar (R-009), fora do modificador.
    s.tick({ simTime: 0, world: w });
    expect(fumacento.states.some((x) => x.type === 'burning')).toBe(false);
  });
});

describe('oxigênio / fumaça × fogo (V1 mínimo)', () => {
  const ATM: SubstrateTuning = {
    ...TUNING,
    burnOxygenConsumePerTick: 8,
    oxygenWeakenThreshold: 50,
    oxygenExtinguishThreshold: 12,
    burnIntensityGrowthPerTick: 3,
    burnIntensityWeakenPerTick: 10,
    smokeFromOxygenConsume: 1,
    oxygenRecoveryPerTick: 2,
    oxygenAmbient: 100,
  };

  function makeAtm(rules: ReactionRule[] = [], seed = 'atm') {
    return new Substrate({
      materials: FIXTURE_MATERIALS,
      matrix: new ReactionMatrix(rules, FIXTURE_MATERIALS),
      effects: FIXTURE_EFFECTS,
      rng: new SeedRoot(seed).stream('substrato'),
      tuning: ATM,
    });
  }

  it('fogo consome oxigênio e emite smoky correlacionado', () => {
    const s = makeAtm();
    const w = new FakeWorld();
    const fogo = alvo('f', 'madeira', {
      states: [{ type: 'burning', intensity: 90 }],
      oxygen: 100,
    });
    s.activate(fogo);
    s.tick({ simTime: 0, world: w });
    expect(fogo.oxygen).toBeDefined();
    expect(fogo.oxygen!).toBeLessThan(100);
    expect(fogo.states.some((st) => st.type === 'smoky' && st.intensity > 0)).toBe(true);
  });

  it('oxigênio baixo apaga a chama', () => {
    const s = makeAtm();
    const w = new FakeWorld();
    const fogo = alvo('f', 'madeira', {
      states: [{ type: 'burning', intensity: 80 }],
      oxygen: 18,
    });
    s.activate(fogo);
    for (let i = 0; i < 6; i++) s.tick({ simTime: i, world: w });
    expect(fogo.states.some((st) => st.type === 'burning')).toBe(false);
    expect(fogo.states.some((st) => st.type === 'smoky')).toBe(true);
  });

  it('com O₂ pleno a intensidade da chama cresce; com O₂ baixo enfraquece', () => {
    const sHi = makeAtm([], 'o2-hi');
    const sLo = makeAtm([], 'o2-lo');
    const w = new FakeWorld();
    const rico = alvo('r', 'madeira', {
      states: [{ type: 'burning', intensity: 40 }],
      oxygen: 100,
    });
    const pobre = alvo('p', 'madeira', {
      states: [{ type: 'burning', intensity: 40 }],
      oxygen: 30,
    });
    sHi.activate(rico);
    sLo.activate(pobre);
    // Um tick: consumo ainda deixa rico acima do limiar de enfraquecimento.
    sHi.tick({ simTime: 0, world: w });
    sLo.tick({ simTime: 0, world: w });
    const iRico = rico.states.find((st) => st.type === 'burning')?.intensity ?? 0;
    const iPobre = pobre.states.find((st) => st.type === 'burning')?.intensity ?? 0;
    expect(iRico).toBeGreaterThan(40);
    expect(iPobre).toBeLessThan(40);
  });

  it('fonte sem oxigênio não alastra; fonte com O₂ pleno alastra', () => {
    const regra: ReactionRule = { ...REGRA_FOGO_VIZINHO, chance: 1 };
    const wRico = new FakeWorld();
    const wPobre = new FakeWorld();

    const fonteRica = alvo('fr', 'madeira', {
      states: [{ type: 'burning', intensity: 90 }],
      oxygen: 100,
    });
    const vizRico = alvo('vr', 'madeira');
    wRico.neighbors.set('fr', [vizRico]);

    const fontePobre = alvo('fp', 'madeira', {
      oxygen: 0,
      states: [
        { type: 'burning', intensity: 90 },
        { type: 'smoky', intensity: 80 },
      ],
    });
    const vizPobre = alvo('vp', 'madeira');
    wPobre.neighbors.set('fp', [vizPobre]);

    const sRico = makeAtm([regra], 'spread-o2');
    sRico.activate(fonteRica);
    sRico.tick({ simTime: 0, world: wRico });
    expect(vizRico.states.some((st) => st.type === 'burning')).toBe(true);

    const sPobre = makeAtm([regra], 'spread-o2');
    sPobre.activate(fontePobre);
    sPobre.tick({ simTime: 0, world: wPobre });
    expect(vizPobre.states.some((st) => st.type === 'burning')).toBe(false);
  });

  it('smoky denso sem campo oxygen deriva O₂ baixo o bastante para apagar', () => {
    const s = makeAtm();
    const w = new FakeWorld();
    // Correlação 0,35: smoky 100 → O₂ derivado 65 — não apaga sozinho.
    // Com oxygen materializado crítico, a passada de intensidade apaga.
    const fogo = alvo('f', 'madeira', {
      oxygen: 8,
      states: [
        { type: 'burning', intensity: 70 },
        { type: 'smoky', intensity: 95 },
      ],
    });
    s.activate(fogo);
    for (let i = 0; i < 4; i++) s.tick({ simTime: i, world: w });
    expect(fogo.states.some((st) => st.type === 'burning')).toBe(false);
  });
});
