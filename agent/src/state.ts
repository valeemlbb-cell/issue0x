import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import type { Config } from "./config.js";
import type { AgentState, EquityPoint, Position } from "./types.js";
import { initLearning, normalizeLearning } from "./learning.js";

/**
 * Persistence and aggregates. The equity curve and the holder/burn figures are
 * derived from the closed positions exactly the way the frontend simulation and
 * web/src/lib/isx.ts define them: equity = start + cumulative net PnL, and holder
 * (70%) + burn (10%) are paid out of *net* realised profit, never gross wins — so
 * holders can never be credited more than the agent actually made.
 */

const HANDLE = "ISSUE0X";
const AVATAR = "/agents/oracle";

export function freshState(cfg: Config, clock: number): Persisted {
  return {
    agent: {
      handle: HANDLE,
      avatar: AVATAR,
      since: clock,
      status: "Trading",
      equity: cfg.startEquity,
      startEquity: cfg.startEquity,
      realisedPnl: 0,
      open: 0,
      closed: 0,
      won: 0,
      lost: 0,
      brier: 0.25,
      streak: 0,
      holderPool: 0,
      burned: 0,
    },
    positions: [],
    equity: [{ t: clock, equity: cfg.startEquity }],
    signals: [],
    learning: initLearning(clock),
    meta: { dataSource: cfg.mode, model: modelLabel(cfg), updatedAt: clock, paused: false },
    runtime: { clock, dayAnchorClock: clock, dayStartNetRealised: 0 },
  };
}

export interface Persisted extends AgentState {
  runtime: { clock: number; dayAnchorClock: number; dayStartNetRealised: number };
}

function modelLabel(cfg: Config): string {
  return cfg.llmProvider === "anthropic" ? cfg.model : "mock";
}

export function loadState(cfg: Config, clock: number): Persisted {
  if (!existsSync(cfg.statePath)) return freshState(cfg, clock);
  try {
    const raw = JSON.parse(readFileSync(cfg.statePath, "utf8")) as Persisted;
    if (!raw.agent || !Array.isArray(raw.positions)) return freshState(cfg, clock);
    if (!Array.isArray(raw.signals)) raw.signals = [];
    raw.learning = normalizeLearning(raw.learning, clock); // backfill for states saved before learning existed
    return raw;
  } catch {
    return freshState(cfg, clock);
  }
}

export function saveState(cfg: Config, state: Persisted): void {
  const tmp = cfg.statePath + ".tmp";
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, cfg.statePath); // atomic-ish: never a half-written state.json
}

/** Recompute the summary + equity curve from positions. Returns net realised PnL. */
export function recompute(state: Persisted, cfg: Config): number {
  const positions = state.positions;
  const closed = positions
    .filter((p) => p.status !== "open")
    .sort((a, b) => a.closedAt - b.closedAt);

  let equityVal = cfg.startEquity;
  let won = 0;
  const first = closed[0]?.sealedAt ?? state.agent.since;
  const equity: EquityPoint[] = [{ t: first, equity: cfg.startEquity }];
  for (const p of closed) {
    const g = p.pnl ?? 0;
    if (g >= 0) won += 1;
    equityVal += g;
    equity.push({ t: p.closedAt, equity: Math.round(equityVal) });
  }
  equity.push({ t: state.runtime.clock, equity: Math.round(equityVal) });

  const netRealised = equityVal - cfg.startEquity;
  const distributable = Math.max(0, netRealised);

  const predClosed = closed.filter((p) => p.desk === "prediction" && p.brier != null);
  const brierMean =
    predClosed.length > 0
      ? predClosed.reduce((s, p) => s + (p.brier ?? 0), 0) / predClosed.length
      : 0.25;

  let streak = 0;
  for (let i = closed.length - 1; i >= 0; i -= 1) {
    if (closed[i].status === "won") streak += 1;
    else break;
  }

  state.equity = equity;
  state.agent = {
    ...state.agent,
    status: state.meta.paused ? "Paused" : "Trading",
    equity: Math.round(equityVal),
    startEquity: cfg.startEquity,
    realisedPnl: Math.round(netRealised),
    open: positions.filter((p) => p.status === "open").length,
    closed: closed.length,
    won,
    lost: closed.length - won,
    brier: Number(brierMean.toFixed(4)),
    streak,
    holderPool: Math.round(distributable * cfg.holderShare),
    burned: Math.round(distributable * cfg.burnShare),
  };
  state.meta = { ...state.meta, dataSource: cfg.mode, model: modelLabel(cfg), updatedAt: state.runtime.clock };
  return netRealised;
}

/** The public view for the frontend — everything but the internal runtime block. */
export function publicView(state: Persisted): AgentState {
  return {
    agent: state.agent,
    positions: state.positions,
    equity: state.equity,
    signals: state.signals,
    learning: state.learning,
    meta: state.meta,
  };
}

export function nextId(positions: Position[]): string {
  const n = positions.length + 1;
  return `POS-${String(4000 + n * 13).slice(-4)}`;
}
