import type { AgentSummary, Desk, EquityPoint, Position, Side } from "./types";

/**
 * Client-side live engine for the simulation. It moves the monitor the way the
 * agent runtime would: positions open, mature, and close, and the summary +
 * equity curve are recomputed from the position list — never patched ad hoc, so
 * the numbers stay coherent (equity = start + net PnL; holders 70% / burn 10% of
 * net realised profit). In live mode the real agent supplies these instead.
 */

const HOLDER_SHARE = 0.7;
const BURN_SHARE = 0.1;
const HOUR = 3_600_000;

const UNIVERSE: Record<Desk, string[]> = {
  prediction: ["TSLAx", "HOODx", "NVDAx", "COINx", "BTC", "ETH", "SOL", "CPI", "FOMC"],
  degen: ["RIBBIT", "ROBINWOOD", "WAGMI", "HOODIE", "VLAD", "CAT", "PICKLE", "DIH"],
  futures: ["BTC-PERP", "ETH-PERP", "SOL-PERP", "HYPE-PERP", "HOOD-PERP"],
};

const MODEL: Record<Desk, { win: number; sizes: [number, number]; win_m: [number, number]; loss_m: [number, number] }> = {
  prediction: { win: 0.66, sizes: [400, 1400], win_m: [0.2, 0.95], loss_m: [0.3, 1] },
  degen: { win: 0.54, sizes: [300, 1500], win_m: [0.3, 2.6], loss_m: [0.4, 1] },
  futures: { win: 0.6, sizes: [900, 3200], win_m: [0.12, 0.7], loss_m: [0.2, 0.6] },
};

const R = () => Math.random();
const between = (a: number, b: number) => a + R() * (b - a);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(R() * xs.length)];

let seq = 0;
function hash(): string {
  let out = "0x";
  for (let i = 0; i < 64; i += 1) out += Math.floor(R() * 16).toString(16);
  return out;
}

function noteFor(desk: Desk, side: Side, conviction: number): string {
  const c = conviction > 0.7 ? "high" : conviction < 0.55 ? "thin" : "mixed";
  if (desk === "degen") return pick([`Flow turning; ${c} conviction, tight invalidation.`, `Breakout on volume — sizing ${c}.`]);
  if (desk === "futures") return pick([`Trend + funding favour ${side}; ${c} edge.`, `Positioned ${side} pre-catalyst, defined risk.`]);
  return pick([`Tape supports ${side}; ${(conviction * 100).toFixed(0)}% is where I'd seal it.`, `Consensus looks mispriced — ${c} edge.`]);
}

function titleFor(desk: Desk, subject: string, side: Side, lev: number): string {
  if (desk === "prediction") return `${subject} ${side === "yes" ? "closes green" : "fails to hold"} this week`;
  if (desk === "futures") return `${lev}× ${side} ${subject} into the catalyst`;
  return `${side === "long" ? "Momentum long" : "Fade"} ${subject}`;
}

/** Open a fresh position, sealed now. */
export function makeLivePosition(now: number): Position {
  const desk = pick(["prediction", "prediction", "degen", "degen", "futures", "degen"] as Desk[]);
  const m = MODEL[desk];
  const subject = pick(UNIVERSE[desk]);
  const side: Side = desk === "prediction" ? (R() < 0.62 ? "yes" : "no") : R() < 0.72 ? "long" : "short";
  const conviction = Number(between(0.52, 0.9).toFixed(2));
  const leverage = desk === "futures" ? Math.round(between(2, 10)) : 0;
  const size = Math.round(between(m.sizes[0], m.sizes[1]) / 10) * 10;
  const horizon = Math.round(between(6, 96) * HOUR);
  return {
    id: `POS-L${seq++}-${Math.floor(R() * 1e5)}`,
    desk,
    subject,
    title: titleFor(desk, subject, side, leverage),
    note: noteFor(desk, side, conviction),
    side,
    conviction,
    leverage,
    size,
    sealedAt: now,
    closedAt: now + horizon,
    hash: hash(),
    status: "open",
    pnl: null,
    brier: null,
  };
}

/** Resolve an open position to a realised close. Returns a new Position (immutable). */
export function resolveLive(pos: Position, now: number): Position {
  const m = MODEL[pos.desk];
  const won = R() < m.win;
  const mag = won ? between(m.win_m[0], m.win_m[1]) : -between(m.loss_m[0], m.loss_m[1]);
  const pnl = Math.round(pos.size * mag);
  let brier: number | null = null;
  if (pos.desk === "prediction") {
    const pYes = pos.side === "yes" ? pos.conviction : 1 - pos.conviction;
    const outcomeYes = won ? pYes > 0.5 : pYes <= 0.5;
    brier = Number(((pYes - (outcomeYes ? 1 : 0)) ** 2).toFixed(4));
  }
  return { ...pos, status: won ? "won" : "lost", pnl, brier, closedAt: now };
}

/** Recompute the summary + equity curve from the current position list. */
export function recomputeMonitor(
  base: AgentSummary,
  positions: Position[],
  now: number,
): { agent: AgentSummary; equity: EquityPoint[] } {
  const closed = positions.filter((p) => p.status !== "open").sort((a, b) => a.closedAt - b.closedAt);
  let eq = base.startEquity;
  let won = 0;
  const first = closed[0]?.sealedAt ?? base.since;
  const equity: EquityPoint[] = [{ t: first, equity: base.startEquity }];
  for (const p of closed) {
    const g = p.pnl ?? 0;
    if (g >= 0) won += 1;
    eq += g;
    equity.push({ t: p.closedAt, equity: Math.round(eq) });
  }
  equity.push({ t: now, equity: Math.round(eq) });

  const net = eq - base.startEquity;
  const dist = Math.max(0, net);
  const pred = closed.filter((p) => p.desk === "prediction" && p.brier != null);
  const brier = pred.length ? pred.reduce((s, p) => s + (p.brier ?? 0), 0) / pred.length : 0.25;
  let streak = 0;
  for (let i = closed.length - 1; i >= 0; i -= 1) {
    if (closed[i].status === "won") streak += 1;
    else break;
  }

  const agent: AgentSummary = {
    ...base,
    status: "Trading",
    equity: Math.round(eq),
    realisedPnl: Math.round(net),
    open: positions.filter((p) => p.status === "open").length,
    closed: closed.length,
    won,
    lost: closed.length - won,
    brier: Number(brier.toFixed(4)),
    streak,
    holderPool: Math.round(dist * HOLDER_SHARE),
    burned: Math.round(dist * BURN_SHARE),
  };
  return { agent, equity };
}
