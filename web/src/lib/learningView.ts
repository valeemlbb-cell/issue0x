import type { DeskLearning, Learning, Position, Signal, SignalType, TypeLearning } from "./types";

/**
 * A learning view derived from a set of positions — used for the simulation source
 * (so the "what it's learned" panel is coherent with the sim's own record) and as a
 * fallback if a live agent omits its learning block. The live agent computes the
 * authoritative version server-side (agent/src/learning.ts) with recency decay; this
 * uses full counts, and matches its weight formula so the number reads the same.
 */

const DESKS: Position["desk"][] = ["prediction", "degen", "futures"];
const CONF_K = 6;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function weightFor(closed: number, won: number, pnlEma: number): number {
  const alpha = 1 + won;
  const beta = 1 + (closed - won);
  const p = alpha / (alpha + beta);
  const conf = closed / (closed + CONF_K);
  const edge = p - 0.5;
  const pnlBias = clamp(pnlEma * 0.5, -0.2, 0.2);
  return Number(clamp(1 + conf * (edge + pnlBias), 0.5, 1.5).toFixed(3));
}

export function learningFromPositions(positions: Position[], _signals: Signal[] = [], updatedAt = Date.now()): Learning {
  const desks: DeskLearning[] = DESKS.map((desk) => {
    const closed = positions.filter((p) => p.desk === desk && p.status !== "open");
    const won = closed.filter((p) => p.status === "won").length;
    const pnl = Math.round(closed.reduce((s, p) => s + (p.pnl ?? 0), 0));
    const ratios = closed.map((p) => clamp((p.pnl ?? 0) / Math.max(p.size, 1), -1, 1));
    const pnlEma = ratios.length ? Number((ratios.reduce((s, r) => s + r, 0) / ratios.length).toFixed(4)) : 0;
    return {
      desk,
      closed: closed.length,
      won,
      pnl,
      alpha: 1 + won,
      beta: 1 + (closed.length - won),
      pnlEma,
      weight: weightFor(closed.length, won, pnlEma),
    };
  });

  const byType = new Map<SignalType, TypeLearning>();
  for (const p of positions) {
    const t = (p as Position & { leadType?: SignalType | null }).leadType;
    if (!t || p.status === "open") continue;
    let e = byType.get(t);
    if (!e) byType.set(t, (e = { type: t, acted: 0, won: 0, pnl: 0 }));
    e.acted += 1;
    e.won += p.status === "won" ? 1 : 0;
    e.pnl = Math.round(e.pnl + (p.pnl ?? 0));
  }

  return { desks, signalTypes: [...byType.values()], lessons: deriveLessons(desks, [...byType.values()]), updatedAt };
}

function deriveLessons(desks: DeskLearning[], types: TypeLearning[]): string[] {
  const out: string[] = [];
  const ranked = desks
    .filter((d) => d.closed >= 3)
    .sort((a, b) => Math.abs(b.weight - 1) - Math.abs(a.weight - 1));
  for (const d of ranked.slice(0, 2)) {
    const rec = `${d.won}/${d.closed}`;
    if (d.weight >= 1.1) out.push(`${d.desk} running hot (${rec}) — sizing up to ${d.weight.toFixed(2)}×.`);
    else if (d.weight <= 0.9) out.push(`${d.desk} cold (${rec}) — sizing down to ${d.weight.toFixed(2)}×, being pickier.`);
    else out.push(`${d.desk} steady (${rec}).`);
  }
  const best = types.filter((t) => t.acted >= 3).sort((a, b) => b.won / b.acted - a.won / a.acted)[0];
  if (best) out.push(`Acting on ${best.type} signals: ${best.won}/${best.acted} won.`);
  return out;
}
