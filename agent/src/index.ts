import { readFileSync, existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { makeLlm } from "./llm.js";
import { makeFeed } from "./market.js";
import { makeExecutor } from "./executor.js";
import { makeRadar } from "./radar.js";
import { loadWatchlist } from "./watchlist.js";
import { tick, type Deps } from "./loop.js";
import { loadState, saveState, recompute, publicView } from "./state.js";
import { serveState } from "./serve.js";
import { PonsScanner } from "./smartmoney.js";
import { Treasury } from "./treasury.js";

/** Minimal .env loader â€” no dependency, only sets vars that aren't already set. */
function loadEnv(path = ".env"): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

function log(msg: string): void {
  process.stdout.write(`${new Date().toISOString()}  ${msg}\n`);
}

function argFlag(name: string): string | null {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  const eq = hit.indexOf("=");
  return eq < 0 ? "" : hit.slice(eq + 1);
}

async function main(): Promise<void> {
  loadEnv();
  const cfg = loadConfig();
  const clock = Date.now();

  const watch = loadWatchlist(cfg.watchlistPath);
  const deps: Deps = {
    llm: makeLlm(cfg),
    feed: makeFeed(cfg),
    executor: makeExecutor(cfg),
    radar: makeRadar(cfg, watch, log),
    log,
  };
  const state = loadState(cfg, clock);
  if (watch.size) log(`watchlist: ${watch.size} labelled wallets loaded`);
  // Keep the clock monotonic across restarts.
  state.runtime.clock = Math.max(state.runtime.clock, clock);

  log(`issue0x agent â€” brain=${deps.llm.name} feed=${deps.feed.name} radar=${deps.radar.name} exec=${deps.executor.name} mode=${cfg.mode}`);

  const backtest = argFlag("backtest");
  if (backtest !== null) {
    const steps = Number(backtest) > 0 ? Number(backtest) : 120;
    log(`backtest: ${steps} steps Ã— 6h`);
    for (let i = 0; i < steps; i += 1) await tick(state, deps, cfg, 6);
    recompute(state, cfg);
    saveState(cfg, state);
    const a = state.agent;
    log(`done. closed=${a.closed} won=${a.won} winRate=${a.closed ? Math.round((a.won / a.closed) * 100) : 0}% realised=${a.realisedPnl} holders=${a.holderPool} burned=${a.burned} equity=${a.equity}`);
    return;
  }

  if (argFlag("once") !== null) {
    await tick(state, deps, cfg, cfg.tickSeconds / 3600);
    saveState(cfg, state);
    log("single tick done.");
    return;
  }

  // Deep smart-money scan: read pons trades server-side across many tokens,
  // accumulate across refreshes, score on a background interval. The endpoint reads
  // the cache, so the browser never waits and pons is hit gently (with the key).
  const scanner = new PonsScanner(
    {
      scanTokens: cfg.smartMoneyTokens,
      minBuyUsd: cfg.smartMoneyMinBuyUsd,
      ponsApiKey: cfg.ponsApiKey,
      blockscoutUrl: cfg.blockscoutUrl,
    },
    log,
  );
  const runScan = () =>
    scanner.refresh(Date.now()).catch((err) => log(`smart-money scan error: ${(err as Error).message}`));
  void runScan();
  setInterval(runScan, cfg.smartMoneyRefreshMs);

  // Treasury: real on-chain fee-wallet balance (trading capital) + real $ISX burns.
  const treasury = new Treasury(
    {
      rpcUrl: process.env.RH_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com",
      feeWallet: process.env.FEE_WALLET ?? "0x0000000000000000000000000000000000000000",
      isxToken: process.env.ISX_TOKEN ?? null,
      blockscoutUrl: cfg.blockscoutUrl,
      liveThresholdUsd: Number(process.env.LIVE_THRESHOLD_USD ?? 1500),
      ethUsdFallback: Number(process.env.ETH_USD ?? 3000),
    },
    log,
  );
  const runTreasury = () => treasury.refresh().catch((err) => log(`treasury error: ${(err as Error).message}`));
  void runTreasury();
  setInterval(runTreasury, 60_000);

  // Continuous: serve the record and trade on an interval.
  serveState(
    cfg,
    () => publicView(state),
    () => scanner.get(),
    (addr) => scanner.tokenDetail(addr),
    (addr) => scanner.walletDetail(addr),
    () => treasury.get(),
    log,
  );
  const runTick = async () => {
    try {
      const opened = await tick(state, deps, cfg, cfg.tickSeconds / 3600);
      saveState(cfg, state);
      if (opened) log(`tick: opened ${opened}`);
    } catch (err) {
      log(`tick error: ${(err as Error).message}`);
    }
  };
  await runTick();
  setInterval(runTick, cfg.tickSeconds * 1000);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
