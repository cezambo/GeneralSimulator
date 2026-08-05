import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/index.js';
import { buildSpikeRoom, loadSpikeAgents, SPIKE_GRID } from '../spike/room.js';
import {
  buildAgentPerceptionPayload,
  createDefaultPerceptionPipeline,
  DEFAULT_PERCEPTION_BUDGET,
} from './index.js';

describe('world-scan contributor (produção)', () => {
  it('pipeline default regista world-scan', () => {
    expect(createDefaultPerceptionPipeline().contributors()).toEqual(['world-scan']);
  });

  it('fogo e agente no cone geram fatos não-vazios', () => {
    const cfg = loadConfig();
    const { sim, world } = buildSpikeRoom(cfg, 'perc-fire');
    const { lia, rui } = loadSpikeAgents();
    // Lia olha +Y (90°); Rui e fogo à frente, dentro do alcance.
    lia.pos = { x: 2.5, y: 2.5 };
    lia.rotation = 90;
    lia.vision = { angle: 120, range: 8 };
    rui.pos = { x: 2.5, y: 5.5 };
    rui.rotation = 270;
    sim.state.agents[lia.id] = lia;
    sim.state.agents[rui.id] = rui;

    const overlay = sim.overlayAt(SPIKE_GRID, 2, 4, true);
    overlay.states = [{ type: 'burning', intensity: 80 }];
    overlay.temperature = 400;

    const payload = buildAgentPerceptionPayload(sim, world, lia.id, {
      budget: DEFAULT_PERCEPTION_BUDGET,
      gridId: SPIKE_GRID,
    });

    expect(payload.agentId).toBe('ag_lia');
    expect(payload.facingDeg).toBe(90);
    expect(payload.vision.angle).toBe(120);
    expect(payload.vision.range).toBe(8);
    expect(payload.ranges.visionTiles).toBe(8);
    expect(payload.included.length).toBeGreaterThan(0);
    expect(payload.report.length).toBeGreaterThan(0);
    expect(payload.report).toMatch(/chamas|queimando/i);
    expect(payload.included.some((f) => f.subjectKind === 'agent')).toBe(true);
    expect(payload.visible.agents.some((a) => a.id === 'ag_rui')).toBe(true);
    expect(payload.notable.some((n) => n.kind === 'burning')).toBe(true);
    expect(payload.temperature.nearby.length).toBeGreaterThan(0);
    // A-033: ids internos não vazam no relato.
    expect(payload.report).not.toContain('ag_rui');
    expect(payload.report).not.toContain('ag_lia');
  });

  it('pipeline.run com contexto de mundo devolve o mesmo perigo', () => {
    const cfg = loadConfig();
    const { sim, world } = buildSpikeRoom(cfg, 'perc-pipe');
    const { lia } = loadSpikeAgents();
    lia.pos = { x: 3.5, y: 3.5 };
    lia.rotation = 0; // +X
    lia.vision = { angle: 110, range: 6 };
    sim.state.agents[lia.id] = lia;
    sim.overlayAt(SPIKE_GRID, 5, 3, true).states = [{ type: 'smoky', intensity: 60 }];

    const pipe = createDefaultPerceptionPipeline();
    const report = pipe.run(
      {
        agentId: lia.id,
        gridId: SPIKE_GRID,
        simTime: 0,
        sim,
        world,
      },
      DEFAULT_PERCEPTION_BUDGET,
    );
    expect(report.included.length).toBeGreaterThan(0);
    expect(report.text).toMatch(/fumo|fumegante/i);
  });
});
