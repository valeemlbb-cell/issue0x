/**
 * A smart-money score from real pons trades.
 *
 * For every wallet we can see, across the tokens in view, we reconstruct a P&L:
 * proceeds from sells, plus the value of what it still holds at the current price,
 * minus what it spent buying. A wallet's score is that P&L shrunk toward zero for
 * thin trade counts, so a couple of lucky fills can't top the board.
 *
 * Honest limits: this only sees the tokens we polled (not a wallet's whole book),
 * marks unrealised gains at the current price, and is per-venue (pons only). It is
 * a heuristic for "who's actually up here", not a certified track record.
 */

export interface TradeLite {
  side: string;
  recipient: string;
  valueUsd: number;
  /** Token amount, already scaled to human units. */
  tokenAmount: number;
}

export interface TokenTrades {
  symbol: string;
  priceUsd: number;
  trades: TradeLite[];
}

/** Per-token contribution to a wallet's P&L — the detail behind an expanded row. */
export interface WalletTokenPnl {
  symbol: string;
  token?: string; // token address — present in wallet-detail so rows can link
  trades: number;
  buyUsd: number;
  sellUsd: number;
  holdingUsd: number; // remaining tokens marked at the current price
  pnlUsd: number;
}

export type WalletTier = "elite" | "sniper" | "smart" | "whale" | "active" | "trader";

export interface WalletScore {
  wallet: string;
  pnlUsd: number;
  realizedUsd: number; // booked on sells
  unrealizedUsd: number; // open, marked at the current price
  winRate: number; // raw hit rate across tokens
  winRateLB: number; // Wilson lower bound — the trusted number
  tokens: number; // distinct tokens traded
  trades: number;
  volumeUsd: number;
  score: number;
  tier: WalletTier;
  earlyBuys: number; // times among a token's first buyers (agent scan only)
  holdMedianMin: number | null; // median FIFO hold time
  flipper: boolean; // churns fast (< 15m median)
  diamond: boolean; // holds most of what it bought, up on it
  txCount: number | null; // total on-chain txs (age proxy)
  fresh: boolean; // very new wallet (few txs)
  breakdown?: WalletTokenPnl[]; // per-token detail, biggest movers first
  simulated?: boolean;
}

/** Wilson score lower bound (z=1.64 ≈ 90%) — turns 1/1 into ~0.21, not 1.0. */
export function wilsonLower(pos: number, n: number, z = 1.64): number {
  if (n <= 0) return 0;
  const phat = pos / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
  return Math.max(0, (centre - margin) / denom);
}

/** The behavioural tier a wallet has earned; the rarest, highest-signal label wins. */
export function tierFor(w: WalletScore): WalletTier {
  const eff = w.score;
  if (eff >= 10000 && w.trades >= 10 && w.winRateLB >= 0.55 && w.realizedUsd > 0) return "elite";
  if (w.earlyBuys >= 3 && w.pnlUsd > 0) return "sniper";
  if (eff >= 2000 && w.trades >= 6 && w.winRateLB >= 0.5) return "smart";
  if (w.volumeUsd >= 3000) return "whale";
  if (w.trades >= 25) return "active";
  return "trader";
}

const SHRINK = 5; // a wallet needs roughly this many trades before its P&L is trusted
const MIN_TRADES = 2;

interface Pos {
  buyUsd: number;
  sellUsd: number;
  buyTok: number;
  sellTok: number;
  trades: number;
}

