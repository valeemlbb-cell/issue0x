import type {
  AgentSummary,
  Desk,
  EquityPoint,
  Position,
  PositionStatus,
  Side,
} from "./types";
import { between, hex, mulberry32, pick } from "./rng";

/**
 * Deterministic simulation of ONE agentic trader — issue0x — standing in for the
 * live agent until a trading API is wired. It is the single source for every
 * figure the monitor renders. Unlike a demo, the positions here are *scored*: each
 * closes to a real PnL, wins and losses both, and the agent's record and the
 * holder pool fall out of those closes rather than being decorative.
 *
 * Seeded so nothing reshuffles on refresh — a monitor whose record changed each
 * reload would undercut the one thing this product sells.
 *
 * When the real agent is connected, this module is replaced and `store.ts` keeps
 * its shape.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const SIM_NOW = Date.UTC(2026, 6, 22, 15, 0); // 2026-07-22 15:00, fixed

/** How realised profit is split (mirrors src/lib/isx.ts). The remaining 20%
 *  compounds the desk, so it is just what is left after these two. */
const HOLDER_SHARE = 0.7;
const BURN_SHARE = 0.1;

/** The protocol capital the desk was seeded with, USDG. */
const START_EQUITY = 50_000;

const AGENT = {
  handle: "ISSUE0X",
  avatar: "/issue0x-avatar",
} as const;

/** Per-desk character: how often it wins, and how large its swings are. */
const DESK_MODEL: Record<
  Desk,
  { win: number; winMul: [number, number]; lossMul: [number, number]; size: [number, number] }
> = {
  // Prediction is the most calibrated desk: wins often, modest payoffs.
  prediction: { win: 0.67, winMul: [0.2, 0.95], lossMul: [0.35, 1], size: [400, 1400] },
  // Degen is a coin-flip with fat tails: fewer wins, occasional moonshots.
  degen: { win: 0.54, winMul: [0.3, 2.6], lossMul: [0.4, 1], size: [300, 1500] },
  // Futures sits between, with leverage doing the amplifying.
  futures: { win: 0.6, winMul: [0.12, 0.7], lossMul: [0.18, 0.6], size: [900, 3200] },
};

const SUBJECTS: Record<Desk, readonly string[]> = {
  prediction: ["TSLAx", "HOODx", "NVDAx", "COINx", "MSTRx", "BTC", "ETH", "SOL", "CPI", "FOMC"],
  // Real Robinhood Chain memecoins (from the Blockscout explorer, chainId 4663).
  degen: ["RIBBIT", "ROBINWOOD", "WAGMI", "HOODIE", "VLAD", "CAT", "PICKLE", "DIH"],
  futures: ["BTC-PERP", "ETH-PERP", "SOL-PERP", "HYPE-PERP", "HOOD-PERP"],
};

const CATALYSTS = ["CPI", "the FOMC print", "options expiry", "the weekly close", "the funding flip", "the ETF flow"];

function predictionTitle(rand: () => number, s: string, side: Side): string {
  const dir = side === "yes" ? "closes green" : "fails to hold";
  return pick(rand, [
    `${s} ${dir} this week`,
    `${s} ${side === "yes" ? "sets a new weekly high" : "breaks its weekly low"} before Friday`,
    `${s} ${side === "yes" ? "is up" : "is down"} week-over-week at the close`,
  ]);
}

function degenTitle(rand: () => number, s: string, side: Side): string {
  const verb = side === "long" ? "Momentum long" : "Fade the pump on";
  return pick(rand, [
    `${verb} ${s}`,
    `${side === "long" ? "Riding" : "Shorting"} ${s} off the ${pick(rand, ["breakout", "reclaim", "wick", "volume spike"])}`,
  ]);
}

function futuresTitle(rand: () => number, s: string, side: Side, lev: number): string {
  return `${lev}× ${side} ${s} into ${pick(rand, CATALYSTS)}`;
}

function noteFor(rand: () => number, desk: Desk, conviction: number, side: Side): string {
  const c = conviction > 0.7 ? "high" : conviction < 0.55 ? "thin" : "mixed";
  if (desk === "prediction") {
    return pick(rand, [
      `Tape supports ${side}; ${(conviction * 100).toFixed(0)}% is where I'd seal it.`,
      `Consensus looks mispriced — ${c} conviction on ${side}.`,
      `Clean setup, ${c} edge. Sealing ${side} at ${(conviction * 100).toFixed(0)}%.`,
    ]);
  }
  if (desk === "degen") {
    return pick(rand, [
      `Flow and socials both turning; ${c} conviction, tight invalidation.`,
      `${side === "long" ? "Breakout" : "Blow-off"} confirmed on volume — sizing ${c}.`,
      `Asymmetric here: small size, ${c} conviction, let it run.`,
    ]);
  }
  return pick(rand, [
    `Trend intact into the catalyst; ${c} conviction, stop below structure.`,
    `Funding favours ${side}; ${c} edge, leverage kept sane.`,
    `Positioned ${side} pre-print — ${c} conviction, defined risk.`,
  ]);
}

interface Built {
  positions: Position[];
  equity: EquityPoint[];
  agent: AgentSummary;
}

