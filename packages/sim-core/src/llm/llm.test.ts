import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRegistry, getPrompt } from './registry.js';
import { renderPrompt } from './render.js';
import { resolveBinding, loadModelsConfig } from './binding.js';
import { CassetteStore, cassetteKey, CassetteMissError } from './cassette.js';
import { validateAgainstSchema, schemaFragmentFor } from './schemas.js';
import { Accounting } from './accounting.js';
import { LlmRouter, SchemaRepairFailed, BudgetExceeded } from './index.js';
import type { Provider, ChatRequest, ChatResponse } from './provider.js';
import type { Resolved } from './binding.js';

const ENTRY = 'agent.thought.base_low';

function varsFor(id: string): Record<string, string> {
  return Object.fromEntries(getPrompt(id).variables.map((v) => [v, `<${v}>`]));
}

describe('registro (L-002)', () => {
  it('carrega os prompts e nenhum cita modelo', () => {
    const reg = loadRegistry(true);
    expect(reg.size).toBeGreaterThan(20);
    for (const [id, e] of reg) {
      expect(['compact', 'narrative', 'longform'], id).toContain(e.tier);
      expect(typeof e.schema === 'string' || e.schema === null, id).toBe(true);
    }
  });

  // schema null é declaração explícita de laço agêntico (W-042), não descuido:
  // world_builder devolve uma sequência de tool calls, não um documento.
  it('só o construtor de mundo dispensa schema, e por ser laço de tool calls', () => {
    const semSchema = [...loadRegistry()].filter(([, e]) => e.schema === null).map(([id]) => id);
    expect(semSchema).toEqual(['generation.world_builder']);
  });

  it('call() recusa o laço agêntico em vez de devolver o primeiro turno', async () => {
    const { LlmRouter: R } = await import('./index.js');
    await expect(new R({ mode: 'hybrid' }).call('generation.world_builder', {})).rejects.toThrow(
      /tool calls/,
    );
  });
});

describe('renderização (L-008)', () => {
  it('resolve inclusões e substitui variáveis', () => {
    const e = getPrompt(ENTRY);
    const r = renderPrompt(e, varsFor(ENTRY));
    expect(r.system.length).toBeGreaterThan(50);
    expect(r.system).not.toContain('{{include:');
    expect(r.user).not.toMatch(/\{\{[a-zA-Z]/);
  });

  // O ponto de L-008: buraco silencioso no contexto produz resposta plausível
  // sobre a coisa errada, que é o defeito mais caro de diagnosticar.
  it('variável declarada e não fornecida é erro, e a mensagem a nomeia', () => {
    const e = getPrompt(ENTRY);
    const vars = varsFor(ENTRY);
    const alvo = e.variables[0]!;
    delete vars[alvo];
    expect(() => renderPrompt(e, vars)).toThrow(new RegExp(alvo));
  });

  it('variável fornecida e não declarada também é erro', () => {
    const e = getPrompt(ENTRY);
    expect(() => renderPrompt(e, { ...varsFor(ENTRY), inventada: 'x' })).toThrow(/inventada/);
  });

  it('injeta o schema de saída no user', () => {
    const e = getPrompt(ENTRY);
    expect(renderPrompt(e, varsFor(ENTRY)).user).toContain('"type": "object"');
  });

  it('não manda ao modelo a documentação de quem edita', () => {
    const e = getPrompt(ENTRY);
    const r = renderPrompt(e, varsFor(ENTRY));
    expect(r.system).not.toContain('## Metadados');
    expect(r.user).not.toContain('Notas de teste');
  });
});

describe('vínculo (L-004)', () => {
  it('resolve tier para modelo do preset ativo', () => {
    const r = resolveBinding(getPrompt(ENTRY));
    expect(r.binding.model).toBeTruthy();
    expect(r.source).toBe('preset');
    expect(r.preset).toBe(loadModelsConfig().activePreset);
  });

  it('o tierOverride sobe o tier sem tocar no prompt', () => {
    const e = getPrompt(ENTRY);
    expect(resolveBinding(e, 'longform').tier).toBe('longform');
  });

  // L-003: amostragem é do prompt, tier é qual modelo. Confundir as duas
  // dimensões foi o que produziu oito tiers colapsando em três modelos.
  it('a amostragem do prompt vence a do vínculo', () => {
    const e = getPrompt(ENTRY);
    if (e.temperature !== undefined) {
      expect(resolveBinding(e).binding.temperature).toBe(e.temperature);
    }
  });
});

describe('chave de cassete (L-013)', () => {
  const resolved = (): Resolved => resolveBinding(getPrompt(ENTRY));

  it('a ordem das variáveis não muda a chave', () => {
    const a = cassetteKey('p', { alfa: '1', beta: '2' }, resolved());
    const b = cassetteKey('p', { beta: '2', alfa: '1' }, resolved());
    expect(a).toBe(b);
  });

  it('mudar o valor de uma variável muda a chave', () => {
    const a = cassetteKey('p', { alfa: '1' }, resolved());
    const b = cassetteKey('p', { alfa: '2' }, resolved());
    expect(a).not.toBe(b);
  });

  it('mudar o modelo muda a chave', () => {
    const base = resolved();
    const outro: Resolved = { ...base, binding: { ...base.binding, model: 'outro/modelo' } };
    expect(cassetteKey('p', { a: '1' }, base)).not.toBe(cassetteKey('p', { a: '1' }, outro));
  });

  it('mudar a temperatura muda a chave', () => {
    const base = resolved();
    const outro: Resolved = { ...base, binding: { ...base.binding, temperature: 0.999 } };
    expect(cassetteKey('p', { a: '1' }, base)).not.toBe(cassetteKey('p', { a: '1' }, outro));
  });
});

describe('modos de cassete (L-014)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cass-'));
    return () => rmSync(dir, { recursive: true, force: true });
  });

  // O pior comportamento possível seria cair na rede em silêncio: a rodada que
  // devia custar zero e reproduzir exatamente passaria a custar e a divergir.
  it('replay estrito falha diante de cassete ausente', () => {
    const s = new CassetteStore('replay', dir);
    expect(() => s.onMiss('p.x', 'chave')).toThrow(CassetteMissError);
  });

  it('híbrido manda chamar quando falta', () => {
    expect(new CassetteStore('hybrid', dir).onMiss('p.x', 'k')).toBe('call');
  });

  it('grava e relê o mesmo registro', () => {
    const s = new CassetteStore('hybrid', dir);
    const rec = {
      key: 'k1',
      promptId: 'agent.thought.base_low',
      model: 'm',
      provider: 'openrouter',
      recordedAt: new Date().toISOString(),
      request: { system: 's', user: 'u' },
      response: { raw: '{}', parsed: {} },
      usage: { promptTokens: 1, completionTokens: 2, costUsd: 0, latencyMs: 3, repairAttempts: 0 },
    };
    s.write(rec);
    expect(s.read('agent.thought.base_low', 'k1')).toEqual(rec);
    expect(s.count()).toBe(1);
  });

  it('replay não grava', () => {
    expect(new CassetteStore('replay', dir).shouldRecord()).toBe(false);
  });
});

