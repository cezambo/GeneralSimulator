import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { configPath } from '../config/paths.js';
import { SeedRoot } from '../rng/index.js';
import { MaterialCatalog } from '../substrate/target.js';
import type { Material } from '../types/domain.js';
import { Body, DEFAULT_BODY_TUNING } from './index.js';
import { agingFactor, computeCapacities, functioning, systemIntegrity } from './capacities.js';
import { ConditionCatalog } from './conditions.js';
import { DAMAGE_TYPES, InjuryMatrix, bleedRateFor, selectHitPart } from './injury.js';
import { BodyPlan, type BodyPlanConfig } from './plan.js';

// ── Dado real, para que o teste morra quando o arquivo mudar ──────────────
const bodyFile = JSON.parse(readFileSync(configPath('body'), 'utf8')) as BodyPlanConfig;
const conditionsFile = JSON.parse(readFileSync(configPath('conditions'), 'utf8')) as {
  conditions: Record<string, Record<string, unknown>>;
  injuryMatrix: Record<string, unknown>[];
};
const materialsFile = JSON.parse(readFileSync(configPath('materials'), 'utf8')) as {
  materials: Material[] | Record<string, Material>;
};
const MATERIALS = new MaterialCatalog(
  Array.isArray(materialsFile.materials)
    ? materialsFile.materials
    : Object.entries(materialsFile.materials)
        .filter(([id]) => !id.startsWith('_'))
        .map(([id, m]) => ({ id, ...m })),
);

const PLAN = new BodyPlan(bodyFile);
const CATALOG = new ConditionCatalog(conditionsFile);
const MATRIX = new InjuryMatrix(conditionsFile.injuryMatrix);

function corpo(onCausal?: (effect: string, targetId: string) => void): Body {
  return new Body({
    agentId: 'ag_1',
    plan: PLAN,
    catalog: CATALOG,
    materials: MATERIALS,
    matrix: MATRIX,
    ...(onCausal ? { onCausal: (e) => onCausal(e.effect, e.targetId) } : {}),
  });
}

function rng(stream = 'body') {
  return new SeedRoot(4242).stream(stream);
}