let cache: Built | null = null;

function build(): Built {
  const N = 58;
  const positions: Position[] = [];

  // Positions are seeded across the last ~34 days, chronological.
  for (let i = 0; i < N; i += 1) {
    const r = mulberry32(0x155 + i * 2657);
    const desk = pick(r, ["prediction", "prediction", "degen", "degen", "futures", "futures", "prediction", "futures"] as Desk[]);
    const model = DESK_MODEL[desk];
    const subject = pick(r, SUBJECTS[desk]);

    // Side: prediction yes/no, others long/short (long-biased).
    const side: Side =
      desk === "prediction"
        ? r() < 0.62 ? "yes" : "no"
        : r() < 0.72 ? "long" : "short";

    const conviction = Number(between(r, 0.52, 0.9).toFixed(2));
    const leverage = desk === "futures" ? Math.round(between(r, 2, 10)) : 0;
    const size = Math.round(between(r, model.size[0], model.size[1]) / 10) * 10;

    const sealedAt = SIM_NOW - between(r, 0.4, 34) * DAY;
    const horizon = between(r, 0.6, 7) * DAY;
    const closedAt = sealedAt + horizon;
    const isOpen = closedAt > SIM_NOW;

    const title =
      desk === "prediction"
        ? predictionTitle(r, subject, side)
        : desk === "degen"
          ? degenTitle(r, subject, side)
          : futuresTitle(r, subject, side, leverage);

    let status: PositionStatus = "open";
    let pnl: number | null = null;
    let brier: number | null = null;

    if (!isOpen) {
      const won = r() < model.win;
      status = won ? "won" : "lost";
      const mag = won
        ? between(r, model.winMul[0], model.winMul[1])
        : -between(r, model.lossMul[0], model.lossMul[1]);
      pnl = Math.round(size * mag);
      if (desk === "prediction") {
        // Agent's stated P(yes), then Brier against the realised outcome.
        const pYes = side === "yes" ? conviction : 1 - conviction;
        const outcomeYes = won ? pYes > 0.5 : pYes <= 0.5;
        brier = Number(((pYes - (outcomeYes ? 1 : 0)) ** 2).toFixed(4));
      }
    }

    positions.push({
      id: `POS-${String(4000 + i * 13).slice(-4)}`,
      desk,
      subject,
      title,
      note: noteFor(r, desk, conviction, side),
      side,
      conviction,
      leverage,
      size,
      sealedAt,
      closedAt,
      hash: hex(r, 32),
      status,
      pnl,
      brier,
    });
  }

  // Chronological closes drive the equity curve and the aggregates.
  const closed = positions
    .filter((p) => p.status !== "open")
    .sort((a, b) => a.closedAt - b.closedAt);

  // The equity curve is the desk's trading book: start plus the full realised PnL
  // of every close, wins and losses both — the conventional equity path. Holder and
  // burn distributions are funded from realised *profit* (below), never letting
  // holders be paid more than the agent actually netted.
  let equityVal = START_EQUITY;
  let won = 0;
  const equity: EquityPoint[] = [{ t: closed[0] ? closed[0].sealedAt : SIM_NOW - 34 * DAY, equity: START_EQUITY }];
  for (const p of closed) {
    const g = p.pnl ?? 0;
    if (g >= 0) won += 1;
    equityVal += g;
    equity.push({ t: p.closedAt, equity: Math.round(equityVal) });
  }
  equity.push({ t: SIM_NOW, equity: Math.round(equityVal) });

  const netRealised = equityVal - START_EQUITY;
  // Distribute only out of net profit: nothing to pay in a losing stretch.
  const distributable = Math.max(0, netRealised);

  // Brier over resolved prediction positions only.
  const predClosed = closed.filter((p) => p.desk === "prediction" && p.brier != null);
  const brierMean =
    predClosed.length > 0
      ? predClosed.reduce((s, p) => s + (p.brier ?? 0), 0) / predClosed.length
      : 0.25;

  // Current win streak, counting back from the most recent close.
  let streak = 0;
  for (let i = closed.length - 1; i >= 0; i -= 1) {
    if (closed[i].status === "won") streak += 1;
    else break;
  }

  const agent: AgentSummary = {
    handle: AGENT.handle,
    avatar: AGENT.avatar,
    since: SIM_NOW - 34 * DAY,
    status: "Trading",
    equity: Math.round(equityVal),
    startEquity: START_EQUITY,
    realisedPnl: Math.round(netRealised),
    open: positions.filter((p) => p.status === "open").length,
    closed: closed.length,
    won,
    lost: closed.length - won,
    brier: Number(brierMean.toFixed(4)),
    streak,
    holderPool: Math.round(distributable * HOLDER_SHARE),
    burned: Math.round(distributable * BURN_SHARE),
  };

  // Newest sealed first — how the monitor lists them.
  positions.sort((a, b) => b.sealedAt - a.sealedAt);
  return { positions, equity, agent };
}

function built(): Built {
  if (!cache) cache = build();
  return cache;
}

export function allPositions(): Position[] {
  return built().positions;
}
export function equitySeries(): EquityPoint[] {
  return built().equity;
}
export function agentSummary(): AgentSummary {
  return built().agent;
}
