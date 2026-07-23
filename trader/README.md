# issue0x-trader

Run the **issue0x** strategy on your own machine, in your terminal. The bot pulls the
same live smart-money radar that powers [issue0x.com](https://issue0x.com), applies a
tunable momentum strategy, and manages positions with take-profit, stop-loss and a
distribution-exit — **paper by default**, non-custodial, and honest about its economics.

```
▲ BUY   SPRITE  0.02Ξ  heat 78  accumulating
◦ fee   0.0004Ξ operator fee (paper — not sent)
▼ SELL  SPRITE  take-profit +41%  +0.0078Ξ (41%)  tx 0x9a1c…
```

## What it is (and isn't)

- **Non-custodial.** In live mode your private key is read from a local file *you*
  control and used only to sign transactions your machine broadcasts. It is never
  printed, logged, or sent anywhere.
- **Transparent 2% operator fee, both sides.** The bot charges a flat 2% to the issue0x
  operator on **each side of a live trade** — 2% on the buy and 2% on the sell — as a
  plain, visible on-chain transfer to `0x0000000000000000000000000000000000000000`. Those
  transfers are the *only* value that leaves your wallet to anyone but your trades. Paper
  mode sends nothing; it only subtracts the fee in simulated accounting so your P&L is
  realistic. The fee is printed in the banner, in every buy/sell log line, and lives in
  one small file: [`src/fee.ts`](src/fee.ts).
- **Paper-first & safe.** The default mode never touches a wallet. Live trading is gated
  behind explicit `feeAcknowledged` + `riskAcknowledged` flags, a local key, and a 5-second
  abort countdown.
- **Not advice.** This is a heuristic momentum strategy on public signals. Live on-chain
  execution is **experimental** (standard router path, no slippage guard). You trade your
  own funds at your own risk.

## Install (humans)

Requires Node.js 18+.

```bash
# 1. get the folder, then:
cd issue0x-trader
npm install
cp issue0x.config.example.json issue0x.config.json

# 2. see what the strategy sees (no trades):
npm run scan

# 3. run it in paper mode (default — simulated, safe):
npm start

# 4. check how it's doing:
npm run positions
```

That's it for paper trading. Tune the strategy in `issue0x.config.json` and re-run.

## Go live (optional, advanced)

Live mode trades **real funds** on Robinhood Chain. Only do this if you understand the
risk. Edit `issue0x.config.json`:

```jsonc
{
  "mode": "live",
  "keyFile": "wallet.key",          // a local file containing your 0x… private key
  "routerAddress": "0x…",           // a Uniswap-V2-style router for your venue
  "wethAddress": "0x…",             // wrapped-native address for the swap path
  "feeAcknowledged": true,          // you accept the 2% operator fee
  "riskAcknowledged": true          // you accept live-trading risk
}
```

Put your private key in `wallet.key` (git-ignored). Then `npm start`. The bot prints a
banner, loads the signer locally, waits 5 seconds, and begins. Start with a tiny
`positionSizeEth` and a low `maxPositions`.

> `wallet.key`, `issue0x.config.json`, and `issue0x-state.json` are git-ignored so you
> never commit secrets or your positions.

## Strategy knobs (`issue0x.config.json` → `strategy`)

| key | meaning | default |
|-----|---------|---------|
| `minHeat` | minimum radar heat (0–100) to enter | `60` |
| `requireAccumulating` | only enter tokens the scanner marks accumulating | `true` |
| `requireSmartInflow` | only enter with positive smart-money net flow | `true` |
| `avoidRisky` | skip concentrated / serial-rug / dev-selling / thin-liquidity tokens | `true` |
| `positionSizeEth` | ETH per position | `0.02` |
| `maxPositions` | max concurrent open positions | `5` |
| `takeProfitPct` | close at +this (0.4 = +40%) | `0.4` |
| `stopLossPct` | close at −this (0.2 = −20%) | `0.2` |
| `maxHoldMin` | force-close after this many minutes | `180` |
| `exitOnDistribution` | exit if the token flips to distributing | `true` |

## Use it from an AI agent

Two ways for Claude (or any agent) to drive the bot — see [`SKILL.md`](SKILL.md) for the
Claude skill, or wire the MCP server:

```bash
npm run mcp        # starts the stdio MCP server
```

Register it with Claude Code (`.mcp.json` or `claude mcp add`):

```json
{
  "mcpServers": {
    "issue0x-trader": { "command": "npx", "args": ["tsx", "mcp/server.ts"], "cwd": "/path/to/issue0x-trader" }
  }
}
```

(Use the direct `npx tsx mcp/server.ts` form for MCP so the JSON-RPC stream on stdout
stays clean.)

Tools exposed: `scan_radar`, `list_positions`, `bot_config`, `run_cycle`. All respect the
config's mode — paper by default, so an agent can't silently trade real funds.

## Commands

| command | what it does |
|---------|--------------|
| `npm run scan` | preview the radar + which tokens your strategy would enter (no trades) |
| `npm start` | run the bot on an interval (paper unless configured live) |
| `npm run positions` | open/closed positions, realized P&L, operator fees paid |
| `npm run config` | print the resolved config + the fee disclosure |
| `npm run mcp` | start the MCP server for agents |
