import type { Config } from "./config.js";
import type { Llm } from "./llm.js";
import type { MarketFeed } from "./market.js";
import type { Executor } from "./executor.js";
import type { Radar } from "./radar.js";
import type { Desk, Position } from "./types.js";
import { riskGate, type RiskContext } from "./risk.js";
import { sealHash } from "./seal.js";
import { nextId, recompute, type Persisted } from "./state.js";
import { deskWeight, learnFromClose, learningSummary } from "./learning.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DESKS: Desk[] = ["prediction", "degen", "futures"];
const SIGNAL_CAP = 80;

export interface Deps {
  llm: Llm;
  feed: MarketFeed;
  executor: Executor;
  radar: Radar;
  log: (msg: string) => void;
}

/**
 * One step of the trading loop over `dtHours`:
 *   advance the world → close matured positions → score → let the brain open new
 *   ones (gated). Every open is sealed before it exists on the book. Returns the
 *   number of positions opened this tick.
 */
export async function tick(state: Persisted, deps: Deps, cfg: Config, dtHours: number): Promise<number> {
  const { feed, executor, radar, llm, log } = deps;

  state.runtime.clock += Math.round(dtHours * HOUR);
  feed.advance(dtHours);
  const quotes = feed.quotes();

  // Radar: pick up fresh on-chain / social signals, newest first, capped.
  const fresh = await radar.emit(quotes, state.runtime.clock);
  if (fresh.length) state.signals = [...fresh, ...state.signals].slice(0, SIGNAL_CAP);

  // Day rollover anchors the kill-switch to realised PnL since the day began.
  if (state.runtime.clock - state.runtime.dayAnchorClock >= DAY) {
    state.runtime.dayAnchorClock = state.runtime.clock;
    state.runtime.dayStartNetRealised = state.agent.realisedPnl;
  }

  closeMatured(state, executor, feed, log);
  const netRealised = recompute(state, cfg);
  const dayRealisedPnl = netRealised - state.runtime.dayStartNetRealised;

  let opened = 0;
  if (!state.meta.paused) {
    // The agent's own record, so the brain reasons against what has actually worked.
    const record = learningSummary(state.learning);
    for (const desk of DESKS) {
      const openOnDesk = state.positions.filter((p) => p.status === "open" && p.desk === desk).length;
      const ctx: RiskContext = {
        equity: state.agent.equity,
        openCount: state.positions.filter((p) => p.status === "open").length,
        openOnDesk,
        dayRealisedPnl,
        sizeWeight: deskWeight(state.learning, desk),
      };

      let decision;
      try {
        decision = await llm.decide(desk, quotes, state.signals, ctx.equity, openOnDesk, record);
      } catch (err) {
        log(`brain error on ${desk}: ${(err as Error).message}`);
        continue;
      }

      const verdict = riskGate(desk, decision, ctx, cfg);
      if (!verdict.ok) {
        if (decision.act) log(`skip ${desk} ${decision.subject}: ${verdict.reason}`);
        continue;
      }

      const sealedAt = state.runtime.clock;
      const hash = sealHash(desk, decision, verdict.size, sealedAt);
      const entryPrice = executor.open(decision.subject, feed);
      const horizonMs = Math.round(decision.horizonHours * HOUR);
      // Tie the trade back to the radar: the signal that led it is now "acted on",
      // and its type is remembered on the position so the learning loop can score
      // which kinds of signals actually pay off.
      const led = state.signals.find((s) => s.subject === decision.subject && !s.actedOn);
      const pos: Position = {
        id: nextId(state.positions),
        desk,
        subject: decision.subject,
        title: decision.title,
        note: decision.note,
        side: decision.side,
        conviction: decision.conviction,
        leverage: verdict.leverage,
        size: verdict.size,
        sealedAt,
        closedAt: sealedAt + horizonMs,
        hash,
        status: "open",
        pnl: null,
        brier: null,
        leadType: led ? led.type : null,
        entryPrice,
        targetHorizonMs: horizonMs,
      };
      state.positions.push(pos);
      opened += 1;
      if (led) led.actedOn = true;
      log(`SEAL ${desk} ${pos.side.toUpperCase()} ${pos.subject} ${verdict.size} USDG @ ${entryPrice} (${hash.slice(0, 12)}…)`);
    }
  }

  recompute(state, cfg);
  return opened;
}

function closeMatured(state: Persisted, executor: Executor, feed: MarketFeed, log: (m: string) => void): void {
  for (const pos of state.positions) {
    if (pos.status !== "open") continue;
    if (state.runtime.clock < pos.closedAt) continue;
    const { pnl, brier } = executor.close(pos, feed);
    pos.pnl = pnl;
    pos.brier = brier;
    pos.status = pnl >= 0 ? "won" : "lost";
    pos.closedAt = state.runtime.clock;
    // The agent learns from every close — this updates the desk weights + signal memory.
    learnFromClose(state.learning, pos, state.runtime.clock);
    log(`CLOSE ${pos.desk} ${pos.subject} ${pos.status.toUpperCase()} ${pnl >= 0 ? "+" : ""}${pnl} USDG`);
  }
}
