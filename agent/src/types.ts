/**
 * The agent's types. The persisted state.json is written in exactly the shape the
 * frontend reads (web/src/lib/types.ts), so the UI can consume it with no mapping.
 * Keep the Position / AgentSummary / EquityPoint fields in sync with that file.
 */

export type Desk = "prediction" | "degen" | "futures";
export type PositionStatus = "open" | "won" | "lost";
export type Side = "yes" | "no" | "long" | "short";

/** Public position — the shape the frontend renders. */
export interface Position {
  id: string;
  desk: Desk;
  subject: string;
  title: string;
  note: string;
  side: Side;
  conviction: number; // 0–1
  leverage: number; // 0 unless futures
  size: number; // USDG of protocol capital committed
  sealedAt: number; // ms epoch, immutable
  closedAt: number; // ms epoch (expected while open, actual once closed)
  hash: string; // commit hash sealed before open
  status: PositionStatus;
  pnl: number | null; // USDG, negative on a loss
  brier: number | null; // prediction desk only

  /** The radar signal type that led this position, if any — feeds the learning loop. */
  leadType?: SignalType | null;

  /** Runtime-only bookkeeping (ignored by the UI). */
  entryPrice?: number;
  targetHorizonMs?: number;
}

export interface EquityPoint {
  t: number;
  equity: number;
}

export interface AgentSummary {
  handle: string;
  avatar: string | null;
  since: number;
  status: string;
  equity: number;
  startEquity: number;
  realisedPnl: number;
  open: number;
  closed: number;
  won: number;
  lost: number;
  brier: number;
  streak: number;
  holderPool: number;
  burned: number;
}

/** The whole persisted state (and the /state response body). */
export interface AgentState {
  agent: AgentSummary;
  positions: Position[];
  equity: EquityPoint[];
  signals: Signal[];
  learning: Learning;
  meta: {
    dataSource: "simulation" | "paper" | "live";
    model: string;
    updatedAt: number;
    paused: boolean;
  };
}

/** A quote from the market-data feed. */
export interface Quote {
  subject: string;
  desk: Desk;
  /** Reference price (or implied P(yes) for a prediction market), used to mark/close. */
  price: number;
  /** Short human context the brain can read: momentum, headline, funding, etc. */
  context: string;
}

/* ---------- Radar (mirrors web/src/lib/types.ts) ---------- */

export type SignalType = "smart-money" | "kol" | "listing" | "whale" | "unlock";
export type SignalStrength = "low" | "medium" | "high";

/** On-chain provenance for a signal — what makes it verifiable, not just asserted. */
export interface SignalSource {
  txHash?: string; // the settling transaction on Robinhood Chain
  wallet?: string; // the acting wallet
  venue?: string; // e.g. "pons", "blockscout"
}

export interface Signal {
  id: string;
  type: SignalType;
  subject: string;
  desk: Desk | null;
  actor: string;
  detail: string;
  strength: SignalStrength;
  at: number;
  actedOn: boolean;
  /** Where this came from — a real tx hash the reader can open on the explorer. */
  source?: SignalSource;
}

/* ---------- Learning (the agent adapting from its own record) ---------- */

/** Per-desk online estimate: a recency-decayed Beta posterior + a PnL EMA, which
 *  together set a size multiplier the risk gate applies. */
export interface DeskLearning {
  desk: Desk;
  closed: number;
  won: number;
  pnl: number;
  alpha: number; // Beta posterior, wins side
  beta: number; // Beta posterior, losses side
  pnlEma: number; // EMA of pnl/size per close
  weight: number; // resulting size multiplier, clamped [0.5, 1.5]
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
  lessons: string[]; // short plain-English takeaways derived from the record
  updatedAt: number;
}

/** What the brain is asked to produce for a single desk. */
export interface Decision {
  act: boolean; // false = sit this desk out this tick
  subject: string;
  side: Side;
  conviction: number; // 0–1
  leverage: number; // 0 unless futures
  sizePct: number; // % of equity to commit (risk gate clamps this)
  horizonHours: number; // how long the position is expected to run
  title: string; // one-line headline
  note: string; // one-line sealed reasoning
}
