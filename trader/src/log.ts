/** Terminal logging — a small banner and colored, timestamped lines. Zero deps. */

import { feeDisclosure, feePctLabel, FEE_RECIPIENT } from "./fee.js";
import type { Config } from "./types.js";

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  lime: "\x1b[38;5;154m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  amber: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function stamp(): string {
  // Wall-clock HH:MM:SS without pulling a date lib; new Date is fine at runtime.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export const log = {
  info: (m: string) => console.log(`${C.gray}${stamp()}${C.reset} ${m}`),
  good: (m: string) => console.log(`${C.gray}${stamp()}${C.reset} ${C.green}${m}${C.reset}`),
  warn: (m: string) => console.log(`${C.gray}${stamp()}${C.reset} ${C.amber}${m}${C.reset}`),
  bad: (m: string) => console.log(`${C.gray}${stamp()}${C.reset} ${C.red}${m}${C.reset}`),
  buy: (m: string) => console.log(`${C.gray}${stamp()}${C.reset} ${C.lime}▲ BUY${C.reset}  ${m}`),
  sell: (m: string) => console.log(`${C.gray}${stamp()}${C.reset} ${C.amber}▼ SELL${C.reset} ${m}`),
  fee: (m: string) => console.log(`${C.gray}${stamp()}${C.reset} ${C.cyan}◦ fee${C.reset}  ${m}`),
};

export function banner(cfg: Config): void {
  const live = cfg.mode === "live";
  console.log("");
  console.log(`${C.lime}${C.bold}  issue0x-trader${C.reset} ${C.gray}· one agent's strategy, on your machine${C.reset}`);
  console.log(`${C.gray}  ────────────────────────────────────────────────────────────${C.reset}`);
  console.log(
    `  mode      ${live ? `${C.red}${C.bold}LIVE — real funds${C.reset}` : `${C.green}paper — simulated${C.reset}`}`,
  );
  console.log(`  signals   ${C.cyan}${cfg.apiBase}${C.reset}`);
  console.log(`  fee       ${C.amber}${feePctLabel()} operator fee${C.reset} → ${C.gray}${FEE_RECIPIENT}${C.reset}`);
  console.log(`  wallet    ${C.gray}${live ? "loaded locally · never transmitted" : "none needed in paper mode"}${C.reset}`);
  console.log(`${C.gray}  ────────────────────────────────────────────────────────────${C.reset}`);
  console.log(`${C.dim}  ${feeDisclosure()}${C.reset}`);
  console.log("");
}
