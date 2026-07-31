/**
 * Spike cognitivo V0 — descartável.
 *
 * Responde: o laço pensamento → Validador → memória fecha headless, em 3 dias
 * simulados, com replay idêntico e custo zero (stub + cassetes).
 */

import { createHash } from 'node:crypto';
import { loadConfig, type SimConfig } from '../config/load.js';
import { LlmRouter, type CassetteMode } from '../llm/index.js';
import type { Resolved } from '../llm/binding.js';
import type { Provider } from '../llm/provider.js';
import {
  Validator,
  type AffordanceIndex,
  type MediationRequest,
  type ProvisionalRuleStore,
} from '../validator/index.js';
import { Simulation } from '../state/index.js';
import type {
  Agent,
  MemoryEntry,
  PlausibilityRegistry,
  ProvisionalRule,
  ValidationPolicy,
  WorldMutation,
} from '../types/domain.js';
import {
  advance,
  createMover,
  findPath,
  setPath,
  tilesPerMinute,
  type MoverState,
} from '../spatial/index.js';
import { SimClock } from '../world/clock.js';
import { World } from '../world/grid.js';
import { buildSpikeRoom, CHAIR_ID, loadSpikeAgents, SPIKE_GRID } from './room.js';
import { SpikeStubProvider } from './stub-provider.js';

const THOUGHT_HOURS = new Set([8, 12, 16, 20]);
const NIGHTLY_HOUR = 22;
const MEMORABILITY_THRESHOLD = 5;

export interface SpikeEvent {
  readonly simTime: number;
  readonly day: number;
  readonly kind: string;
  readonly agentId?: string;
  readonly detail: string;
}

export interface SpikeResult {
  readonly seed: string;
  readonly days: number;
  readonly thoughts: number;
  readonly validations: number;
  readonly memoriesAdded: number;
  readonly events: readonly SpikeEvent[];
  readonly finalPositions: Readonly<Record<string, { x: number; y: number }>>;
  /** Impressão estável do desfecho — duas corridas iguais produzem o mesmo. */
  readonly fingerprint: string;
  readonly llmCallsRecorded: number;
  readonly llmCostUsd: number;
  readonly cassetteHits: number;
  readonly providerCalls: number;
}

export interface SpikeOptions {
  readonly seed?: string;
  readonly days?: number;
  readonly mode?: CassetteMode;
  readonly cassetteDir?: string;
  readonly config?: SimConfig;
  readonly providerFactory?: (resolved: Resolved) => Provider;
}

class EmptyRules implements ProvisionalRuleStore {
  find(): undefined {
    return undefined;
  }
  apply(): never {
    throw new Error('spike: regra provisória inesperada');
  }
  add(_r: ProvisionalRule): void {}
  liveCount(): number {
    return 0;
  }
  nextId(): string {
    return 'rule_spike_0';
  }
}

interface ThoughtDecision {
  thought: string;
  decision: {
    actionType: string;
    targetId?: string | null;
    targetLabel?: string | null;
    destination?: { x: number; y: number } | null;
    intentDescription: string;
    speech?: string | null;
  };
  memorability?: { score: number; what?: string };
}

