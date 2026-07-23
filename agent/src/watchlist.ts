import { existsSync, readFileSync } from "node:fs";
import type { SignalType } from "./types.js";

/**
 * The wallet watchlist — the ONLY place a wallet gets labelled "smart money" or a
 * KOL. It is curated and verified by the operator, never guessed by the agent.
 * On-chain events are real (Blockscout); *who counts as smart money* is a human
 * judgement call, so it lives here where it can be audited, not inferred.
 *
 * Seed it from real sources you trust (see agent/README.md → Watchlist), verify
 * each address on the explorer, then drop them in watchlist.json.
 */
export interface WatchedWallet {
  address: string;
  label: string;
  /** How a signal from this wallet is tagged on the radar. */
  tag: Extract<SignalType, "smart-money" | "kol">;
  /** Where you sourced/verified it (for the audit trail). */
  source?: string;
}

export interface Watchlist {
  get(address: string): WatchedWallet | undefined;
  size: number;
}

export function loadWatchlist(path: string): Watchlist {
  const map = new Map<string, WatchedWallet>();
  try {
    if (existsSync(path)) {
      const raw = JSON.parse(readFileSync(path, "utf8")) as { wallets?: WatchedWallet[] };
      for (const w of raw.wallets ?? []) {
        if (typeof w.address === "string" && w.label) {
          map.set(w.address.toLowerCase(), {
            address: w.address,
            label: w.label,
            tag: w.tag === "kol" ? "kol" : "smart-money",
            source: w.source,
          });
        }
      }
    }
  } catch {
    /* a malformed watchlist is ignored, not fatal — the radar still runs */
  }
  return {
    get: (address: string) => map.get(address.toLowerCase()),
    size: map.size,
  };
}
