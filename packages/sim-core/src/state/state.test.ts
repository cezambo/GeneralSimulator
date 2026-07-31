import { describe, expect, it } from 'vitest';
import { Simulation, SaveLoadError, SAVE_VERSION } from './index.js';
import { TileLayers } from '../world/tile-layers.js';
import { SeedRoot } from '../rng/index.js';
import { validateDomain } from '../schema/index.js';
import type { TileType } from '../types/domain.js';

const base = () =>
  Simulation.create({
    seed: 'vila-do-teste',
    preset: 'teste-barato',
    mainGrid: { width: 16, height: 12, defaultType: 'floor', defaultMaterialId: 'terra_batida' },
  });

describe('camadas densas e codificação por repetição (W-058)', () => {
  it('um grid recém-criado cabe numa sequência mínima', () => {
    const l = TileLayers.create('g', 512, 512, { type: 'floor', materialId: 'terra_batida' });
    const j = l.toJSON();
    // Uma paleta de um elemento e uma sequência de um par para 262 mil células:
    // é o ponto inteiro de codificar por repetição em vez de guardar matriz.
    expect(j.typeRuns).toEqual([0, 512 * 512]);
    expect(j.typePalette).toEqual(['floor']);
    expect(JSON.stringify(j).length).toBeLessThan(400);
  });

  it('ida e volta devolve célula por célula o mesmo valor', () => {
    const l = TileLayers.create('g', 8, 6, { type: 'floor', materialId: 'terra_batida' });
    l.setTypeAt(3, 2, 'wall');
    l.setMaterialAt(3, 2, 'pedra');
    l.setBaseHeightAt(3, 2, 1.25);
    l.setTypeAt(7, 5, 'water');
    l.setBaseHeightAt(0, 0, -0.5);

    const volta = TileLayers.fromJSON(l.toJSON());
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 8; x++) {
        expect(volta.typeAt(x, y), `${x},${y}`).toBe(l.typeAt(x, y));
        expect(volta.materialAt(x, y), `${x},${y}`).toBe(l.materialAt(x, y));
        expect(volta.baseHeightAt(x, y), `${x},${y}`).toBe(l.baseHeightAt(x, y));
      }
    }
  });

  // Em Float32 isto falharia: 0,1 volta como 0,10000000149011612, e X-003 pede
  // igualdade campo a campo, não aproximação.
  it('a altura sobrevive à ida e volta sem arredondar', () => {
    const l = TileLayers.create('g', 4, 4, { type: 'floor', materialId: 'terra' });
    l.setBaseHeightAt(1, 1, 0.1);
    l.setBaseHeightAt(2, 2, 1 / 3);
    const volta = TileLayers.fromJSON(l.toJSON());
    expect(volta.baseHeightAt(1, 1)).toBe(0.1);
    expect(volta.baseHeightAt(2, 2)).toBe(1 / 3);
  });

  // Sem canonicidade, dois mundos de conteúdo idêntico salvariam diferente
  // conforme a história de edição de cada um.
  it('paleta é recompactada, então material substituído não deixa rastro', () => {
    const a = TileLayers.create('g', 4, 4, { type: 'floor', materialId: 'terra' });
    a.setMaterialAt(0, 0, 'pedra');
    a.setMaterialAt(0, 0, 'terra');
    const b = TileLayers.create('g', 4, 4, { type: 'floor', materialId: 'terra' });
    expect(a.toJSON()).toEqual(b.toJSON());
  });

  it('salvar duas vezes dá exatamente o mesmo resultado', () => {
    const l = TileLayers.create('g', 6, 6, { type: 'floor', materialId: 'terra' });
    l.setTypeAt(2, 2, 'wall');
    const uma = l.toJSON();
    expect(TileLayers.fromJSON(uma).toJSON()).toEqual(uma);
  });

  // Uma sequência truncada preencheria o resto com zero, que é um tipo válido:
  // meio mapa viraria chão em silêncio.
  it('sequência truncada é recusada em vez de virar meio mapa de chão', () => {
    const l = TileLayers.create('g', 10, 10, { type: 'floor', materialId: 'terra' });
    const j = l.toJSON();
    expect(() => TileLayers.fromJSON({ ...j, typeRuns: [0, 50] })).toThrow(/somam 50/);
  });

  it('sequência longa demais também é recusada', () => {
    const l = TileLayers.create('g', 10, 10, { type: 'floor', materialId: 'terra' });
    const j = l.toJSON();
    expect(() => TileLayers.fromJSON({ ...j, typeRuns: [0, 500] })).toThrow(/somam mais/);
  });

  it('célula fora do grid é erro, e a mensagem diz o tamanho', () => {
    const l = TileLayers.create('g', 4, 4, { type: 'floor', materialId: 'terra' });
    expect(() => l.typeAt(4, 0)).toThrow(/4×4/);
  });
});

