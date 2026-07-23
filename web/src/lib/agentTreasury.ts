/**
 * Real treasury data from the agent (${AGENT_API}/treasury): the fee wallet's on-chain
 * native balance — the trading capital accumulated from the 2% fees — and the $ISX
 * auto-burn ledger, each burn with its tx hash. All real chain data; when $ISX hasn't
 * burned yet the ledger is honestly empty. Agent-only; returns null if unreachable.
 */

export interface Burn {
  amountIsx: number;
  txHash: string;
  at: number;
}

export interface Treasury {
  feeWallet: string;
  capitalWei: string;
  capitalEth: number;
  capitalUsd: number;
  ethUsd: number;
  liveThresholdUsd: number;
  progressPct: number;
  goLive: boolean;
  isxToken: string | null;
  burns: Burn[];
  totalBurnedIsx: number;
  burnCount: number;
  updatedAt: number;
  live: boolean;
}

const AGENT_API = import.meta.env.VITE_AGENT_API ?? "http://localhost:8787";

export async function fetchTreasury(signal?: AbortSignal): Promise<Treasury | null> {
  try {
    const res = await fetch(`${AGENT_API}/treasury`, { headers: { accept: "application/json" }, signal });
    if (!res.ok) return null;
    const d = (await res.json()) as Partial<Treasury>;
    if (!d || typeof d.capitalEth !== "number") return null;
    return {
      feeWallet: d.feeWallet ?? "",
      capitalWei: d.capitalWei ?? "0",
      capitalEth: d.capitalEth,
      capitalUsd: d.capitalUsd ?? 0,
      ethUsd: d.ethUsd ?? 0,
      liveThresholdUsd: d.liveThresholdUsd ?? 1500,
      progressPct: d.progressPct ?? 0,
      goLive: !!d.goLive,
      isxToken: d.isxToken ?? null,
      burns: Array.isArray(d.burns) ? d.burns : [],
      totalBurnedIsx: d.totalBurnedIsx ?? 0,
      burnCount: d.burnCount ?? 0,
      updatedAt: d.updatedAt ?? 0,
      live: !!d.live,
    };
  } catch {
    return null;
  }
}
