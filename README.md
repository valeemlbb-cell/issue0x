# issue0x

**One AI agent, trading Robinhood Chain, with a record it can't fake.**

issue0x is a single agentic trader powered by a **Claude Opus 4.8** mind. It reads the
chain in real time — smart-money buys, deployer rugs, graduations, whale moves — and
works three desks off what it sees: **prediction markets, degen launches, and futures**.
Every position is **sealed before it opens** (direction, size, one line of why — hashed
and timestamped), so wins can't be curated and losses can't be quietly dropped.

🌐 **Live: [issue0x.com](https://issue0x.com)** · 📖 **[Docs](https://issue0x.com/docs)** · 📡 **[Radar](https://issue0x.com/radar)**

---

## What's in this repo

This is the full working stack behind issue0x — a monorepo of three packages:

| Package | What it is |
|---------|------------|
| [`web/`](web) | The frontend — Vite + React 19 + TypeScript. The landing page, the live radar, per-token and per-wallet drill-downs, the $ISX page, and the docs. Hand-written design-token CSS, no UI framework. |
| [`agent/`](agent) | The agent runtime — a zero-dependency Node/TS service. The deep smart-money scanner (heat, tiers, alerts, deployer/holder risk, provenance), the self-learning risk gate, the treasury/auto-burn reader, and a read-only JSON API the frontend polls. |
| [`trader/`](trader) | **issue0x-trader** — a downloadable CLI bot that runs the same strategy on your own machine. Paper by default, non-custodial, with a Claude skill + a zero-dependency MCP server so an AI agent can drive it. |

## The radar

The scanner (`agent/src/smartmoney.ts`) scores every active token into one number —
**heat, 0–100** — from smart-money net flow, buy pressure, acceleration, breadth and
graduation pace, shrunk on thin data and wash-gated. On top of that it computes a deep
signal set: a P&L-ranked smart-money leaderboard (Wilson lower-bound win rate), wallet
tiers, graduation velocity + ETA, deployer serial-rug detection, holder concentration,
flipper/diamond hold-time, same-block bundle detection, fresh-wallet flags, whale walls,
and live alerts — every on-chain signal carrying a real settling tx hash.

## Run the bot

```bash
cd trader
npm install
cp issue0x.config.example.json issue0x.config.json
npm run scan     # preview the radar — no trades
npm start        # run it (paper by default)
```

See [`trader/README.md`](trader/README.md) for live mode, the fee model, and the MCP server.

## Develop

```bash
# frontend
cd web && npm install && npm run dev

# agent runtime
cd agent && npm install && cp .env.example .env && npm start
```

Copy the `.env.example` files and fill in your own values (RPC, wallet, keys). **Nothing
in this repo contains secrets** — no keys, no private endpoints, no operator wallet.

## Honesty

issue0x is built on one principle: the record can't be curated. Positions are sealed
before they open, signals link to real tx hashes, the treasury and burns are readable
on-chain, and where the agent hasn't traded live yet the figures are a clearly-labelled
preview — never dressed up as real.

## License

MIT — see [LICENSE](LICENSE).
