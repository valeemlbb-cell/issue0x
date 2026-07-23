/**
 * A minimal, zero-dependency MCP stdio server that exposes the issue0x-trader bot to
 * an agent (Claude Code, etc.). Speaks JSON-RPC 2.0 over newline-delimited stdio — the
 * MCP stdio transport — implementing initialize / tools/list / tools/call.
 *
 * Tools are read-mostly. `run_cycle` DOES act on the strategy, but in whatever mode the
 * config sets — paper by default (safe). Live trading still requires the config's
 * feeAcknowledged + riskAcknowledged gates, so an agent can't silently trade real funds.
 */

import { createInterface } from "node:readline";
import { loadConfig } from "../src/config.js";
import { fetchSignals } from "../src/api.js";
import { isEntry } from "../src/strategy.js";
import { loadState } from "../src/state.js";
import { runCycle } from "../src/engine.js";
import { loadSigner } from "../src/wallet.js";
import { feeDisclosure, feePctLabel, FEE_RECIPIENT } from "../src/fee.js";

const SERVER = { name: "issue0x-trader", version: "1.0.0" };

interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  run: () => Promise<string>;
}

const NO_INPUT = { type: "object", properties: {}, additionalProperties: false };

const TOOLS: Tool[] = [
  {
    name: "scan_radar",
    description:
      "Preview the live issue0x radar (top tokens by heat) and which ones the configured strategy would enter. Read-only, no trades.",
    inputSchema: NO_INPUT,
    run: async () => {
      const cfg = loadConfig();
      const signals = await fetchSignals(cfg.apiBase);
      const rows = signals
        .slice()
        .sort((a, b) => b.heat - a.heat)
        .slice(0, 20)
        .map((s) => ({
          symbol: s.symbol,
          token: s.token,
          heat: s.heat,
          state: s.state,
          smartNetFlowUsd: Math.round(s.smartNetFlowUsd),
          wouldEnter: isEntry(s, cfg),
        }));
      return JSON.stringify({ mode: cfg.mode, minHeat: cfg.strategy.minHeat, candidates: rows.filter((r) => r.wouldEnter).length, rows }, null, 2);
    },
  },
  {
    name: "list_positions",
    description: "List the bot's open and recently-closed positions with realized P&L (ETH) and operator fees paid.",
    inputSchema: NO_INPUT,
    run: async () => {
      const s = loadState();
      return JSON.stringify(
        {
          open: s.positions.filter((p) => p.status === "open"),
          closedRecent: s.positions.filter((p) => p.status !== "open").slice(-12).reverse(),
          realizedPnlEth: +s.realizedPnlEth.toFixed(4),
          feesPaidEth: +s.feesPaidEth.toFixed(4),
          cycles: s.cycles,
        },
        null,
        2,
      );
    },
  },
  {
    name: "bot_config",
    description: "Show the resolved bot config (mode, strategy thresholds) and the transparent operator-fee disclosure.",
    inputSchema: NO_INPUT,
    run: async () => {
      const cfg = loadConfig();
      return JSON.stringify({ config: cfg, fee: { pct: feePctLabel(), recipient: FEE_RECIPIENT, disclosure: feeDisclosure() } }, null, 2);
    },
  },
  {
    name: "run_cycle",
    description:
      "Run ONE scan→decide→execute cycle in the configured mode (paper by default — safe). In live mode this places real trades and requires the config's fee/risk acknowledgments. Returns how many positions opened/closed.",
    inputSchema: NO_INPUT,
    run: async () => {
      const cfg = loadConfig();
      const signer = cfg.mode === "live" && cfg.keyFile ? await loadSigner(cfg.keyFile, cfg.rpcUrl) : null;
      const { opened, closed, state } = await runCycle(cfg, signer);
      return JSON.stringify(
        { mode: cfg.mode, opened, closed, open: state.positions.filter((p) => p.status === "open").length, realizedPnlEth: +state.realizedPnlEth.toFixed(4) },
        null,
        2,
      );
    },
  },
];

function send(msg: unknown): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function ok(id: unknown, result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}
function err(id: unknown, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(msg: { id?: unknown; method?: string; params?: any }): Promise<void> {
  const { id, method, params } = msg;
  if (method === "initialize") {
    ok(id, {
      protocolVersion: params?.protocolVersion ?? "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: SERVER,
    });
    return;
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") return; // notifications: no reply
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") {
    ok(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    return;
  }
  if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return err(id, -32602, `unknown tool: ${params?.name}`);
    try {
      const text = await tool.run();
      ok(id, { content: [{ type: "text", text }] });
    } catch (e) {
      ok(id, { content: [{ type: "text", text: `error: ${(e as Error).message}` }], isError: true });
    }
    return;
  }
  if (id !== undefined) err(id, -32601, `method not found: ${method}`);
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const s = line.trim();
  if (!s) return;
  let msg: { id?: unknown; method?: string; params?: unknown };
  try {
    msg = JSON.parse(s);
  } catch {
    return; // ignore non-JSON lines
  }
  handle(msg).catch((e) => process.stderr.write(`handler error: ${(e as Error).message}\n`));
});
