import type { Config } from "./config.js";
import type { MarketFeed } from "./market.js";
import type { Position } from "./types.js";

/**
 * Execution. PaperExecutor never moves funds: it records the entry price at open
 * and computes realised PnL at close from the same feed, resolving predictions
 * against their hidden truth. RealExecutor is the seam for on-chain trades on
 * Robinhood Chain — deliberately unimplemented until MODE=live and a real wallet.
 */
export interface Executor {
  readonly name: string;
  /** Returns the entry price recorded at open. */
  open(subject: string, feed: MarketFeed): number;
  /** Resolves a matured position to realised PnL (USDG) and a Brier (predictions only). */
  close(pos: Position, feed: MarketFeed): { pnl: number; brier: number | null };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class PaperExecutor implements Executor {
  readonly name = "paper";
  private rand = mulberry32(0x9e37_79b9);

  open(subject: string, feed: MarketFeed): number {
    return feed.priceOf(subject) ?? 1;
  }

  close(pos: Position, feed: MarketFeed): { pnl: number; brier: number | null } {
    const entry = pos.entryPrice ?? feed.priceOf(pos.subject) ?? 1;

    if (pos.desk === "prediction") {
      const truth = feed.truthOf(pos.subject) ?? 0.5;
      const outcomeYes = this.rand() < truth;
      const won = (pos.side === "yes" && outcomeYes) || (pos.side === "no" && !outcomeYes);
      const pImplied = pos.side === "yes" ? entry : 1 - entry;
      const payoutMult = Math.min(4, (1 - pImplied) / Math.max(0.05, pImplied));
      const pnl = won ? Math.round(pos.size * payoutMult) : -pos.size;

      const pYes = pos.side === "yes" ? pos.conviction : 1 - pos.conviction;
      const brier = Number(((pYes - (outcomeYes ? 1 : 0)) ** 2).toFixed(4));
      return { pnl, brier };
    }

    // Degen / futures: mark against the current price.
    const close = feed.priceOf(pos.subject) ?? entry;
    const raw = (close - entry) / (entry || 1);
    const ret = pos.side === "short" ? -raw : raw;
    const lev = pos.leverage || 1;
    // Committed capital can be lost in full (liquidation), and upside is uncapped.
    const pnl = Math.round(pos.size * Math.max(-1, ret * lev));
    return { pnl, brier: null };
  }
}

/** Live on-chain execution seam. Not wired — refuses until it's real. */
export class RealExecutor implements Executor {
  readonly name = "real";
  constructor(private rpcUrl: string) {}
  private notWired(): never {
    throw new Error(
      `RealExecutor is not implemented. Wire on-chain trades against ${this.rpcUrl} ` +
        "(open/close on your Robinhood Chain venues, real fills, real settlement) before MODE=live.",
    );
  }
  open(): number {
    this.notWired();
  }
  close(): { pnl: number; brier: number | null } {
    this.notWired();
  }
}

export function makeExecutor(cfg: Config): Executor {
  return cfg.mode === "live" ? new RealExecutor(cfg.executorRpcUrl) : new PaperExecutor();
}
