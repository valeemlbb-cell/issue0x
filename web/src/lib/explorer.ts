/**
 * Robinhood Chain block-explorer links. The radar surfaces a real settling tx hash
 * for every on-chain signal, so a reader can open it and confirm the buy actually
 * happened — the source, not just our word for it. Base is overridable for other
 * explorers via VITE_EXPLORER.
 */

const BASE = (import.meta.env.VITE_EXPLORER ?? "https://robinhoodchain.blockscout.com").replace(/\/$/, "");

export function txUrl(hash: string): string {
  return `${BASE}/tx/${hash}`;
}

export function addrUrl(wallet: string): string {
  return `${BASE}/address/${wallet}`;
}

export function tokenUrl(token: string): string {
  return `${BASE}/token/${token}`;
}

/** A short, human-legible tx hash, e.g. 0x538b15…f730d. */
export function shortHash(hash: string): string {
  return hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-5)}` : hash;
}
