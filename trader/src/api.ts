/** Read-only client for the issue0x scanner API (the deployed agent). We only pull
 *  public signals — the same data the radar on issue0x.com shows. No key, no writes. */

import type { Signal } from "./types.js";

interface RawToken {
  symbol?: string;
  token?: string;
  priceUsd?: number;
  heat?: number;
  heatBand?: string;
  state?: string;
  smartNetFlowUsd?: number;
  smartBuyers?: number;
  concentrated?: boolean;
  serialRugger?: boolean;
  deployerSelling?: boolean;
  liqHealth?: string | null;
  priceChange1h?: number | null;
}

function toSignal(t: RawToken): Signal | null {
  if (!t.token || !t.symbol || typeof t.priceUsd !== "number") return null;
  return {
    symbol: t.symbol,
    token: t.token,
    priceUsd: t.priceUsd,
    heat: t.heat ?? 0,
    heatBand: (t.heatBand as Signal["heatBand"]) ?? "cold",
    state: (t.state as Signal["state"]) ?? "neutral",
    smartNetFlowUsd: t.smartNetFlowUsd ?? 0,
    smartBuyers: t.smartBuyers ?? 0,
    concentrated: !!t.concentrated,
    serialRugger: !!t.serialRugger,
    deployerSelling: !!t.deployerSelling,
    liqHealth: (t.liqHealth as Signal["liqHealth"]) ?? null,
    priceChange1h: t.priceChange1h ?? null,
  };
}

/** The current alpha-radar: every token the scanner is watching, as Signals. */
export async function fetchSignals(apiBase: string, signal?: AbortSignal): Promise<Signal[]> {
  const res = await fetch(`${apiBase}/smart-money`, { headers: { accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`scanner /smart-money ${res.status}`);
  const d = (await res.json()) as { tokens?: RawToken[] };
  if (!d || !Array.isArray(d.tokens)) throw new Error("scanner returned no tokens (is the agent live?)");
  return d.tokens.map(toSignal).filter((s): s is Signal => s !== null);
}

/** Fresh price + intel for one token (used to mark open positions). Returns null if
 *  the token has aged off the radar. */
export async function fetchToken(apiBase: string, token: string, signal?: AbortSignal): Promise<Signal | null> {
  const res = await fetch(`${apiBase}/token/${token}`, { headers: { accept: "application/json" }, signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`scanner /token ${res.status}`);
  const d = (await res.json()) as { intel?: RawToken };
  return d?.intel ? toSignal(d.intel) : null;
}
