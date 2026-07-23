import { useEffect, useRef, useState } from "react";
import { fetchPonsPrices } from "../lib/ponsPrices";
import "./priceticker.css";

/**
 * A scrolling price tape of live Robinhood Chain token prices from the pons
 * launchpad. Real USD prices, polled a few seconds apart, coloured by session
 * direction (amber up / crimson down — the app's win/loss palette) with a tick
 * blip on each change.
 *
 * If pons is unreachable (no proxy configured, offline), it falls back to a
 * simulated walk so the tape never goes blank. Reduced motion freezes the scroll
 * but leaves the numbers updating — motion off, still live.
 */
interface Tick {
  symbol: string;
  price: number;
  ref: number; // session-start price, for the % change
  decimals: number;
}

function decFor(price: number): number {
  return price >= 1 ? 3 : price >= 0.01 ? 4 : price >= 0.0001 ? 6 : 8;
}

const SIM_TOKENS = [
  "RIBBIT", "ROBINWOOD", "WAGMI", "HOODIE", "VLAD", "CAT", "PICKLE", "DIH", "JUGGERNAUT", "CASHDOG",
];

function simSeed(): Tick[] {
  return SIM_TOKENS.map((symbol) => {
    const price = 0.0006 + Math.random() * 1.4;
    return { symbol, price, ref: price, decimals: decFor(price) };
  });
}

const LOCKED_COUNT = 12;

function usePrices(): Tick[] {
  const [ticks, setTicks] = useState<Tick[]>(simSeed);
  const mode = useRef<"sim" | "real">("sim");
  const refs = useRef<Map<string, number>>(new Map()); // session-start price per symbol
  const last = useRef<Map<string, number>>(new Map()); // latest price per symbol
  const locked = useRef<string[]>([]); // a stable display set, chosen once

  useEffect(() => {
    let alive = true;

    // Rebuild the visible ticks from the locked symbols + their latest prices, so
    // the tape keeps a steady set and only the numbers move (no reshuffle churn).
    const build = () => {
      setTicks(
        locked.current
          .map((sym) => last.current.get(sym))
          .map((price, i) => {
            const sym = locked.current[i];
            if (price == null) return null;
            if (!refs.current.has(sym)) refs.current.set(sym, price);
            return { symbol: sym, price, ref: refs.current.get(sym) ?? price, decimals: decFor(price) };
          })
          .filter((t): t is Tick => t !== null),
      );
    };

    const walk = (t: Tick): Tick => {
      const step = (Math.random() - 0.5) * t.price * 0.05;
      return { ...t, price: Math.max(t.price * 0.2, t.price + step) };
    };

    // Try pons on a gentle interval; if it gates us (402 without a partner key),
    // drop to "sim" and let the fast walk below keep the tape lively.
    const poll = async () => {
      try {
        const prices = await fetchPonsPrices(40);
        if (alive && prices.length) {
          mode.current = "real";
          // Dedupe by normalised symbol (two pons launches can share a ticker, and it
          // can differ only in case/whitespace); keep the first, which is the highest
          // market cap since the list is sorted that way.
          const seen = new Set<string>();
          const uniq = prices.filter((p) => {
            const key = p.symbol.trim().toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          for (const p of uniq) last.current.set(p.symbol, p.priceUsd);
          if (locked.current.length === 0) {
            locked.current = uniq.slice(0, LOCKED_COUNT).map((p) => p.symbol);
          }
          build();
          return;
        }
      } catch {
        /* fall through to sim */
      }
      if (alive) mode.current = "sim";
    };

    poll();
    const ponsTimer = window.setInterval(poll, 10_000);
    const simTimer = window.setInterval(() => {
      if (alive && mode.current === "sim") setTicks((prev) => prev.map(walk));
    }, 2000);
    return () => {
      alive = false;
      window.clearInterval(ponsTimer);
      window.clearInterval(simTimer);
    };
  }, []);

  return ticks;
}

function Cell({ t }: { t: Tick }) {
  const pct = t.ref > 0 ? ((t.price - t.ref) / t.ref) * 100 : 0;
  const up = pct >= 0;
  const price = `$${t.price.toFixed(t.decimals)}`;
  return (
    <span className="pcell">
      <span className="pcell__sym num">{t.symbol}</span>
      {/* keyed by value so a changed price remounts and re-plays the tick blip */}
      <span key={price} className="pcell__price num">
        {price}
      </span>
      <span className={`pcell__chg num ${up ? "is-pos" : "is-neg"}`}>
        {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
      </span>
    </span>
  );
}

export function PriceTicker() {
  const ticks = usePrices();
  return (
    <div className="pticker" role="region" aria-label="Live Robinhood Chain token prices from pons">
      <div className="pticker__track">
        <div className="pticker__run">
          {ticks.map((t, i) => (
            <Cell key={i} t={t} />
          ))}
        </div>
        <div className="pticker__run" aria-hidden="true">
          {ticks.map((t, i) => (
            <Cell key={`b-${i}`} t={t} />
          ))}
        </div>
      </div>
    </div>
  );
}
