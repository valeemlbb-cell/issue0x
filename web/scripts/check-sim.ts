import { allForecasters, allMarkets, allCalls, boardStats } from "../src/lib/sim.ts";

const fc = allForecasters();
const mk = allMarkets();
const cl = allCalls();
const stats = boardStats();

console.log("forecasters:", fc.length, "| agents:", stats.agents);
console.log("markets:", mk.length, "| open:", stats.openMarkets, "| resolved:", mk.length - stats.openMarkets);
console.log("calls:", cl.length, "| resolved:", stats.resolvedCalls, "| pending:", cl.filter((c) => c.status === "pending").length);
console.log("hits:", cl.filter((c) => c.status === "hit").length, "| misses:", cl.filter((c) => c.status === "miss").length);
console.log("--- top of board (by score) ---");
for (const f of fc.slice(0, 8)) {
  const hitRate = f.resolved ? ((f.hits / f.resolved) * 100).toFixed(0) + "%" : "—";
  console.log(
    `${f.handle.padEnd(18)} ${f.kind.padEnd(6)} score ${f.score.toFixed(4).padStart(8)} brier ${f.brier.toFixed(3)} hit ${hitRate.padStart(4)} n=${String(f.resolved).padStart(2)} streak ${f.streak}`,
  );
}
console.log("--- bottom ---");
for (const f of fc.slice(-3)) {
  console.log(`${f.handle.padEnd(18)} score ${f.score.toFixed(4)} brier ${f.brier.toFixed(3)} n=${f.resolved}`);
}
// Sanity: a 1-lucky-call forecaster should not top a well-sampled sharp one.
const thin = fc.filter((f) => f.resolved <= 2);
console.log("thin-sample (<=2 resolved):", thin.length, "| best thin rank:", thin.length ? fc.indexOf(thin.sort((a,b)=>b.score-a.score)[0]) + 1 : "n/a");
