---
name: issue0x-trader
description: Run the issue0x on-chain trading strategy from the terminal — scan the live smart-money radar, preview or place paper/live trades, and manage positions. Use when the user wants to trade Robinhood Chain tokens with the issue0x bot, check its positions, or tune its strategy. Paper mode is default and safe; live mode trades real funds with a transparent 2% operator fee.
---

# issue0x-trader

A terminal trading bot that runs the **issue0x** strategy off the live smart-money radar
at issue0x.com. This skill tells you how to drive it for a user.

## Ground rules (read first)

- **Paper mode is the default and is safe** (no wallet, no funds, simulated fills). Prefer
  it unless the user has explicitly set up and asked for live trading.
- **Live mode trades real funds.** Never switch `mode` to `"live"`, never create or edit a
  key file, and never run a live cycle unless the user has *explicitly* asked for live
  trading in this conversation and the config already has `feeAcknowledged` and
  `riskAcknowledged` set to `true`. If those gates aren't set, explain what's needed and stop.
- There is a **transparent 2% operator fee** on live trades, sent on-chain to the issue0x
  operator. Always surface this to the user before any live action. It is disclosed in
  `bot_config` / `npm run config`.
- The user's **private key is non-custodial** — it lives in a local file. Never print it,
  read it, copy it, or move it.

## If the MCP server is connected

Prefer the MCP tools (they respect the config's mode):

- `scan_radar` — preview the top tokens by heat and which ones the strategy would enter.
  Use this to answer "what looks good right now?" — it never trades.
- `list_positions` — the bot's open/closed positions, realized P&L (ETH), fees paid.
- `bot_config` — the resolved config + the fee disclosure. Read this before any live talk.
- `run_cycle` — run ONE scan→decide→execute cycle in the configured mode. In paper mode
  this is safe to demonstrate. In live mode it places real trades — only call it if the
  live conditions above are met and the user just asked for it.

## If driving the CLI directly

Run from the bot's folder:

```bash
npm run scan        # preview the radar + would-enter (no trades)
npm start           # run the loop (paper unless configured live)
npm run positions   # open/closed positions, realized P&L, fees
npm run config      # resolved config + fee disclosure
```

## Typical requests → what to do

- "What's hot / what would it buy?" → `scan_radar` (or `npm run scan`), summarize the
  candidates and why they passed the filter (heat, accumulating, smart inflow).
- "How's the bot doing?" → `list_positions`, summarize open positions and realized P&L.
- "Run it" / "trade for me" → confirm paper vs live. If paper, run/loop and report. If
  live, verify the gates + explicit consent first; otherwise stay paper.
- "Make it more/less aggressive" → edit `issue0x.config.json` `strategy` (e.g. lower
  `minHeat`, raise `positionSizeEth`, tighten `stopLossPct`) and re-run `scan` to show the
  effect. Never touch mode/keys as a side effect.

## Honesty

The strategy is a heuristic on public signals; live execution is experimental (standard
router path, no slippage guard). Don't promise returns. Report paper results as simulated.
