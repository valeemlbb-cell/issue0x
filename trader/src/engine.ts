/** The trading loop: scan → decide → execute → record. One cycle can run standalone
 *  (used by the CLI `scan` and the MCP server) or on an interval (used by `run`). */

import { fetchSignals, fetchToken } from "./api.js";
import { pickEntries, evaluateExit } from "./strategy.js";
import { executeEntry, executeExit } from "./execution.js";
import { loadState, saveState, openPositions } from "./state.js";
import { loadSigner, type Signer } from "./wallet.js";
import { feeOn } from "./fee.js";
import { log } from "./log.js";
import type { BotState, Config, Position, Signal } from "./types.js";

function fmtEth(n: number): string {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(4)}Ξ`;
}

async function getSigner(cfg: Config): Promise<Signer | null> {
  if (cfg.mode !== "live" || !cfg.keyFile) return null;
  return loadSigner(cfg.keyFile, cfg.rpcUrl);
}

/** Run a single scan/decide/execute cycle. Returns the updated state + a summary. */
export async function runCycle(cfg: Config, signer: Signer | null): Promise<{ state: BotState; opened: number; closed: number }> {
  const state = loadState();
  if (state.startedAt == null) state.startedAt = Date.now();
  state.cycles += 1;

  let signals: Signal[];
  try {
    signals = await fetchSignals(cfg.apiBase);
  } catch (e) {
    log.warn(`scan skipped — ${(e as Error).message}`);
    saveState(state);
    return { state, opened: 0, closed: 0 };
  }
  const byToken = new Map(signals.map((s) => [s.token.toLowerCase(), s]));
  const now = Date.now();
  let opened = 0;
  let closed = 0;

  // 1) manage open positions
  for (const pos of openPositions(state)) {
    let current = byToken.get(pos.token.toLowerCase()) ?? null;
    if (!current) {
      try {
        current = await fetchToken(cfg.apiBase, pos.token);
      } catch {
        current = null;
      }
    }
    const dec = evaluateExit(pos, current, cfg, now);
    if (!dec.close) continue;

    const exitPrice = current?.priceUsd ?? pos.entryPriceUsd;
    try {
      const f = pos.entryPriceUsd > 0 ? exitPrice / pos.entryPriceUsd : 1;
      const invested = pos.sizeEth - pos.entryFeeEth; // ETH that actually bought tokens
      const exitNotionalEth = invested * f; // gross ETH value coming out
      const res = await executeExit(cfg, pos.token, exitPrice, exitNotionalEth, signer);
      // P&L nets BOTH fees: entry fee is already baked into `invested`; subtract the exit fee here.
      const pnlEth = exitNotionalEth - res.feeEth - pos.sizeEth;
      pos.status = dec.status;
      pos.exitPriceUsd = res.exitPriceUsd;
      pos.exitAt = now;
      pos.exitFeeEth = res.feeEth;
      pos.pnlEth = pnlEth;
      pos.pnlPct = f - 1;
      pos.reason = dec.reason;
      pos.exitTx = res.exitTx;
      state.realizedPnlEth += pnlEth;
      state.feesPaidEth += res.feeEth;
      closed += 1;
      log.sell(`${pos.symbol}  ${dec.reason}  ${fmtEth(pnlEth)} (${(pos.pnlPct * 100).toFixed(0)}%)${res.exitTx ? `  tx ${res.exitTx.slice(0, 10)}…` : ""}`);
      log.fee(`${res.feeEth.toFixed(4)}Ξ exit fee${res.feeTx ? `  tx ${res.feeTx.slice(0, 10)}…` : " (paper — not sent)"}`);
    } catch (e) {
      log.bad(`exit ${pos.symbol} failed — ${(e as Error).message}`);
    }
  }

  // 2) open new positions
  const entries = pickEntries(signals, openPositions(state), cfg);
  for (const s of entries) {
    try {
      const res = await executeEntry(cfg, s, cfg.strategy.positionSizeEth, signer);
      const pos: Position = {
        id: `${s.token.slice(2, 8)}-${now}`,
        token: s.token,
        symbol: s.symbol,
        mode: cfg.mode,
        status: "open",
        sizeEth: cfg.strategy.positionSizeEth,
        entryPriceUsd: res.entryPriceUsd,
        entryAt: now,
        entryFeeEth: res.feeEth,
        exitPriceUsd: null,
        exitAt: null,
        exitFeeEth: 0,
        pnlEth: null,
        pnlPct: null,
        reason: `heat ${s.heat}, ${s.state}`,
        entryTx: res.entryTx,
        exitTx: null,
      };
      state.positions.push(pos);
      state.feesPaidEth += res.feeEth;
      opened += 1;
      log.buy(`${s.symbol}  ${cfg.strategy.positionSizeEth}Ξ  heat ${s.heat}  ${s.state}`);
      log.fee(`${feeOn(cfg.strategy.positionSizeEth).toFixed(4)}Ξ operator fee${res.feeTx ? `  tx ${res.feeTx.slice(0, 10)}…` : " (paper — not sent)"}`);
    } catch (e) {
      log.bad(`entry ${s.symbol} failed — ${(e as Error).message}`);
    }
  }

  saveState(state);
  const open = openPositions(state).length;
  log.info(
    `cycle ${state.cycles} · ${signals.length} signals · ${open} open · realized ${fmtEth(state.realizedPnlEth)} · fees ${state.feesPaidEth.toFixed(4)}Ξ`,
  );
  return { state, opened, closed };
}

/** Run cycles forever on the configured interval. */
export async function runLoop(cfg: Config): Promise<void> {
  const signer = await getSigner(cfg);
  if (signer) log.info(`live signer loaded: ${signer.address}`);
  // Run immediately, then on the interval.
  for (;;) {
    try {
      await runCycle(cfg, signer);
    } catch (e) {
      log.bad(`cycle error — ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, cfg.intervalSec * 1000));
  }
}
