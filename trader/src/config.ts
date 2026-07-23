/** Load, default, and validate the bot config. Live mode is gated behind explicit
 *  acknowledgments so no one trades real funds by accident. */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Config, StrategyConfig } from "./types.js";

const DEFAULT_STRATEGY: StrategyConfig = {
  minHeat: 60,
  requireAccumulating: true,
  requireSmartInflow: true,
  avoidRisky: true,
  positionSizeEth: 0.02,
  maxPositions: 5,
  takeProfitPct: 0.4,
  stopLossPct: 0.2,
  maxHoldMin: 180,
  exitOnDistribution: true,
};

const DEFAULTS: Config = {
  mode: "paper",
  apiBase: "https://issue0x.com/agent",
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  chainId: 4663,
  keyFile: null,
  routerAddress: null,
  wethAddress: null,
  intervalSec: 60,
  feeAcknowledged: false,
  riskAcknowledged: false,
  strategy: DEFAULT_STRATEGY,
};

export const CONFIG_PATH = resolve(process.cwd(), "issue0x.config.json");

export function loadConfig(): Config {
  let raw: Partial<Config> = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<Config>;
    } catch (e) {
      throw new Error(`issue0x.config.json is not valid JSON: ${(e as Error).message}`);
    }
  }
  const cfg: Config = {
    ...DEFAULTS,
    ...raw,
    strategy: { ...DEFAULT_STRATEGY, ...(raw.strategy ?? {}) },
  };
  validate(cfg);
  return cfg;
}

function validate(cfg: Config): void {
  if (cfg.strategy.positionSizeEth <= 0) throw new Error("strategy.positionSizeEth must be > 0");
  if (cfg.strategy.maxPositions < 1) throw new Error("strategy.maxPositions must be >= 1");
  if (cfg.intervalSec < 10) throw new Error("intervalSec must be >= 10 (be kind to the API)");

  if (cfg.mode === "live") {
    const missing: string[] = [];
    if (!cfg.feeAcknowledged) missing.push('feeAcknowledged must be true (you accept the 2% operator fee)');
    if (!cfg.riskAcknowledged) missing.push("riskAcknowledged must be true (live trading risks real funds)");
    if (!cfg.keyFile || !existsSync(resolve(process.cwd(), cfg.keyFile)))
      missing.push("keyFile must point to a readable file holding your private key");
    if (!cfg.rpcUrl) missing.push("rpcUrl is required in live mode");
    if (!cfg.routerAddress) missing.push("routerAddress (a Uniswap-V2-style router) is required in live mode");
    if (!cfg.wethAddress) missing.push("wethAddress (wrapped-native for the swap path) is required in live mode");
    if (missing.length) {
      throw new Error(
        "Live mode is not ready. Fix these in issue0x.config.json, or set mode: \"paper\":\n  - " +
          missing.join("\n  - "),
      );
    }
  }
}