describe('validação de schema (L-007)', () => {
  it('aceita resposta válida e recusa inválida', () => {
    expect(validateAgainstSchema('handshake_response', { accept: true }).valid).toBe(true);
    const bad = validateAgainstSchema('handshake_response', {});
    expect(bad.valid).toBe(false);
    expect(bad.message).toMatch(/accept/);
  });

  it('a mensagem de campo não previsto nomeia o campo', () => {
    const r = validateAgainstSchema('handshake_response', { accept: true, inventado: 1 });
    expect(r.valid).toBe(false);
    expect(r.message).toMatch(/inventado/);
  });

  // O trecho vai ao prompt: as descrições em português são notas de projeto que
  // citam requisitos, e mandá-las convida o modelo a citar requisito na resposta.
  it('o trecho injetado não leva as descrições do schema', () => {
    const frag = schemaFragmentFor('handshake_response');
    expect(frag).toContain('accept');
    expect(frag).not.toContain('S-002');
  });

  it('schema desconhecido falha nomeando o schema', () => {
    expect(() => schemaFragmentFor('nao_existe_response')).toThrow(/nao_existe_response/);
  });
});

describe('orçamento e reserva de crise (C-007, L-006)', () => {
  const limits = {
    perAgentPerSimDayCallLimit: 10,
    graveReactiveReserve: 3,
    batchCallLimit: 6,
    dailyUsdLimit: 100,
  };
  const gastar = (a: Accounting, n: number, kind: 'ordinary' | 'grave_reactive' | 'batch') => {
    for (let i = 0; i < n; i++) {
      a.record(
        {
          promptId: 'p',
          agentId: 'ag',
          simDay: 1,
          model: 'm',
          promptTokens: 0,
          completionTokens: 0,
          costUsd: 0,
          latencyMs: 0,
          repairAttempts: 0,
          fromCassette: false,
        },
        kind,
      );
    }
  };

  it('gatilho comum para no teto menos a reserva', () => {
    const a = new Accounting(limits);
    gastar(a, 7, 'ordinary');
    expect(a.canCall('ag', 1, 'ordinary').allowed).toBe(false);
  });

  // A razão de existir da reserva: num dia de crise o agente atinge o teto por
  // ter vivido demais, e a degradação chegaria justo quando B-031 e S-036
  // exigem cognição.
  it('reativo grave ainda pensa depois de o saldo comum acabar', () => {
    const a = new Accounting(limits);
    gastar(a, 7, 'ordinary');
    const v = a.canCall('ag', 1, 'grave_reactive');
    expect(v.allowed).toBe(true);
    expect(v.usedReserve).toBe(true);
  });

  it('a reserva também acaba', () => {
    const a = new Accounting(limits);
    gastar(a, 7, 'ordinary');
    gastar(a, 3, 'grave_reactive');
    expect(a.canCall('ag', 1, 'grave_reactive').allowed).toBe(false);
  });

  // Se o lote disputasse o mesmo saldo, o agente que passou o dia conversando
  // perderia a memória do dia: o dia custaria caro e não deixaria nada.
  it('o lote noturno não compete com o dia', () => {
    const a = new Accounting(limits);
    gastar(a, 10, 'ordinary');
    expect(a.canCall('ag', 1, 'batch').allowed).toBe(true);
  });

  it('o teto é por dia simulado', () => {
    const a = new Accounting(limits);
    gastar(a, 7, 'ordinary');
    expect(a.canCall('ag', 2, 'ordinary').allowed).toBe(true);
  });

  it('degradação fica registrada e visível', () => {
    const a = new Accounting(limits);
    a.markDegraded('ag', 1, 42);
    expect(a.degradedAgents().get('ag#1')?.atSimTime).toBe(42);
  });
});

