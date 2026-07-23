import type { Desk, DeskLearning, Learning, Position, Signal, SignalType, TypeLearning } from "./types.js";

/**
 * The agent learning from its own record.
 *
 * This is honest, online, in-context learning — not model training. Each time a
 * position closes, the agent updates a recency-decayed Beta(α,β) posterior over
 * "does this desk win?" plus an EMA of how much it makes per unit risked. Those
 * turn into a per-desk size multiplier the risk gate applies, so cold desks quietly
 * size down and hot ones size up (within the same hard caps). It also tracks which
 * radar signal types have actually preceded winning trades. All of it is persisted
 * in state.json, so it accumulates across restarts, and all of it is fed back into
 * the brain's prompt each tick so the model reasons against its own track record.
 */

const DESKS: Desk[] = ["prediction", "degen", "futures"];
const DECAY = 0.97; // each close nudges the posterior back toward the prior — recent results weigh more
const CONF_K = 6; // trades before the desk's edge is trusted at full strength
const WEIGHT_MIN = 0.5;
const WEIGHT_MAX = 1.5;
const MIN_LESSON_SAMPLES = 3;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function freshDesk(desk: Desk): DeskLearning {
  return { desk, closed: 0, won: 0, pnl: 0, alpha: 1, beta: 1, pnlEma: 0, weight: 1 };
}

export function initLearning(clock: number): Learning {
  return { desks: DESKS.map(freshDesk), signalTypes: [], lessons: [], updatedAt: clock };
}

/** Backfill any missing fields on a loaded (possibly older) learning block. */
export function normalizeLearning(l: Learning | undefined, clock: number): Learning {
  if (!l || !Array.isArray(l.desks)) return initLearning(clock);
  const byDesk = new Map(l.desks.map((d) => [d.desk, d]));
  const desks = DESKS.map((d) => byDesk.get(d) ?? freshDesk(d));
  return {
    desks,
    signalTypes: Array.isArray(l.signalTypes) ? l.signalTypes : [],
    lessons: Array.isArray(l.lessons) ? l.lessons : [],
    updatedAt: l.updatedAt ?? clock,
  };
}

function recomputeWeight(d: DeskLearning): number {
  const p = d.alpha / (d.alpha + d.beta); // posterior mean win rate
  const conf = d.closed / (d.closed + CONF_K); // trust grows with sample size
  const edge = p - 0.5; // above/below a coin flip
  const pnlBias = clamp(d.pnlEma * 0.5, -0.2, 0.2); // reward actual profitability, not just hit rate
  return Number(clamp(1 + conf * (edge + pnlBias), WEIGHT_MIN, WEIGHT_MAX).toFixed(3));
}

/** Fold one closed position into the learning state. Call once per close. */
export function learnFromClose(learning: Learning, pos: Position, clock: number): void {
  const won = pos.status === "won";
  const pnl = pos.pnl ?? 0;

  const d = learning.desks.find((x) => x.desk === pos.desk);
  if (d) {
    // Decay toward the prior so the estimate tracks recent form, then add this result.
    d.alpha = 1 + (d.alpha - 1) * DECAY + (won ? 1 : 0);
    d.beta = 1 + (d.beta - 1) * DECAY + (won ? 0 : 1);
    d.closed += 1;
    d.won += won ? 1 : 0;
    d.pnl = Math.round(d.pnl + pnl);
    const ratio = clamp(pnl / Math.max(pos.size, 1), -1, 1);
    d.pnlEma = Number((d.pnlEma * 0.8 + ratio * 0.2).toFixed(4));
    d.weight = recomputeWeight(d);
  }

  if (pos.leadType) {
    let t = learning.signalTypes.find((x) => x.type === pos.leadType);
    if (!t) {
      t = { type: pos.leadType, acted: 0, won: 0, pnl: 0 };
      learning.signalTypes.push(t);
    }
    t.acted += 1;
    t.won += won ? 1 : 0;
    t.pnl = Math.round(t.pnl + pnl);
  }

  learning.lessons = deriveLessons(learning);
  learning.updatedAt = clock;
}

/** The size multiplier the risk gate applies for a desk (1 = neutral). */
export function deskWeight(learning: Learning, desk: Desk): number {
  return learning.desks.find((x) => x.desk === desk)?.weight ?? 1;
}

/** Short, plain-English takeaways the agent has earned from its record. */
function deriveLessons(learning: Learning): string[] {
  const out: string[] = [];
  const ranked = [...learning.desks]
    .filter((d) => d.closed >= MIN_LESSON_SAMPLES)
    .sort((a, b) => Math.abs(b.weight - 1) - Math.abs(a.weight - 1));
  for (const d of ranked.slice(0, 2)) {
    const rec = `${d.won}/${d.closed}`;
    if (d.weight >= 1.1) out.push(`${d.desk} running hot (${rec}) — sizing up to ${d.weight.toFixed(2)}x.`);
    else if (d.weight <= 0.9) out.push(`${d.desk} cold (${rec}) — sizing down to ${d.weight.toFixed(2)}x, be pickier.`);
    else out.push(`${d.desk} steady (${rec}).`);
  }
  const bestType = [...learning.signalTypes]
    .filter((t) => t.acted >= MIN_LESSON_SAMPLES)
    .sort((a, b) => b.won / b.acted - a.won / a.acted)[0];
  if (bestType) {
    out.push(`Acting on ${bestType.type} signals: ${bestType.won}/${bestType.acted} won.`);
  }
  return out;
}

/** A compact record block for the brain's prompt — its own results to reason against. */
export function learningSummary(learning: Learning): string {
  const desks = learning.desks
    .map((d) => {
      const rec = d.closed ? `${d.won}/${d.closed} won, ${d.pnl >= 0 ? "+" : ""}${d.pnl} USDG, sizing ${d.weight}x` : "no closes yet";
      return `  - ${d.desk}: ${rec}`;
    })
    .join("\n");
  const types = learning.signalTypes
    .filter((t) => t.acted > 0)
    .sort((a, b) => b.acted - a.acted)
    .slice(0, 5)
    .map((t) => `${t.type} ${t.won}/${t.acted}`)
    .join("; ");
  const lessons = learning.lessons.length ? learning.lessons.map((l) => `  - ${l}`).join("\n") : "  - (still building a record)";
  return [
    "Your own record so far (size and focus should follow what has actually worked — this is you learning from yourself):",
    desks,
    types ? `Radar signals that led your trades: ${types}.` : "",
    "Lessons:",
    lessons,
  ]
    .filter(Boolean)
    .join("\n");
}

/** The signal type (if any) that most plausibly led a position on `subject`. */
export function leadTypeFor(signals: Signal[], subject: string): SignalType | null {
  const led = signals.find((s) => s.subject === subject);
  return led ? led.type : null;
}

export type { Learning, DeskLearning, TypeLearning };
