import type { WalletScore } from "./smartMoney";

/**
 * One wallet's full drill-down (agent/src/smartmoney.ts → ${AGENT_API}/wallet/{addr}):
 * the wallet's score with per-token P&L breakdown (each row now carrying a token
 * address so it can link to the token page), plus its cross-token trade tape and its
 * position on the leaderboard. Works for any wallet seen on the tape, not just the
 * ranked top-N. Agent-only — no client fallback; the page degrades to "agent offline".
 */

export interface WalletTrade {
  token: string;
  symbol: string;
  side: string; // "buy" | "sell"
  valueUsd: number;
  priceUsd: number;
  at: number; // ms epoch
  txHash: string;
}

export interface WalletDetail {
  score: WalletScore;
  trades: WalletTrade[];
  rank: number | null;
}

const AGENT_API = import.meta.env.VITE_AGENT_API ?? "http://localhost:8787";

/** Fetch one wallet's drill-down. Throws "not-seen" on a 404 (never on the tape),
 *  a generic error on a down agent, or on an unexpected shape. */
export async function fetchWalletDetail(address: string, signal?: AbortSignal): Promise<WalletDetail> {
  const res = await fetch(`${AGENT_API}/wallet/${address}`, {
    headers: { accept: "application/json" },
    signal,
  });
  if (res.status === 404) throw new Error("not-seen");
  if (!res.ok) throw new Error(`agent /wallet ${res.status}`);
  const d = (await res.json()) as Partial<WalletDetail>;
  if (!d || !d.score || !Array.isArray(d.trades)) {
    throw new Error("agent /wallet: unexpected shape");
  }
  return { score: d.score, trades: d.trades, rank: d.rank ?? null };
}
