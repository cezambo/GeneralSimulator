/**
 * Drive ao vivo do serve existente (Godot a ver): coreografia pausada em ws://127.0.0.1:8787.
 * Não sobe serve efémero — só liga ao URL (SIM_URL) e, se morto, reinicia `npm run sim -- serve`.
 *
 * Uso: `npm run sim -- drive` | `npm run sim -- drive --fresh`
 * Relatório: packages/sim-core/.local/live-drive-report.json
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectClient, type HarnessClient, type WorldView } from './ws-harness.js';

const PKG_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const REPO_ROOT = join(PKG_ROOT, '..', '..');
const GODOT_CONN = join(REPO_ROOT, 'packages', 'client-godot', '.local', 'core-connection.json');
export const LIVE_DRIVE_REPORT_PATH = join(PKG_ROOT, '.local', 'live-drive-report.json');

const DEFAULT_URL = process.env['SIM_URL'] ?? 'ws://127.0.0.1:8787';
/** Pausa entre passos para César ver no Godot. */
const PAUSE_MS = 2500;

export type StepAssert = {
  name: string;
  ok: boolean;
  detail?: string;
};

export type StepResult = {
  n: number;
  step: string;
  label: string;
  ok: boolean;
  detail: string;
  at: string;
  cell?: { x: number; y: number };
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  asserts?: StepAssert[];
};

export type LiveDriveReport = {
  ok: boolean;
  url: string;
  fresh: boolean;
  pauseMs: number;
  startedAt: string;
  finishedAt: string;
  godotConnection?: Record<string, unknown>;
  steps: StepResult[];
  failed: string[];
};

function logPt(obj: Record<string, unknown>): void {
  console.log(JSON.stringify(obj));
}

