import type { Config } from "./config.js";
import type { Decision, Desk } from "./types.js";

/**
 * The risk gate sits between the brain and execution. The brain reasons; the gate
 * enforces the limits that keep a bad idea (or a bad tick) from blowing up the
 * desk. It clamps, and it can veto. Nothing opens without passing through here.
 */
export interface RiskContext {
  equity: number;
  openCount: number;
  openOnDesk: number;
  /** Realised PnL since the start of the current day, USDG (negative = underwater). */
  dayRealisedPnl: number;
  /** The desk's learned size multiplier (1 = neutral). Scales the request, then the
   *  hard maxPositionPct cap still applies on top — learning tunes within the limits. */
  sizeWeight: number;
}

export interface RiskVerdict {
  ok: boolean;
  reason: string;
  size: number;
  leverage: number;
}

const MIN_POSITION_USDG = 25;
const MAX_OPEN_PER_DESK = 3;
const CONVICTION_FLOOR = 0.53;

export function riskGate(desk: Desk, d: Decision, ctx: RiskContext, cfg: Config): RiskVerdict {
  const veto = (reason: string): RiskVerdict => ({ ok: false, reason, size: 0, leverage: 0 });

  if (!d.act) return veto("brain chose to sit out");

  // Kill-switch: once a day is far enough underwater, stop opening new risk.
  const dailyFloor = -(cfg.dailyLossLimitPct / 100) * ctx.equity;
  if (ctx.dayRealisedPnl <= dailyFloor) {
    return veto(`daily loss limit hit (${Math.round(ctx.dayRealisedPnl)} ≤ ${Math.round(dailyFloor)} USDG)`);
  }

  if (ctx.openCount >= cfg.maxOpenPositions) return veto("max open positions reached");
  if (ctx.openOnDesk >= MAX_OPEN_PER_DESK) return veto("max open on this desk reached");
  if (d.conviction < CONVICTION_FLOOR) return veto("conviction below floor — no real edge");

  // The learned weight scales the brain's request; the hard cap still bounds it.
  const weightedPct = d.sizePct * (ctx.sizeWeight > 0 ? ctx.sizeWeight : 1);
  const size = Math.round(Math.min(weightedPct, cfg.maxPositionPct) / 100 * ctx.equity);
  if (size < MIN_POSITION_USDG) return veto("position too small to matter");

  const leverage = desk === "futures" ? Math.max(1, Math.min(cfg.maxLeverage, Math.round(d.leverage))) : 0;

  return { ok: true, reason: "ok", size, leverage };
}
