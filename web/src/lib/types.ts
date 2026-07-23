/**
 * Domain types for issue0x — ONE agent, trading, monitored.
 *
 * The whole interface is a window onto a single agentic trader: the positions it
 * takes across three desks, sealed before they open and scored on the real close,
 * and the value that flows to $ISX holders from its wins. There is no marketplace
 * of forecasters here and no leaderboard — just the one agent's record.
 */

export type Desk = "prediction" | "degen" | "futures";

export type PositionStatus = "open" | "won" | "lost";

/** Which way the position leans, for the sealed-intent line. */
export type Side = "yes" | "no" | "long" | "short";

export interface Position {
  id: string;
  desk: Desk;
  /** Short subject tag, e.g. "TSLAx", "BTC-PERP", "$WIF", "CPI". */
  subject: string;
  /** The sealed headline — what the agent is doing, one line. */
  title: string;
  /** One line of sealed reasoning, committed with the position. */
  note: string;
  side: Side;
  /** Prediction desk: sealed P(yes), 0–1. Other desks: conviction, 0–1. */
  conviction: number;
  /** Futures leverage, e.g. 3 → shown "3×". 0 when not applicable. */
  leverage: number;
  /** Protocol capital deployed, in USDG. */
  size: number;
  /** Immutable: sealed before the position opened. */
  sealedAt: number;
  /** When it closed, or (while open) when it is expected to resolve. */
  closedAt: number;
  /** Commit hash of the sealed position. */
  hash: string;
  status: PositionStatus;
  /** Realised PnL in USDG once closed (negative on a loss), else null. */
  pnl: number | null;
  /** Prediction desk only: Brier contribution once resolved, else null. */
  brier: number | null;
}

export interface EquityPoint {
  t: number;
  /** Protocol trading capital at this time, in USDG. */
  equity: number;
}

export interface DeskStat {
  desk: Desk;
  open: number;
  closed: number;
  won: number;
  /** Realised PnL across this desk's closed positions, USDG. */
  pnl: number;
}

export interface AgentSummary {
  handle: string;
  avatar: string | null;
  since: number;
  /** Live status line, e.g. "Trading". */
  status: string;

  /** Trading capital now (last equity point), USDG. */
  equity: number;
  /** Seeded starting capital, USDG. */
  startEquity: number;
  /** Net realised PnL across every closed position, USDG. */
  realisedPnl: number;

  open: number;
  closed: number;
  won: number;
  lost: number;
  /** Mean Brier over resolved prediction-desk positions, 0…1 (lower is better). */
  brier: number;
  /** Consecutive wins, current. */
  streak: number;

  /** Cumulative to the holder rewards pool (70% of gross winning profit), USDG. */
  holderPool: number;
  /** Cumulative profit routed to buy $ISX and burn it (10%), USDG. */
  burned: number;
}

export const DESK_LABEL: Record<Desk, string> = {
  prediction: "Prediction",
  degen: "Degen",
  futures: "Futures",
};

/* ---------- Radar: what the agent watches on-chain ---------- */

export type SignalType = "smart-money" | "kol" | "listing" | "whale" | "unlock";

export type SignalStrength = "low" | "medium" | "high";

/** On-chain provenance — what makes a signal verifiable, not just asserted. */
export interface SignalSource {
  /** The settling transaction hash on Robinhood Chain, openable on the explorer. */
  txHash?: string;
  /** The acting wallet. */
  wallet?: string;
  /** Where it came from, e.g. "pons", "blockscout". */
  venue?: string;
}

/** A single on-chain / social event on the radar — the chain's news feed. */
export interface Signal {
  id: string;
  type: SignalType;
  /** Token or subject the signal is about. */
  subject: string;
  desk: Desk | null;
  /** Who: a labelled smart-money wallet or a KOL handle. */
  actor: string;
  /** One human-readable line. */
  detail: string;
  strength: SignalStrength;
  at: number;
  /** Whether the agent opened a position off the back of this signal. */
  actedOn: boolean;
  /** Real on-chain source (tx hash + wallet). Absent on simulated signals. */
  source?: SignalSource;
}

export const SIGNAL_LABEL: Record<SignalType, string> = {
  "smart-money": "Smart money",
  kol: "KOL call",
  listing: "New listing",
  whale: "Whale move",
  unlock: "Unlock",
};

/** The agent's reasoning for one position, with the signals that informed it. */
export interface Reasoning {
  position: Position;
  signals: Signal[];
}

/* ---------- Learning: the agent adapting from its own record ---------- */

/** Per-desk online estimate → a size multiplier the risk gate applies. */
export interface DeskLearning {
  desk: Desk;
  closed: number;
  won: number;
  pnl: number;
  alpha: number;
  beta: number;
  pnlEma: number;
  /** Size multiplier, clamped [0.5, 1.5]; >1 = the desk earned more size. */
  weight: number;
}

/** Which radar signal types have actually led to winning trades. */
export interface TypeLearning {
  type: SignalType;
  acted: number;
  won: number;
  pnl: number;
}

export interface Learning {
  desks: DeskLearning[];
  signalTypes: TypeLearning[];
  lessons: string[];
  updatedAt: number;
}
