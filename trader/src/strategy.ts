/** The trading strategy — pure decision logic over the scanner's signals. Entry and
 *  exit rules are all driven by config so a user can tune them without touching code.
 *  This is a heuristic momentum strategy on smart-money flow, not financial advice. */

import type { Config, Position, PositionStatus, Signal } from "./types.js";

/** Does a signal pass the entry filter? */
export function isEntry(s: Signal, cfg: Config): boolean {
  const st = cfg.strategy;
  if (s.heat < st.minHeat) return false;
  if (st.requireAccumulating && s.state !== "accumulating") return false;
  if (st.requireSmartInflow && s.smartNetFlowUsd <= 0) return false;
  if (st.avoidRisky && (s.concentrated || s.serialRugger || s.deployerSelling || s.liqHealth === "thin")) return false;
  if (s.priceUsd <= 0) return false;
  return true;
}

/** Pick new tokens to open, respecting maxPositions and skipping ones already held. */
export function pickEntries(signals: Signal[], open: Position[], cfg: Config): Signal[] {
  const held = new Set(open.map((p) => p.token.toLowerCase()));
  const slots = cfg.strategy.maxPositions - open.length;
  if (slots <= 0) return [];
  return signals
    .filter((s) => !held.has(s.token.toLowerCase()) && isEntry(s, cfg))
    .sort((a, b) => b.heat - a.heat)
    .slice(0, slots);
}

export interface ExitDecision {
  close: boolean;
  status: PositionStatus;
  reason: string;
  pnlPct: number;
}

/** Decide whether to close an open position, given its current signal (or null if the
 *  token aged off the radar — we can't mark it, so we hold and let the timeout catch it). */
export function evaluateExit(pos: Position, current: Signal | null, cfg: Config, now: number): ExitDecision {
  const st = cfg.strategy;
  const ageMin = (now - pos.entryAt) / 60_000;

  if (current && current.priceUsd > 0 && pos.entryPriceUsd > 0) {
    const pnlPct = (current.priceUsd - pos.entryPriceUsd) / pos.entryPriceUsd;
    if (pnlPct >= st.takeProfitPct) return { close: true, status: "tp", reason: `take-profit +${Math.round(pnlPct * 100)}%`, pnlPct };
    if (pnlPct <= -st.stopLossPct) return { close: true, status: "sl", reason: `stop-loss ${Math.round(pnlPct * 100)}%`, pnlPct };
    if (st.exitOnDistribution && current.state === "distributing")
      return { close: true, status: "flip", reason: "flipped to distributing", pnlPct };
    if (ageMin >= st.maxHoldMin) return { close: true, status: "timeout", reason: `held ${Math.round(ageMin)}m`, pnlPct };
    return { close: false, status: "open", reason: "holding", pnlPct };
  }

  // No fresh price — only the timeout can act.
  if (ageMin >= st.maxHoldMin) return { close: true, status: "timeout", reason: `held ${Math.round(ageMin)}m, no price`, pnlPct: 0 };
  return { close: false, status: "open", reason: "holding (no price)", pnlPct: 0 };
}