/** Rank wallets by shrunk realised+unrealised P&L across the observed tokens. */
export function scoreWallets(tokens: TokenTrades[], topN = 8): WalletScore[] {
  const acc = new Map<string, Map<string, Pos>>();
  const priceBySym = new Map(tokens.map((t) => [t.symbol, t.priceUsd]));

  for (const tk of tokens) {
    for (const t of tk.trades) {
      const w = (t.recipient || "").toLowerCase();
      if (!w) continue;
      let byTok = acc.get(w);
      if (!byTok) acc.set(w, (byTok = new Map()));
      let p = byTok.get(tk.symbol);
      if (!p) byTok.set(tk.symbol, (p = { buyUsd: 0, sellUsd: 0, buyTok: 0, sellTok: 0, trades: 0 }));
      p.trades += 1;
      if (t.side === "buy") {
        p.buyUsd += t.valueUsd;
        p.buyTok += t.tokenAmount;
      } else if (t.side === "sell") {
        p.sellUsd += t.valueUsd;
        p.sellTok += t.tokenAmount;
      }
    }
  }

  const out: WalletScore[] = [];
  for (const [wallet, byTok] of acc) {
    let pnl = 0;
    let realized = 0;
    let unrealized = 0;
    let wins = 0;
    let vol = 0;
    let trades = 0;
    let toks = 0;
    const breakdown: WalletTokenPnl[] = [];
    for (const [sym, p] of byTok) {
      const remaining = Math.max(0, p.buyTok - p.sellTok);
      const price = priceBySym.get(sym) ?? 0;
      const holdingUsd = remaining * price;
      const tokenPnl = p.sellUsd + holdingUsd - p.buyUsd;
      const avgCost = p.buyTok > 0 ? p.buyUsd / p.buyTok : 0;
      realized += p.sellUsd - avgCost * Math.min(p.sellTok, p.buyTok);
      unrealized += holdingUsd - avgCost * remaining;
      pnl += tokenPnl;
      if (tokenPnl > 0) wins += 1;
      vol += p.buyUsd + p.sellUsd;
      trades += p.trades;
      toks += 1;
      breakdown.push({
        symbol: sym,
        trades: p.trades,
        buyUsd: Math.round(p.buyUsd),
        sellUsd: Math.round(p.sellUsd),
        holdingUsd: Math.round(holdingUsd),
        pnlUsd: Math.round(tokenPnl),
      });
    }
    if (trades < MIN_TRADES) continue;
    breakdown.sort((a, b) => Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd));
    const w: WalletScore = {
      wallet,
      pnlUsd: Math.round(pnl),
      realizedUsd: Math.round(realized),
      unrealizedUsd: Math.round(unrealized),
      winRate: toks ? wins / toks : 0,
      winRateLB: wilsonLower(wins, toks),
      tokens: toks,
      trades,
      volumeUsd: Math.round(vol),
      score: pnl * (trades / (trades + SHRINK)),
      tier: "trader",
      earlyBuys: 0, // the client snapshot can't see first-buyer ordering; agent fills this
      holdMedianMin: null,
      flipper: false,
      diamond: false,
      txCount: null,
      fresh: false,
      breakdown,
    };
    w.tier = tierFor(w);
    out.push(w);
  }

  return out.sort((a, b) => b.score - a.score).slice(0, topN);
}

/** Deterministic-ish simulated leaderboard for when pons is unreachable. */
export function simScores(n = 8): WalletScore[] {
  const R = () => Math.random();
  const hex = () => Math.floor(R() * 16).toString(16);
  const addr = () => `0x${Array.from({ length: 4 }, hex).join("")}·${Array.from({ length: 4 }, hex).join("")}`;
  const tiers: WalletTier[] = ["elite", "sniper", "smart", "whale", "active", "trader"];
  return Array.from({ length: n }, () => {
    const pnl = Math.round((R() * R() * 40000 - 3000));
    const trades = Math.round(4 + R() * 60);
    const wr = 0.4 + R() * 0.5;
    return {
      wallet: addr(),
      pnlUsd: pnl,
      realizedUsd: Math.round(pnl * (0.3 + R() * 0.5)),
      unrealizedUsd: Math.round(pnl * (0.2 + R() * 0.4)),
      winRate: wr,
      winRateLB: Math.max(0, wr - 0.2),
      tokens: 1 + Math.round(R() * 8),
      trades,
      volumeUsd: Math.round(Math.abs(pnl) * (2 + R() * 6)),
      score: pnl * (trades / (trades + SHRINK)),
      tier: tiers[Math.floor(R() * tiers.length)],
      earlyBuys: Math.round(R() * 5),
      holdMedianMin: Math.round(R() * 240),
      flipper: R() > 0.7,
      diamond: R() > 0.7,
      txCount: Math.round(R() * 500),
      fresh: R() > 0.85,
      simulated: true,
    } satisfies WalletScore;
  })
    .sort((a, b) => b.score - a.score);
}
