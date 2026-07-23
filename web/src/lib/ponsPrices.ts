/**
 * Real Robinhood Chain token prices from the pons launchpad API
 * (www.ponsfamily.com/api/pons-launches). pons serves this same-origin with no
 * CORS header, so the browser can't hit it directly — in dev the Vite server
 * proxies `/pons/*` → pons `/api/*`; in prod point VITE_PONS_API at a proxy (or
 * the agent runtime's /prices endpoint), which serves the same shape.
 */

export interface PonsPrice {
  symbol: string;
  token: string;
  priceUsd: number;
  marketCapUsd: number;
}

interface RawLaunch {
  token?: string;
  symbol?: string;
  priceUsd?: number;
  marketCapUsd?: number;
}

const BASE = import.meta.env.VITE_PONS_API ?? "/pons";

/** Top tokens by market cap, with a live USD price. Newest data on each call. */
export async function fetchPonsPrices(limit = 14): Promise<PonsPrice[]> {
  const url =
    `${BASE}/pons-launches?explore=1&sort=marketCap&age=all&page=1` +
    `&pageSize=${limit}&graduatedPage=1&graduatedPageSize=6&includeGraduated=0&v=10`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`pons ${res.status}`);
  const data = (await res.json()) as { active?: { items?: RawLaunch[] } | RawLaunch[] };
  // `active` is `{ items: [...] }`; tolerate a bare array too.
  const active = data.active;
  const list: RawLaunch[] = Array.isArray(active) ? active : (active?.items ?? []);
  return list
    .filter((l): l is Required<Pick<RawLaunch, "symbol" | "priceUsd">> & RawLaunch =>
      !!l && typeof l.symbol === "string" && typeof l.priceUsd === "number" && l.priceUsd > 0,
    )
    .slice(0, limit)
    .map((l) => ({
      symbol: l.symbol,
      token: l.token ?? "",
      priceUsd: l.priceUsd,
      marketCapUsd: typeof l.marketCapUsd === "number" ? l.marketCapUsd : 0,
    }));
}
