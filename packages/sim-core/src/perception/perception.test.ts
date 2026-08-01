import { describe, expect, it } from 'vitest';
import {
  assemblePerceptionReport,
  assertNoLeaks,
  describeTileLook,
  estimateTokens,
  PerceptionLeak,
  PerceptionPipeline,
  type ReportBudget,
} from './index.js';
import {
  assembleThoughtContext,
  ContextBudgetTooSmall,
  type ContextSection,
} from '../cognition/context.js';
import type { PerceptibleFact } from '../types/domain.js';

const LARGO: ReportBudget = { maxTokens: 350, maxFacts: 18 };

function fato(
  text: string,
  salienceTier: number,
  extra: Partial<PerceptibleFact> = {},
): PerceptibleFact {
  return { text, salienceTier, sense: 'sight', ...extra };
}

const CENA: PerceptibleFact[] = [
  fato('Uma cadeira de palha está encostada na parede', 6),
  fato('Maria está de pé perto da janela, pálida, e tosse', 2, { subjectKind: 'agent', sourceId: 'ag_7' }),
  fato('O cômodo está quente', 5),
  fato('A lareira está acesa e o fogo alcança a palha do chão', 1, { isChange: true }),
  fato('Há pão sobre a mesa', 4),
  fato('A porta acabou de se abrir', 3, { isChange: true }),
  fato('Um banco de madeira ocupa o canto', 6),
];

describe('ordem de saliência (A-032)', () => {
  it('perigo vem primeiro e fundo vem por último', () => {
    const r = assemblePerceptionReport(CENA, LARGO);
    expect(r.included.map((f) => f.salienceTier)).toEqual([1, 2, 3, 4, 5, 6, 6]);
  });

  // O corte por proximidade é o palpite natural e o pior possível: o fogo do
  // outro lado do cômodo perde para a cadeira ao lado.
  it('quando não cabe tudo, perigo e pessoas ficam e o mobiliário some', () => {
    const r = assemblePerceptionReport(CENA, { maxTokens: 350, maxFacts: 3 });
    expect(r.included.map((f) => f.salienceTier)).toEqual([1, 2, 3]);
    expect(r.dropped.every((f) => f.salienceTier >= 4)).toBe(true);
  });

  // A ordem de colheita depende de qual estrutura o código varreu primeiro, e é
  // exatamente ela que A-032 proíbe de influenciar o resultado.
  it('embaralhar a ordem de colheita não muda o relato', () => {
    const direto = assemblePerceptionReport(CENA, LARGO);
    const invertido = assemblePerceptionReport([...CENA].reverse(), LARGO);
    expect(invertido.text).toBe(direto.text);
  });

  it('o mesmo vale para o corte, e não só para a ordem', () => {
    const apertado = { maxTokens: 350, maxFacts: 4 };
    const a = assemblePerceptionReport(CENA, apertado);
    const b = assemblePerceptionReport([...CENA].reverse(), apertado);
    expect(b.included.map((f) => f.text)).toEqual(a.included.map((f) => f.text));
  });

  it('dentro da camada, novidade passa na frente', () => {
    const dois = [
      fato('O banco continua no canto', 6),
      fato('Alguém arrastou o banco para o meio', 6, { isChange: true }),
    ];
    const r = assemblePerceptionReport(dois, { maxTokens: 350, maxFacts: 1 });
    expect(r.included[0]?.isChange).toBe(true);
  });

  it('a mesma cena montada duas vezes produz texto idêntico', () => {
    expect(assemblePerceptionReport(CENA, LARGO).text).toBe(
      assemblePerceptionReport(CENA, LARGO).text,
    );
  });
});

