import { fetchPonsPrices } from "./ponsPrices";
import { scoreWallets, type TokenTrades, type WalletScore } from "./smartMoney";
import type { Signal } from "./types";

/**
 * Real activity on the pons launchpad. pons exposes per-token trades at
 * /api/pons-market/{token}/trades — each with side (buy/sell), the trader wallet
 * (recipient), the USD value and the token amount. We fetch the top tokens' trades
 * ONCE and derive two things: the recent big buys (radar Degen feed) and a
 * wallet-level P&L leaderboard (smart-money score).
 *
 * pons rate-limits heavy public access (HTTP 402) — a partner key lifts it. On
 * failure the callers fall back to simulation so nothing blanks.
 */

export interface PonsBuy {
  id: string; // tx hash — unique
  symbol: string;
  token: string;
  wallet: string;
  valueUsd: number;
  at: number; // ms epoch
}

interface RawTrade {
  side?: string;
  timestamp?: number; // seconds
  recipient?: string;
  valueUsd?: number;
  tokenAmount?: string;
  transactionHash?: string;
}

const BASE = import.meta.env.VITE_PONS_API ?? "/pons";
const TOKENS_SCANNED = 8;

async function fetchTrades(token: string): Promise<RawTrade[]> {
  const res = await fetch(`${BASE}/pons-market/${token}/trades?v=2`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`pons trades ${res.status}`);
  const raw = (await res.json()) as unknown;
  return Array.isArray(raw) ? (raw as RawTrade[]) : [];
}

interface Scanned {
  symbol: string;
  token: string;
  priceUsd: number;
  raw: RawTrade[];
}

/** Fetch the top tokens' trades once. Throws if pons is unreachable. */
async function scanTop(): Promise<Scanned[]> {
  const top = await fetchPonsPrices(TOKENS_SCANNED);
  if (!top.length) throw new Error("pons: no tokens");
  const settled = await Promise.allSettled(
    top.map(async (t) => ({ symbol: t.symbol, token: t.token, priceUsd: t.priceUsd, raw: await fetchTrades(t.token) })),
  );
  const ok = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!ok.length) throw new Error("pons: all trade fetches failed");
  return ok;
}

export interface PonsActivity {
  buys: PonsBuy[];
  scores: WalletScore[];
}

/** Real pons activity: recent big buys + a wallet P&L leaderboard, in one scan. */
export async function fetchPonsActivity(minBuyUsd = 20): Promise<PonsActivity> {
  const scanned = await scanTop();

  const buys: PonsBuy[] = [];
  const seen = new Set<string>();
  for (const s of scanned) {
    for (const t of s.raw) {
      if (t.side !== "buy" || typeof t.valueUsd !== "number" || t.valueUsd < minBuyUsd) continue;
      if (!t.transactionHash || seen.has(t.transactionHash)) continue;
      seen.add(t.transactionHash);
      buys.push({
        id: t.transactionHash,
        symbol: s.symbol,
        token: s.token,
        wallet: t.recipient ?? "",
        valueUsd: t.valueUsd,
        at: (t.timestamp ?? 0) * 1000,
      });
    }
  }
  buys.sort((a, b) => b.at - a.at);

  const tokenTrades: TokenTrades[] = scanned.map((s) => ({
    symbol: s.symbol,
    priceUsd: s.priceUsd,
    trades: s.raw
      .filter((t) => t.recipient && typeof t.valueUsd === "number")
      .map((t) => ({
        side: t.side ?? "",
        recipient: t.recipient as string,
        valueUsd: t.valueUsd as number,
        tokenAmount: Number(t.tokenAmount ?? 0) / 1e18,
      })),
  }));

  return { buys: buys.slice(0, 24), scores: scoreWallets(tokenTrades, 40) };
}

function shortAddr(a: string): string {
  return a && a.length > 12 ? `${a.slice(0, 6)}·${a.slice(-4)}` : a || "unknown";
}

/**
 * A real pons buy as a radar signal. Tagged `smart-money` when the buyer is one of
 * the current top-scored wallets, else `whale` (a big real buy). Never fabricated:
 * the smart-money set comes from the live P&L leaderboard.
 */
export function buyToSignal(b: PonsBuy, smartSet: Set<string>): Signal {
  const usd = Math.round(b.valueUsd).toLocaleString();
  const smart = smartSet.has(b.wallet.toLowerCase());
  return {
    id: b.id,
    type: smart ? "smart-money" : "whale",
    subject: b.symbol,
    desk: "degen",
    actor: shortAddr(b.wallet),
    detail: `bought $${usd} of ${b.symbol}`,
    strength: b.valueUsd >= 500 ? "high" : b.valueUsd >= 100 ? "medium" : "low",
    at: b.at,
    actedOn: false,
    // Real provenance: b.id is the settling swap tx on Robinhood Chain.
    source: { txHash: b.id, wallet: b.wallet, venue: "pons" },
  };
}

export function shortWallet(a: string): string {
  return shortAddr(a);
}