export async function runSpike(opts: SpikeOptions = {}): Promise<SpikeResult> {
  const seed = opts.seed ?? 'spike-v0';
  const days = opts.days ?? 3;
  const cfg = opts.config ?? loadConfig();
  const stub = new SpikeStubProvider();
  const providerFactory = opts.providerFactory ?? ((_r: Resolved) => stub);

  const { sim, world } = buildSpikeRoom(cfg, seed);
  const { lia, rui } = loadSpikeAgents();
  sim.state.agents[lia.id] = lia;
  sim.state.agents[rui.id] = rui;
  sim.state.clock.paused = false;
  sim.state.clock.speed = 1;

  const clock = new SimClock(sim.state.clock, {
    minutesPerTick: cfg.tuning.minutesPerTick,
    hoursPerDay: cfg.tuning.hoursPerDay,
    daysPerSeason: cfg.tuning.daysPerSeason,
    seasonsPerYear: cfg.tuning.seasonsPerYear,
    availableSpeeds: cfg.tuning.availableSpeeds,
  });

  const movers = new Map<string, MoverState>([
    [lia.id, createMover(SPIKE_GRID, lia.pos.x, lia.pos.y, lia.rotation)],
    [rui.id, createMover(SPIKE_GRID, rui.pos.x, rui.pos.y, rui.rotation)],
  ]);

  const router = new LlmRouter({
    mode: opts.mode ?? 'hybrid',
    ...(opts.cassetteDir !== undefined ? { cassetteDir: opts.cassetteDir } : {}),
    providerFactory,
    limits: {
      perAgentPerSimDayCallLimit: 64,
      graveReactiveReserve: 4,
      batchCallLimit: 16,
      dailyUsdLimit: 100,
    },
  });

  const affordances = makeAffordances(sim, movers);
  const policy: ValidationPolicy = { gatekeeperDomains: ['physicalLaw'], maxRetries: 1 };
  const plausibility: PlausibilityRegistry = {
    allowedOperations: ['ignite', 'wet'],
    forbiddenOperations: [],
    inviolableLaws: ['ninguém voa'],
  };
  const validator = new Validator({
    router,
    seedRoot: sim.rng,
    policy,
    plausibility,
    rules: new EmptyRules(),
    affordances,
  });

  const events: SpikeEvent[] = [];
  let thoughts = 0;
  let validations = 0;
  let memoriesAdded = 0;
  let cassetteHits = 0;

  const ticks = days * cfg.tuning.hoursPerDay * 60;
  for (let i = 0; i < ticks; i += 1) {
    clock.tick();
    stepAllMovers(movers, sim);

    const minuto = clock.minuteOfDay;
    const hora = clock.hourOfDay;
    if (minuto % 60 !== 0) continue;

    if (THOUGHT_HOURS.has(hora)) {
      for (const agent of [lia, rui]) {
        const r = await thinkOnce({
          agent,
          other: agent.id === lia.id ? rui : lia,
          sim,
          world,
          clock,
          router,
          validator,
          movers,
          cfg,
        });
        thoughts += 1;
        cassetteHits += r.fromCassette ? 1 : 0;
        if (r.validated) validations += 1;
        if (r.memoryAdded) memoriesAdded += 1;
        events.push({
          simTime: clock.simTime,
          day: clock.day,
          kind: 'thought',
          agentId: agent.id,
          detail: `${r.actionType}:${r.verdict}:${r.feedback.slice(0, 80)}`,
        });
      }
    }

    if (hora === NIGHTLY_HOUR) {
      for (const agent of [lia, rui]) {
        const r = await nightlyBatch(agent, clock, router);
        cassetteHits += r.fromCassette ? 1 : 0;
        events.push({
          simTime: clock.simTime,
          day: clock.day,
          kind: 'nightly',
          agentId: agent.id,
          detail: r.summary.slice(0, 120),
        });
      }
    }
  }

  const finalPositions: Record<string, { x: number; y: number }> = {};
  for (const [id, m] of movers) {
    finalPositions[id] = { x: round4(m.x), y: round4(m.y) };
    const a = sim.state.agents[id];
    if (a) {
      a.pos = { x: m.x, y: m.y };
      a.rotation = m.rotationDeg;
    }
  }

  const accounting = router.accounting.summary();
  const fingerprint = fingerprintOf({
    thoughts,
    validations,
    memoriesAdded,
    events,
    finalPositions,
    memoryTexts: [lia, rui].flatMap((a) => (a.memories ?? []).map((m) => m.text)),
  });

  return {
    seed,
    days,
    thoughts,
    validations,
    memoriesAdded,
    events,
    finalPositions,
    fingerprint,
    llmCallsRecorded: accounting.calls,
    llmCostUsd: accounting.costUsd,
    cassetteHits,
    providerCalls: stub.calls,
  };
}

