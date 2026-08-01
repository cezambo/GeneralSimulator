/**
 * Slots de save em disco. X-003, U-013.
 *
 * O conteúdo é o `Simulation.serialize()` — estado vivo sem projeção.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SLOT_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function assertSlotName(slot: string): string {
  if (!SLOT_RE.test(slot)) {
    throw new Error(
      `slot inválido "${slot}": use 1–64 caracteres [a-zA-Z0-9_-]`,
    );
  }
  return slot;
}

export function slotPath(dir: string, slot: string): string {
  return join(dir, `${assertSlotName(slot)}.json`);
}

export function saveSlot(dir: string, slot: string, json: string): string {
  assertSlotName(slot);
  mkdirSync(dir, { recursive: true });
  const path = slotPath(dir, slot);
  writeFileSync(path, json, 'utf8');
  return path;
}

export function loadSlot(dir: string, slot: string): string {
  const path = slotPath(dir, slot);
  if (!existsSync(path)) {
    throw new Error(`slot "${slot}" não encontrado em ${dir}`);
  }
  return readFileSync(path, 'utf8');
}

export function slotExists(dir: string, slot: string): boolean {
  return existsSync(slotPath(dir, slot));
}
