import type { TokenIntel } from "./agentSmart";
import type { WalletTier } from "./smartMoney";

/**
 * One token's full drill-down (agent/src/smartmoney.ts → served at ${AGENT_API}/token/{addr}):
 * the same radar intel the Alpha Radar shows, plus the token's live trade tape and the
 * scored wallets that have traded it. Agent-only — there is no client-side fallback for
 * this depth, so the page degrades to "agent offline" rather than a shallow re-scan.
 */

export interface TokenTrade {
  side: string; // "buy" | "sell"
  wallet: string;
  valueUsd: number;
  priceUsd: number;
  at: number; // ms epoch
  txHash: string;
}

export interface TokenBuyer {
  wallet: string;
  tier: WalletTier;
  pnlUsd: number; // overall P&L across the radar
  tokenPnlUsd: number; // P&L on THIS token
  buyUsd: number;
  fresh: boolean;
}

export interface TokenDetail {
  intel: TokenIntel;
  trades: TokenTrade[];
  buyers: TokenBuyer[];
}

const AGENT_API = import.meta.env.VITE_AGENT_API ?? "http://localhost:8787";

/** Fetch one token's drill-down. Throws on a down agent, a 404 (not on the radar),
 *  or an unexpected shape — the caller renders those as distinct states. */
export async function fetchTokenDetail(address: string, signal?: AbortSignal): Promise<TokenDetail> {
  const res = await fetch(`${AGENT_API}/token/${address}`, {
    headers: { accept: "application/json" },
    signal,
  });
  if (res.status === 404) throw new Error("not-on-radar");
  if (!res.ok) throw new Error(`agent /token ${res.status}`);
  const d = (await res.json()) as Partial<TokenDetail>;
  if (!d || !d.intel || !Array.isArray(d.trades) || !Array.isArray(d.buyers)) {
    throw new Error("agent /token: unexpected shape");
  }
  return { intel: d.intel, trades: d.trades, buyers: d.buyers };
}
