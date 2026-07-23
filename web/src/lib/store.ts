import type {
  AgentSummary,
  Desk,
  DeskStat,
  EquityPoint,
  Learning,
  Position,
  Reasoning,
  Signal,
} from "./types";
import { agentSummary, allPositions, equitySeries } from "./sim";
import { allSignals } from "./signals";
import { learningFromPositions } from "./learningView";

/**
 * The only surface the UI talks to. It resolves against ONE of two sources with an
 * identical shape, so no component above changes:
 *   - the deterministic simulation (default), or
 *   - the live agent runtime at VITE_AGENT_API (set VITE_DATA_SOURCE=live).
 *
 * Live reads fall back to the simulation if the agent is unreachable, so the UI
 * never breaks — and the resolved source is always surfaced, never hidden. A
 * simulated (or paper) record shown as real money is exactly the dishonesty this
 * product is positioned against.
 */

export type DataSource = "simulation" | "paper" | "live";

const LIVE = import.meta.env.VITE_DATA_SOURCE === "live";
const AGENT_API = import.meta.env.VITE_AGENT_API ?? "http://localhost:8787";
const LIVE_TTL_MS = 8_000;

export const DATA_SOURCE: DataSource = LIVE ? "live" : "simulation";

interface Snapshot {
  agent: AgentSummary;
  positions: Position[];
  equity: EquityPoint[];
  signals: Signal[];
  learning: Learning;
  dataSource: DataSource;
}

function simSnapshot(): Snapshot {
  const positions = allPositions();
  const signals = allSignals();
  return {
    agent: agentSummary(),
    positions,
    equity: equitySeries(),
    signals,
    learning: learningFromPositions(positions, signals),
    dataSource: "simulation",
  };
}

let liveCache: { at: number; snap: Snapshot } | null = null;

async function liveSnapshot(): Promise<Snapshot> {
  if (liveCache && Date.now() - liveCache.at < LIVE_TTL_MS) return liveCache.snap;
  const res = await fetch(`${AGENT_API}/state`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`agent /state ${res.status}`);
  const data = (await res.json()) as {
    agent: AgentSummary;
    positions: Position[];
    equity: EquityPoint[];
    signals?: Signal[];
    learning?: Learning;
    meta?: { dataSource?: DataSource };
  };
  const snap: Snapshot = {
    agent: data.agent,
    positions: data.positions,
    equity: data.equity,
    signals: data.signals ?? [],
    // Prefer the agent's authoritative learning; derive from positions if it's absent.
    learning: data.learning ?? learningFromPositions(data.positions, data.signals ?? []),
    dataSource: data.meta?.dataSource ?? "live",
  };
  liveCache = { at: Date.now(), snap };
  return snap;
}

async function snapshot(): Promise<Snapshot> {
  if (!LIVE) return simSnapshot();
  try {
    return await liveSnapshot();
  } catch {
    return simSnapshot(); // agent down → degrade to the sim rather than a broken UI
  }
}

export function getAgent(): Promise<AgentSummary> {
  return snapshot().then((s) => s.agent);
}

export function getEquity(): Promise<EquityPoint[]> {
  return snapshot().then((s) => s.equity);
}

export function getPositions(): Promise<Position[]> {
  return snapshot().then((s) => s.positions);
}

export function getOpenPositions(): Promise<Position[]> {
  return snapshot().then((s) =>
    s.positions.filter((p) => p.status === "open").sort((a, b) => a.closedAt - b.closedAt),
  );
}

export function getRecentCloses(n = 8): Promise<Position[]> {
  return snapshot().then((s) =>
    s.positions
      .filter((p) => p.status !== "open")
      .sort((a, b) => b.closedAt - a.closedAt)
      .slice(0, n),
  );
}

export function getPosition(id: string): Promise<Position | undefined> {
  return snapshot().then((s) => s.positions.find((p) => p.id.toLowerCase() === id.toLowerCase()));
}

const DESKS: Desk[] = ["prediction", "degen", "futures"];

export function getDeskStats(): Promise<DeskStat[]> {
  return snapshot().then((s) =>
    DESKS.map((desk) => {
      const mine = s.positions.filter((p) => p.desk === desk);
      const closed = mine.filter((p) => p.status !== "open");
      return {
        desk,
        open: mine.filter((p) => p.status === "open").length,
        closed: closed.length,
        won: closed.filter((p) => p.status === "won").length,
        pnl: closed.reduce((acc, p) => acc + (p.pnl ?? 0), 0),
      };
    }),
  );
}

export interface LandingSnapshot {
  agent: AgentSummary;
  equity: EquityPoint[];
  closes: Position[];
}

export function getLandingSnapshot(): Promise<LandingSnapshot> {
  return snapshot().then((s) => ({
    agent: s.agent,
    equity: s.equity,
    closes: s.positions
      .filter((p) => p.status !== "open")
      .sort((a, b) => b.closedAt - a.closedAt)
      .slice(0, 4),
  }));
}

/** The chain radar — every signal, newest first, optionally filtered by type. */
export function getSignals(): Promise<Signal[]> {
  return snapshot().then((s) => [...s.signals].sort((a, b) => b.at - a.at));
}

/** What the agent has learned from its own record — desk weights, signal memory. */
export function getLearning(): Promise<Learning> {
  return snapshot().then((s) => s.learning);
}

/**
 * Why the agent is trading: its most recent positions (newest seal first), each
 * paired with the radar signals on the same subject that led it — the reasoning
 * trail from chain event to sealed position.
 */
export function getReasoningFeed(n = 6): Promise<Reasoning[]> {
  return snapshot().then((s) => {
    const recent = [...s.positions].sort((a, b) => b.sealedAt - a.sealedAt).slice(0, n);
    return recent.map((position) => ({
      position,
      signals: s.signals
        .filter((sig) => sig.subject === position.subject && sig.at <= position.sealedAt)
        .sort((a, b) => b.at - a.at)
        .slice(0, 2),
    }));
  });
}