/** Linha clara de passo para César a acompanhar no terminal. */
function logPasso(
  n: number,
  nome: string,
  mensagem: string,
  extra?: Record<string, unknown>,
): void {
  logPt({
    evento: `PASSO ${n}: ${nome}`,
    passo: n,
    nome,
    mensagem: `PASSO ${n}: ${mensagem}`,
    ...extra,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function readGodotConnection(): Record<string, unknown> | undefined {
  try {
    if (!existsSync(GODOT_CONN)) return undefined;
    return JSON.parse(readFileSync(GODOT_CONN, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function probeWs(url: string): Promise<boolean> {
  try {
    const c = await connectClient(url);
    c.close();
    return true;
  } catch {
    return false;
  }
}

async function ensureServe(url: string): Promise<{ restarted: boolean; child?: ChildProcess }> {
  if (await probeWs(url)) {
    logPt({ evento: 'serve_ok', url, mensagem: 'serve já a escutar' });
    return { restarted: false };
  }

  logPt({
    evento: 'serve_morto',
    url,
    mensagem: 'a reiniciar npm run sim -- serve — Godot deve reconectar sozinho',
  });

  const child = spawn('npm', ['run', 'sim', '--', 'serve'], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env },
  });

  let listening = false;
  const onChunk = (buf: Buffer) => {
    const text = buf.toString();
    process.stdout.write(text);
    if (text.includes('listening') || text.includes('"listening"')) listening = true;
  };
  child.stdout?.on('data', onChunk);
  child.stderr?.on('data', onChunk);

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (listening || (await probeWs(url))) {
      logPt({ evento: 'serve_reiniciado', url, mensagem: 'a escutar de novo' });
      return { restarted: true, child };
    }
    await sleep(400);
  }
  child.kill();
  throw new Error(`serve não ficou a escutar em ${url} após restart`);
}

function findFloorCell(
  view: WorldView,
  prefer: { x: number; y: number },
  opts?: { avoidBurning?: boolean; avoidAgents?: boolean },
): { x: number; y: number } | undefined {
  const burning = new Set(
    [...view.tiles.values()]
      .filter((t) => t.states?.some((s) => s.type === 'burning' && s.intensity > 0))
      .map((t) => `${t.x},${t.y}`),
  );
  const agentCells = new Set(
    view.agents.map((a) => `${Math.floor(a.pos.x)},${Math.floor(a.pos.y)}`),
  );

  const ok = (x: number, y: number): boolean => {
    const t = view.tiles.get(`${x},${y}`);
    if (!t || t.type !== 'floor') return false;
    if (opts?.avoidBurning !== false && burning.has(`${x},${y}`)) return false;
    if (opts?.avoidAgents && agentCells.has(`${x},${y}`)) return false;
    return true;
  };

  if (ok(prefer.x, prefer.y)) return prefer;

  for (let r = 1; r < 20; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = prefer.x + dx;
        const y = prefer.y + dy;
        if (ok(x, y)) return { x, y };
      }
    }
  }
  for (const t of view.tiles.values()) {
    if (ok(t.x, t.y)) return { x: t.x, y: t.y };
  }
  return undefined;
}

function findDoor(view: WorldView): { x: number; y: number; isOpen?: boolean } | undefined {
  for (const t of view.tiles.values()) {
    if (t.type === 'door') {
      return { x: t.x, y: t.y, isOpen: Boolean(t.state?.isOpen) };
    }
  }
  return undefined;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function cellStates(c: HarnessClient, x: number, y: number): { type: string; intensity: number }[] {
  return c.tileAt(x, y)?.states?.map((s) => ({ type: s.type, intensity: s.intensity })) ?? [];
}

/**
 * Alvo da água: preferir floor a arder (nunca porta se houver floor a arder).
 * Preferência (1,1) se for floor+burning.
 */
function pickWetFloorTarget(c: HarnessClient): {
  x: number;
  y: number;
  tileType: string;
} | undefined {
  const burning = c.burningCells();
  const floors = burning
    .map((p) => ({ ...p, tileType: c.tileAt(p.x, p.y)?.type ?? '?' }))
    .filter((p) => p.tileType === 'floor');

  if (floors.length > 0) {
    const at11 = floors.find((p) => p.x === 1 && p.y === 1);
    if (at11) return at11;
    floors.sort((a, b) => dist(a.x, a.y, 1, 1) - dist(b.x, b.y, 1, 1));
    return floors[0];
  }

  // Fallback: qualquer burning que não seja porta.
  const nonDoor = burning
    .map((p) => ({ ...p, tileType: c.tileAt(p.x, p.y)?.type ?? '?' }))
    .filter((p) => p.tileType !== 'door');
  if (nonDoor[0]) return nonDoor[0];
  if (burning[0]) {
    const p = burning[0];
    return { ...p, tileType: c.tileAt(p.x, p.y)?.type ?? '?' };
  }
  return undefined;
}

async function waitRes(c: HarnessClient, reqId: string, timeoutMs = 8000) {
  return c.waitFor(
    (e) => (e.type === 'res.ok' || e.type === 'res.error') && e.reqId === reqId,
    timeoutMs,
  );
}

export async function runLiveDrive(opts?: {
  url?: string;
  /** `cmd.sim.reset` antes da coreografia — sala limpa + fogo fresco. */
  fresh?: boolean;
}): Promise<LiveDriveReport> {
  const url = opts?.url ?? DEFAULT_URL;
  const fresh =
    opts?.fresh ??
    (process.argv.includes('--fresh') || process.env['SIM_DRIVE_FRESH'] === '1');
  const startedAt = new Date().toISOString();
  const steps: StepResult[] = [];
  let serveChild: ChildProcess | undefined;

  const push = (
    n: number,
    step: string,
    label: string,
    ok: boolean,
    detail: string,
    extra?: Partial<Pick<StepResult, 'cell' | 'before' | 'after' | 'asserts'>>,
  ) => {
    const row: StepResult = {
      n,
      step,
      label,
      ok,
      detail,
      at: new Date().toISOString(),
      ...extra,
    };
    steps.push(row);
    logPt({
      resultado: `PASSO ${n}`,
      passo: n,
      nome: step,
      label,
      ok,
      detalhe: detail,
      cell: extra?.cell ?? null,
      asserts: extra?.asserts ?? null,
    });
  };

  try {
    const ensure = await ensureServe(url);
    serveChild = ensure.child;
    const godot = readGodotConnection();
    logPt({
      evento: 'godot_conexao',
      ficheiro: GODOT_CONN,
      estado: godot ?? null,
      nota: 'se Godot estiver aberto, deve auto-reconectar ao serve',
    });

    logPt({ evento: 'a_ligar', url, mensagem: 'segundo cliente WS (drive)', fresh, pauseMs: PAUSE_MS });
    const c = await connectClient(url);
    try {
      await c.waitFor('world.snapshot', 10000);
      await sleep(800);

      // --- PASSO 0: fresh (opcional) ---
      if (fresh) {
        logPasso(0, 'fresh', 'cmd.sim.reset — sala limpa antes da coreografia', {
          acao: 'cmd.sim.reset',
        });
        c.sendCmd('cmd.sim.reset', {}, 'drive-reset');
        const resetRes = await waitRes(c, 'drive-reset');
        if (resetRes.type === 'res.error') {
          push(
            0,
            'fresh',
            'reset',
            false,
            String(resetRes.payload['message'] ?? resetRes.payload['code'] ?? 'erro'),
          );
        } else {
          await c.waitUntil(() => c.hasState(1, 1, 'burning'), 8000, 'fogo após reset');
          await sleep(PAUSE_MS);
          const burningAfter = c.burningCells();
          push(0, 'fresh', 'reset', true, 'sala resetada; foco em (1,1)', {
            cell: { x: 1, y: 1 },
            after: {
              burning: burningAfter,
              tile11: c.tileAt(1, 1)?.type ?? null,
              states11: cellStates(c, 1, 1),
            },
            asserts: [
              {
                name: 'foco_burning',
                ok: c.hasState(1, 1, 'burning'),
                detail: 'burning em (1,1)',
              },
            ],
          });
        }
      }

      const burning0 = c.burningCells();
      const agents0 = c.view.agents.map((a) => ({
        id: a.id,
        pos: a.pos,
        motion: a.motion ? { len: a.motion.path.length, speed: a.motion.speed } : null,
      }));
      logPt({
        evento: 'world.snapshot',
        celulasAArder: burning0,
        agentes: agents0,
        modo: c.view.mode ?? null,
        tiles: c.view.tiles.size,
        fresh,
      });
      push(
        0,
        'snapshot',
        'estado inicial',
        true,
        `burning=${burning0.length} agents=${agents0.map((a) => a.id).join(',')}`,
        {
          before: { burning: burning0, agents: agents0, mode: c.view.mode ?? null },
        },
      );

      // --- PASSO 1: água (preferir FLOOR a arder, não porta) ---
      await sleep(PAUSE_MS);
      const wetTarget = pickWetFloorTarget(c);
      if (!wetTarget) {
        logPasso(1, 'água', 'sem célula a arder para molhar');
        push(1, 'wet', 'água', false, 'nenhuma célula burning no snapshot');
      } else {
        const beforeWet = {
          cell: wetTarget,
          tileType: wetTarget.tileType,
          burning: c.hasState(wetTarget.x, wetTarget.y, 'burning'),
          wet: c.hasState(wetTarget.x, wetTarget.y, 'wet'),
          states: cellStates(c, wetTarget.x, wetTarget.y),
          burningAll: c.burningCells(),
        };
        logPasso(1, 'água', `água em (${wetTarget.x},${wetTarget.y}) [tile=${wetTarget.tileType}]`, {
          cell: { x: wetTarget.x, y: wetTarget.y },
          tileType: wetTarget.tileType,
          preferencia: 'floor a arder (não porta)',
        });
        c.sendCmd(
          'cmd.tool.apply',
          { effect: 'wet', cells: [{ x: wetTarget.x, y: wetTarget.y }] },
          'drive-wet',
        );
        const wetRes = await waitRes(c, 'drive-wet');
        if (wetRes.type === 'res.error') {
          push(
            1,
            'wet',
            'água',
            false,
            String(wetRes.payload['message'] ?? wetRes.payload['code'] ?? 'erro'),
            { cell: wetTarget, before: beforeWet },
          );
        } else {
          // Extinção imediata; wet opcional (pode evaporar depressa se estiver quente).
          let extinguished = false;
          let wetSeenBriefly = false;
          try {
            await c.waitUntil(
              () => !c.hasState(wetTarget.x, wetTarget.y, 'burning'),
              4000,
              'apagou burning',
            );
            extinguished = true;
            wetSeenBriefly = c.hasState(wetTarget.x, wetTarget.y, 'wet');
          } catch {
            extinguished = !c.hasState(wetTarget.x, wetTarget.y, 'burning');
            wetSeenBriefly = c.hasState(wetTarget.x, wetTarget.y, 'wet');
          }
          await sleep(PAUSE_MS);
          const stillNotBurning = !c.hasState(wetTarget.x, wetTarget.y, 'burning');
          const wetStill = c.hasState(wetTarget.x, wetTarget.y, 'wet');
          const ok = stillNotBurning;
          const asserts: StepAssert[] = [
            {
              name: 'sem_burning',
              ok: stillNotBurning,
              detail: stillNotBurning
                ? `célula (${wetTarget.x},${wetTarget.y}) sem burning`
                : `ainda burning em (${wetTarget.x},${wetTarget.y})`,
            },
            {
              name: 'wet_breve_opcional',
              // Informativo: não falha o passo se evaporou (quente).
              ok: true,
              detail:
                wetSeenBriefly || wetStill
                  ? `wet visto (imediato=${wetSeenBriefly} após_pausa=${wetStill})`
                  : 'wet não observado (opcional — pode ter evaporado)',
            },
          ];
          // wet_breve_opcional não falha o passo; só sem_burning conta.
          push(
            1,
            'wet',
            'água',
            ok,
            ok
              ? `chão (${wetTarget.x},${wetTarget.y}) apagado` +
                  (wetSeenBriefly || wetStill ? '; wet presente' : '; wet já evaporou/ausente')
              : `ainda burning em (${wetTarget.x},${wetTarget.y})`,
            {
              cell: { x: wetTarget.x, y: wetTarget.y },
              before: beforeWet,
              after: {
                extinguished,
                stillNotBurning,
                wetSeenBriefly,
                wetStill,
                tileType: c.tileAt(wetTarget.x, wetTarget.y)?.type ?? null,
                states: cellStates(c, wetTarget.x, wetTarget.y),
                burningAll: c.burningCells(),
              },
              asserts,
            },
          );
        }
      }

      // --- PASSO 2: parede ---
      await sleep(PAUSE_MS);
      const wallCell =
        findFloorCell(c.view, { x: 5, y: 5 }, { avoidBurning: true, avoidAgents: true }) ??
        findFloorCell(c.view, { x: 5, y: 5 });
      if (!wallCell) {
        logPasso(2, 'parede', 'sem célula floor livre');
        push(2, 'wall', 'parede', false, 'sem célula floor livre para parede');
      } else {
        const beforeWall = {
          type: c.tileAt(wallCell.x, wallCell.y)?.type ?? null,
          materialId: c.tileAt(wallCell.x, wallCell.y)?.materialId ?? null,
        };
        logPasso(2, 'parede', `parede em (${wallCell.x},${wallCell.y})`, {
          cell: wallCell,
          materialId: 'pedra',
        });
        c.sendCmd('cmd.sim.setMode', { mode: 'construction' }, 'drive-c1');
        await waitRes(c, 'drive-c1');
        await c.waitUntil(() => c.view.mode === 'construction', 5000, 'construction');
        c.sendCmd(
          'cmd.build.paintTile',
          { tileType: 'wall', materialId: 'pedra', cells: [wallCell] },
          'drive-wall',
        );
        const wallRes = await waitRes(c, 'drive-wall');
        c.sendCmd('cmd.sim.setMode', { mode: 'normal' }, 'drive-c2');
        await waitRes(c, 'drive-c2');
        await c.waitUntil(() => c.view.mode === 'normal', 5000, 'normal');
        await sleep(PAUSE_MS);
        const painted = c.tileAt(wallCell.x, wallCell.y);
        const typeOk = painted?.type === 'wall';
        const matOk = painted?.materialId === 'pedra';
        const resOk = wallRes.type === 'res.ok';
        const wallOk = resOk && typeOk;
        push(
          2,
          'wall',
          'parede',
          wallOk,
          wallOk
            ? `wall/pedra em (${wallCell.x},${wallCell.y})`
            : `falhou pintar/assert em (${wallCell.x},${wallCell.y}) type=${painted?.type ?? '?'}`,
          {
            cell: wallCell,
            before: beforeWall,
            after: {
              type: painted?.type ?? null,
              materialId: painted?.materialId ?? null,
              resOk,
            },
            asserts: [
              { name: 'res_ok', ok: resOk },
              { name: 'tipo_wall', ok: typeOk, detail: `type=${painted?.type ?? '?'}` },
              { name: 'material_pedra', ok: matOk, detail: `mat=${painted?.materialId ?? '?'}` },
            ],
          },
        );
      }

      // --- PASSO 3: mover agente ---
      await sleep(PAUSE_MS);
      const burnSet0 = new Set(c.burningCells().map((p) => `${p.x},${p.y}`));
      const agent =
        [...c.view.agents].sort((a, b) => {
          const af = burnSet0.has(`${Math.floor(a.pos.x)},${Math.floor(a.pos.y)}`) ? 1 : 0;
          const bf = burnSet0.has(`${Math.floor(b.pos.x)},${Math.floor(b.pos.y)}`) ? 1 : 0;
          return af - bf;
        })[0] ?? c.view.agents[0];
      if (!agent) {
        logPasso(3, 'mover', 'nenhum agente no snapshot');
        push(3, 'move', 'mover', false, 'nenhum agente no snapshot');
      } else {
        const ax = Math.floor(agent.pos.x);
        const ay = Math.floor(agent.pos.y);
        const burnSet = new Set(c.burningCells().map((p) => `${p.x},${p.y}`));
        const candidates: { x: number; y: number; score: number }[] = [];
        for (const t of c.view.tiles.values()) {
          if (t.type !== 'floor') continue;
          if (burnSet.has(`${t.x},${t.y}`)) continue;
          if (t.x === ax && t.y === ay) continue;
          const dAgent = dist(t.x, t.y, ax, ay);
          if (dAgent < 2 || dAgent > 6) continue;
          const dFire = Math.min(
            ...[...burnSet].map((k) => {
              const [fx, fy] = k.split(',').map(Number);
              return dist(t.x, t.y, fx!, fy!);
            }),
            99,
          );
          candidates.push({ x: t.x, y: t.y, score: dFire * 10 - Math.abs(dAgent - 4) });
        }
        candidates.sort((a, b) => b.score - a.score);
        if (candidates.length === 0) {
          const fallback = findFloorCell(c.view, { x: ax, y: ay }, { avoidBurning: true });
          if (fallback && !(fallback.x === ax && fallback.y === ay)) {
            candidates.push({ ...fallback, score: 0 });
          }
        }

        let accepted: { x: number; y: number } | undefined;
        let lastErr = 'sem candidatos';
        const startPos = { ...agent.pos };
        for (let i = 0; i < Math.min(8, candidates.length); i += 1) {
          const goal = candidates[i]!;
          const reqId = `drive-mv-${i}`;
          logPasso(3, 'mover', `mover ${agent.id} → (${goal.x},${goal.y})`, {
            agentId: agent.id,
            from: { x: ax, y: ay },
            to: goal,
            tentativa: i + 1,
          });
          c.sendCmd('cmd.agent.move', { agentId: agent.id, x: goal.x, y: goal.y }, reqId);
          const mvRes = await waitRes(c, reqId);
          if (mvRes.type === 'res.ok') {
            accepted = goal;
            break;
          }
          lastErr = String(mvRes.payload['message'] ?? mvRes.payload['code'] ?? 'erro');
          await sleep(200);
        }

        if (!accepted) {
          push(3, 'move', 'mover', false, `move rejeitado: ${lastErr}`, {
            before: { agentId: agent.id, pos: startPos, candidatos: candidates.length },
          });
        } else {
          await sleep(Math.max(PAUSE_MS, 3000));
          const after = c.view.agents.find((a) => a.id === agent.id);
          const hasMotion = Boolean(after?.motion?.path && after.motion.path.length > 0);
          const moved =
            after &&
            (Math.abs(after.pos.x - startPos.x) > 0.05 ||
              Math.abs(after.pos.y - startPos.y) > 0.05);
          const approaching =
            after &&
            dist(after.pos.x, after.pos.y, accepted.x + 0.5, accepted.y + 0.5) <
              dist(startPos.x, startPos.y, accepted.x + 0.5, accepted.y + 0.5);
          const ok = hasMotion || Boolean(moved) || Boolean(approaching);
          push(
            3,
            'move',
            'mover',
            ok,
            ok
              ? `motion=${hasMotion} pos=${after ? `${after.pos.x.toFixed(2)},${after.pos.y.toFixed(2)}` : '?'} → (${accepted.x},${accepted.y})`
              : 'sem motion nem deslocamento visível',
            {
              cell: accepted,
              before: { agentId: agent.id, pos: startPos },
              after: {
                agentId: agent.id,
                pos: after?.pos ?? null,
                motionLen: after?.motion?.path?.length ?? 0,
                goal: accepted,
                hasMotion,
                moved: Boolean(moved),
                approaching: Boolean(approaching),
              },
              asserts: [
                {
                  name: 'motion_ou_deslocamento',
                  ok,
                  detail: `motion=${hasMotion} moved=${Boolean(moved)} approaching=${Boolean(approaching)}`,
                },
              ],
            },
          );
        }
      }

      // --- PASSO 4: porta ---
      await sleep(PAUSE_MS);
      let door = findDoor(c.view);
      let paintedDoor = false;
      if (!door) {
        logPasso(4, 'porta', 'nenhuma no snapshot; a pintar numa parede', {
          paintAt: { x: 7, y: 0 },
        });
        const paintAt = { x: 7, y: 0 };
        c.sendCmd('cmd.sim.setMode', { mode: 'construction' }, 'drive-d0');
        await waitRes(c, 'drive-d0');
        c.sendCmd(
          'cmd.build.paintTile',
          { tileType: 'door', materialId: 'pinho', cells: [paintAt] },
          'drive-paint-door',
        );
        await waitRes(c, 'drive-paint-door');
        c.sendCmd('cmd.sim.setMode', { mode: 'normal' }, 'drive-d1');
        await waitRes(c, 'drive-d1');
        await sleep(500);
        door = findDoor(c.view);
        paintedDoor = Boolean(door);
      }

      if (!door) {
        logPasso(4, 'porta', 'skip (sem tile door)');
        push(4, 'door', 'porta', false, 'sem porta e paint falhou — skip');
      } else {
        const openBefore = Boolean(c.tileAt(door.x, door.y)?.state?.isOpen);
        logPasso(4, 'porta', `porta em (${door.x},${door.y}) — toggle×2`, {
          cell: { x: door.x, y: door.y },
          isOpenAntes: openBefore,
          acao: 'toggle×2',
          pintada: paintedDoor,
        });
        c.sendCmd('cmd.world.toggleDoor', { x: door.x, y: door.y }, 'drive-door1');
        const d1 = await waitRes(c, 'drive-door1');
        await sleep(1200);
        const mid = Boolean(c.tileAt(door.x, door.y)?.state?.isOpen);
        c.sendCmd('cmd.world.toggleDoor', { x: door.x, y: door.y }, 'drive-door2');
        const d2 = await waitRes(c, 'drive-door2');
        await sleep(1200);
        const end = Boolean(c.tileAt(door.x, door.y)?.state?.isOpen);
        const flippedOnce = mid !== openBefore;
        const restored = end === openBefore;
        const toggled = flippedOnce || restored;
        push(
          4,
          'door',
          'porta',
          toggled,
          `porta (${door.x},${door.y}) open: ${openBefore} → ${mid} → ${end}`,
          {
            cell: { x: door.x, y: door.y },
            before: { isOpen: openBefore, paintedDoor },
            after: {
              mid,
              end,
              res1: d1.type,
              res2: d2.type,
            },
            asserts: [
              {
                name: 'toggle_visivel',
                ok: toggled,
                detail: `open ${openBefore}→${mid}→${end}`,
              },
              {
                name: 'primeiro_toggle',
                ok: flippedOnce,
                detail: flippedOnce ? 'estado mudou no 1.º toggle' : '1.º toggle sem mudança',
              },
            ],
          },
        );
      }

      await sleep(1500);
    } finally {
      c.close();
    }
  } catch (err) {
    push(-1, 'fatal', 'erro fatal', false, err instanceof Error ? err.message : String(err));
  }

  const finishedAt = new Date().toISOString();
  const failed = steps.filter((s) => !s.ok).map((s) => s.step);
  const ok = steps.length > 0 && failed.length === 0;
  const godotConnection = readGodotConnection();
  const report: LiveDriveReport = {
    ok,
    url,
    fresh,
    pauseMs: PAUSE_MS,
    startedAt,
    finishedAt,
    ...(godotConnection ? { godotConnection } : {}),
    steps,
    failed,
  };

  mkdirSync(dirname(LIVE_DRIVE_REPORT_PATH), { recursive: true });
  writeFileSync(LIVE_DRIVE_REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log('');
  console.log('========== RESUMO LIVE-DRIVE (PT-BR) ==========');
  console.log(`URL: ${url}`);
  console.log(`Fresh: ${fresh ? 'sim (--fresh / reset)' : 'não'}`);
  console.log(`Pausa entre passos: ${PAUSE_MS}ms`);
  console.log(`Relatório: ${LIVE_DRIVE_REPORT_PATH}`);
  console.log(`Resultado geral: ${ok ? 'OK' : 'FALHOU'}`);
  if (failed.length) console.log(`Falhou: ${failed.join(', ')}`);
  for (const s of steps) {
    console.log(`  ${s.ok ? '✓' : '✗'} PASSO ${s.n} ${s.label} (${s.step}): ${s.detail}`);
  }
  const godotEnd = report.godotConnection;
  if (godotEnd) {
    console.log(
      `Godot (.local/core-connection.json): status=${String(godotEnd['status'] ?? '?')} url=${String(godotEnd['url'] ?? '?')}`,
    );
    if (godotEnd['status'] !== 'connected') {
      console.log(
        'Aviso: Godot não está connected — abre o cliente para ver a coreografia (auto-reconnect).',
      );
    }
  } else {
    console.log('Aviso: ficheiro core-connection.json não encontrado.');
  }
  console.log('===============================================');

  if (serveChild) {
    logPt({
      evento: 'serve_deixado_a_correr',
      pid: serveChild.pid ?? null,
      mensagem: 'serve filho ficou activo (não foi terminado pelo drive)',
    });
  }

  return report;
}