async function thinkOnce(ctx: {
  agent: Agent;
  other: Agent;
  sim: Simulation;
  world: World;
  clock: SimClock;
  router: LlmRouter;
  validator: Validator;
  movers: Map<string, MoverState>;
  cfg: SimConfig;
}): Promise<{
  actionType: string;
  verdict: string;
  feedback: string;
  fromCassette: boolean;
  validated: boolean;
  memoryAdded: boolean;
}> {
  const { agent, other, clock, router, validator, movers, world, cfg } = ctx;
  const mover = movers.get(agent.id)!;
  agent.pos = { x: mover.x, y: mover.y };

  const affordancesText = [
    `- interact ${CHAIR_ID} (sentar)`,
    `- speak ${other.id} (${other.name})`,
    `- move / wait / sleep`,
  ].join('\n');

  const promptId = 'agent.thought.base_high';
  const call = await router.call<ThoughtDecision>(
    promptId,
    {
      agentContext: `${agent.name}, pos=(${mover.x.toFixed(1)},${mover.y.toFixed(1)}), energia=${agent.biology.needs.energy}`,
      triggerType: 'idle',
      triggerDetail: `hora ${clock.hourOfDay} do dia ${clock.day}`,
      affordances: affordancesText,
      goalsSummary: agent.goals?.secondary?.text ?? agent.goals?.primary?.text ?? 'nenhuma',
    },
    { agentId: agent.id, simDay: clock.day, kind: 'ordinary' },
  );

  const decision = call.value.decision;
  const actionType = decision.actionType;

  // Movimento: pathfinding determinístico, sem Validador.
  if (actionType === 'move' && decision.destination) {
    const dest = decision.destination;
    const start = { gridId: SPIKE_GRID, x: Math.floor(mover.x), y: Math.floor(mover.y) };
    const goal = {
      gridId: SPIKE_GRID,
      x: Math.max(1, Math.min(3, Math.floor(dest.x))),
      y: Math.max(1, Math.min(3, Math.floor(dest.y))),
    };
    const path = findPath(world, start, goal);
    if (path.found) {
      const speed = tilesPerMinute(
        agent.biology.capacities?.moving ?? 1,
        {
          baseSpeedMetersPerSecond: cfg.tuning.baseSpeedMetersPerSecond,
          minSpeedFactor: cfg.tuning.minSpeedFactor,
        },
        world.scale,
      );
      setPath(mover, path.path, speed);
    }
    const memoryAdded = maybeRemember(agent, call.value, clock.simTime);
    logActivity(agent, clock.simTime, `move:${goal.x},${goal.y}`);
    return {
      actionType,
      verdict: 'executed',
      feedback: path.found ? 'Você começa a caminhar.' : 'Não há caminho.',
      fromCassette: call.fromCassette,
      validated: false,
      memoryAdded,
    };
  }

  const req: MediationRequest = {
    agentId: agent.id,
    actionId: ctx.sim.nextId('act'),
    actionType,
    intent: decision.intentDescription,
    ...(decision.targetId ? { targetId: decision.targetId } : {}),
    simTime: clock.simTime,
    simDay: clock.day,
  };

  const gmVars = {
    intent: decision.intentDescription,
    agentSnapshot: `${agent.name} em (${mover.x.toFixed(1)},${mover.y.toFixed(1)})`,
    targetSnapshot: decision.targetLabel ?? decision.targetId ?? 'nenhum',
    worldSnapshot: 'sala 5x5 com cadeira',
    userInstructions: 'nenhuma',
    substrateSnapshot: 'estável',
    matrixSummary: 'sem reação ativa',
    bodySnapshot: `${agent.name} íntegro`,
    injurySummary: 'padrão',
    allowedOperations: 'ignite, wet',
    plausibilityRegistry: 'realista',
    priorAttempts: 'nenhuma',
  };

  const mediated = await validator.mediate(req, gmVars);
  const memoryAdded = maybeRemember(agent, call.value, clock.simTime);
  logActivity(agent, clock.simTime, `${actionType}:${mediated.verdict}`);

  if (decision.speech && actionType === 'speak') {
    logActivity(other, clock.simTime, `ouviu:${agent.name}:${decision.speech}`);
  }

  return {
    actionType,
    verdict: mediated.verdict,
    feedback: mediated.agentFeedback,
    fromCassette: call.fromCassette,
    validated: mediated.path !== 'affordance',
    memoryAdded,
  };
}

