/**
 * Relógio de simulação e agendador. W-051, W-052, W-053, W-056.
 *
 * Um tick é um minuto simulado. Pausar congela todo avanço — inclusive o
 * substrato — porque o laço de tick é quem o chama; sem tick, nada corre.
 */

import type { Clock } from '../types/domain.js';

export interface CalendarTuning {
  readonly minutesPerTick: number;
  readonly hoursPerDay: number;
  readonly daysPerSeason: number;
  readonly seasonsPerYear: number;
  readonly availableSpeeds: readonly number[];
}

export const DEFAULT_CALENDAR: CalendarTuning = {
  minutesPerTick: 1,
  hoursPerDay: 24,
  daysPerSeason: 15,
  seasonsPerYear: 4,
  availableSpeeds: [0, 1, 2, 5, 20],
};

export type ScheduledHandler = (simTime: number, payload: unknown) => void;

export interface ScheduledEvent {
  readonly id: string;
  readonly atSimTime: number;
  readonly kind: string;
  readonly payload?: unknown;
}

/**
 * O relógio muta o `Clock` do estado vivo — não tem cópia própria.
 *
 * Assim o save/load de X-003 já captura o tempo sem projeção. O agendador é a
 * única peça extra: a fila precisa sobreviver ao save (W-056), então ela é
 * serializável e restaura junto.
 */
export class SimClock {
  readonly #clock: Clock;
  readonly #tuning: CalendarTuning;
  #queue: ScheduledEvent[] = [];
  #nextId = 1;
  readonly #handlers = new Map<string, ScheduledHandler>();

  constructor(clock: Clock, tuning: CalendarTuning = DEFAULT_CALENDAR) {
    this.#clock = clock;
    this.#tuning = tuning;
    this.#syncCalendar();
  }

  get simTime(): number {
    return this.#clock.simTime;
  }

  get paused(): boolean {
    return this.#clock.paused || this.#clock.speed === 0;
  }

  get speed(): number {
    return this.#clock.speed;
  }

  get day(): number {
    return this.#clock.day ?? 1;
  }

  get season(): number {
    return this.#clock.season ?? 1;
  }

  get year(): number {
    return this.#clock.year ?? 1;
  }

  /** Minutos desde meia-noite do dia corrente. */
  get minuteOfDay(): number {
    const minutosPorDia = this.#tuning.hoursPerDay * 60;
    return ((this.#clock.simTime % minutosPorDia) + minutosPorDia) % minutosPorDia;
  }

  get hourOfDay(): number {
    return Math.floor(this.minuteOfDay / 60);
  }

  /** Fração do dia [0, 1) — útil para iluminação (W-054). */
  get dayFraction(): number {
    return this.minuteOfDay / (this.#tuning.hoursPerDay * 60);
  }

  setSpeed(speed: number): void {
    if (!this.#tuning.availableSpeeds.includes(speed)) {
      throw new Error(
        `velocidade ${speed} fora do conjunto declarado: [${this.#tuning.availableSpeeds.join(', ')}]`,
      );
    }
    this.#clock.speed = speed;
    this.#clock.paused = speed === 0;
  }

  pause(): void {
    this.#clock.paused = true;
  }

  resume(): void {
    if (this.#clock.speed === 0) this.#clock.speed = 1;
    this.#clock.paused = false;
  }

  /**
   * Avança um tick se não estiver pausado. Devolve os eventos que dispararam.
   * W-051, W-056.
   */
  tick(): ScheduledEvent[] {
    if (this.paused) return [];
    this.#clock.simTime += this.#tuning.minutesPerTick;
    this.#syncCalendar();
    return this.#fireDue();
  }

  /** Avança `n` ticks. Útil em testes e em avanço em lote. */
  tickMany(n: number): ScheduledEvent[] {
    const fired: ScheduledEvent[] = [];
    for (let i = 0; i < n; i += 1) fired.push(...this.tick());
    return fired;
  }

  schedule(kind: string, atSimTime: number, payload?: unknown): string {
    if (atSimTime < this.#clock.simTime) {
      throw new Error(`agendar no passado: ${atSimTime} < ${this.#clock.simTime}`);
    }
    const id = `evt_${this.#nextId++}`;
    this.#queue.push({ id, atSimTime, kind, ...(payload !== undefined ? { payload } : {}) });
    // Ordem estável: tempo, depois id. Sem ela, dois eventos no mesmo tick
    // disparariam em ordem de inserção — e a inserção depende de quem agendou
    // primeiro, o que quebra determinismo entre saves.
    this.#queue.sort((a, b) => a.atSimTime - b.atSimTime || a.id.localeCompare(b.id));
    return id;
  }

  cancel(id: string): boolean {
    const i = this.#queue.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.#queue.splice(i, 1);
    return true;
  }

  on(kind: string, handler: ScheduledHandler): void {
    this.#handlers.set(kind, handler);
  }

  /** Fila serializável para o save. W-056. */
  snapshotQueue(): { events: ScheduledEvent[]; nextId: number } {
    return { events: this.#queue.map((e) => ({ ...e })), nextId: this.#nextId };
  }

  restoreQueue(snap: { events: readonly ScheduledEvent[]; nextId: number }): void {
    this.#queue = snap.events.map((e) => ({ ...e }));
    this.#nextId = snap.nextId;
  }

  #fireDue(): ScheduledEvent[] {
    const due: ScheduledEvent[] = [];
    while (this.#queue.length > 0 && this.#queue[0]!.atSimTime <= this.#clock.simTime) {
      due.push(this.#queue.shift()!);
    }
    for (const e of due) {
      this.#handlers.get(e.kind)?.(this.#clock.simTime, e.payload);
    }
    return due;
  }

  /**
   * Dia / estação / ano derivados de `simTime`. W-053.
   *
   * Dia 1 começa em simTime 0. 1440 ticks (com 1 min/tick e 24 h) viram dia 2.
   */
  #syncCalendar(): void {
    const minutosPorDia = this.#tuning.hoursPerDay * 60;
    const diasTotais = Math.floor(this.#clock.simTime / minutosPorDia);
    const diasPorAno = this.#tuning.daysPerSeason * this.#tuning.seasonsPerYear;
    this.#clock.year = Math.floor(diasTotais / diasPorAno) + 1;
    const diaDoAno = diasTotais % diasPorAno;
    this.#clock.season = Math.floor(diaDoAno / this.#tuning.daysPerSeason) + 1;
    this.#clock.day = (diaDoAno % this.#tuning.daysPerSeason) + 1;
  }
}
