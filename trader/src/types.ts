/** Shared types for the issue0x-trader bot. */

export type Mode = "paper" | "live";

export interface StrategyConfig {
  /** Minimum heat (0–100) to consider an entry. */
  minHeat: number;
  /** Require the token's flow state to be accumulating. */
  requireAccumulating: boolean;
  /** Require positive smart-money net flow. */
  requireSmartInflow: boolean;
  /** Skip tokens flagged concentrated / serial-rug / dev-selling / thin liq. */
  avoidRisky: boolean;
  /** ETH notional per position. */
  positionSizeEth: number;
  /** Max concurrent open positions. */
  maxPositions: number;
  /** Take-profit as a fraction, e.g. 0.4 = +40%. */
  takeProfitPct: number;
  /** Stop-loss as a fraction, e.g. 0.2 = −20%. */
  stopLossPct: number;
  /** Force-close a position after this many minutes regardless of price. */
  maxHoldMin: number;
  /** Exit early if the token flips to distributing. */
  exitOnDistribution: boolean;
}

export interface Config {
  mode: Mode;
  /** issue0x scanner API base — the deployed agent. */
  apiBase: string;
  /** Robinhood Chain JSON-RPC (live mode only). */
  rpcUrl: string;
  chainId: number;
  /** Path to a file holding the trading wallet's private key (live mode only).
   *  The key is read locally and never transmitted. */
  keyFile: string | null;
  /** A Uniswap-V2-style router for live swaps (graduated tokens). Live mode only. */
  routerAddress: string | null;
  /** WETH / wrapped-native address for the router path (live mode only). */
  wethAddress: string | null;
  /** Seconds between scan/decision cycles. */
  intervalSec: number;
  /** The user must set these true to enable live trading. */
  feeAcknowledged: boolean;
  riskAcknowledged: boolean;
  strategy: StrategyConfig;
}

/** A token as the scanner sees it (subset of the agent's TokenIntel we use). */
export interface Signal {
  symbol: string;
  token: string;
  priceUsd: number;
  heat: number;
  heatBand: "hot" | "warm" | "cold";
  state: "accumulating" | "distributing" | "neutral";
  smartNetFlowUsd: number;
  smartBuyers: number;
  concentrated: boolean;
  serialRugger: boolean;
  deployerSelling: boolean;
  liqHealth: "thin" | "ok" | "deep" | null;
  priceChange1h: number | null;
}

export type PositionStatus = "open" | "tp" | "sl" | "timeout" | "flip" | "closed";

export interface Position {
  id: string;
  token: string;
  symbol: string;
  mode: Mode;
  status: PositionStatus;
  sizeEth: number;
  entryPriceUsd: number;
  entryAt: number;
  /** Operator fee charged on entry (ETH), always disclosed. */
  entryFeeEth: number;
  exitPriceUsd: number | null;
  exitAt: number | null;
  exitFeeEth: number;
  /** Position P&L in ETH notional (net of the operator fee). Null while open. */
  pnlEth: number | null;
  pnlPct: number | null;
  reason: string;
  entryTx: string | null;
  exitTx: string | null;
}

export interface BotState {
  positions: Position[];
  realizedPnlEth: number;
  feesPaidEth: number;
  startedAt: number | null;
  cycles: number;
}
