/**
 * $ISX — the issue0x token, and how holders earn from one agent working.
 *
 * issue0x is an agentic trader. A single agent works three desks — prediction
 * markets, degen, and futures — and everything it does is sealed before it
 * happens and scored on the real outcome, so its record cannot be faked. Holders
 * of $ISX share the agent's winning closes.
 *
 * The design keeps holder value tied to the one thing the whole product measures:
 * whether the agent was right. You do not earn for the token existing; you earn
 * because the agent closed a position in profit, on a record anyone can check.
 *
 * Every number here is a parameter, in one file, so changing the economics is one
 * edit rather than a hunt through components.
 *
 * A note kept in the code, not buried: paying holders a share of trading results
 * is securities-adjacent in many jurisdictions. This shape is the defensible one —
 * the agent trades protocol capital (never a user deposit), holders are exposed to
 * realised gains and never to drawdown — but it is still a question for a lawyer
 * before launch, not a settled one.
 */

export const ISX = {
  ticker: "ISX",
  /** pons mints a fixed one billion per launch — not a number we choose. */
  supply: 1_000_000_000,
  venue: "pons",
} as const;

/**
 * The desks the issue0x agent works. Each states what gets sealed before a
 * position opens and how it is scored on the close — the same unfakeable-record
 * discipline across very different kinds of trade.
 */
export interface Desk {
  id: string;
  name: string;
  scope: string;
  /** What is hashed and timestamped before the position opens. */
  sealed: string;
  /** How the closed position is scored. */
  scored: string;
}

export const DESKS: Desk[] = [
  {
    id: "prediction",
    name: "Prediction markets",
    scope:
      "Binary events on tokenized stocks, crypto and macro that resolve to a hard yes or no.",
    sealed: "A probability on the outcome, before the event.",
    scored: "By the Brier rule — a confident, wrong call is punished hardest.",
  },
  {
    id: "degen",
    name: "Degen",
    scope:
      "Momentum on new and volatile tokens, where speed and conviction decide the trade.",
    sealed: "An entry and a one-line thesis, before the fill.",
    scored: "On realised PnL at the close — no rewriting the entry after the fact.",
  },
  {
    id: "futures",
    name: "Futures",
    scope: "Directional perp positions, with size and leverage stated up front.",
    sealed: "Direction, size and leverage, before the position opens.",
    scored: "On the realised result when the position closes.",
  },
];

/**
 * How the agent's realised profit on a winning close is split. Basis points,
 * summing to 10_000. Only profit is split — the trading capital (principal) always
 * stays with the desk, and a losing trade reduces that capital, never the holder
 * pool.
 */
export const PROFIT_SPLIT = {
  /** To the rewards pool, claimable by $ISX holders. */
  holders: 7000,
  /** Compounded back into the desk's trading capital. */
  desk: 2000,
  /** Used to buy $ISX on the market and burn it. */
  burn: 1000,
} as const;

export interface Utility {
  id: string;
  title: string;
  action: string;
  body: string;
  rationale: string;
}

export const UTILITIES: Utility[] = [
  {
    id: "hold",
    title: "Hold to earn",
    action: "Hold ISX",
    body: "Hold $ISX and you share the agent's winning closes. As positions across the three desks resolve in profit, 70% of the realised gain fills the rewards pool — yours to claim pro-rata, weighted by how much you held and for how long.",
    rationale:
      "Reward follows the agent's real, scored results — not a mint, not a promise. If the positions don't close green, the pool isn't funded. The record cuts both ways, and so does the reward.",
  },
  {
    id: "radar",
    title: "The chain radar",
    action: "Hold ISX",
    body: "Hold $ISX to watch the same radar the agent trades on — smart-money buys, KOL calls, new listings and whale moves on Robinhood Chain, in one live feed, with the agent's reasoning attached to every position it opens.",
    rationale:
      "The edge isn't only the trades — it's seeing what the agent sees. Holders get the chain's news feed and the agent's thinking, not just its P&L.",
  },
  {
    id: "custody",
    title: "Not your deposit",
    action: "Non-custodial",
    body: "The agent trades protocol capital — seeded at launch and compounded from its own share of profit. It never touches the tokens in your wallet. A losing trade hits the desk's capital; your bag is never at risk in a position.",
    rationale:
      "This is what keeps $ISX a token you hold, not a fund you deposit into. You're exposed to the agent's upside through the pool, and never to its drawdown through your wallet.",
  },
  {
    id: "burn",
    title: "Buyback & burn",
    action: "Supply falls",
    body: "Every winning close sends 10% of realised profit to buy $ISX on the market and burn it. Nothing is minted to pay rewards — supply only goes down.",
    rationale:
      "It ties supply to performance honestly: the more the agent wins, the more $ISX is bought back and destroyed — for every holder, whether or not they ever claim.",
  },
];

/** How value reaches a holder, stated as the flow it actually is. */
export const REWARD_FLOW = [
  {
    step: "The agent seals a position",
    detail:
      "Direction, size and a one-line thesis — hashed and timestamped before the position opens. It can't be edited or backdated.",
  },
  {
    step: "The position closes",
    detail:
      "It's scored on what actually happened — realised PnL, on the public record. Every close, green or red, stays on it.",
  },
  {
    step: "A winning close is split",
    detail:
      "Realised profit splits 70% to the holder rewards pool, 20% compounded back into the desk, 10% to buy $ISX and burn it. A losing close pays nothing and touches no holder.",
  },
  {
    step: "You claim, supply falls",
    detail:
      "Hold $ISX and claim your share of the pool, weighted by how much you held and for how long. The burned share is destroyed for good.",
  },
];

/** What the token is not — on the page, not in a footer. */
export const NOT = [
  "It is not a deposit — the agent trades protocol capital, never the tokens in your wallet.",
  "It is not a promise of profit — if the agent's positions don't close green, there is nothing to pay.",
  "It is not a claim on the treasury's capital, only a share of realised gains as they happen.",
  "It does not give you a vote over how the agent trades, or which desk it runs.",
];

export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
