import type { Config } from "./config.js";
import type { Desk, Quote } from "./types.js";
import { DEGEN_SYMBOLS } from "./tokens.js";

/**
 * The market-data feed. Everything the brain reads about the world, and the prices
 * the paper executor marks against, comes through here.
 *
 * MockFeed is a seeded synthetic universe: prices random-walk, predictions carry a
 * hidden truth probability for resolution. It lets the whole runtime run offline.
 * RealFeed is the seam for a live Robinhood Chain data source — wire MARKET_DATA_URL.
 */
export interface MarketFeed {
  readonly name: string;
  /** Advance the world by this many (sim or wall-clock) hours. */
  advance(hours: number): void;
  quotes(): Quote[];
  priceOf(subject: string): number | undefined;
  /** For prediction subjects: the hidden probability the event resolves yes. */
  truthOf(subject: string): number | undefined;
}

const UNIVERSE: Record<Desk, string[]> = {
  prediction: ["TSLAx", "HOODx", "NVDAx", "COINx", "BTC", "ETH", "SOL", "CPI", "FOMC"],
  // Real Robinhood Chain memecoins — see src/tokens.ts.
  degen: DEGEN_SYMBOLS,
  futures: ["BTC-PERP", "ETH-PERP", "SOL-PERP", "HYPE-PERP"],
};

const VOL: Record<Desk, number> = { prediction: 0.03, degen: 0.11, futures: 0.06 };

interface Sym {
  desk: Desk;
  price: number;
  prev: number;
  truth: number; // only meaningful for prediction
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

function gaussian(rand: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class MockFeed implements MarketFeed {
  readonly name = "mock";
  private rand = mulberry32(0x155eed);
  private syms = new Map<string, Sym>();

  constructor() {
    for (const desk of Object.keys(UNIVERSE) as Desk[]) {
      for (const subject of UNIVERSE[desk]) {
        const price = desk === "prediction" ? 0.35 + this.rand() * 0.3 : 50 + this.rand() * 200;
        this.syms.set(subject, { desk, price, prev: price, truth: 0.3 + this.rand() * 0.4 });
      }
    }
  }

  advance(hours: number): void {
    const scale = Math.sqrt(Math.max(0.1, hours) / 24);
    for (const s of this.syms.values()) {
      s.prev = s.price;
      const step = gaussian(this.rand) * VOL[s.desk] * scale;
      if (s.desk === "prediction") {
        // Implied probability drifts toward its hidden truth, plus noise.
        s.price = clamp01(s.price + (s.truth - s.price) * 0.1 + step * 0.5);
      } else {
        s.price = Math.max(0.0001, s.price * (1 + step));
      }
    }
  }

  quotes(): Quote[] {
    const out: Quote[] = [];
    for (const [subject, s] of this.syms) {
      const mom = (s.price - s.prev) / (s.prev || 1);
      out.push({
        subject,
        desk: s.desk,
        price: Number(s.price.toFixed(s.desk === "prediction" ? 3 : 4)),
        context: contextFor(s.desk, mom),
      });
    }
    return out;
  }

  priceOf(subject: string): number | undefined {
    return this.syms.get(subject)?.price;
  }
  truthOf(subject: string): number | undefined {
    const s = this.syms.get(subject);
    return s?.desk === "prediction" ? s.truth : undefined;
  }
}

/** Live feed seam. Not wired — throws with guidance until MARKET_DATA_URL is real. */
export class RealFeed implements MarketFeed {
  readonly name = "real";
  constructor(private url: string) {}
  private notWired(): never {
    throw new Error(
      `RealFeed is not implemented yet. Wire it to your Robinhood Chain data source at ${this.url} ` +
        "(prices for perps/tokens, implied odds + resolution source for prediction markets), " +
        "then return live Quotes here. Until then run with MARKET_DATA_URL blank (MockFeed).",
    );
  }
  advance(): void {
    /* live data advances itself */
  }
  quotes(): Quote[] {
    this.notWired();
  }
  priceOf(): number | undefined {
    this.notWired();
  }
  truthOf(): number | undefined {
    this.notWired();
  }
}

function contextFor(desk: Desk, mom: number): string {
  const dir = mom > 0.005 ? "up" : mom < -0.005 ? "down" : "flat";
  if (desk === "prediction") {
    return dir === "up" ? "implied odds firming" : dir === "down" ? "odds fading" : "odds steady";
  }
  if (desk === "degen") {
    return dir === "up" ? "breaking out on volume" : dir === "down" ? "rolling over" : "chopping sideways";
  }
  return dir === "up" ? "trend + funding favour longs" : dir === "down" ? "trend down, funding heavy" : "range-bound";
}

function clamp01(v: number): number {
  return Math.min(0.97, Math.max(0.03, v));
}

export function makeFeed(cfg: Config): MarketFeed {
  return cfg.marketDataUrl ? new RealFeed(cfg.marketDataUrl) : new MockFeed();
}