// ═════════════════════════════════════════════════════════════════════════
describe('BodyPlan — a árvore vem de dado (B-001, B-002, B-051, B-054)', () => {
  it('carrega o corpo do arquivo de exemplo sem código específico', () => {
    expect(PLAN.parts.length).toBe(28);
    expect(PLAN.part('brain').vital).toBe(true);
    expect(PLAN.part('handL').parent).toBe('armL');
  });

  it('o diagrama de B-001 é o que o arquivo declara: do crânio pende só o cérebro', () => {
    const filhosDoCranio = PLAN.part('skull').childIndices.map((i) => PLAN.parts[i]!.id);
    expect(filhosDoCranio).toEqual(['brain']);
    // Olho atrás do crânio seria inatingível por golpe comum, o oposto do que a
    // cobertura declarada para ele diz.
    expect(PLAN.part('eyeL').parent).toBe('head');
    expect(PLAN.part('eyeL').depth).toBe('outside');
  });

  it('não existem dedos: a manipulação é servida pela mão', () => {
    expect(PLAN.parts.some((p) => /finger|dedo/i.test(p.id))).toBe(false);
    expect(PLAN.serving('manipulation').map((s) => s.part.id).sort()).toEqual([
      'armL',
      'armR',
      'handL',
      'handR',
    ]);
  });

  it('a soma das coberturas externas é 1 exatamente', () => {
    const soma = PLAN.parts
      .filter((p) => p.depth === 'outside')
      .reduce((t, p) => t + p.coverage, 0);
    expect(soma).toBeCloseTo(1, 9);
  });

  it('recusa cobertura que não soma 1, porque o desvio não produz sintoma nenhum', () => {
    const quebrado = estruturaComCobertura({ head: 0.2 });
    expect(() => new BodyPlan(quebrado)).toThrow(/soma das coberturas/);
  });

  it('recusa parte interna com cobertura declarada', () => {
    // As externas continuam somando 1; o defeito é o crânio querer entrar no sorteio.
    expect(() => new BodyPlan(estruturaComCobertura({ skull: 0.01 }))).toThrow(
      /partes internas com cobertura/,
    );
  });

  it('recusa sensibilidade abaixo da resiliência, que faria o funcionamento crescer com o dano', () => {
    const quebrado = {
      ...bodyFile,
      partTypes: {
        ...bodyFile.partTypes,
        flesh: { ...bodyFile.partTypes['flesh'], sensitivity: 0.1, resilience: 0.5 },
      },
    };
    expect(() => new BodyPlan(quebrado)).toThrow(/abaixo da resiliência/);
  });

  it('a sobrescrita da parte vence a constante da classe (B-054)', () => {
    // O fígado acumula mais que o resto da sua classe porque é por ele que a carga passa.
    expect(PLAN.part('liver').toxicityPerDay).toBeGreaterThan(PLAN.part('kidneyL').constants.toxicityPerDay);
    expect(PLAN.part('liver').kind).toBe('organ');
  });

  it('classe sobrevive à transmutação: as constantes não vêm do material', () => {
    const body = corpo();
    const antes = PLAN.part('skull').constants;
    body.transmutePart('skull', 'ferro', 1);
    expect(PLAN.part('skull').kind).toBe('bone');
    expect(PLAN.part('skull').constants).toBe(antes);
  });

  it('recusa fonte de capacidade que não é parte nem capacidade', () => {
    const quebrado = {
      ...bodyFile,
      capacityRules: {
        ...bodyFile.capacityRules,
        consciousness: {
          ...bodyFile.capacityRules['consciousness'],
          sources: { brain: 1, inexistente: 0.5 },
        },
      },
    };
    expect(() => new BodyPlan(quebrado)).toThrow(/não é parte nem capacidade/);
  });

  it('recusa ciclo de capacidade, que produziria um número estável e errado', () => {
    const quebrado = {
      ...bodyFile,
      capacityRules: {
        ...bodyFile.capacityRules,
        consciousness: {
          ...bodyFile.capacityRules['consciousness'],
          sources: { brain: 1, moving: 0.2 },
        },
      },
    };
    expect(() => new BodyPlan(quebrado)).toThrow(/ciclo de capacidade/);
  });

  it('recusa sistema que cita capacidade inexistente', () => {
    const quebrado = {
      ...bodyFile,
      systems: { ...bodyFile.systems, fantasma: { nome: 'x', capacities: ['telepatia'] } },
    };
    expect(() => new BodyPlan(quebrado)).toThrow(/não existe/);
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('Funcionamento da parte — a porta única (B-055, B-058)', () => {
  it('acima da sensibilidade entrega 1; abaixo da resiliência, 0; entre as duas, interpola', () => {
    const def = PLAN.part('armL'); // flesh: sensitivity 0.60, resilience 0.00
    const em = (frac: number) =>
      functioning(def, { partId: def.id, health: def.maxHealth * frac });

    expect(em(1)).toBe(1);
    expect(em(0.6)).toBe(1);
    expect(em(0.3)).toBeCloseTo(0.5, 9);
    expect(em(0)).toBe(0);
  });

  it('resiliência baixa é parte que trabalha machucada; alta desiste cedo', () => {
    const musculo = PLAN.part('armL'); // resilience 0.00
    const olho = PLAN.part('eyeL'); // sense: sensitivity 0.90, resilience 0.35
    const frac = 0.3;
    expect(functioning(musculo, { partId: musculo.id, health: musculo.maxHealth * frac })).toBeGreaterThan(0);
    expect(functioning(olho, { partId: olho.id, health: olho.maxHealth * frac })).toBe(0);
  });

  it('sensibilidade igual à resiliência é degrau, e não divisão por zero', () => {
    const plano = new BodyPlan({
      ...bodyFile,
      partTypes: {
        ...bodyFile.partTypes,
        flesh: { ...bodyFile.partTypes['flesh'], sensitivity: 0.5, resilience: 0.5 },
      },
    });
    const def = plano.part('armL');
    expect(functioning(def, { partId: def.id, health: def.maxHealth * 0.5 })).toBe(1);
    expect(functioning(def, { partId: def.id, health: def.maxHealth * 0.49 })).toBe(0);
  });

  it('parte destruída ou faltando entrega zero', () => {
    const def = PLAN.part('handR');
    expect(functioning(def, { partId: def.id, health: def.maxHealth, destroyed: true })).toBe(0);
    expect(functioning(def, { partId: def.id, health: def.maxHealth, missing: true })).toBe(0);
  });

  it('a prótese pode passar de 100% (B-005)', () => {
    const def = PLAN.part('legL');
    const v = functioning(
      def,
      { partId: def.id, health: 0, prostheticId: 'perna_bionica' },
      { parts: [], conditions: [], prostheticEfficiency: () => 1.2 },
    );
    expect(v).toBeGreaterThan(1);
  });

  it('idade biológica reduz o funcionamento, e a forma vem da classe (B-058)', () => {
    const linear = { onsetAge: 30, shape: 'linear' as const, lossPerYear: 0.01 };
    const acelerada = { onsetAge: 30, shape: 'accelerating' as const, lossPerYear: 0.01 };

    expect(agingFactor(20, linear)).toBe(1);
    expect(agingFactor(40, linear)).toBeCloseTo(0.9, 9);
    // A curva acelerada iguala a linear na referência de vinte anos, e passa dela depois.
    expect(agingFactor(50, acelerada)).toBeCloseTo(agingFactor(50, linear), 9);
    expect(agingFactor(45, acelerada)).toBeGreaterThan(agingFactor(45, linear));
    expect(agingFactor(60, acelerada)).toBeLessThan(agingFactor(60, linear));
  });

  it('toxicidade reduz o funcionamento sem que a capacidade saiba que veneno existe', () => {
    const def = PLAN.part('liver');
    const sadio = functioning(def, { partId: def.id, health: def.maxHealth });
    const envenenado = functioning(def, { partId: def.id, health: def.maxHealth, toxicity: 0.5 });
    expect(sadio).toBe(1);
    expect(envenenado).toBeCloseTo(0.5, 9);
  });

  it('dois agentes de mesma idade cronológica divergem na filtragem por idade de fígado (B-058)', () => {
    const jovem = corpo();
    const bebedor = corpo();
    bebedor.setBiologicalAge('liver', 50, 1);

    expect(bebedor.capacity('bloodFiltration')).toBeLessThan(jovem.capacity('bloodFiltration'));
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('Capacidades — soma ponderada e nada atribuído (B-011, B-012, B-013)', () => {
  it('um corpo íntegro entrega 1 em todas as capacidades', () => {
    const body = corpo();
    for (const cap of PLAN.capacities) {
      expect(body.capacity(cap), cap).toBeCloseTo(1, 9);
    }
  });

  it('perder uma perna reduz o movimento em aproximadamente metade; as duas zeram', () => {
    const uma = corpo();
    uma.severPart('legL', 1);
    expect(uma.capacity('moving')).toBeCloseTo(0.5, 9);

    const duas = corpo();
    duas.severPart('legL', 1);
    duas.severPart('legR', 1);
    expect(duas.capacity('moving')).toBe(0);
  });

  it('dano pulmonar isolado reduz a manipulação, sem regra ligando pulmão a mão (B-013)', () => {
    const body = corpo();
    const antes = body.capacity('manipulation');
    body.severPart('lungL', 1);

    expect(body.capacity('breathing')).toBeLessThan(1);
    expect(body.capacity('manipulation')).toBeLessThan(antes);
    // O caminho é a consciência, e não uma regra escrita para o par.
    expect(body.capacity('consciousness')).toBeLessThan(1);
    const regra = PLAN.rules.get('manipulation')!;
    expect(regra.sources).toBeUndefined();
    expect(regra.multipliedByConsciousness).toBe(true);
  });

  it('a normalização pelos pesos é o que faz as duas promessas valerem juntas', () => {
    // A locomoção soma 1,4 de peso declarado. Sem normalizar, o corpo íntegro
    // teria de ser aparado em 1 e a perna perdida custaria 0,3 em vez de 0,5.
    const total = PLAN.serving('moving').reduce((t, s) => t + s.weight, 0);
    expect(total).toBeGreaterThan(1);
    expect(corpo().capacity('moving')).toBeCloseTo(1, 9);
  });

  it('offsets de condição são aditivos e o teto é absoluto (B-007, B-008)', () => {
    const body = corpo();
    // "espasmo" traz offsets; "desmaio" traz teto de consciência.
    body.applyCondition('shock', { partId: 'armR', severity: 0.4, simTime: 1 });
    expect(body.capacity('manipulation')).toBeLessThan(1);

    const grave = corpo();
    grave.applyCondition('shock', { partId: 'armR', severity: 0.8, simTime: 1 });
    expect(grave.capacity('consciousness')).toBeLessThanOrEqual(0.05);
    expect(grave.capacities.unconscious).toBe(true);
  });

  it('dor abaixo do piso não altera a consciência; acima, altera monotonicamente (B-016)', () => {
    const arranhao = corpo();
    arranhao.applyCondition('scar', { partId: 'armL', severity: 1, simTime: 1 });
    expect(arranhao.capacities.pain).toBeGreaterThan(0);
    expect(arranhao.capacity('consciousness')).toBeCloseTo(1, 9);

    const leituras: number[] = [];
    for (const severidade of [0.1, 0.5, 0.9]) {
      const body = corpo();
      body.applyCondition('puncture', { partId: 'torso', severity: severidade, simTime: 1 });
      leituras.push(body.capacity('consciousness'));
    }
    expect(leituras[0]!).toBeGreaterThanOrEqual(leituras[1]!);
    expect(leituras[1]!).toBeGreaterThanOrEqual(leituras[2]!);
  });

  it('o limiar de dor da personalidade modula o que se sente (B-016)', () => {
    const parts = [{ partId: 'torso', health: PLAN.part('torso').maxHealth }];
    const conditions = [{ defId: 'puncture', partId: 'torso', severity: 0.8 }];
    const duro = computeCapacities(PLAN, CATALOG, { parts, conditions, painFactor: 0.5 });
    const sensivel = computeCapacities(PLAN, CATALOG, { parts, conditions, painFactor: 2 });
    expect(sensivel.pain).toBeGreaterThan(duro.pain);
  });

  it('capacidade que nenhuma parte serve vale zero, em vez de virar 1 por vacuidade', () => {
    // Declarada na regra e servida por ninguém: é assim que se descobre que
    // faltou pendurá-la numa parte, em vez de ela passar por íntegra.
    const plano = new BodyPlan({
      ...bodyFile,
      capacityRules: { ...bodyFile.capacityRules, echolocation: {} },
    });
    expect(plano.serving('echolocation').length).toBe(0);
    const leitura = computeCapacities(plano, CATALOG, { parts: [], conditions: [] });
    expect(leitura.values['echolocation']).toBe(0);
  });

  it('a integridade de cada sistema é derivada das capacidades que o compõem (B-061)', () => {
    const body = corpo();
    expect(systemIntegrity(PLAN, body.capacities.values)['excretory']).toBeCloseTo(1, 9);

    body.severPart('kidneyL', 1);
    const sistemas = body.systems();
    expect(sistemas['excretory']!).toBeLessThan(1);
    // O locomotor também cede um pouco, e não por regra: a filtragem alimenta a
    // consciência, que multiplica movimento e manipulação (B-013). O que a
    // derivação garante é a proporção — o sistema atingido cede muito mais.
    expect(sistemas['locomotor']!).toBeLessThan(1);
    expect(sistemas['excretory']!).toBeLessThan(sistemas['locomotor']!);
    // A dor fica deliberadamente fora do agrupamento.
    expect(PLAN.systems.some((s) => s.capacities.includes('pain'))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('Recomputação por invalidação (B-015, B-046)', () => {
  it('um agente estável por mil ticks executa zero recálculos', () => {
    const body = corpo();
    body.capacities; // a primeira leitura calcula
    const base = body.recomputes;

    for (let t = 0; t < 1000; t += 1) {
      body.tick({ cadence: 'fast', hoursElapsed: 0.01, simTime: t, rng: rng() });
      body.capacity('consciousness');
    }
    expect(body.recomputes).toBe(base);
  });

  it('mudar o conjunto de partes ou de condições invalida exatamente uma vez', () => {
    const body = corpo();
    body.capacities;
    const base = body.recomputes;

    body.damagePart('armL', 5, 1);
    body.capacity('manipulation');
    body.capacity('moving');
    expect(body.recomputes).toBe(base + 1);

    body.applyCondition('scar', { partId: 'armL', severity: 1, simTime: 2 });
    body.capacity('manipulation');
    expect(body.recomputes).toBe(base + 2);
  });

  it('um agente com cicatrizes e uma perna faltando não entra no laço de saúde', () => {
    const body = corpo();
    body.severPart('legL', 1);
    for (const parte of ['armL', 'torso', 'head', 'armR', 'handR']) {
      body.applyCondition('scar', { partId: parte, severity: 1, simTime: 1 });
    }
    expect(body.conditions.length).toBeGreaterThan(4);
    expect(body.isActive()).toBe(false);
  });

  it('uma condição de cadência rápida põe o agente no laço', () => {
    const body = corpo();
    body.applyCondition('laceration', { partId: 'armL', severity: 0.3, simTime: 1 });
    expect(body.isActive()).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('Cascata estrutural e morte com causa (B-004, B-029)', () => {
  it('destruir um braço destrói a mão numa única operação, e o log registra a cascata', () => {
    const registros: string[] = [];
    const body = new Body({
      agentId: 'ag_1',
      plan: PLAN,
      catalog: CATALOG,
      materials: MATERIALS,
      matrix: MATRIX,
      onCausal: (e) => registros.push(`${e.effect}:${e.targetId}`),
    });

    body.severPart('armL', 10);
    expect(body.stateOf('handL').destroyed).toBe(true);
    expect(registros).toContain('part_destroyed:armL');
    expect(registros).toContain('part_destroyed:handL');
    expect(body.capacity('manipulation')).toBeCloseTo(0.5, 9);
  });

  it('destruir uma parte vital mata, e a causa fica registrada', () => {
    const body = corpo();
    body.damagePart('heart', 999, 7);
    expect(body.isAlive).toBe(false);
    expect(body.death).toMatchObject({ kind: 'vital_part_destroyed', partId: 'heart', simTime: 7 });
  });

  it('a morte por destruição de coração é indistinguível de qualquer outra no log (B-041)', () => {
    const registros: string[] = [];
    const body = new Body({
      agentId: 'ag_1',
      plan: PLAN,
      catalog: CATALOG,
      materials: MATERIALS,
      matrix: MATRIX,
      onCausal: (e) => registros.push(e.effect),
    });
    body.damagePart('heart', 999, 3);
    expect(registros).toContain('death');
  });

  it('zerar uma capacidade vital mata mesmo sem parte vital destruída', () => {
    const body = corpo();
    // Nariz e pescoço servem respiração junto dos pulmões; sem nenhum deles, ela zera.
    for (const parte of ['lungL', 'lungR', 'nose', 'neck']) body.severPart(parte, 5);
    expect(body.isAlive).toBe(false);
    expect(body.death?.kind).toBeDefined();
  });

  it('um corpo morto sai do laço de saúde', () => {
    const body = corpo();
    body.applyCondition('laceration', { partId: 'armL', severity: 0.5, simTime: 1 });
    expect(body.isActive()).toBe(true);
    body.damagePart('brain', 999, 2);
    expect(body.isActive()).toBe(false);
  });

  it('o teto de regeneração da classe impede a parte de voltar ao que era (B-057)', () => {
    const body = corpo();
    const pulmao = PLAN.part('lungR');
    body.damagePart('lungR', pulmao.maxHealth * 0.5, 1);
    body.healPart('lungR', 999, 2);
    expect(body.stateOf('lungR').health).toBeCloseTo(pulmao.maxHealth * pulmao.constants.regenCeiling, 9);
    expect(body.stateOf('lungR').health).toBeLessThan(pulmao.maxHealth);

    const musculo = corpo();
    musculo.damagePart('armR', 10, 1);
    musculo.healPart('armR', 999, 2);
    expect(musculo.stateOf('armR').health).toBe(PLAN.part('armR').maxHealth);
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('Matriz de lesão (B-020, B-052)', () => {
  it('todo tipo de dano alcança tecido meramente vivo, para que nenhuma agressão resolva em nada', () => {
    for (const dano of DAMAGE_TYPES) {
      const linha = MATRIX.rules.find(
        (r) => r.damage === dano && r.condition !== null && r.material === '#living',
      );
      expect(linha, dano).toBeDefined();
    }
  });

  it('recusa matriz que deixe um tipo de dano sem linha para tecido comum', () => {
    const semFrio = conditionsFile.injuryMatrix.filter((r) => r['damage'] !== 'cold');
    expect(() => new InjuryMatrix(semFrio)).toThrow(/sem linha que case com tecido comum/);
  });

  it('recusa linha sem o campo porque, que é onde a ordem fica registrada', () => {
    const semPorque = conditionsFile.injuryMatrix.map((r, i) =>
      i === 0 ? { ...r, porque: '' } : r,
    );
    expect(() => new InjuryMatrix(semPorque)).toThrow(/sem campo "porque"/);
  });

  it('recusa dano fora do vocabulário fechado de sete tipos', () => {
    expect(() => new InjuryMatrix([{ damage: 'psiquico', material: '#living', porque: 'x' }])).toThrow(
      /fora do vocabulário/,
    );
  });

  it('a primeira que casa vence: corte em osso frature em vez de lacerar', () => {
    const osso = MATRIX.match('cut', alvo('osso'), MATERIALS, false);
    expect(osso?.condition).toBe('fracture');
    const carne = MATRIX.match('cut', alvo('musculo'), MATERIALS, false);
    expect(carne?.condition).toBe('laceration');
  });

  it('nenhuma linha da matriz nomeia material por identificador (R-001, B-020)', () => {
    for (const regra of MATRIX.rules) {
      for (const { term } of regra.terms) {
        expect(term === '*' || term.startsWith('#'), regra.material).toBe(true);
      }
    }
  });

  it('#vital na coluna do material é propriedade da parte, e distingue órgão de bíceps', () => {
    const orgao = MATRIX.match('pierce', alvo('orgao'), MATERIALS, true);
    const braco = MATRIX.match('pierce', alvo('musculo'), MATERIALS, false);
    expect(orgao?.infectionChance).toBeGreaterThan(braco!.infectionChance);
    expect(orgao?.condition).toBe('puncture');
    expect(braco?.condition).toBe('puncture');
  });

  it('a transmutação muda o resultado sem que exista regra para o caso (B-039)', () => {
    // Osso é #fragile e #living: corte o frature. Virado vidro, perde `living`.
    const vivo = MATRIX.match('cut', alvo('osso'), MATERIALS, false);
    const vidro = MATRIX.match('cut', alvo('vidro'), MATERIALS, false);
    expect(vivo?.condition).toBe('fracture');
    expect(vidro?.condition).toBeNull();
    expect(vidro?.fallback).toBe('integrityDamage');
  });

  it('choque elétrico segue o caminho condutivo, e um fêmur de ferro passa a conduzir', () => {
    expect(MATRIX.match('electric', alvo('nervo'), MATERIALS, false)?.condition).toBe('shock');
    expect(MATRIX.match('electric', alvo('osso'), MATERIALS, false)?.condition).toBe('burn');
    expect(MATRIX.match('electric', alvo('ferro'), MATERIALS, false)?.condition).toBe('shock');
  });

  it('nenhuma linha específica é coberta por uma mais geral que venha antes', () => {
    // Toda linha com condição precisa ser alcançável por algum material do catálogo.
    const alcancadas = new Set<number>();
    for (const m of MATERIALS.all()) {
      for (const dano of DAMAGE_TYPES) {
        for (const vital of [false, true]) {
          const r = MATRIX.match(dano, alvo(m.id), MATERIALS, vital);
          if (r) alcancadas.add(r.index);
        }
      }
    }
    const mortas = MATRIX.rules.filter((r) => !alcancadas.has(r.index)).map((r) => r.material);
    expect(mortas).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('Seleção da parte atingida (B-021)', () => {
  it('a distribuição de mil golpes converge para a cobertura declarada', () => {
    const body = corpo();
    const gerador = rng('injury');
    const contagem = new Map<string, number>();
    for (let i = 0; i < 4000; i += 1) {
      const hit = selectHitPart(PLAN, body.parts, 'blunt', gerador);
      contagem.set(hit!.part.id, (contagem.get(hit!.part.id) ?? 0) + 1);
    }
    const torso = (contagem.get('torso') ?? 0) / 4000;
    const olho = (contagem.get('eyeL') ?? 0) / 4000;
    expect(torso).toBeGreaterThan(0.3);
    expect(torso).toBeLessThan(0.4);
    expect(olho).toBeLessThan(0.03);
    expect(torso).toBeGreaterThan(olho * 10);
  });

  it('golpe contundente em camada externa íntegra não alcança o que está dentro', () => {
    const body = corpo();
    const gerador = rng('penetration');
    for (let i = 0; i < 500; i += 1) {
      const hit = selectHitPart(PLAN, body.parts, 'blunt', gerador);
      expect(hit!.part.depth).toBe('outside');
    }
  });

  it('dano penetrante alcança o interior, e o caminho fica no resultado', () => {
    const body = corpo();
    const gerador = rng('pierce');
    let internos = 0;
    let comCaminho = 0;
    for (let i = 0; i < 500; i += 1) {
      const hit = selectHitPart(PLAN, body.parts, 'pierce', gerador);
      if (hit!.part.depth === 'inside') {
        internos += 1;
        if (hit!.path.length > 1) comCaminho += 1;
      }
    }
    expect(internos).toBeGreaterThan(0);
    expect(comCaminho).toBe(internos);
  });

  it('camada externa comprometida abre caminho mesmo para dano não penetrante', () => {
    const body = corpo();
    body.damagePart('torso', PLAN.part('torso').maxHealth * 0.9, 1);
    const gerador = rng('comprometida');
    let internos = 0;
    for (let i = 0; i < 500; i += 1) {
      const hit = selectHitPart(PLAN, body.parts, 'blunt', gerador);
      if (hit!.part.depth === 'inside') internos += 1;
    }
    expect(internos).toBeGreaterThan(0);
  });

  it('parte faltando não é sorteada', () => {
    const body = corpo();
    body.severPart('armL', 1);
    const gerador = rng('faltando');
    for (let i = 0; i < 500; i += 1) {
      const hit = selectHitPart(PLAN, body.parts, 'blunt', gerador);
      expect(['armL', 'handL']).not.toContain(hit!.part.id);
    }
  });

  it('alvo declarado enviesa o sorteio sem torná-lo determinístico', () => {
    const body = corpo();
    const gerador = rng('alvo');
    let acertos = 0;
    for (let i = 0; i < 400; i += 1) {
      const hit = selectHitPart(PLAN, body.parts, 'blunt', gerador, { declaredTarget: 'head' });
      if (hit!.part.id === 'head') acertos += 1;
    }
    expect(acertos).toBeGreaterThan(240);
    expect(acertos).toBeLessThan(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('Sangramento e vascularização (B-017, B-056)', () => {
  it('dois órgãos do mesmo material com vascularizações diferentes sangram diferente', () => {
    const figado = PLAN.part('liver');
    const cerebro = PLAN.part('brain');
    expect(figado.materialId).toBe(cerebro.materialId);
    expect(figado.vascularity).not.toBe(cerebro.vascularity);

    const taxaFigado = bleedRateFor(figado, 'orgao', MATERIALS, 1.1, 0.5, 'byMaterial');
    const taxaCerebro = bleedRateFor(cerebro, 'orgao', MATERIALS, 1.1, 0.5, 'byMaterial');
    expect(taxaFigado).toBeGreaterThan(taxaCerebro);
    // E a matriz de lesão não ganhou nenhuma linha para isso.
    expect(MATRIX.rules.some((r) => /liver|brain|figado|cerebro/.test(r.material))).toBe(false);
  });

  it('o material dá a base: osso quase não sangra, carne sangra', () => {
    const def = PLAN.part('armL');
    expect(bleedRateFor(def, 'osso', MATERIALS, 1, 1, 'byMaterial')).toBeLessThan(
      bleedRateFor(def, 'musculo', MATERIALS, 1, 1, 'byMaterial'),
    );
  });

  it('bleed "none" não sangra, por mais grave que seja', () => {
    expect(bleedRateFor(PLAN.part('torso'), 'musculo', MATERIALS, 5, 1, 'none')).toBe(0);
  });

  it('a perda de sangue sobe enquanto houver sangramento e mata cheia', () => {
    const body = corpo();
    const corte = body.applyCondition('laceration', { partId: 'torso', severity: 0.8, simTime: 0 });
    corte.bleedRate = 3;

    for (let t = 0; t < 400 && body.isAlive; t += 1) {
      body.tick({ cadence: 'fast', hoursElapsed: 0.5, simTime: t, rng: rng() });
    }
    expect(body.isAlive).toBe(false);
    expect(body.death?.kind).toBe('lethal_condition');
  });

  it('estancado o sangramento, a perda de sangue regride e a condição some', () => {
    const body = corpo();
    const corte = body.applyCondition('puncture', { partId: 'torso', severity: 0.5, simTime: 0 });
    corte.bleedRate = 1;
    for (let t = 0; t < 10; t += 1) {
      body.tick({ cadence: 'fast', hoursElapsed: 0.2, simTime: t, rng: rng() });
    }
    const perda = body.conditions.find((c) => c.defId === 'blood_loss');
    expect(perda!.severity).toBeGreaterThan(0);

    corte.bleedRate = 0;
    for (let t = 10; t < 300; t += 1) {
      body.tick({ cadence: 'fast', hoursElapsed: 0.5, simTime: t, rng: rng() });
    }
    expect(body.conditions.some((c) => c.defId === 'blood_loss')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('A agressão inteira: matriz, parte e condição (B-020, B-022)', () => {
  it('esfaquear produz perfuração na parte atingida, e o dano vai junto', () => {
    const body = corpo();
    const r = body.injure('pierce', 8, { rng: rng('faca'), simTime: 1, declaredTarget: 'torso' });
    expect(r?.condition?.defId).toBe('puncture');
    expect(body.stateOf(r!.partId).health).toBeLessThan(PLAN.part(r!.partId).maxHealth);
  });

  it('atravessar um tile em chamas produz queimadura, e não decremento genérico', () => {
    const body = corpo();
    const r = body.injure('burn', 4, { rng: rng('fogo'), simTime: 1, declaredTarget: 'legL' });
    expect(r?.condition?.defId).toBe('burn');
  });

  it('parte transmutada para material morto perde integridade sem adoecer (B-020, B-039)', () => {
    const body = corpo();
    body.transmutePart('armR', 'vidro', 1);
    const r = body.injure('cut', 6, { rng: rng('vidro'), simTime: 2, declaredTarget: 'armR' });
    expect(r?.partId).toBe('armR');
    expect(r?.condition).toBeUndefined();
    expect(body.stateOf('armR').health).toBeLessThan(PLAN.part('armR').maxHealth);
    expect(body.conditions.length).toBe(0);
  });

  it('a mesma semente produz exatamente o mesmo histórico médico (B-050)', () => {
    const historico = (): string => {
      const body = corpo();
      const gerador = new SeedRoot(9001).stream('injury');
      for (let i = 0; i < 20; i += 1) {
        body.injure('cut', 3, { rng: gerador, simTime: i });
      }
      return body.conditions
        .map((c) => `${c.defId}@${c.partId}:${c.severity.toFixed(4)}`)
        .sort()
        .join('|');
    };
    expect(historico()).toBe(historico());
  });

  it('sementes diferentes produzem históricos diferentes', () => {
    const historico = (seed: number): string => {
      const body = corpo();
      const gerador = new SeedRoot(seed).stream('injury');
      for (let i = 0; i < 20; i += 1) body.injure('cut', 3, { rng: gerador, simTime: i });
      return body.conditions.map((c) => `${c.defId}@${c.partId}`).sort().join('|');
    };
    expect(historico(1)).not.toBe(historico(2));
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('Progressão e cadência (B-008, B-009, B-010, B-047)', () => {
  it('um corte deixado em paz regride sozinho ao longo de dias', () => {
    const body = corpo();
    body.applyCondition('laceration', { partId: 'armL', severity: 0.5, simTime: 0 });
    for (let t = 0; t < 200; t += 1) {
      body.tick({ cadence: 'fast', hoursElapsed: 0.5, simTime: t, rng: rng('cura') });
    }
    const restante = body.conditions.filter((c) => c.defId === 'laceration');
    expect(restante.length).toBe(0);
  });

  it('condição estática nunca é avaliada, por mais ticks que passem', () => {
    const body = corpo();
    body.applyCondition('scar', { partId: 'armL', severity: 0.7, simTime: 0 });
    const antes = body.conditions[0]!.severity;
    for (let t = 0; t < 500; t += 1) {
      body.tick({ cadence: 'fast', hoursElapsed: 1, simTime: t, rng: rng() });
      body.tick({ cadence: 'slow', hoursElapsed: 1, simTime: t, rng: rng() });
    }
    expect(body.conditions[0]!.severity).toBe(antes);
  });

  it('a cadência declarada separa quem roda em qual laço', () => {
    const body = corpo();
    // fratura é lenta; corte é rápido.
    body.applyCondition('fracture', { partId: 'armL', severity: 0.5, simTime: 0 });
    const antes = body.conditions[0]!.severity;
    body.tick({ cadence: 'fast', hoursElapsed: 24, simTime: 1, rng: rng() });
    expect(body.conditions[0]!.severity).toBe(antes);
    body.tick({ cadence: 'slow', hoursElapsed: 24, simTime: 2, rng: rng() });
    expect(body.conditions[0]!.severity).toBeLessThan(antes);
  });

  it('o estágio muda exatamente nos limiares declarados, sem interpolação', () => {
    const body = corpo();
    const c = body.applyCondition('bruise', { partId: 'torso', severity: 0.44, simTime: 0 });
    expect(c.stage).toBe(0);
    body.moveSeverity(c, 0.01, 1);
    expect(c.stage).toBe(1);
    body.moveSeverity(c, 0.3, 2);
    expect(c.stage).toBe(2);
  });

  it('curar um ferimento grave pode deixar cicatriz permanente (B-023)', () => {
    let comCicatriz = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const body = corpo();
      const c = body.applyCondition('burn', { partId: 'armL', severity: 0.9, simTime: 0 });
      body.removeCondition(c, { simTime: 1, rng: new SeedRoot(seed).stream('cura') });
      if (body.conditions.some((x) => x.defId === 'scar')) comCicatriz += 1;
    }
    // A queimadura declara 70% de chance; o que o teste cobra é que a sequela exista.
    expect(comCicatriz).toBeGreaterThan(15);
    expect(comCicatriz).toBeLessThan(40);
  });

  it('condição de corpo inteiro é uma só, e reaplicar agrava em vez de duplicar', () => {
    const body = corpo();
    body.applyCondition('blood_loss', { severity: 0.2, simTime: 0 });
    body.applyCondition('blood_loss', { severity: 0.5, simTime: 1 });
    const todas = body.conditions.filter((c) => c.defId === 'blood_loss');
    expect(todas.length).toBe(1);
    expect(todas[0]!.severity).toBe(0.5);
  });

  it('condição governada por escalar externo lê o driver, não a progressão declarada', () => {
    const body = corpo();
    body.applyCondition('malnutrition', { severity: 0.1, simTime: 0 });
    body.tick({
      cadence: 'slow',
      hoursElapsed: 1,
      simTime: 1,
      rng: rng(),
      drivers: { 'needs.hunger': 0.8 },
    });
    expect(body.conditions.find((c) => c.defId === 'malnutrition')!.severity).toBe(0.8);
    expect(body.capacity('moving')).toBeLessThan(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('Infecção como corrida (B-024, B-025)', () => {
  const rodar = (opcoes: { tend?: number; resting?: boolean }): { morreu: boolean; dias: number } => {
    const body = corpo();
    const c = body.applyCondition('infection', { partId: 'armL', severity: 0.05, simTime: 0 });
    c.immunity = 0;
    if (opcoes.tend !== undefined) c.tendQuality = opcoes.tend;

    for (let hora = 0; hora < 24 * 20; hora += 1) {
      body.tick({
        cadence: 'slow',
        hoursElapsed: 1,
        simTime: hora,
        rng: rng('infeccao'),
        ...(opcoes.resting ? { resting: true } : {}),
      });
      if (!body.isAlive) return { morreu: true, dias: hora / 24 };
      if (!body.conditions.some((x) => x.defId === 'infection')) return { morreu: false, dias: hora / 24 };
    }
    return { morreu: false, dias: 20 };
  };

  it('sem tratamento a severidade vence e o paciente morre', () => {
    expect(rodar({}).morreu).toBe(true);
  });

  it('tratada e com repouso, cura', () => {
    const r = rodar({ tend: 1, resting: true });
    expect(r.morreu).toBe(false);
    expect(r.dias).toBeLessThan(20);
  });

  it('remédio sozinho e descanso sozinho são desfechos diferentes de remédio com descanso', () => {
    const soRemedio = rodar({ tend: 1 });
    const remedioEDescanso = rodar({ tend: 1, resting: true });
    expect(remedioEDescanso.dias).toBeLessThanOrEqual(soRemedio.dias);
  });

  it('tratamento desacelera a severidade, e não acelera a imunidade', () => {
    const semTend = corpo();
    const comTend = corpo();
    for (const [body, tend] of [
      [semTend, undefined],
      [comTend, 1],
    ] as const) {
      const c = body.applyCondition('infection', { partId: 'armL', severity: 0.1, simTime: 0 });
      c.immunity = 0;
      if (tend !== undefined) c.tendQuality = tend;
      body.tick({ cadence: 'slow', hoursElapsed: 12, simTime: 1, rng: rng() });
    }
    const a = semTend.conditions.find((c) => c.defId === 'infection')!;
    const b = comTend.conditions.find((c) => c.defId === 'infection')!;
    expect(b.severity).toBeLessThan(a.severity);
    expect(b.immunity).toBeCloseTo(a.immunity!, 9);
  });

  it('filtragem comprometida atrasa a imunidade (B-024)', () => {
    const sadio = corpo();
    const semRim = corpo();
    semRim.severPart('kidneyL', 0);
    semRim.severPart('kidneyR', 0);

    for (const body of [sadio, semRim]) {
      const c = body.applyCondition('infection', { partId: 'armL', severity: 0.1, simTime: 0 });
      c.immunity = 0;
      body.tick({ cadence: 'slow', hoursElapsed: 12, simTime: 1, rng: rng() });
    }
    const a = sadio.conditions.find((c) => c.defId === 'infection')!;
    const b = semRim.conditions.find((c) => c.defId === 'infection')!;
    expect(b.immunity!).toBeLessThan(a.immunity!);
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('Toxicidade e falência excretora (B-059, B-060, B-063)', () => {
  /** Cadência lenta, um dia por chamada. B-063: nunca por tick. */
  const dias = (body: Body, n: number, inicio = 0): void => {
    for (let d = 0; d < n && body.isAlive; d += 1) {
      body.tick({ cadence: 'slow', hoursElapsed: 24, simTime: inicio + d, rng: rng('tox') });
    }
  };

  const semRins = (): Body => {
    const body = corpo();
    // O fígado é vital: destruí-lo mata na hora e não haveria corrida nenhuma.
    // Perder os dois rins deixa a filtragem em 0,5, que é o caso do requisito.
    body.severPart('kidneyL', 0);
    body.severPart('kidneyR', 0);
    return body;
  };

  it('excreção íntegra mantém a toxicidade em zero, e o laço não visita o agente', () => {
    const body = corpo();
    dias(body, 3650);
    expect(body.parts.every((p) => (p.toxicity ?? 0) === 0)).toBe(true);
    expect(body.conditions.some((c) => c.defId === 'toxicosis')).toBe(false);
    expect(body.isActive()).toBe(false);
  });

  it('perder um rim é sobrevivível; perder os dois inverte a corrida', () => {
    const um = corpo();
    um.severPart('kidneyL', 0);
    expect(um.capacity('bloodFiltration')).toBeCloseTo(0.75, 2);
    dias(um, 3650);
    expect(um.parts.every((p) => (p.toxicity ?? 0) === 0)).toBe(true);

    const dois = semRins();
    expect(dois.capacity('bloodFiltration')).toBeCloseTo(0.5, 2);
    dias(dois, 30);
    expect(dois.parts.some((p) => (p.toxicity ?? 0) > 0)).toBe(true);
  });

  it('a toxicidade sobe em todas as partes ao mesmo tempo, e não só na que falhou', () => {
    const body = semRins();
    dias(body, 30);
    const carregadas = body.parts.filter((p) => (p.toxicity ?? 0) > 0);
    expect(carregadas.length).toBe(PLAN.parts.length);
    // Não morre o rim: adoece o corpo inteiro, e a face perceptível é uma
    // condição de corpo inteiro, como a perda de sangue.
    expect(body.conditions.some((c) => c.defId === 'toxicosis')).toBe(true);
    expect(body.conditions.find((c) => c.defId === 'toxicosis')!.partId).toBeUndefined();
  });

  it('o fígado vai primeiro, porque é por ele que a carga passa', () => {
    const body = semRins();
    dias(body, 60);
    expect(body.stateOf('liver').toxicity!).toBeGreaterThan(body.stateOf('skull').toxicity!);
  });

  it('a falência excretora mata, e a cadeia aponta para a parte, não para um escalar', () => {
    const registros: string[] = [];
    const body = corpo((effect, targetId) => registros.push(`${effect}:${targetId}`));
    body.severPart('kidneyL', 0);
    body.severPart('kidneyR', 0);
    dias(body, 4000, 1);

    expect(body.isAlive).toBe(false);
    // Não morre de "intoxicação em 1,0": morre porque uma capacidade vital
    // zerou, com a carga tóxica tendo comido o funcionamento de toda parte. É
    // o desfecho que B-060 pede, e é indistinguível de qualquer outra morte.
    expect(body.death?.kind).toBe('vital_capacity_zeroed');
    expect(body.death!.simTime).toBeGreaterThan(0);
    expect(PLAN.rules.get(body.death!.capacity!)!.vital).toBe(true);

    // A cadeia é reconstruível: a perda da filtragem vem antes da morte (B-029).
    expect(registros.indexOf('part_destroyed:kidneyR')).toBeLessThan(
      registros.findIndex((r) => r.startsWith('death:')),
    );
    expect(registros).toContain('condition_applied:ag_1');
  });

  it('recuperar a filtragem é a única coisa que reverte a corrida', () => {
    const body = semRins();
    dias(body, 200);
    const pico = body.parts.reduce((t, p) => t + (p.toxicity ?? 0), 0);
    expect(pico).toBeGreaterThan(0);

    // Pelo caminho legítimo: a parte, que é causa — nunca o derivado (B-036).
    for (const parte of ['kidneyL', 'kidneyR']) body.attachPart(parte, { simTime: 200 });
    dias(body, 400, 200);
    expect(body.parts.reduce((t, p) => t + (p.toxicity ?? 0), 0)).toBeLessThan(pico);
  });

  it('o limiar é o inverso do fator declarado, e é ele que produz as duas frases', () => {
    // Em 1,5 o limiar de filtragem fica em dois terços: 0,75 limpa e 0,5 não.
    expect(1 / DEFAULT_BODY_TUNING.toxicityClearanceFactor).toBeGreaterThan(0.5);
    expect(1 / DEFAULT_BODY_TUNING.toxicityClearanceFactor).toBeLessThan(0.75);
  });

  it('a toxicidade só aparece no laço quando alguma coisa já deu errado (B-063)', () => {
    expect(corpo().isActive()).toBe(false);

    const doente = corpo();
    doente.setToxicity('liver', 0.2, 1);
    expect(doente.isActive()).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('Fronteira com o Validador (B-036, B-037, B-038)', () => {
  it('transmutar uma parte troca tudo que a lesão consulta, sem regra nova', () => {
    const body = corpo();
    const antes = MATRIX.match('blunt', alvo(PLAN.part('legL').materialId), MATERIALS, false);
    body.transmutePart('legL', 'ferro', 1);
    const depois = MATRIX.match('blunt', alvo('ferro'), MATERIALS, false);
    expect(antes?.condition).toBe('bruise');
    // Ferro não é frágil nem vivo: contusão deixa de produzir condição.
    expect(depois?.condition).toBeNull();
    expect(body.stateOf('legL').materialId).toBe('ferro');
  });

  it('recusa transmutação para material fora do catálogo', () => {
    expect(() => corpo().transmutePart('legL', 'metavar', 1)).toThrow(/material desconhecido/);
  });

  it('o Validador mexe em causa e a engine deriva o resto: condição derruba consciência', () => {
    const body = corpo();
    expect(body.capacity('consciousness')).toBeCloseTo(1, 9);
    body.applyCondition('shock', { partId: 'armR', severity: 0.8, simTime: 1 });
    expect(body.capacity('consciousness')).toBeLessThan(0.3);
    expect(body.capacities.unconscious).toBe(true);
  });

  it('`stage` é mantido pela engine a partir da severidade, que é a causa', () => {
    const body = corpo();
    const c = body.applyCondition('puncture', { partId: 'torso', severity: 0.1, simTime: 1 });
    expect(c.stage).toBe(0);
    body.moveSeverity(c, 0.8, 2);
    expect(c.stage).toBe(2);
    expect(c.severity).toBeCloseTo(0.9, 9);
  });
});

// ── auxiliares ───────────────────────────────────────────────────────────
function alvo(materialId: string) {
  return { id: 't', kind: 'body_part' as const, materialId, states: [] };
}

function estruturaComCobertura(over: Record<string, number>): BodyPlanConfig {
  return {
    ...bodyFile,
    parts: Object.fromEntries(
      Object.entries(bodyFile.parts).map(([id, p]) => [
        id,
        over[id] !== undefined ? { ...p, coverage: over[id] } : p,
      ]),
    ),
  };
}
