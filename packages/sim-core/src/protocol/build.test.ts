import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/index.js';
import { buildSpikeRoom } from '../spike/room.js';
import { BuildHistory } from './build.js';
import { ProtocolError } from './envelope.js';

function hist() {
  const cfg = loadConfig();
  const { sim, world } = buildSpikeRoom(cfg, 'build-hist');
  return { cfg, sim, world, build: new BuildHistory(sim, world, cfg.objects) };
}

describe('BuildHistory', () => {
  it('pinta, desfaz e refaz tile', () => {
    const { build, world } = hist();
    const g = world.mainGridId;
    expect(world.tileAt(g, 4, 4).type).toBe('floor');
    build.paintTiles('wall', 'pedra', [{ x: 4, y: 4 }]);
    expect(world.tileAt(g, 4, 4).type).toBe('wall');
    build.undo();
    expect(world.tileAt(g, 4, 4).type).toBe('floor');
    build.redo();
    expect(world.tileAt(g, 4, 4).type).toBe('wall');
  });

  it('remove tile volta a chão', () => {
    const { build, world } = hist();
    const g = world.mainGridId;
    build.paintTiles('wall', 'pedra', [{ x: 3, y: 3 }]);
    build.removeTiles([{ x: 3, y: 3 }]);
    expect(world.tileAt(g, 3, 3)).toMatchObject({ type: 'floor', materialId: 'pinho' });
  });

  it('coloca e remove móvel com undo/redo', () => {
    const { build, sim } = hist();
    const placed = build.placeObject('cadeira_madeira', { x: 5, y: 5 });
    const id = placed.objectsUpsert![0]!.id;
    expect(sim.state.objects[id]?.defId).toBe('cadeira_madeira');

    build.undo();
    expect(sim.state.objects[id]).toBeUndefined();
    build.redo();
    expect(sim.state.objects[id]?.defId).toBe('cadeira_madeira');

    build.removeObject({ objectId: id });
    expect(sim.state.objects[id]).toBeUndefined();
    build.undo();
    expect(sim.state.objects[id]?.defId).toBe('cadeira_madeira');
  });

  it('recusa móvel em parede', () => {
    const { build } = hist();
    expect(() => build.placeObject('cadeira_madeira', { x: 0, y: 0 })).toThrow(ProtocolError);
  });
});
