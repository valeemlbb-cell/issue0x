import { useEffect, useMemo, useRef, useState } from "react";
import { DATA_SOURCE, getAgent, getPositions } from "./store";
import { makeLivePosition, recomputeMonitor, resolveLive } from "./live";
import { SIM_NOW } from "./sim";
import type { AgentSummary, EquityPoint, Position } from "./types";

export interface LiveAgent {
  positions: Position[];
  now: number;
  /** Ids of positions that arrived/closed after the initial load — for entrance flashes. */
  born: Set<string>;
  agent: AgentSummary | null;
  equity: EquityPoint[] | null;
}

/**
 * The one live view of the agent, shared by the monitor and the landing snapshot.
 * Seeds from the store, then moves: a clock ticks the relative times every second,
 * and on an interval a position opens or matures and closes — the summary and
 * equity curve are recomputed from the list so every number stays coherent (equity
 * = start + net PnL; holders 70% / burn 10% of net). In live mode it re-polls the
 * real agent instead of simulating.
 */
export function useLiveAgent(): LiveAgent {
  const [positions, setPositions] = useState<Position[]>([]);
  const [base, setBase] = useState<AgentSummary | null>(null);
  const [now, setNow] = useState(SIM_NOW);
  const born = useRef<Set<string>>(new Set());
  const clockRef = useRef(SIM_NOW);

  useEffect(() => {
    let alive = true;
    let clock = SIM_NOW;
    Promise.all([getAgent(), getPositions()]).then(([a, p]) => {
      if (!alive) return;
      setBase(a);
      setPositions(p);
    });

    const clockTimer = window.setInterval(() => {
      clock += 1000;
      clockRef.current = clock;
      setNow(clock);
    }, 1000);

    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(
        async () => {
          if (!alive) return;
          clock += 1000;
          clockRef.current = clock;
          if (DATA_SOURCE === "live") {
            try {
              const [a, p] = await Promise.all([getAgent(), getPositions()]);
              if (!alive) return;
              setPositions((prev) => {
                const prevClosed = new Set(prev.filter((x) => x.status !== "open").map((x) => x.id));
                p.forEach((x) => {
                  if (x.status !== "open" && !prevClosed.has(x.id)) born.current.add(x.id);
                });
                return p;
              });
              setBase(a);
            } catch {
              /* agent unreachable — hold */
            }
          } else {
            setPositions((prev) => {
              let next = prev;
              const opens = prev.filter((x) => x.status === "open");
              if (opens.length && Math.random() < 0.7) {
                const victim = opens[Math.floor(Math.random() * opens.length)];
                born.current.add(victim.id);
                next = next.map((x) => (x.id === victim.id ? resolveLive(x, clock) : x));
              }
              if (opens.length < 6 || Math.random() < 0.7) {
                next = [makeLivePosition(clock), ...next];
              }
              return next.slice(0, 240);
            });
            setNow(clock);
          }
          schedule();
        },
        4000 + Math.random() * 4000,
      );
    };
    schedule();

    return () => {
      alive = false;
      window.clearInterval(clockTimer);
      window.clearTimeout(timer);
    };
  }, []);

  const derived = useMemo(
    () => (base ? recomputeMonitor(base, positions, clockRef.current) : null),
    [base, positions],
  );

  return {
    positions,
    now,
    born: born.current,
    agent: derived?.agent ?? null,
    equity: derived?.equity ?? null,
  };
}
