/**
 * All runtime configuration, resolved once from the environment with safe
 * defaults. Nothing else in the agent reads process.env directly.
 *
 * The defaults are deliberately harmless: mock brain, paper trading, no key, no
 * on-chain execution. You have to opt into every step toward real money.
 */

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v == null || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v == null || v.trim() === "" ? fallback : v.trim();
}

export type LlmProvider = "mock" | "anthropic";
export type Mode = "paper" | "live";

export interface Config {
  llmProvider: LlmProvider;
  anthropicKey: string;
  model: string;
  maxTokens: number;

  mode: Mode;

  marketDataUrl: string;
  executorRpcUrl: string;
  walletKey: string;

  /** Blockscout base URL for the real radar. Blank → mock radar. */
  blockscoutUrl: string;
  /** Path to the curated smart-money / KOL watchlist. */
  watchlistPath: string;

  /** pons launchpad partner key — lifts the public rate limit on heavy scans. */
  ponsApiKey: string;
  /** How many top tokens the smart-money scanner reads each pass. */
  smartMoneyTokens: number;
  /** Background refresh interval for the smart-money scan (ms). */
  smartMoneyRefreshMs: number;
  /** Minimum USD for a buy to count as a radar "buy" signal. */
  smartMoneyMinBuyUsd: number;

  startEquity: number;
  maxOpenPositions: number;
  maxPositionPct: number;
  maxLeverage: number;
  dailyLossLimitPct: number;

  tickSeconds: number;
  port: number;

  holderShare: number;
  burnShare: number;

  statePath: string;
}

export function loadConfig(): Config {
  const llmProvider = str("LLM_PROVIDER", "mock") === "anthropic" ? "anthropic" : "mock";
  const mode = str("MODE", "paper") === "live" ? "live" : "paper";

  const cfg: Config = {
    llmProvider,
    anthropicKey: str("ANTHROPIC_API_KEY", ""),
    model: str("MODEL", "claude-opus-4-8"),
    maxTokens: num("MAX_TOKENS", 1024),

    mode,

    marketDataUrl: str("MARKET_DATA_URL", ""),
    executorRpcUrl: str("EXECUTOR_RPC_URL", ""),
    walletKey: str("WALLET_KEY", ""),

    blockscoutUrl: str("BLOCKSCOUT_URL", ""),
    watchlistPath: str("WATCHLIST_PATH", "watchlist.json"),

    ponsApiKey: str("PONS_API_KEY", ""),
    smartMoneyTokens: num("SMART_MONEY_TOKENS", 24),
    smartMoneyRefreshMs: num("SMART_MONEY_REFRESH_SEC", 60) * 1000,
    smartMoneyMinBuyUsd: num("SMART_MONEY_MIN_BUY_USD", 20),

    startEquity: num("START_EQUITY_USDG", 50_000),
    maxOpenPositions: num("MAX_OPEN_POSITIONS", 8),
    maxPositionPct: num("MAX_POSITION_PCT", 6),
    maxLeverage: num("MAX_LEVERAGE", 10),
    dailyLossLimitPct: num("DAILY_LOSS_LIMIT_PCT", 8),

    tickSeconds: num("TICK_SECONDS", 900),
    port: num("PORT", 8787),

    holderShare: num("HOLDER_SHARE", 0.7),
    burnShare: num("BURN_SHARE", 0.1),

    statePath: str("STATE_PATH", "state.json"),
  };

  // Guardrails: refuse to run live without the pieces that make it safe.
  if (cfg.mode === "live") {
    if (!cfg.executorRpcUrl || !cfg.walletKey) {
      throw new Error(
        "MODE=live requires EXECUTOR_RPC_URL and WALLET_KEY. Refusing to run live without a real executor.",
      );
    }
    if (cfg.llmProvider === "mock") {
      throw new Error("MODE=live with LLM_PROVIDER=mock makes no sense — set a real brain.");
    }
  }
  if (cfg.llmProvider === "anthropic" && !cfg.anthropicKey) {
    throw new Error("LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY.");
  }

  return cfg;
}
