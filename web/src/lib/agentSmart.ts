import type { WalletScore } from "./smartMoney";
import type { PonsBuy } from "./ponsTrades";

export type FlowState = "accumulating" | "distributing" | "neutral";
export type HeatBand = "hot" | "warm" | "cold";

/** A token on the alpha-radar — where smart money + buy pressure are flowing. */
export interface TokenIntel {
  symbol: string;
  token: string;
  priceUsd: number;
  marketCapUsd: number;
  liquidityUsd: number | null;
  ageMin: number | null;
  graduationPct: number | null;
  gradVelocity: number | null;
  etaMin: number | null;
  imminent: boolean;
  buyCount: number;
  sellCount: number;
  buyVolUsd: number;
  sellVolUsd: number;
  netFlowUsd: number;
  pressure: number;
  accel: number;
  uniqueBuyers: number;
  smartBuyers: number;
  smartNetFlowUsd: number;
  smartInflowUsd: number;
  buyerConcentration: number;
  state: FlowState;
  recentBuys: number;
  heat: number; // 0–100
  heatBand: HeatBand;
  /* depth layer: deployer + holder risk */
  deployer: string;
  liqHealth: "thin" | "ok" | "deep" | null;
  deployerSelling: boolean;
  deployerTokens: number;
  deployerGradRate: number;
  serialRugger: boolean;
  top10Pct: number | null;
  devHoldPct: number | null;
  concentrated: boolean;
  bundleWallets: number;
  earlySmartEntry: boolean;
  smartFirstBuyers: number;
  priceChange1h: number | null;
  smartShare: number;
  biggestBuyUsd: number;
  biggestSellUsd: number;
  volume24hUsd: number | null;
  spark: number[];
}

export interface Alert {
  id: string;
  type: "whale" | "cluster" | "heating" | "distribution" | "bundle" | "earlysmart";
  symbol: string;
  token: string;
  wallet?: string;
  detail: string;
  valueUsd: number;
  at: number;
  severity: "high" | "medium";
}

/**
 * The agent runtime's deep smart-money scan (agent/src/smartmoney.ts, served at
 * ${AGENT_API}/smart-money). It scans many more tokens than the browser and
 * accumulates trades across refreshes, so its leaderboard is deeper and its scan is
 * not throttled by the browser's pons rate limit. The Radar prefers this; if the
 * agent is unreachable it falls back to the client-side pons scan, then to sim.
 */

/** The scanner's self-graded track record (agent/src/smartmoney.ts → meta.stats). */
export interface ScanStats {
  uptimeMin: number;
  windowHrs: number;
  walletsTracked: number;
  walletsActive24h: number;
  tokensScanned: number;
  tokensSeen: number;
  tradesObserved: number;
  signals24h: number;
  signalsLogged: number;
  signalsResolved: number;
  signalsHit: number;
  hitRate: number | null;
  avgReturnPct: number | null;
  bestCall: { symbol: string; returnPct: number } | null;
  byType: { type: string; logged: number; resolved: number; hit: number }[];
  alertsLive: number;
}

export interface SmartMeta {
  scannedTokens: number;
  trades: number;
  wallets: number;
  updatedAt: number; // ms epoch of the last successful scan
  source: "pons" | "sim";
  live: boolean;
  activeTotal?: number;
  graduatedTotal?: number;
  launchTotal?: number;
  stats?: ScanStats;
}

export interface AgentSmart {
  scores: WalletScore[];
  tokens: TokenIntel[];
  alerts: Alert[];
  buys: PonsBuy[];
  meta: SmartMeta;
}

const AGENT_API = import.meta.env.VITE_AGENT_API ?? "http://localhost:8787";

/** Fetch the agent's deep scan. Throws if the agent is down or the shape is wrong.
 *  tokens/alerts are tolerated as absent (older agent build) → empty. */
export async function fetchAgentSmartMoney(): Promise<AgentSmart> {
  const res = await fetch(`${AGENT_API}/smart-money`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`agent /smart-money ${res.status}`);
  const d = (await res.json()) as Partial<AgentSmart>;
  if (!d || !Array.isArray(d.scores) || !Array.isArray(d.buys) || !d.meta) {
    throw new Error("agent /smart-money: unexpected shape");
  }
  return {
    scores: d.scores,
    tokens: Array.isArray(d.tokens) ? d.tokens : [],
    alerts: Array.isArray(d.alerts) ? d.alerts : [],
    buys: d.buys,
    meta: d.meta,
  };
}
