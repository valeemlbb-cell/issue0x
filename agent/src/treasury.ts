/**
 * Treasury + auto-burn tracking — real on-chain data, no simulation.
 *
 *  - Capital: the fee wallet's live native balance on Robinhood Chain (eth_getBalance).
 *    This is the real ETH accumulated from the 2% trading fees; it funds the agent's
 *    trading capital once live.
 *  - Burns: real $ISX transfers to a burn address, scanned from Blockscout, each with its
 *    tx hash. Until $ISX is deployed / the first buyback fires, this is honestly empty (0
 *    burned) — the mechanism is wired, the numbers are only ever real ones.
 */

const BURN_ADDRS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
]);

export interface Burn {
  amountIsx: number;
  txHash: string;
  at: number; // ms epoch
}

export interface TreasurySnapshot {
  feeWallet: string;
  capitalWei: string;
  capitalEth: number;
  capitalUsd: number; // capitalEth × ethUsd
  ethUsd: number; // reference ETH price used for the USD figure
  liveThresholdUsd: number; // fees target that unlocks live trading
  progressPct: number; // 0–100 toward the threshold
  goLive: boolean; // capitalUsd >= threshold
  isxToken: string | null;
  burns: Burn[];
  totalBurnedIsx: number;
  burnCount: number;
  updatedAt: number;
  live: boolean; // did the last refresh reach the chain?
}

export interface TreasuryOpts {
  rpcUrl: string;
  feeWallet: string;
  isxToken: string | null;
  blockscoutUrl: string;
  liveThresholdUsd: number;
  ethUsdFallback: number;
}

/** Best-effort ETH→USD from a public price feed; falls back to the configured default. */
async function fetchEthUsd(fallback: number): Promise<number> {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return fallback;
    const j = (await res.json()) as { ethereum?: { usd?: number } };
    const p = j?.ethereum?.usd;
    return typeof p === "number" && p > 0 ? p : fallback;
  } catch {
    return fallback;
  }
}

async function fetchCapital(rpcUrl: string, wallet: string): Promise<{ wei: string; eth: number }> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [wallet, "latest"] }),
  });
  const j = (await res.json()) as { result?: string };
  const wei = BigInt(j.result ?? "0x0");
  return { wei: wei.toString(), eth: Number(wei) / 1e18 };
}

async function fetchBurns(blockscoutUrl: string, isxToken: string | null): Promise<{ burns: Burn[]; total: number }> {
  if (!isxToken) return { burns: [], total: 0 };
  const res = await fetch(`${blockscoutUrl}/api/v2/tokens/${isxToken}/transfers`, { headers: { accept: "application/json" } });
  if (!res.ok) return { burns: [], total: 0 };
  const j = (await res.json()) as { items?: any[] };
  const burns: Burn[] = [];
  let total = 0;
  for (const it of j.items ?? []) {
    const to = (it?.to?.hash ?? "").toLowerCase();
    if (!BURN_ADDRS.has(to)) continue;
    const dec = it?.total?.decimals ? Number(it.total.decimals) : 18;
    const amt = Number(it?.total?.value ?? 0) / 10 ** dec;
    const tx = it?.transaction_hash ?? it?.tx_hash ?? "";
    if (!tx) continue;
    burns.push({ amountIsx: amt, txHash: tx, at: Date.parse(it?.timestamp ?? "") || 0 });
    total += amt;
  }
  burns.sort((a, b) => b.at - a.at);
  return { burns, total };
}

export class Treasury {
  private snap: TreasurySnapshot;

  constructor(private opts: TreasuryOpts, private log: (m: string) => void) {
    this.snap = {
      feeWallet: opts.feeWallet,
      capitalWei: "0",
      capitalEth: 0,
      capitalUsd: 0,
      ethUsd: opts.ethUsdFallback,
      liveThresholdUsd: opts.liveThresholdUsd,
      progressPct: 0,
      goLive: false,
      isxToken: opts.isxToken,
      burns: [],
      totalBurnedIsx: 0,
      burnCount: 0,
      updatedAt: 0,
      live: false,
    };
  }

  get(): TreasurySnapshot {
    return this.snap;
  }

  async refresh(): Promise<void> {
    try {
      const cap = await fetchCapital(this.opts.rpcUrl, this.opts.feeWallet);
      const ethUsd = await fetchEthUsd(this.opts.ethUsdFallback);
      const { burns, total } = await fetchBurns(this.opts.blockscoutUrl, this.opts.isxToken);
      const capitalUsd = cap.eth * ethUsd;
      const threshold = this.opts.liveThresholdUsd;
      this.snap = {
        feeWallet: this.opts.feeWallet,
        capitalWei: cap.wei,
        capitalEth: cap.eth,
        capitalUsd,
        ethUsd,
        liveThresholdUsd: threshold,
        progressPct: threshold > 0 ? Math.max(0, Math.min(100, (capitalUsd / threshold) * 100)) : 0,
        goLive: capitalUsd >= threshold,
        isxToken: this.opts.isxToken,
        burns: burns.slice(0, 100),
        totalBurnedIsx: total,
        burnCount: burns.length,
        updatedAt: Date.now(),
        live: true,
      };
      this.log(
        `treasury: ${cap.eth.toFixed(4)} ETH ≈ $${capitalUsd.toFixed(0)} / $${threshold} (${this.snap.progressPct.toFixed(1)}%) · ${burns.length} burns`,
      );
    } catch (e) {
      this.log(`treasury refresh failed: ${(e as Error).message}`);
    }
  }
}
