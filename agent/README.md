# issue0x agent runtime

The trading brain behind the monitor. One agent, three desks (prediction · degen ·
futures). Every position is **sealed (hashed + timestamped) before it opens** and
**scored on the real close**, so the record can't be faked. Holders of `$ISX` earn
from net realised profit (70% holders · 20% compounds the desk · 10% buyback & burn).

It runs **paper, offline, with no key** out of the box, so you can watch the whole
loop work before any money or any API is involved.

## Run it now (mock brain, paper trading)

```bash
cd agent
npm install
npm run backtest      # fast-forward ~40 days to seed a record → writes state.json
npm start             # serve GET /state on :8787 and keep trading on an interval
```

Point the frontend at it:

```bash
# in web/.env.local
VITE_DATA_SOURCE=live
VITE_AGENT_API=http://localhost:8787
```

The monitor now reads the live record. If the agent is down, the UI falls back to
the built-in simulation — it never breaks.

## Go live with Opus 4.8

The brain is the model. To use the real one, set in `agent/.env`:

```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
MODEL=claude-opus-4-8
```

That alone upgrades the *decisions* from the mock stand-in to full Opus 4.8
reasoning (forced structured output, one sealed decision per desk per tick). It is
still **paper** — no funds move — until you wire the two real-world seams below.

## The two seams to wire for real money

Everything else is done. Real trading needs your venue specifics:

1. **Market data** — `src/market.ts` `RealFeed`. Return live `Quote`s from your
   Robinhood Chain data source (perp/token prices, prediction-market implied odds +
   a resolution source). Enable by setting `MARKET_DATA_URL`.
2. **Execution** — `src/executor.ts` `RealExecutor`. Open/close real positions and
   read realised fills. Enable by setting `MODE=live`, `EXECUTOR_RPC_URL`, `WALLET_KEY`.

`MODE=live` refuses to start without a real executor + wallet, and refuses a mock
brain. Paper-trade first.

## The radar — real on-chain signals + a watchlist

The radar reads **real Robinhood Chain data** and never invents who is "smart money".

- Set `BLOCKSCOUT_URL=https://robinhoodchain.blockscout.com` (already the default in
  `.env.example`) and the runtime pulls **real token transfers** from the official
  explorer — the biggest recent moves on the degen tokens in `src/tokens.ts` become
  radar signals with **real wallet addresses**. Read-only, no key, no funds. Blank →
  the offline MockRadar.
- A wallet is only labelled **smart money** or **KOL** if it's on your curated
  **watchlist** (`watchlist.json`, copy from `watchlist.example.json`). Everything
  else shows as an anonymous **whale**. The agent never guesses who's sharp — that
  judgement is yours, auditable in one file.

**Building the watchlist** — find good wallets, verify each on the explorer, then add
`{address, label, tag, source}`. Real places to research them:

- **[Blockscout explorer](https://robinhoodchain.blockscout.com)** — the source of
  truth. Check any wallet's balance and trade history before you trust it.
- **[Cognitive OS](https://thecognitiveos.com)** — tracks 400+ scored smart-money
  wallets on Robinhood Chain. Verify their picks yourself.
- **[RobinScan](https://robinscan.xyz)** — Robinhood Chain explorer + whale tracker.
- **[frontrun.pro](https://frontrun.pro)** — millions of labelled KOL / smart-money
  wallets (Solana-first; use it to map KOL handles to wallets).

A wrong "smart money" tag is worse than none — someone may copy it. Verify first.

## Token prices (pons proxy)

The landing ticker (real token prices) and the radar's **Degen column** (real buys —
wallet + USD from `/api/pons-market/{token}/trades`) read the pons launchpad API
(`www.ponsfamily.com/api/…`). pons serves it same-origin with no CORS header, so a
browser can't call it directly:

- **Dev**: the Vite dev server proxies `/pons/*` → pons `/api/*` (see `web/vite.config.ts`).
- **Prod**: this runtime does the same — `GET /pons/*` on the `/state` server proxies to
  pons server-side. Point the frontend at it with `VITE_PONS_API=http://<host>:PORT/pons`.

**pons rate-limits heavy public access with HTTP 402 ("Payment required").** For
sustained real data, get a **partner API key** (docs.ponsfamily.com,
contact@ponsfamily.com) and set `PONS_API_KEY` — the proxy attaches it as a Bearer
token. Without it, the UI degrades gracefully to simulated prices/buys (disclosed
on-page), never blank. Read-only, GET-only, fixed upstream host.

## Safety — read this

An LLM reasoning well is **not** a guarantee of profit. Markets are adversarial and
the model has no crystal ball. The runtime is built to lose *survivably*, not to
promise gains:

- **Risk gate** (`src/risk.ts`): caps per-position size (`MAX_POSITION_PCT`) and
  leverage (`MAX_LEVERAGE`), total open positions, and a per-day **loss kill-switch**
  (`DAILY_LOSS_LIMIT_PCT`) that pauses new opens when a day runs too far underwater.
- **Non-custodial**: the agent trades protocol capital seeded at launch — never a
  user's deposit. A losing trade hits the desk, never a holder's wallet.
- **The record shows losses.** That's the point. Paper-trade, then size real capital
  you can afford to lose. None of this is financial advice.

## Layout

```
src/
  config.ts    env → typed config, with live-mode guardrails
  types.ts     shared shapes (mirror web/src/lib/types.ts)
  prompt.ts    the trading brain's system prompt + decision tool schema
  llm.ts       AnthropicLlm (Opus 4.8, forced tool call) + MockLlm
  market.ts    MarketFeed: MockFeed (offline) + RealFeed (seam)
  executor.ts  Executor: PaperExecutor + RealExecutor (seam)
  risk.ts      the risk gate
  seal.ts      commit hash sealed before a position opens
  state.ts     persistence + aggregates (equity, holder/burn distribution)
  loop.ts      one tick: advance → close matured → score → decide → seal → open
  serve.ts     GET /state for the frontend
  index.ts     entrypoint (--backtest / --once / serve+loop)
```
