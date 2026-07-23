/** issue0x-trader CLI. Commands: run · scan · positions · config · help. */

import { loadConfig, CONFIG_PATH } from "./config.js";
import { fetchSignals } from "./api.js";
import { isEntry } from "./strategy.js";
import { loadState } from "./state.js";
import { runLoop } from "./engine.js";
import { banner, log } from "./log.js";
import { feeDisclosure } from "./fee.js";

function fmtEth(n: number): string {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(4)}Ξ`;
}

async function cmdScan(): Promise<void> {
  const cfg = loadConfig();
  banner(cfg);
  log.info("scanning the issue0x radar (preview only — no trades)…");
  const signals = await fetchSignals(cfg.apiBase);
  const ranked = signals.slice().sort((a, b) => b.heat - a.heat);
  console.log("");
  console.log("  heat  token        state          smart net    would enter");
  console.log("  ────  ───────────  ─────────────  ──────────  ───────────");
  for (const s of ranked.slice(0, 20)) {
    const enter = isEntry(s, cfg) ? "\x1b[38;5;154myes\x1b[0m" : "\x1b[90m—\x1b[0m";
    const net = `${s.smartNetFlowUsd >= 0 ? "+" : "−"}$${Math.abs(s.smartNetFlowUsd).toFixed(0)}`;
    console.log(
      `  ${String(s.heat).padStart(3)}   ${s.symbol.padEnd(11).slice(0, 11)}  ${s.state.padEnd(13)}  ${net.padStart(10)}  ${enter}`,
    );
  }
  const n = ranked.filter((s) => isEntry(s, cfg)).length;
  console.log("");
  log.info(`${n} of ${signals.length} tokens pass your entry filter (minHeat ${cfg.strategy.minHeat}).`);
}

function cmdPositions(): void {
  const s = loadState();
  const open = s.positions.filter((p) => p.status === "open");
  const closed = s.positions.filter((p) => p.status !== "open");
  console.log("");
  console.log(`  Open (${open.length}):`);
  for (const p of open) console.log(`    ${p.symbol.padEnd(10)} ${p.sizeEth}Ξ @ $${p.entryPriceUsd.toPrecision(3)}  ${p.mode}`);
  console.log(`\n  Closed (${closed.length}, newest first):`);
  for (const p of closed.slice(-12).reverse())
    console.log(`    ${p.symbol.padEnd(10)} ${fmtEth(p.pnlEth ?? 0)} (${((p.pnlPct ?? 0) * 100).toFixed(0)}%)  ${p.status}  ${p.reason}`);
  console.log("");
  console.log(`  Realized: ${fmtEth(s.realizedPnlEth)}   ·   operator fees paid: ${s.feesPaidEth.toFixed(4)}Ξ   ·   cycles: ${s.cycles}`);
  console.log("");
}

function cmdConfig(): void {
  const cfg = loadConfig();
  console.log(`\n  config: ${CONFIG_PATH}\n`);
  console.log(JSON.stringify(cfg, null, 2));
  console.log(`\n  ${feeDisclosure()}\n`);
}

async function cmdRun(): Promise<void> {
  const cfg = loadConfig();
  banner(cfg);
  if (cfg.mode === "live") {
    log.warn("LIVE mode — real funds. Starting in 5s. Ctrl+C to abort.");
    await new Promise((r) => setTimeout(r, 5000));
  }
  log.good(`running — a cycle every ${cfg.intervalSec}s. Ctrl+C to stop.`);
  await runLoop(cfg);
}

function help(): void {
  console.log(`
  issue0x-trader — one agent's strategy, on your machine

  npm run scan        Preview the radar and what your strategy would enter (no trades)
  npm start           Run the bot (paper by default; live if configured)
  npm run positions   Show open/closed positions, realized P&L and fees paid
  npm run config      Print the resolved config and the fee disclosure

  Edit issue0x.config.json to tune the strategy or enable live trading.
  Paper mode is the default and never touches a wallet. A transparent 2% operator
  fee applies to live trades only — see the banner and README.
`);
}

const cmd = process.argv[2] ?? "help";
const run = async () => {
  switch (cmd) {
    case "run": return cmdRun();
    case "scan": return cmdScan();
    case "positions": return cmdPositions();
    case "config": return cmdConfig();
    default: return help();
  }
};
run().catch((e) => {
  log.bad((e as Error).message);
  process.exit(1);
});
