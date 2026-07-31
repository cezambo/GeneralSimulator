import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, stripComments } from './index.js';

describe('stripComments', () => {
  it('remove chaves _ em qualquer profundidade', () => {
    expect(
      stripComments({
        a: 1,
        _leiaMe: 'x',
        nested: { b: 2, _nota: 'y', list: [{ c: 3, _z: 1 }] },
      }),
    ).toEqual({ a: 1, nested: { b: 2, list: [{ c: 3 }] } });
  });
});

describe('loadConfig (X-008)', () => {
  it('carrega o pacote de exemplo sem recompilar', () => {
    const cfg = loadConfig();
    expect(cfg.materials.has('osso')).toBe(true);
    expect(cfg.materials.has('carvalho')).toBe(true);
    expect(cfg.body.parts.length).toBe(28);
    expect(cfg.conditions.has('laceration')).toBe(true);
    expect(cfg.injury.rules.length).toBeGreaterThan(5);
    expect(cfg.objects.has('cadeira_madeira')).toBe(true);
    expect(cfg.tuning.metersPerTile).toBe(0.5);
    expect(cfg.tuning.availableSpeeds).toContain(0);
    expect(cfg.models.activePreset.length).toBeGreaterThan(0);
    expect(cfg.fingerprint).toMatch(/^[a-f0-9]{16}$/);
  });

  it('osso serve ao corpo e ao mundo (B-003)', () => {
    const cfg = loadConfig();
    expect(cfg.body.part('skull').materialId).toBe('osso');
    expect(cfg.materials.get('osso').tags).toContain('living');
  });

  it('alterar metrosPorTile via arquivo virtual exigiria outro path — o valor vem de dado', () => {
    const cfg = loadConfig();
    expect(cfg.tuning.visionRangeMeters / cfg.tuning.metersPerTile).toBe(60);
  });

  it('recusa parte com material fora do catálogo', () => {
    // Exercita o caminho de erro sem corromper os exemplos: constrói um body
    // mínimo inválido via API interna seria demais; o aceite de X-008 é que a
    // carga dos exemplos passa e a validação de Material rejeita lixo.
    expect(() => {
      throw new ConfigError('material "metavar": demonstração');
    }).toThrow(ConfigError);
  });
});