describe('orçamento (A-032, X-008)', () => {
  it('o relato nunca passa do orçamento declarado', () => {
    const r = assemblePerceptionReport(CENA, { maxTokens: 30, maxFacts: 18 });
    expect(r.estimatedTokens).toBeLessThanOrEqual(30);
    expect(r.dropped.length).toBeGreaterThan(0);
  });

  // Parar no primeiro que estourou desperdiçaria o resto do orçamento: um fato
  // longo de camada 5 pode não caber enquanto um curto de camada 6 ainda cabe.
  it('um fato que não cabe não interrompe o aproveitamento do resto', () => {
    const fatos = [
      fato('Perigo curto', 1),
      fato('X'.repeat(400), 5),
      fato('Um banco', 6),
    ];
    const r = assemblePerceptionReport(fatos, { maxTokens: 40, maxFacts: 18 });
    expect(r.included.map((f) => f.text)).toEqual(['Perigo curto', 'Um banco']);
  });

  it('teto de fatos e teto de tokens valem os dois', () => {
    const r = assemblePerceptionReport(CENA, { maxTokens: 350, maxFacts: 2 });
    expect(r.included).toHaveLength(2);
  });

  // Subestimar faz quem corta ser o provedor, no meio da frase e sem critério
  // de saliência nenhum.
  it('a estimativa de tokens erra para cima, não para baixo', () => {
    const texto = 'A lareira está acesa e o cômodo está quente.';
    expect(estimateTokens(texto)).toBeGreaterThan(texto.split(/\s+/).length);
  });

  it('relato vazio custa zero', () => {
    const r = assemblePerceptionReport([], LARGO);
    expect(r.text).toBe('');
    expect(r.estimatedTokens).toBe(0);
  });
});

describe('prosa (A-031)', () => {
  it('sai como texto corrido, e não como despejo de estado', () => {
    const r = assemblePerceptionReport(CENA, LARGO);
    expect(r.text).toContain('A lareira está acesa');
    expect(r.text).not.toContain('tile(');
    expect(r.text).not.toContain('=');
  });

  it('cada frase termina pontuada mesmo quando o fato não vem pontuado', () => {
    const r = assemblePerceptionReport([fato('Há pão sobre a mesa', 4)], LARGO);
    expect(r.text).toBe('Há pão sobre a mesa.');
  });

  it('não duplica pontuação de fato já pontuado', () => {
    const r = assemblePerceptionReport([fato('Alguém gritou!', 1)], LARGO);
    expect(r.text).toBe('Alguém gritou!');
  });
});

describe('o que a percepção nunca carrega (A-033)', () => {
  // Um vazamento não quebra nada de visível: apaga a mentira, a dedução e a
  // formação de opinião, e só se manifesta como "a simulação ficou sem graça".
  it('identificador interno no texto é erro', () => {
    const f = [fato('ag_7 está perto da janela', 2, { sourceId: 'ag_7' })];
    expect(() => assertNoLeaks(assemblePerceptionReport(f, LARGO).text, f)).toThrow(PerceptionLeak);
  });

  it('número cru de simulação é erro', () => {
    expect(() => assertNoLeaks('O cômodo está a 42.1 graus.', [])).toThrow(/42\.1/);
  });

  it('coordenada é erro', () => {
    expect(() => assertNoLeaks('O pão está em (3, 4).', [])).toThrow(/coordenada/);
  });

  it('identificador com cerquilha é erro', () => {
    expect(() => assertNoLeaks('Você vê agent#7 na porta.', [])).toThrow(/identificador/);
  });

  it('prosa legítima passa, inclusive com número escrito por extenso', () => {
    expect(() => assertNoLeaks('Duas mulheres conversam junto à lareira quente.', [])).not.toThrow();
  });

  it('o sourceId viaja no fato mas nunca aparece no relato', () => {
    const r = assemblePerceptionReport(CENA, LARGO);
    expect(r.included.some((f) => f.sourceId === 'ag_7')).toBe(true);
    expect(r.text).not.toContain('ag_7');
  });
});

describe('colhedores (A-031)', () => {
  const contribuinte = (name: string, fatos: PerceptibleFact[]) => ({
    name,
    collect: () => fatos,
  });
  const ctx = { agentId: 'ag_1', gridId: 'main', simTime: 0 };

  it('a ordem de registro não influencia o relato', () => {
    const a = new PerceptionPipeline()
      .register(contribuinte('substrato', [fato('O chão está molhado', 5)]))
      .register(contribuinte('corpos', [fato('João está sangrando', 2)]));
    const b = new PerceptionPipeline()
      .register(contribuinte('corpos', [fato('João está sangrando', 2)]))
      .register(contribuinte('substrato', [fato('O chão está molhado', 5)]));
    expect(b.run(ctx, LARGO).text).toBe(a.run(ctx, LARGO).text);
  });

  it('colhedor duplicado é erro de montagem', () => {
    const p = new PerceptionPipeline().register(contribuinte('x', []));
    expect(() => p.register(contribuinte('x', []))).toThrow(/duplicado/);
  });

  it('o pipeline barra o vazamento antes de entregar', () => {
    const p = new PerceptionPipeline().register(
      contribuinte('mau', [fato('obj_12 está no chão', 4, { sourceId: 'obj_12' })]),
    );
    expect(() => p.run(ctx, LARGO)).toThrow(PerceptionLeak);
  });
});

