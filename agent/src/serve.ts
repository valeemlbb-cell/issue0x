import { createServer, type Server } from "node:http";
import type { AgentState } from "./types.js";
import type { Config } from "./config.js";
import type { SmartMoneySnapshot, TokenDetail, WalletDetail } from "./smartmoney.js";
import type { TreasurySnapshot } from "./treasury.js";

/**
 * A minimal read-only server so the frontend can poll the live record. Routes:
 *   GET /state          — the whole agent record (positions, equity, signals)
 *   GET /smart-money    — the deep pons scan: wallet P&L leaderboard + recent buys
 *   GET /token/{addr}   — one token's full drill-down: intel + tape + buyers
 *   GET /wallet/{addr}  — one wallet's full drill-down: score + breakdown + tape
 *   GET /treasury       — real fee-wallet capital + real $ISX auto-burn ledger
 *   GET /pons/*         — CORS proxy to the pons launchpad API (prices, trades)
 *   GET /health         — liveness
 * No write surface, no auth — it only exposes what is already public on the record.
 */
export function serveState(
  cfg: Config,
  getState: () => AgentState,
  getSmartMoney: () => SmartMoneySnapshot,
  getTokenDetail: (addr: string) => TokenDetail | null,
  getWalletDetail: (addr: string) => WalletDetail | null,
  getTreasury: () => TreasurySnapshot,
  log: (m: string) => void,
): Server {
  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    const url = (req.url ?? "/").split("?")[0];
    if (url === "/health") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
      return;
    }
    if (url === "/state") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(getState()));
      return;
    }
    // The smart-money leaderboard, scored server-side across a deep, accumulated
    // scan of pons trades (see smartmoney.ts). Instant read from the cache.
    if (url === "/smart-money") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(getSmartMoney()));
      return;
    }
    // Real treasury: the fee wallet's on-chain capital + the $ISX auto-burn ledger.
    if (url === "/treasury") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(getTreasury()));
      return;
    }
    // One token's full drill-down: /token/0x… → radar intel + trade tape + buyers.
    if (url.startsWith("/token/")) {
      const addr = decodeURIComponent(url.slice("/token/".length)).trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "bad address" }));
        return;
      }
      const detail = getTokenDetail(addr);
      if (!detail) {
        res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "token not on radar" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(detail));
      return;
    }
    // One wallet's full drill-down: /wallet/0x… → score + per-token breakdown + tape.
    if (url.startsWith("/wallet/")) {
      const addr = decodeURIComponent(url.slice("/wallet/".length)).trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "bad address" }));
        return;
      }
      const detail = getWalletDetail(addr);
      if (!detail) {
        res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "wallet not seen" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(detail));
      return;
    }
    // Server-side proxy to the pons launchpad API for real token prices. pons has
    // no CORS header, so the browser can't hit it directly — the frontend points
    // VITE_PONS_API at this and calls `/pons/pons-launches?…`. Read-only, GET-only,
    // fixed upstream host (no SSRF surface).
    if (req.method === "GET" && url.startsWith("/pons/")) {
      const path = (req.url ?? "").slice("/pons/".length);
      // pons gates heavy access; attach the partner key when configured.
      const headers: Record<string, string> = { accept: "application/json" };
      if (cfg.ponsApiKey) headers.authorization = `Bearer ${cfg.ponsApiKey}`;
      fetch(`https://www.ponsfamily.com/api/${path}`, { headers })
        .then(async (upstream) => {
          const body = await upstream.text();
          res.writeHead(upstream.status, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(body);
        })
        .catch((err: unknown) => {
          res.writeHead(502, { "content-type": "application/json" }).end(
            JSON.stringify({ error: (err as Error).message }),
          );
        });
      return;
    }
    res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not found" }));
  });
  server.listen(cfg.port, () => log(`serving /state /smart-money /pons on http://localhost:${cfg.port}`));
  return server;
}