// ── Laço completo, sem rede ────────────────────────────────────────────
class FakeProvider implements Provider {
  calls = 0;
  constructor(private readonly respostas: string[]) {}
  async chat(_req: ChatRequest): Promise<ChatResponse> {
    const raw = this.respostas[Math.min(this.calls, this.respostas.length - 1)]!;
    this.calls++;
    return { raw, promptTokens: 10, completionTokens: 5, costUsd: 0.001, latencyMs: 1 };
  }
}

describe('roteador de ponta a ponta', () => {
  const PROMPT = 'memory.daily_summary';
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cass-e2e-'));
    return () => rmSync(dir, { recursive: true, force: true });
  });

  const router = (respostas: string[], mode: 'hybrid' | 'replay' = 'hybrid') => {
    const provider = new FakeProvider(respostas);
    const r = new LlmRouter({ mode, cassetteDir: dir, providerFactory: () => provider });
    return { r, provider };
  };

  it('resposta válida atravessa sem reparo', async () => {
    const { r, provider } = router(['{\"summary\":\"Consertou o telhado e discutiu com Maria.\"}']);
    const out = await r.call<{ summary: string }>(PROMPT, varsFor(PROMPT));
    expect(out.value.summary).toBeTruthy();
    expect(out.repairAttempts).toBe(0);
    expect(provider.calls).toBe(1);
  });

  it('aceita a cerca de código que modelo pequeno insiste em pôr', async () => {
    const { r } = router(['```json\n{\"summary\":\"Dia parado.\"}\n```']);
    expect((await r.call<{ summary: string }>(PROMPT, varsFor(PROMPT))).value.summary).toBeTruthy();
  });

  // O reparo é condicional: não custa nada no caminho feliz, e é por isso que
  // venceu a alternativa de pagar uma chamada extra em toda resposta.
  it('repara resposta inválida e informa quantas tentativas', async () => {
    const { r, provider } = router(['{\"faltando\":\"summary\"}', '{\"summary\":\"ok\"}']);
    const out = await r.call<{ summary: string }>(PROMPT, varsFor(PROMPT));
    expect(out.value.summary).toBeTruthy();
    expect(out.repairAttempts).toBe(1);
    expect(provider.calls).toBe(2);
  });

  it('desiste depois de dois reparos, e não entrega inválido', async () => {
    const { r, provider } = router(['nada disso é json']);
    await expect(r.call(PROMPT, varsFor(PROMPT))).rejects.toThrow(SchemaRepairFailed);
    expect(provider.calls).toBe(3);
  });

  it('grava e depois responde do cassete sem tocar no provedor', async () => {
    const { r, provider } = router(['{\"summary\":\"ok\"}']);
    await r.call(PROMPT, varsFor(PROMPT));
    expect(provider.calls).toBe(1);

    const segundo = await r.call<{ summary: string }>(PROMPT, varsFor(PROMPT));
    expect(segundo.fromCassette).toBe(true);
    expect(segundo.costUsd).toBe(0);
    expect(provider.calls).toBe(1);
  });

  it('o custo da sessão bate com a soma das chamadas (L-016)', async () => {
    const { r } = router(['{\"summary\":\"ok\"}']);
    await r.call(PROMPT, varsFor(PROMPT));
    const s = r.accounting.summary();
    expect(s.costUsd).toBeCloseTo(r.accounting.calls().reduce((t, c) => t + c.costUsd, 0), 10);
    expect(s.calls).toBe(1);
  });

  it('estourar o orçamento degrada de forma visível em vez de falhar calado', async () => {
    const { r } = router(['{\"summary\":\"ok\"}']);
    // @ts-expect-error — limites apertados para o teste
    r.accounting = new Accounting({
      perAgentPerSimDayCallLimit: 1,
      graveReactiveReserve: 1,
      batchCallLimit: 1,
      dailyUsdLimit: 100,
    });
    await expect(
      r.call(PROMPT, varsFor(PROMPT), { agentId: 'ag', simDay: 1, kind: 'ordinary' }),
    ).rejects.toThrow(BudgetExceeded);
    expect(r.accounting.degradedAgents().has('ag#1')).toBe(true);
  });
});