describe('posição dos geradores (X-004, X-003)', () => {
  // Sem cursor, a partida retomada sorteia de novo o que já tinha sorteado: o
  // save preservaria o estado e perderia o futuro.
  it('retomar de um save continua a sequência, e não a reinicia', () => {
    const a = new SeedRoot('semente');
    const fluxo = a.stream('substrato');
    const antes = [fluxo.next(), fluxo.next(), fluxo.next()];
    const esperado = [fluxo.next(), fluxo.next()];

    const b = new SeedRoot('semente');
    const fluxoB = b.stream('substrato');
    for (let i = 0; i < 3; i++) fluxoB.next();
    const cursores = b.cursors();

    const c = new SeedRoot('semente');
    c.restoreCursors(cursores);
    expect([c.stream('substrato').next(), c.stream('substrato').next()]).toEqual(esperado);
    expect(antes).toHaveLength(3);
  });

  // A ordem de abertura depende de que subsistema agiu primeiro, e deixá-la
  // vazar faria dois saves de estado idêntico diferirem.
  it('os cursores saem ordenados por nome, não por ordem de abertura', () => {
    const r = new SeedRoot('s');
    r.stream('zebra').next();
    r.stream('alfa').next();
    expect(r.cursors().map((c) => c.stream)).toEqual(['alfa', 'zebra']);
  });

  it('o cursor conta os sorteios para diagnóstico', () => {
    const r = new SeedRoot('s');
    const f = r.stream('x');
    f.next();
    f.next();
    expect(r.cursors()[0]?.draws).toBe(2);
  });
});

describe('sobreposições esparsas (W-058, X-017)', () => {
  it('célula intacta não ocupa lugar nenhum', () => {
    const s = base();
    expect(s.overlayAt(s.mainGridId, 3, 3)).toBeUndefined();
    expect(Object.keys(s.state.tileOverlays[s.mainGridId] ?? {})).toHaveLength(0);
  });

  it('criar sob demanda registra só a célula tocada', () => {
    const s = base();
    s.overlayAt(s.mainGridId, 3, 3, true).temperature = 300;
    expect(Object.keys(s.state.tileOverlays[s.mainGridId]!)).toEqual(['3,3']);
  });

  // Poça que evapora e fogo que apaga deixam a entrada para trás; sem varrer,
  // o depósito cresceria com o que já aconteceu.
  it('sobreposição que esvaziou é varrida', () => {
    const s = base();
    s.overlayAt(s.mainGridId, 1, 1, true).states = [];
    s.overlayAt(s.mainGridId, 2, 2, true).temperature = 300;
    expect(s.pruneOverlays()).toBe(1);
    expect(Object.keys(s.state.tileOverlays[s.mainGridId]!)).toEqual(['2,2']);
  });
});

describe('identificadores (X-003)', () => {
  // Sem salvar o contador, a partida retomada recomeça a numerar do zero e
  // sobrescreve o que já existe, sem dar erro.
  it('o contador sobrevive ao save', () => {
    const s = base();
    expect(s.nextId('obj')).toBe('obj_1');
    expect(s.nextId('obj')).toBe('obj_2');
    const volta = Simulation.deserialize(s.serialize());
    expect(volta.nextId('obj')).toBe('obj_3');
  });
});

