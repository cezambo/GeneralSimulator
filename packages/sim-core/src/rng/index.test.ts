import { describe, expect, it } from 'vitest';
import { SeedRoot } from './index.js';

describe('SeedRoot', () => {
  it('mesma semente, mesma sequência', () => {
    const a = new SeedRoot('cenario-1');
    const b = new SeedRoot('cenario-1');
    const seqA = Array.from({ length: 20 }, () => a.stream('substrato').next());
    const seqB = Array.from({ length: 20 }, () => b.stream('substrato').next());
    expect(seqA).toEqual(seqB);
  });

  it('sementes diferentes divergem', () => {
    const a = new SeedRoot('cenario-1');
    const b = new SeedRoot('cenario-2');
    expect(a.stream('substrato').next()).not.toEqual(b.stream('substrato').next());
  });

  // A razão de existir dos fluxos nomeados (X-004): acrescentar um consumidor
  // de dado no substrato não pode mover o dado do Validador, senão qualquer
  // mudança no código invalida toda partida gravada.
  it('um fluxo novo não perturba os que já existiam', () => {
    const semNovo = new SeedRoot('s');
    const antes = Array.from({ length: 5 }, () => semNovo.stream('validador').next());

    const comNovo = new SeedRoot('s');
    comNovo.stream('substrato').next();
    comNovo.stream('corpo').int(1, 6);
    const depois = Array.from({ length: 5 }, () => comNovo.stream('validador').next());

    expect(depois).toEqual(antes);
  });

  it('o mesmo nome devolve o mesmo gerador, e não um reiniciado', () => {
    const r = new SeedRoot('s');
    const primeiro = r.stream('x').next();
    const segundo = r.stream('x').next();
    expect(segundo).not.toEqual(primeiro);
  });

  it('int respeita os extremos', () => {
    const r = new SeedRoot('s').stream('d');
    const vals = Array.from({ length: 500 }, () => r.int(1, 6));
    expect(Math.min(...vals)).toBe(1);
    expect(Math.max(...vals)).toBe(6);
    expect(vals.every(Number.isInteger)).toBe(true);
  });

  it('chance nos extremos não consome sorte nem hesita', () => {
    const r = new SeedRoot('s').stream('c');
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
  });

  it('shuffle não altera a lista original e preserva os elementos', () => {
    const r = new SeedRoot('s').stream('sh');
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const embaralhado = r.shuffle(original);
    expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...embaralhado].sort((x, y) => x - y)).toEqual(original);
  });

  it('pick em lista vazia falha em vez de devolver undefined', () => {
    const r = new SeedRoot('s').stream('p');
    expect(() => r.pick([])).toThrow(/vazia/);
  });
});