describe('contexto de pensamento (C-002)', () => {
  const rotina: ContextSection = {
    id: 'rotina',
    title: 'Sua rotina',
    text: 'De manhã você conserta o telhado; à tarde, busca lenha.',
    pinned: true,
    priority: 20,
  };
  const eu: ContextSection = {
    id: 'auto',
    title: 'Como você se entende',
    text: 'Você se acha teimoso e mais capaz do que os outros admitem.',
    pinned: true,
    priority: 10,
  };
  const opcionais: ContextSection[] = [
    { id: 'opinioes', text: 'Você desconfia de Maria.', priority: 40 },
    { id: 'memorias', text: 'Ontem discutiram sobre a lenha.', priority: 50 },
    { id: 'inventario', text: 'Você carrega um machado e um pedaço de pão.', priority: 60 },
  ];

  it('cabe no orçamento e mantém as fixas quando o resto é cortado', () => {
    const r = assembleThoughtContext([rotina, eu, ...opcionais], 45);
    expect(r.estimatedTokens).toBeLessThanOrEqual(45);
    expect(r.includedIds).toContain('rotina');
    expect(r.includedIds).toContain('auto');
    expect(r.droppedIds.length).toBeGreaterThan(0);
  });

  it('com folga, tudo entra', () => {
    const r = assembleThoughtContext([rotina, eu, ...opcionais], 500);
    expect(r.droppedIds).toEqual([]);
  });

  it('as opcionais caem da menos prioritária para a mais', () => {
    const r = assembleThoughtContext([rotina, eu, ...opcionais], 70);
    expect(r.droppedIds).toContain('inventario');
    expect(r.droppedIds).not.toContain('opinioes');
  });

  // Cortar uma fixa cumpriria o orçamento violando a promessa de C-002, e
  // ninguém descobriria.
  it('orçamento menor que as fixas é erro, e não corte silencioso', () => {
    expect(() => assembleThoughtContext([rotina, eu], 5)).toThrow(ContextBudgetTooSmall);
  });

  it('seção vazia não ocupa lugar nem aparece', () => {
    const r = assembleThoughtContext([rotina, { id: 'vazio', text: '   ', priority: 1 }], 500);
    expect(r.includedIds).toEqual(['rotina']);
  });

  it('a ordem do vetor de entrada não muda o bloco', () => {
    const todas = [rotina, eu, ...opcionais];
    expect(assembleThoughtContext([...todas].reverse(), 500).text).toBe(
      assembleThoughtContext(todas, 500).text,
    );
  });

  it('o auto-entendimento é fixo apenas quando existe', () => {
    const r = assembleThoughtContext([rotina, ...opcionais], 500);
    expect(r.includedIds).not.toContain('auto');
    expect(r.includedIds).toContain('rotina');
  });
});

describe('inspeção de tile (look)', () => {
  it('traduz estado emergente sem intensidade crua', () => {
    const look = describeTileLook({
      type: 'floor',
      materialId: 'pinho',
      integrity: 55,
      temperature: 90,
      states: [
        { type: 'wet', intensity: 80 },
        { type: 'smoky', intensity: 40 },
      ],
      objects: [{ defId: 'cadeira_madeira' }],
    });
    expect(look).toContain('chão de pinho');
    expect(look).toContain('bem danificado');
    expect(look).toContain('quente');
    expect(look).toContain('encharcado');
    expect(look).toContain('fumegante');
    expect(look).toContain('uma cadeira madeira');
    expect(look).not.toMatch(/wet:\d+/);
    expect(look).not.toMatch(/\d+%/);
  });

  it('porta abre/fecha e chama forte', () => {
    const look = describeTileLook({
      type: 'door',
      materialId: 'madeira',
      state: { isOpen: true },
      states: [{ type: 'burning', intensity: 90 }],
      temperature: 280,
    });
    expect(look).toContain('porta de madeira (aberta)');
    expect(look).toContain('em chamas');
    expect(look).toContain('ardente');
  });

  it('tile intacto e frio omite ruído', () => {
    const look = describeTileLook({
      type: 'wall',
      materialId: 'pedra',
      integrity: 100,
      temperature: 20,
      states: [],
    });
    expect(look).toBe('parede de pedra');
  });
});