describe('salvar e carregar (X-003, X-015)', () => {
  const povoar = (s: Simulation) => {
    const g = s.mainGridId;
    s.layersOf(g).setTypeAt(2, 2, 'wall' as TileType);
    s.layersOf(g).setMaterialAt(2, 2, 'pedra');
    s.layersOf(g).setBaseHeightAt(5, 5, 0.75);
    s.overlayAt(g, 4, 4, true).liquid = { dominantMaterialId: 'agua', totalVolume: 3.5 };
    s.overlayAt(g, 4, 4, true).temperature = 288.15;
    s.state.clock.simTime = 1440;
    s.state.clock.day = 2;
    s.state.laws = [{ id: 'lei_1', text: 'Ninguém pega lenha alheia.', enactedAtSimTime: 900 }];
    s.state.causalLog = [
      {
        simTime: 1000,
        cause: { kind: 'matrix_rule', ref: 'fogo_em_madeira' },
        effect: 'ignite',
        targetKind: 'tile',
        targetId: `${g}:4,4`,
      },
    ];
    s.rng.stream('substrato').next();
    s.rng.stream('validador').next();
    return s;
  };

  it('o estado volta idêntico campo a campo', () => {
    const s = povoar(base());
    const salvo = s.toJSON();
    const volta = Simulation.deserialize(JSON.stringify(salvo));
    expect(volta.toJSON()).toEqual(salvo);
  });

  it('as camadas de tile voltam com o conteúdo certo, e não só com a forma certa', () => {
    const s = povoar(base());
    const volta = Simulation.deserialize(s.serialize());
    const g = s.mainGridId;
    expect(volta.layersOf(g).typeAt(2, 2)).toBe('wall');
    expect(volta.layersOf(g).materialAt(2, 2)).toBe('pedra');
    expect(volta.layersOf(g).baseHeightAt(5, 5)).toBe(0.75);
    expect(volta.layersOf(g).typeAt(0, 0)).toBe('floor');
  });

  it('a simulação retomada continua os mesmos fluxos de aleatoriedade', () => {
    const s = povoar(base());
    const texto = s.serialize();
    // Sorteia depois de salvar: a partida retomada tem de devolver exatamente
    // o que a original devolveria a seguir, e não recomeçar o fluxo.
    const seguinte = s.rng.stream('substrato').next();
    expect(Simulation.deserialize(texto).rng.stream('substrato').next()).toBe(seguinte);
  });

  it('o save produzido valida contra o schema de domínio', () => {
    const r = validateDomain('SimulationState', povoar(base()).toJSON());
    expect(r.message ?? '').toBe('');
    expect(r.valid).toBe(true);
  });

  // Devolver a referência viva faria o objeto salvo continuar mudando junto
  // com a simulação.
  it('o objeto salvo não muda depois quando a simulação anda', () => {
    const s = base();
    const salvo = s.toJSON();
    s.state.clock.simTime = 999;
    expect(salvo.clock.simTime).toBe(0);
  });

  it('salvar registra a hora simulada do momento', () => {
    const s = base();
    s.state.clock.simTime = 720;
    expect(s.toJSON().manifest.savedAtSimTime).toBe(720);
  });

  // X-015: um save de formato incompatível falharia a validação com uma lista
  // de campos desconhecidos, mandando o usuário depurar campos.
  it('versão incompatível é recusada pela versão, não por campo', () => {
    const s = base();
    const salvo = { ...s.toJSON(), saveVersion: SAVE_VERSION + 1 };
    expect(() => Simulation.fromJSON(salvo)).toThrow(/versão/);
  });

  it('arquivo que não é save é recusado com mensagem, não com erro de campo', () => {
    expect(() => Simulation.fromJSON({ qualquer: 'coisa' })).toThrow(/saveVersion/);
  });

  // Estado meio carregado roda por um tempo antes de dar errado num lugar sem
  // relação com o campo que faltava.
  it('save inválido não carrega pela metade', () => {
    const salvo = base().toJSON() as Record<string, unknown>;
    delete salvo['agents'];
    expect(() => Simulation.fromJSON(salvo)).toThrow(SaveLoadError);
    expect(() => Simulation.fromJSON(salvo)).toThrow(/agents/);
  });

  it('JSON quebrado dá mensagem de save ilegível', () => {
    expect(() => Simulation.deserialize('{')).toThrow(/ilegível/);
  });

  it('salvar, carregar e salvar de novo dá o mesmo texto', () => {
    const s = povoar(base());
    const um = s.serialize();
    expect(Simulation.deserialize(um).serialize()).toBe(um);
  });
});
