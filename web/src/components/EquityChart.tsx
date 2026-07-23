import { useId } from "react";
import type { EquityPoint } from "../lib/types";
import "./equitychart.css";

/**
 * The agent's trading capital over time, drawn as a designed terminal chart — grid
 * lines, value ticks, a dotted seed-capital baseline, and a labelled node at now.
 * Text and the node are HTML overlaid on the stretched SVG plot, so nothing
 * distorts when the chart is wide.
 *
 * Deterministic input (the sim resolves once), so this never re-animates on
 * refresh; the one motion is a draw-in on mount, which reduced-motion skips.
 */
interface Props {
  points: EquityPoint[];
  /** Seeded starting capital — drawn as a dotted reference line. */
  baseline?: number;
  height?: number;
  /** Show value ticks + date axis. Off for the compact landing spark. */
  showAxis?: boolean;
}

const PAD_Y = 6; // vevh units of vertical breathing room inside the 0–100 box
const GRID_LINES = 4;

function niceTicks(lo: number, hi: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(lo + ((hi - lo) * i) / (n - 1));
  return out;
}

function fmtTick(v: number): string {
  return Math.abs(v) >= 10_000
    ? `${(v / 1000).toFixed(0)}k`
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
}

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function EquityChart({ points, baseline, height = 240, showAxis = false }: Props) {
  const gid = useId().replace(/:/g, "");

  const ts = points.map((p) => p.t);
  const es = points.map((p) => p.equity);
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  const lo = Math.min(...es, baseline ?? Infinity);
  const hi = Math.max(...es, baseline ?? -Infinity);
  const span = Math.max(1, hi - lo);

  const x = (t: number) => ((t - tMin) / Math.max(1, tMax - tMin)) * 100;
  const y = (e: number) => PAD_Y + (1 - (e - lo) / span) * (100 - 2 * PAD_Y);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(2)},${y(p.equity).toFixed(2)}`).join(" ");
  const area = `${line} L100,${(100 - PAD_Y).toFixed(2)} L0,${(100 - PAD_Y).toFixed(2)} Z`;

  const last = points[points.length - 1];
  const ticks = showAxis ? niceTicks(lo, hi, GRID_LINES) : [];
  const up = last.equity >= (baseline ?? es[0]);

  return (
    <figure className="eqchart">
      <div className="eqchart__plot" style={{ height: `${height}px` }}>
        <svg className="eqchart__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--indigo)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--indigo)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {showAxis &&
            ticks.map((t, i) => (
              <line key={i} className="eqchart__grid" x1="0" x2="100" y1={y(t)} y2={y(t)} />
            ))}

          {baseline != null && (
            <line className="eqchart__base" x1="0" x2="100" y1={y(baseline)} y2={y(baseline)} />
          )}

          <path className="eqchart__area" d={area} fill={`url(#fill-${gid})`} />
          <path className="eqchart__line" d={line} pathLength={1} />
        </svg>

        {/* HTML overlay — crisp text + a round node, immune to the plot's stretch. */}
        {showAxis && (
          <div className="eqchart__ticks num" aria-hidden="true">
            {ticks.map((t, i) => (
              <span key={i} style={{ top: `${y(t)}%` }}>
                {fmtTick(t)}
              </span>
            ))}
          </div>
        )}

        <span
          className={`eqchart__node ${up ? "is-up" : "is-down"}`}
          style={{ left: `${x(last.t)}%`, top: `${y(last.equity)}%` }}
          aria-hidden="true"
        />
      </div>

      {showAxis ? (
        <figcaption className="eqchart__axis num">
          <span>{dateFmt.format(new Date(tMin))}</span>
          <span>now · {new Intl.NumberFormat("en-US").format(last.equity)} USDG</span>
        </figcaption>
      ) : (
        <figcaption className="sr-only">
          Trading capital ending at {new Intl.NumberFormat("en-US").format(last.equity)} USDG.
        </figcaption>
      )}
    </figure>
  );
}