async function nightlyBatch(
  agent: Agent,
  clock: SimClock,
  router: LlmRouter,
): Promise<{ summary: string; fromCassette: boolean }> {
  const log =
    (agent.activityLog ?? []).map((e) => `${e.action}${e.outcome ? ':' + e.outcome : ''}`).join('; ') ||
    'nada registrado';
  const summaryCall = await router.call<{ summary: string }>(
    'memory.daily_summary',
    {
      agentName: agent.name,
      activityLog: log,
      bufferMarcantes: (agent.memories ?? [])
        .filter((m) => m.isMarcante)
        .map((m) => m.text)
        .join('; ') || 'nenhum',
      personality: agent.personality.traitsText,
      opinionsSummary:
        (agent.opinions ?? []).map((o) => o.nuanceDescription).slice(0, 3).join('; ') || 'nenhuma',
    },
    { agentId: agent.id, simDay: clock.day, kind: 'batch' },
  );

  const appraisal = await router.call(
    'cognition.nightly_appraisal',
    {
      agentContext: `${agent.name}, dia ${clock.day}`,
      existingOpinions:
        (agent.opinions ?? []).map((o) => o.nuanceDescription).join('; ') || 'nenhuma',
      newImpressions: log,
      heardClaims: 'nenhuma',
      factBankSummary: 'vazio',
      topicFilter: 'geral',
    },
    { agentId: agent.id, simDay: clock.day, kind: 'batch' },
  );

  const mem: MemoryEntry = {
    id: `mem_day_${clock.day}_${agent.id}`,
    layer: 'daily',
    text: summaryCall.value.summary,
    simTime: clock.simTime,
  };
  (agent.memories ??= []).push(mem);

  return {
    summary: summaryCall.value.summary,
    fromCassette: summaryCall.fromCassette && appraisal.fromCassette,
  };
}

function maybeRemember(agent: Agent, thought: ThoughtDecision, simTime: number): boolean {
  const score = thought.memorability?.score ?? 0;
  if (score < MEMORABILITY_THRESHOLD) return false;
  const text = thought.memorability?.what ?? thought.thought;
  (agent.memories ??= []).push({
    id: `mem_${simTime}_${agent.id}_${agent.memories?.length ?? 0}`,
    layer: 'short_term',
    text,
    simTime,
    memorabilityScore: score,
    isMarcante: score >= 8,
  });
  return true;
}

function logActivity(agent: Agent, simTime: number, action: string): void {
  (agent.activityLog ??= []).push({
    simTime,
    action,
    sectorId: SPIKE_GRID,
  });
}

function makeAffordances(sim: Simulation, movers: Map<string, MoverState>): AffordanceIndex {
  return {
    offers(targetId, actionType) {
      if (targetId === CHAIR_ID && (actionType === 'interact' || actionType === 'sit' || actionType === 'sentar')) {
        return true;
      }
      if (actionType === 'wait' || actionType === 'sleep' || actionType === 'none') return true;
      if (actionType === 'speak' && (targetId === 'ag_lia' || targetId === 'ag_rui')) return true;
      return false;
    },
    withinReach(agentId, targetId) {
      const m = movers.get(agentId);
      if (!m) return false;
      if (targetId === CHAIR_ID) {
        const o = sim.state.objects[CHAIR_ID];
        if (!o) return false;
        const dx = m.x - o.pos.x;
        const dy = m.y - o.pos.y;
        return Math.hypot(dx, dy) <= 2.5;
      }
      const other = movers.get(targetId);
      if (!other) return true;
      return Math.hypot(m.x - other.x, m.y - other.y) <= 3;
    },
    feedbackFor(actionType, targetId) {
      if (targetId === CHAIR_ID) return 'Você se acomoda; a madeira range.';
      if (actionType === 'speak') return 'Suas palavras ecoam na sala pequena.';
      if (actionType === 'wait') return 'Você espera. O tempo passa.';
      if (actionType === 'sleep') return 'Você tenta dormir no chão frio.';
      return 'Feito.';
    },
    mutationsFor(agentId, actionType, targetId): WorldMutation[] {
      if (targetId === CHAIR_ID) {
        return [{ type: 'agent_state', target: agentId, changes: { posture: 'sitting' } }];
      }
      if (actionType === 'speak') {
        return [{ type: 'agent_state', target: agentId, changes: { lastSpoke: true } }];
      }
      return [{ type: 'agent_state', target: agentId, changes: { idle: true } }];
    },
  };
}

function stepAllMovers(movers: Map<string, MoverState>, sim: Simulation): void {
  for (const [id, m] of movers) {
    if (m.waypointIndex < 0) continue;
    advance(m, 1);
    const a = sim.state.agents[id];
    if (a) {
      a.pos = { x: m.x, y: m.y };
      a.rotation = m.rotationDeg;
    }
  }
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function fingerprintOf(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16);
}
