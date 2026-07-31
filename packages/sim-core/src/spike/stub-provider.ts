/**
 * Provedor determinístico do spike. Zero rede, custo zero.
 *
 * Responde pelo schemaName da requisição. Variedade vem de um hash do user —
 * mesma entrada, mesma saída — para cassete e replay baterem.
 */

import { createHash } from 'node:crypto';
import type { ChatRequest, ChatResponse, Provider } from '../llm/provider.js';

function hash(s: string): number {
  const h = createHash('sha256').update(s).digest();
  return h.readUInt32BE(0);
}

function pickThought(user: string): string {
  const n = hash(user) % 5;
  const lia = /Lia/i.test(user);
  const alvo = lia ? 'ag_rui' : 'ag_lia';
  const nomeAlvo = lia ? 'Rui' : 'Lia';

  const decisoes = [
    {
      thought: lia ? 'A cadeira range. Preciso sentar um pouco.' : 'Vou esperar e ver o que ela faz.',
      decision: {
        actionType: 'interact',
        targetId: 'obj_cadeira_1',
        targetLabel: 'cadeira',
        destination: null,
        intentDescription: 'sentar na cadeira de madeira',
        speech: null,
      },
      memorability: { score: 3, what: 'Notei a cadeira no meio da sala.' },
      meta: { emotion: 'cansado', urgency: 'low' },
    },
    {
      thought: lia ? `Onde está ${nomeAlvo}? Quero falar.` : `Vou até ${nomeAlvo}.`,
      decision: {
        actionType: 'move',
        targetId: alvo,
        targetLabel: nomeAlvo,
        destination: lia ? { x: 3, y: 3 } : { x: 1, y: 1 },
        intentDescription: `caminhar até ${nomeAlvo}`,
        speech: null,
      },
      memorability: { score: 2 },
      meta: { emotion: 'neutro', urgency: 'medium' },
    },
    {
      thought: `Preciso dizer algo a ${nomeAlvo}.`,
      decision: {
        actionType: 'speak',
        targetId: alvo,
        targetLabel: nomeAlvo,
        destination: null,
        intentDescription: `cumprimentar ${nomeAlvo}`,
        speech: lia ? 'Oi, Rui. A sala está quieta hoje.' : 'Lia. Bom te ver por aqui.',
      },
      memorability: { score: 6, what: `Falei com ${nomeAlvo} na sala.` },
      meta: { emotion: 'sociável', urgency: 'low' },
    },
    {
      thought: 'Nada urgente. Espero.',
      decision: {
        actionType: 'wait',
        targetId: null,
        targetLabel: null,
        destination: null,
        intentDescription: 'ficar parado observando a sala',
        speech: null,
      },
      memorability: { score: 0 },
      meta: { emotion: 'calmo', urgency: 'low' },
    },
    {
      thought: 'Hora de descansar um pouco.',
      decision: {
        actionType: 'sleep',
        targetId: null,
        targetLabel: null,
        destination: null,
        intentDescription: 'tentar dormir no chão da sala',
        speech: null,
      },
      memorability: { score: 1 },
      meta: { emotion: 'exausto', urgency: 'medium' },
    },
  ] as const;

  return JSON.stringify(decisoes[n]!);
}

function stubFor(req: ChatRequest): string {
  switch (req.schemaName) {
    case 'agent_thought_response':
      return pickThought(req.user);
    case 'memory_summary_response':
      return JSON.stringify({
        summary: 'Dia quieto na sala pequena. Conversas curtas e espera.',
        preservedMarcantes: [],
        discardedTopics: ['ruído de fundo'],
      });
    case 'nightly_appraisal_response':
      return JSON.stringify({ classifications: [], verdicts: [] });
    case 'gm_response':
      return JSON.stringify({
        verdict: 'executed',
        narrative: 'A ação se resolve sem drama.',
        reasoning: 'Spike: desfecho permissivo fora de porteiro.',
        worldMutations: [
          {
            type: 'agent_state',
            target: 'spike',
            changes: { note: 'gm_ok' },
          },
        ],
        agentFeedback: 'Você faz o que pretendia.',
        generalization: { verdict: 'one_off', reasoning: 'caso de spike' },
      });
    default:
      // Schemas inesperados no spike: resposta mínima vazia costuma falhar o
      // AJV e acionar reparo — devolvemos objeto vazio tipado o bastante.
      return JSON.stringify({});
  }
}

export class SpikeStubProvider implements Provider {
  calls = 0;

  async chat(req: ChatRequest): Promise<ChatResponse> {
    this.calls += 1;
    return {
      raw: stubFor(req),
      promptTokens: 20,
      completionTokens: 30,
      costUsd: 0,
      latencyMs: 0,
    };
  }
}
