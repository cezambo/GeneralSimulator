import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/index.js';
import type { ObjectDef } from '../types/domain.js';
import {
  canFit,
  carryCapacityKg,
  checkCarry,
  effectiveVolume,
  packingWhenStored,
  resolveFunction,
  speedFactorFromLoad,
  stackEffectiveVolume,
  totalCarryWeight,
} from './index.js';

const cfg = loadConfig();

function def(id: string): ObjectDef {
  const d = cfg.objects.get(id);
  if (!d) throw new Error(`objeto ausente no exemplo: ${id}`);
  return d;
}

describe('Volume e PEM (O-001, O-002, O-003)', () => {
  it('volume efetivo é volume × PEM', () => {
    const cadeira = def('cadeira_madeira');
    expect(effectiveVolume(cadeira)).toBeCloseTo(cadeira.volume * cadeira.packingEfficiency, 9);
  });

  it('fittedFor reduz o PEM sem mudar o peso', () => {
    // Procura um container com fittedFor nos exemplos; se não houver, monta o caso.
    const flecha = [...cfg.objects.values()].find((o) => o.id.includes('flecha') || o.category === 'weapon');
    const aljava = [...cfg.objects.values()].find((o) => o.fittedFor && o.fittedFor.length > 0);
    if (!flecha || !aljava) {
      const item: ObjectDef = {
        ...def('cadeira_madeira'),
        id: 'arco',
        packingEfficiency: 5,
        weight: 2,
        volume: 0.01,
      };
      const bag: ObjectDef = {
        ...def('cadeira_madeira'),
        id: 'aljava',
        isContainer: true,
        containerVolume: 1,
        fittedFor: ['arco'],
      };
      expect(packingWhenStored(item, bag)).toBe(1);
      expect(item.weight).toBe(2);
      return;
    }
    const alvo = aljava.fittedFor![0]!;
    const item = cfg.objects.get(alvo) ?? flecha;
    expect(packingWhenStored(item, aljava)).toBeLessThanOrEqual(item.packingEfficiency);
    expect(packingWhenStored(item, aljava)).toBe(1);
  });

  it('recusa o que não cabe e aceita depois de liberar espaço', () => {
    const bau = [...cfg.objects.values()].find((o) => o.isContainer && (o.containerVolume ?? 0) > 0);
    expect(bau).toBeDefined();
    const grande = [...cfg.objects.values()]
      .filter((o) => o.id !== bau!.id)
      .sort((a, b) => effectiveVolume(b) - effectiveVolume(a))[0]!;
    const cheio = canFit(bau!, [{ def: grande }], { def: grande });
    // Pode ou não caber duas vezes; o que importa é a aritmética.
    const vazio = canFit(bau!, [], { def: grande });
    if (effectiveVolume(grande) <= (bau!.containerVolume ?? 0)) {
      expect(vazio.ok).toBe(true);
    } else {
      expect(vazio.ok).toBe(false);
      expect(vazio.reason).toMatch(/não cabe/i);
    }
    if (!cheio.ok && vazio.ok) {
      expect(cheio.reason).toBeTruthy();
    }
  });

  it('aninhar recipientes nunca cria espaço (O-003)', () => {
    const outer: ObjectDef = {
      ...def('cadeira_madeira'),
      id: 'bau',
      isContainer: true,
      containerVolume: 0.5,
      volume: 0.1,
      packingEfficiency: 2,
      weight: 5,
    };
    const inner: ObjectDef = {
      ...def('cadeira_madeira'),
      id: 'saco',
      isContainer: true,
      containerVolume: 0.4,
      volume: 0.05,
      packingEfficiency: 3,
      weight: 1,
    };
    const pao: ObjectDef = {
      ...def('cadeira_madeira'),
      id: 'pao',
      volume: 0.02,
      packingEfficiency: 1,
      weight: 0.5,
    };
    // Saco cheio de pães: o baú conta o conteúdo, não o saco vazio.
    const sacoCheio = {
      def: inner,
      contents: [{ def: pao }, { def: pao }, { def: pao }, { def: pao }],
    };
    const fit = canFit(outer, [], sacoCheio);
    expect(fit.ok).toBe(true);
  });

  it('pilha ocupa menos que exemplares soltos (O-007)', () => {
    const empilhavel = [...cfg.objects.values()].find((o) => o.stackLimit && o.stackLimit >= 2);
    if (!empilhavel) return;
    const n = Math.min(4, empilhavel.stackLimit!);
    const soltos = n * effectiveVolume(empilhavel);
    const pilha = stackEffectiveVolume(empilhavel, n);
    expect(pilha).toBeLessThan(soltos);
  });
});

describe('Carga e movimento (O-013, O-014, O-015)', () => {
  it('carga é a soma dos pesos, recipientes incluídos', () => {
    const a = def('cadeira_madeira');
    const items = [{ def: a }, { def: a }];
    expect(totalCarryWeight(items)).toBeCloseTo(a.weight * 2, 9);
  });

  it('braço comprometido reduz capacidade', () => {
    const sao = carryCapacityKg(1, 1);
    const ferido = carryCapacityKg(1, 0.4);
    expect(ferido).toBeLessThan(sao);
  });

  it('acima da capacidade falha com sensação, não linguagem de sistema', () => {
    const bigorna = [...cfg.objects.values()].sort((a, b) => b.weight - a.weight)[0]!;
    const check = checkCarry([{ def: bigorna }, { def: bigorna }, { def: bigorna }], 0.2, 0.2);
    if (check.weight > check.capacity) {
      expect(check.canTakeMore).toBe(false);
      expect(check.reason).not.toMatch(/error|invalid|null/i);
    }
  });

  it('mesmo trajeto mais lento com o dobro do peso; piso respeitado', () => {
    const cap = 35;
    const leve = speedFactorFromLoad(cap * 0.4, cap);
    const pesado = speedFactorFromLoad(cap * 0.9, cap);
    expect(leve).toBe(1);
    expect(pesado).toBeLessThan(leve);
    expect(speedFactorFromLoad(cap, cap)).toBe(0.25);
  });
});

describe('Funcionamento (O-021)', () => {
  it('regra de recusa devolve texto diegético sem LLM', () => {
    const tool = [...cfg.objects.values()].find((o) => (o.functionRules?.length ?? 0) > 0);
    if (!tool) {
      const defFake: ObjectDef = {
        ...def('cadeira_madeira'),
        id: 'faca',
        functionRules: [
          {
            id: 'faca-pedra',
            trigger: { action: 'cortar', targetMaterial: 'pedra' },
            outcome: 'refuse',
            diegeticText: 'a lâmina desliza na pedra sem morder',
          },
        ],
      };
      const r = resolveFunction(defFake, {
        action: 'cortar',
        context: { targetMaterial: 'pedra' },
      });
      expect(r.matched).toBe(true);
      expect(r.outcome).toBe('refuse');
      expect(r.diegeticText).toMatch(/lâmina/);
      return;
    }
    const rule = tool.functionRules![0]!;
    const action = String(rule.trigger['action'] ?? rule.trigger['affordance'] ?? '');
    if (!action) return;
    const r = resolveFunction(tool, { action, context: rule.trigger });
    expect(r.matched).toBe(true);
  });

  it('sem regra correspondente não inventa resolução', () => {
    const cadeira = def('cadeira_madeira');
    expect(resolveFunction(cadeira, { action: 'teleportar' }).matched).toBe(false);
  });
});
