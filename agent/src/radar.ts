import type { Config } from "./config.js";
import type { Quote, Signal, SignalStrength, SignalType } from "./types.js";
import type { Watchlist } from "./watchlist.js";
import { DEGEN_SYMBOLS, DEGEN_TOKENS, type TokenRef } from "./tokens.js";

/**
 * The radar: on-chain / social events the agent watches.
 *  - BlockscoutRadar reads REAL Robinhood Chain token transfers from the official
 *    explorer and surfaces the largest recent moves. A wallet only gets a
 *    "smart-money" / KOL label if it's on the operator's curated watchlist —
 *    otherwise it's an anonymous "whale". The agent never invents who is smart.
 *  - MockRadar is the offline stand-in (fictional handles), for running with no
 *    network. It references the same real token tickers.
 */
export interface Radar {
  readonly name: string;
  emit(quotes: Quote[], clock: number): Promise<Signal[]>;
}

const HOUR = 3_600_000;

/* ---------------- Real radar (Blockscout) ---------------- */

export class BlockscoutRadar implements Radar {
  readonly name = "blockscout";
  private seen = new Set<string>();
  private cursor = 0;
  private seq = 0;

  constructor(
    private baseUrl: string,
    private watch: Watchlist,
    private log: (m: string) => void,
    private tokens: TokenRef[] = DEGEN_TOKENS,
  ) {}

  async emit(_quotes: Quote[], clock: number): Promise<Signal[]> {
    if (this.tokens.length === 0) return [];
    // Poll one token per tick to stay light on the explorer.
    const token = this.tokens[this.cursor % this.tokens.length];
    this.cursor += 1;

    let items: RawTransfer[];
    try {
      const url = `${this.baseUrl.replace(/\/$/, "")}/api/v2/tokens/${token.address}/transfers`;
      const res = await fetchJson(url);
      items = Array.isArray(res?.items) ? (res.items as RawTransfer[]) : [];
    } catch (err) {
      this.log(`radar: ${token.symbol} fetch failed: ${(err as Error).message}`);
      return [];
    }

    const fresh = items
      .filter((t) => t.transaction_hash && !this.seen.has(t.transaction_hash))
      .map((t) => ({ t, amt: amountOf(t) }))
      .sort((a, b) => b.amt - a.amt)
      .slice(0, 3); // the biggest new moves this poll

    const out: Signal[] = [];
    for (const { t, amt } of fresh) {
      this.seen.add(t.transaction_hash!);
      const from = t.from?.hash ?? "";
      const to = t.to?.hash ?? "";
      const watched = this.watch.get(from) ?? this.watch.get(to);
      const type: SignalType = watched ? watched.tag : "whale";
      const actor = watched ? watched.label : shortAddr(from || to);
      const dir = watched && this.watch.get(to) ? "accumulated" : "moved";
      out.push({
        id: `SIG-${String(3000 + this.seq++ * 7).slice(-4)}`,
        type,
        subject: token.symbol,
        desk: "degen",
        actor,
        detail: `${actor} ${dir} ${compact(amt)} ${token.symbol}`,
        strength: strengthOf(amt),
        at: t.timestamp ? Date.parse(t.timestamp) || clock : clock,
        actedOn: false,
        source: { txHash: t.transaction_hash, wallet: from || to, venue: "blockscout" },
      });
    }
    if (this.seen.size > 800) this.seen = new Set([...this.seen].slice(-400));
    return out;
  }
}

interface RawTransfer {
  from?: { hash?: string };
  to?: { hash?: string };
  total?: { value?: string; decimals?: string };
  value?: string;
  transaction_hash?: string;
  timestamp?: string;
}

async function fetchJson(url: string): Promise<{ items?: unknown[] }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { items?: unknown[] };
  } finally {
    clearTimeout(timer);
  }
}

function amountOf(t: RawTransfer): number {
  const value = t.total?.value ?? t.value ?? "0";
  const decimals = Number(t.total?.decimals ?? 18);
  try {
    // Scale down with BigInt to survive huge memecoin supplies, keep 4 dp.
    const scaled = BigInt(value) / 10n ** BigInt(Math.max(0, decimals - 4));
    return Number(scaled) / 1e4;
  } catch {
    return 0;
  }
}

function strengthOf(amt: number): SignalStrength {
  return amt >= 5_000_000 ? "high" : amt >= 500_000 ? "medium" : "low";
}

function shortAddr(a: string): string {
  return a && a.length > 12 ? `${a.slice(0, 6)}·${a.slice(-4)}` : a || "unknown";
}

function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

/* ---------------- Mock radar (offline) ---------------- */

const KOLS = ["@chainseer", "@degenoracle", "@0xmaxi", "@tapewatcher", "@liquidiq", "@perp_priest"];
const WHALES = ["whale 0x9c·77", "treasury.eth", "0xdead·beef", "market_maker.eth"];
const SMART = ["0x7f2a·9c1", "earlylp.eth", "sol_sniper.eth", "delta.eth", "0x3ab·d2f"];

export class MockRadar implements Radar {
  readonly name = "mock";
  private rand = mulberry32(0x2ada5);
  private seq = 0;

  async emit(quotes: Quote[], clock: number): Promise<Signal[]> {
    const out: Signal[] = [];
    for (const q of quotes) {
      if (this.rand() > 0.12) continue;
      const type: SignalType =
        q.desk === "degen"
          ? this.rand() > 0.5 ? "smart-money" : "kol"
          : this.rand() > 0.6 ? "smart-money" : this.rand() > 0.5 ? "whale" : "kol";
      const actor = pick(this.rand, type === "kol" ? KOLS : type === "whale" ? WHALES : SMART);
      out.push({
        id: `SIG-${String(3000 + this.seq++ * 7).slice(-4)}`,
        type,
        subject: q.subject,
        desk: q.desk,
        actor,
        detail: mockDetail(type, q.subject, actor, q.context, this.rand),
        strength: strengthOf(8_000 + this.rand() * 6_000_000),
        at: clock - Math.round(this.rand() * 2 * HOUR),
        actedOn: false,
      });
    }
    return out;
  }
}

function mockDetail(type: SignalType, subject: string, actor: string, mom: string, rand: () => number): string {
  const usd = `${Math.round(8 + rand() * 220)}k`;
  switch (type) {
    case "smart-money":
      return `${actor} bought ${usd} of ${subject} — ${mom}`;
    case "kol":
      return `${actor} called ${subject}`;
    case "whale":
      return `${actor} moved ${usd} into ${subject}`;
    case "listing":
      return `${subject} just listed`;
    case "unlock":
      return `${subject} unlock incoming`;
  }
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

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

export { DEGEN_SYMBOLS };

export function makeRadar(cfg: Config, watch: Watchlist, log: (m: string) => void): Radar {
  return cfg.blockscoutUrl ? new BlockscoutRadar(cfg.blockscoutUrl, watch, log) : new MockRadar();
}
