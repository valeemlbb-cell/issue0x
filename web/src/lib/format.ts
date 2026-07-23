/** Formatting helpers. Every scored number the interface prints goes through here. */

export function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** A probability, always as an integer percent — that is how a call reads. */
export function prob(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function usdg(value: number): string {
  if (value === 0) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function count(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/** Signed USDG for realised PnL — always shows the sign, never a bare number. */
export function pnl(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.abs(value))}`;
}

export function compact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Brier is 0…1, lower is better; four decimals is the resolution that matters. */
export function brier(value: number): string {
  return value.toFixed(3);
}

/** A rank score is small; show a sign so better-than-chance is legible. */
export function score(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(4)}`;
}

export function addr(value: string, lead = 8, tail = 6): string {
  if (value.length <= lead + tail) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

export function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** For a future timestamp: "in 3d", "in 5h". */
export function until(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((ts - now) / 1000));
  const h = Math.floor(s / 3600);
  if (h < 1) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Hit rate as a percent, or a dash when there is nothing scored yet. */
export function hitRate(hits: number, resolved: number): string {
  if (resolved === 0) return "—";
  return `${Math.round((hits / resolved) * 100)}%`;
}
