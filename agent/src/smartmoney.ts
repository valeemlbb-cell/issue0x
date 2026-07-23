/**
 * The scanner — server-side on-chain intelligence for Robinhood Chain, run deeper
 * than a browser can. It scans the top pons tokens, ACCUMULATES their trades across
 * refreshes (deduped by tx hash, rolling window), keeps a small graduation-progress
 * history per token, and from that derives:
 *
 *   - a wallet leaderboard, split realised / unrealised, ranked by a Wilson-bounded
 *     record and shrunk P&L, each carrying a behavioural TIER earned from that record;
 *   - a TOKEN alpha-radar: smart-money NET flow (buys − sells → accumulating vs
 *     distributing), buy pressure & acceleration, breadth, age, bonding-curve velocity
 *     and a time-to-graduation ETA, folded into a normalised 0–100 heat score;
 *   - an ALERTS stream of the highest-signal events — including the rare truthful one,
 *     smart money DISTRIBUTING before the crowd.
 *
 * Every judgment is a disclosed heuristic over what we scanned. Thin samples are
 * shrunk; wash-looking volume is gated down. The wallet P&L math stays in parity with
 * web/src/lib/smartMoney.ts.
 */

const SHRINK = 5; // a wallet needs roughly this many trades before its P&L is trusted
const MIN_TRADES = 2;
const SMART_PNL = 500; // fallback smart-set floor before tiers are assigned
const EARLY_N = 10; // the first N distinct buyers of a token are its "early" buyers
const M5 = 5 * 60 * 1000;
const M60 = 60 * 60 * 1000;
const ALERT_WINDOW_MS = 30 * 60 * 1000;
const WHALE_BUY_USD = 400;
const HEATING_AGE_MIN = 360;
const HEATING_INFLOW_USD = 500;
const GRAD_HIST_CAP = 20;

export type WalletTier = "elite" | "sniper" | "smart" | "whale" | "active" | "trader";
export type FlowState = "accumulating" | "distributing" | "neutral";
export type HeatBand = "hot" | "warm" | "cold";

export interface TradeLite {
  side: string;
  recipient: string;
  valueUsd: number;
  tokenAmount: number; // human units
  timestamp: number; // ms epoch
  blockNumber: number;
}

export interface TokenTrades {
  symbol: string;
  priceUsd: number;
  trades: TradeLite[];
}

export interface WalletTokenPnl {
  symbol: string;
  token?: string; // token address — populated in wallet-detail so rows can link
  trades: number;
  buyUsd: number;
  sellUsd: number;
  holdingUsd: number;
  pnlUsd: number;
}

export interface WalletScore {
  wallet: string;
  pnlUsd: number;
  realizedUsd: number;
  unrealizedUsd: number;
  winRate: number; // raw hit rate across tokens
  winRateLB: number; // Wilson lower bound — the trusted number
  tokens: number;
  trades: number;
  volumeUsd: number;
  score: number;
  tier: WalletTier;
  earlyBuys: number;
  holdMedianMin: number | null; // median hold time of matched (FIFO) sells
  flipper: boolean; // churns fast — median hold < 15m
  diamond: boolean; // holds >70% of what it bought, up on it
  txCount: number | null; // total on-chain txs (Blockscout) — age proxy
  fresh: boolean; // very few txs → new wallet (red flag if also up big)
  breakdown?: WalletTokenPnl[];
  simulated?: boolean;
}

export interface PonsBuy {
  id: string;
  symbol: string;
  token: string;
  wallet: string;
  valueUsd: number;
  at: number;
}

/** A token on the alpha-radar — where smart money and buy pressure are flowing. */
export interface TokenIntel {
  symbol: string;
  token: string;
  priceUsd: number;
  marketCapUsd: number;
  liquidityUsd: number | null;
  ageMin: number | null;
  graduationPct: number | null;
  gradVelocity: number | null; // % per minute
  etaMin: number | null; // forecast minutes to graduation
  imminent: boolean;
  buyCount: number;
  sellCount: number;
  buyVolUsd: number;
  sellVolUsd: number;
  netFlowUsd: number; // all buys − all sells (60m)
  pressure: number; // (buy−sell)/(buy+sell) ∈ [−1,1]
  accel: number; // buys last 5m − buys prior 5m
  uniqueBuyers: number;
  smartBuyers: number;
  smartNetFlowUsd: number; // smart buys − smart sells (the flagship)
  smartInflowUsd: number; // smart buys only
  buyerConcentration: number; // top wallet's share of buy USD (wash proxy)
  state: FlowState;
  recentBuys: number;
  heat: number; // 0–100
  heatBand: HeatBand;
  priceChange1h: number | null; // fractional price change over ~1h
  smartShare: number; // smart-money share of buy USD (0–1)
  biggestBuyUsd: number; // largest single buy in the window
  biggestSellUsd: number; // largest single sell
  volume24hUsd: number | null; // Blockscout 24h volume
  spark: number[]; // recent price samples for a sparkline
  /* ---- depth layer: deployer + holder risk ---- */
  deployer: string;
  liqHealth: "thin" | "ok" | "deep" | null; // liquidity / market cap
  deployerSelling: boolean; // the deployer appears as a seller on this token
  deployerTokens: number; // launches by this deployer we've observed
  deployerGradRate: number; // fraction of them that graduated
  serialRugger: boolean; // many launches, almost none graduate
  top10Pct: number | null; // top-10 holders (excl. pool) share of supply
  devHoldPct: number | null; // deployer's current holding share
  concentrated: boolean; // top10Pct > 0.6
  bundleWallets: number; // largest same-block coordinated buy cluster
  earlySmartEntry: boolean; // ≥2 smart wallets among the first buyers
  smartFirstBuyers: number; // smart wallets in the first-N buyers
}

export interface Alert {
  id: string;
  type: "whale" | "cluster" | "heating" | "distribution" | "bundle" | "earlysmart";
  symbol: string;
  token: string;
  wallet?: string;
  detail: string;
  valueUsd: number;
  at: number;
  severity: "high" | "medium";
}

/** The scanner's own track record — signals it logged and how they played out. This
 *  is a self-graded backtest of the radar's calls, not investment performance. */
export interface ScanStats {
  uptimeMin: number; // how long the scanner has been tracking
  windowHrs: number; // the honest reporting window = min(24, uptime)
  walletsTracked: number; // unique wallets ever observed
  walletsActive24h: number; // unique wallets that traded in the last 24h
  tokensScanned: number; // tokens on the radar this pass
  tokensSeen: number; // unique tokens ever seen
  tradesObserved: number; // trades accumulated across all scans
  signals24h: number; // actionable signals logged in the last 24h
  signalsLogged: number; // signals in the (bounded) ledger
  signalsResolved: number; // logged signals old enough to judge
  signalsHit: number; // resolved signals whose price rose past the bar
  hitRate: number | null; // signalsHit / signalsResolved
  avgReturnPct: number | null; // mean forward return of resolved signals
  bestCall: { symbol: string; returnPct: number } | null;
  byType: { type: string; logged: number; resolved: number; hit: number }[];
  alertsLive: number; // alerts on the board right now
}

export interface SmartMoneySnapshot {
  scores: WalletScore[];
  tokens: TokenIntel[];
  alerts: Alert[];
  buys: PonsBuy[];
  meta: {
    scannedTokens: number;
    trades: number;
    wallets: number;
    updatedAt: number;
    source: "pons" | "sim";
    live: boolean;
    activeTotal: number; // total live tokens on pons
    graduatedTotal: number; // total graduated
    launchTotal: number; // total ever launched
    stats?: ScanStats; // the scanner's own track record
  };
}

/** One entry in the signal ledger — a call the radar made and how it resolved. */
interface LoggedSignal {
  token: string;
  symbol: string;
  type: "heating" | "earlysmart" | "accumulating";
  at: number; // ms epoch when logged
  price: number; // price at the moment of the signal
  resolved: boolean;
  returnPct: number; // forward return, set on resolve
  hit: boolean; // rose past the bar, set on resolve
}

/** One row of a token's live trade tape. */
export interface TokenTrade {
  side: string; // "buy" | "sell"
  wallet: string;
  valueUsd: number;
  priceUsd: number;
  at: number; // ms epoch
  txHash: string;
}

/** A scored wallet that has traded this specific token. */
export interface TokenBuyer {
  wallet: string;
  tier: WalletTier;
  pnlUsd: number; // this wallet's overall P&L across the radar
  tokenPnlUsd: number; // its P&L on THIS token
  buyUsd: number; // its buy volume on this token
  fresh: boolean;
}

/** Everything the token-detail page needs: the radar intel plus its tape and buyers. */
export interface TokenDetail {
  intel: TokenIntel;
  trades: TokenTrade[];
  buyers: TokenBuyer[];
}

/** One row of a wallet's cross-token trade tape. */
export interface WalletTrade {
  token: string;
  symbol: string;
  side: string; // "buy" | "sell"
  valueUsd: number;
  priceUsd: number;
  at: number; // ms epoch
  txHash: string;
}

/** Everything the wallet-detail page needs: the wallet's score (with per-token
 *  breakdown, now carrying token addresses), its recent trades, and its board rank. */
export interface WalletDetail {
  score: WalletScore;
  trades: WalletTrade[];
  rank: number | null; // position on the leaderboard, or null if unranked
}

interface Pos {
  buyUsd: number;
  sellUsd: number;
  buyTok: number;
  sellTok: number;
  trades: number;
}

/** Wilson score lower bound (z=1.64 ≈ 90%). Turns 1/1 into ~0.21, not 1.0. */
function wilsonLower(pos: number, n: number, z = 1.64): number {
  if (n <= 0) return 0;
  const phat = pos / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
  return Math.max(0, (centre - margin) / denom);
}

/** The behavioural tier a wallet has earned; the rarest, highest-signal label wins. */
export function tierFor(w: WalletScore): WalletTier {
  const eff = w.score; // pnl shrunk by trade count
  if (eff >= 10000 && w.trades >= 10 && w.winRateLB >= 0.55 && w.realizedUsd > 0) return "elite";
  if (w.earlyBuys >= 3 && w.pnlUsd > 0) return "sniper";
  if (eff >= 2000 && w.trades >= 6 && w.winRateLB >= 0.5) return "smart";
  if (w.volumeUsd >= 3000) return "whale";
  if (w.trades >= 25) return "active";
  return "trader";
}

/** Rank wallets by shrunk realised+unrealised P&L across the observed tokens. Tier
 *  and earlyBuys are filled in later (they need the token-level view). */
export function scoreWallets(tokens: TokenTrades[], topN = 40): WalletScore[] {
  const acc = new Map<string, Map<string, Pos>>();
  const priceBySym = new Map(tokens.map((t) => [t.symbol, t.priceUsd]));

  for (const tk of tokens) {
    for (const t of tk.trades) {
      const w = (t.recipient || "").toLowerCase();
      if (!w) continue;
      let byTok = acc.get(w);
      if (!byTok) acc.set(w, (byTok = new Map()));
      let p = byTok.get(tk.symbol);
      if (!p) byTok.set(tk.symbol, (p = { buyUsd: 0, sellUsd: 0, buyTok: 0, sellTok: 0, trades: 0 }));
      p.trades += 1;
      if (t.side === "buy") {
        p.buyUsd += t.valueUsd;
        p.buyTok += t.tokenAmount;
      } else if (t.side === "sell") {
        p.sellUsd += t.valueUsd;
        p.sellTok += t.tokenAmount;
      }
    }
  }

  const out: WalletScore[] = [];
  for (const [wallet, byTok] of acc) {
    let pnl = 0, realized = 0, unrealized = 0, wins = 0, vol = 0, trades = 0, toks = 0;
    const breakdown: WalletTokenPnl[] = [];
    for (const [sym, p] of byTok) {
      const remaining = Math.max(0, p.buyTok - p.sellTok);
      const price = priceBySym.get(sym) ?? 0;
      const holdingUsd = remaining * price;
      const tokenPnl = p.sellUsd + holdingUsd - p.buyUsd;
      const avgCost = p.buyTok > 0 ? p.buyUsd / p.buyTok : 0;
      realized += p.sellUsd - avgCost * Math.min(p.sellTok, p.buyTok);
      unrealized += holdingUsd - avgCost * remaining;
      pnl += tokenPnl;
      if (tokenPnl > 0) wins += 1;
      vol += p.buyUsd + p.sellUsd;
      trades += p.trades;
      toks += 1;
      breakdown.push({
        symbol: sym,
        trades: p.trades,
        buyUsd: Math.round(p.buyUsd),
        sellUsd: Math.round(p.sellUsd),
        holdingUsd: Math.round(holdingUsd),
        pnlUsd: Math.round(tokenPnl),
      });
    }
    if (trades < MIN_TRADES) continue;
    breakdown.sort((a, b) => Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd));
    const w: WalletScore = {
      wallet,
      pnlUsd: Math.round(pnl),
      realizedUsd: Math.round(realized),
      unrealizedUsd: Math.round(unrealized),
      winRate: toks ? wins / toks : 0,
      winRateLB: wilsonLower(wins, toks),
      tokens: toks,
      trades,
      volumeUsd: Math.round(vol),
      score: pnl * (trades / (trades + SHRINK)),
      tier: "trader",
      earlyBuys: 0,
      holdMedianMin: null,
      flipper: false,
      diamond: false,
      txCount: null,
      fresh: false,
      breakdown,
    };
    w.tier = tierFor(w);
    out.push(w);
  }

  return out.sort((a, b) => b.score - a.score).slice(0, topN);
}

/** Deterministic-ish simulated leaderboard for when pons is unreachable. */
export function simScores(n = 12): WalletScore[] {
  const R = () => Math.random();
  const hex = () => Math.floor(R() * 16).toString(16);
  const addr = () => `0x${Array.from({ length: 20 }, hex).join("")}`;
  const tiers: WalletTier[] = ["elite", "sniper", "smart", "whale", "active", "trader"];
  return Array.from({ length: n }, () => {
    const pnl = Math.round(R() * R() * 40000 - 3000);
    const trades = Math.round(4 + R() * 60);
    const wr = 0.4 + R() * 0.5;
    return {
      wallet: addr(),
      pnlUsd: pnl,
      realizedUsd: Math.round(pnl * (0.3 + R() * 0.5)),
      unrealizedUsd: Math.round(pnl * (0.2 + R() * 0.4)),
      winRate: wr,
      winRateLB: Math.max(0, wr - 0.2),
      tokens: 1 + Math.round(R() * 8),
      trades,
      volumeUsd: Math.round(Math.abs(pnl) * (2 + R() * 6)),
      score: pnl * (trades / (trades + SHRINK)),
      tier: tiers[Math.floor(R() * tiers.length)],
      earlyBuys: Math.round(R() * 5),
      holdMedianMin: Math.round(R() * 240),
      flipper: R() > 0.7,
      diamond: R() > 0.7,
      txCount: Math.round(R() * 500),
      fresh: R() > 0.85,
      simulated: true,
    };
  }).sort((a, b) => b.score - a.score);
}

/* ---------------- pons access (server-side, with partner key) ---------------- */

const PONS_BASE = "https://www.ponsfamily.com/api";

interface RawLaunch {
  token?: string;
  symbol?: string;
  priceUsd?: number;
  marketCapUsd?: number;
  liquidityUsd?: number | null;
  launchedAt?: string;
  graduationProgressPct?: number | null;
  deployer?: string;
  pool?: string;
  pairToken?: string;
  initialBuyWei?: string | number;
  pairedPrincipalEth?: number | null;
  graduated?: boolean;
}

interface RawTrade {
  side?: string;
  timestamp?: number;
  blockNumber?: number;
  recipient?: string;
  valueUsd?: number;
  priceUsd?: number;
  tokenAmount?: string;
  transactionHash?: string;
}

async function ponsGet(path: string, key: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (key) headers.authorization = `Bearer ${key}`;
    const res = await fetch(`${PONS_BASE}/${path}`, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`pons ${path.split("?")[0]} HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

interface Launch {
  symbol: string;
  token: string;
  priceUsd: number;
  marketCapUsd: number;
  liquidityUsd: number | null;
  launchedAt: number | null;
  graduationPct: number | null;
  deployer: string;
  pool: string;
  pairToken: string;
  initialBuyEth: number;
  pairedPrincipalEth: number | null;
  graduated: boolean;
}

interface LaunchFetch {
  launches: Launch[];
  totals: { active: number; graduated: number; launch: number };
}

async function fetchLaunches(limit: number, key: string): Promise<LaunchFetch> {
  const data = (await ponsGet(
    `pons-launches?explore=1&sort=marketCap&age=all&page=1&pageSize=${limit}` +
      `&graduatedPage=1&graduatedPageSize=6&includeGraduated=0&v=10`,
    key,
  )) as {
    active?: { items?: RawLaunch[] } | RawLaunch[];
    activeTotal?: number;
    graduatedTotal?: number;
    launchTotal?: number;
  };
  const active = data.active;
  const list: RawLaunch[] = Array.isArray(active) ? active : active?.items ?? [];
  const launches = list
    .filter((l): l is Required<Pick<RawLaunch, "symbol" | "token" | "priceUsd">> & RawLaunch =>
      !!l && typeof l.symbol === "string" && typeof l.token === "string" && typeof l.priceUsd === "number" && l.priceUsd > 0,
    )
    .slice(0, limit)
    .map((l) => ({
      symbol: l.symbol,
      token: l.token,
      priceUsd: l.priceUsd,
      marketCapUsd: typeof l.marketCapUsd === "number" ? l.marketCapUsd : 0,
      liquidityUsd: typeof l.liquidityUsd === "number" ? l.liquidityUsd : null,
      launchedAt: l.launchedAt ? Date.parse(l.launchedAt) || null : null,
      graduationPct: typeof l.graduationProgressPct === "number" ? l.graduationProgressPct : null,
      deployer: (l.deployer ?? "").toLowerCase(),
      pool: (l.pool ?? "").toLowerCase(),
      pairToken: (l.pairToken ?? "").toLowerCase(),
      initialBuyEth: Number(l.initialBuyWei ?? 0) / 1e18,
      pairedPrincipalEth: typeof l.pairedPrincipalEth === "number" ? l.pairedPrincipalEth : null,
      graduated: !!l.graduated,
    }));
  return {
    launches,
    totals: {
      active: typeof data.activeTotal === "number" ? data.activeTotal : launches.length,
      graduated: typeof data.graduatedTotal === "number" ? data.graduatedTotal : 0,
      launch: typeof data.launchTotal === "number" ? data.launchTotal : launches.length,
    },
  };
}

async function fetchTrades(token: string, key: string): Promise<RawTrade[]> {
  const raw = await ponsGet(`pons-market/${token}/trades?v=2`, key);
  return Array.isArray(raw) ? (raw as RawTrade[]) : [];
}

/** Fetch JSON from the Blockscout explorer (holder distribution + supply). */
async function blockscoutGet(base: string, path: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/v2/${path}`, {
      headers: { accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`blockscout ${path} HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

interface HolderStat {
  top10Pct: number;
  devHoldPct: number;
  volume24h: number | null;
  at: number;
}

/** Parse a possibly-huge on-chain balance string to BigInt, tolerating junk. */
function safeBig(v: unknown): bigint {
  try {
    return BigInt(String(v ?? "0").split(".")[0] || "0");
  } catch {
    return 0n;
  }
}

async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/* ---------------- The scanner ---------------- */

const TRADES_PER_TOKEN_CAP = 600;
const CONCURRENCY = 3;

/** Raw per-token signals collected before cross-sectional normalisation. */
interface TokenRaw {
  intel: Omit<TokenIntel, "heat" | "heatBand">;
  smartNetPos: number; // max(0, smartNetFlow) for heat
  accelPos: number;
  gradVel: number;
  ageBoost: number;
  trades: number;
  wash: number; // buyerConcentration
}

const HOLDER_TTL_MS = 12 * 60 * 1000; // holder distribution changes slowly
const HOLDER_TOP_N = 6; // only enrich the hottest tokens (budget Blockscout)

export interface ScannerOpts {
  scanTokens: number;
  minBuyUsd: number;
  ponsApiKey: string;
  blockscoutUrl: string; // blank → skip holder enrichment
}

export class PonsScanner {
  private acc = new Map<string, Map<string, RawTrade>>();
  private meta = new Map<string, Launch>();
  private gradHist = new Map<string, { pct: number; at: number }[]>();
  /** deployer → the tokens (and graduated tokens) we've seen it launch. */
  private deployerHist = new Map<string, { tokens: Set<string>; graduated: Set<string> }>();
  private holderCache = new Map<string, HolderStat>();
  private priceHist = new Map<string, { p: number; at: number }[]>();
  private walletMeta = new Map<string, { txCount: number; at: number }>();
  private lastTotals = { active: 0, graduated: 0, launch: 0 };
  private startedAt = 0; // first scan clock — the start of the track record
  private signalLog: LoggedSignal[] = []; // the radar's own calls, resolved over time
  private lastLogged = new Map<string, number>(); // `${token}:${type}` → last log time (cooldown)
  private snap: SmartMoneySnapshot = {
    scores: simScores(12),
    tokens: [],
    alerts: [],
    buys: [],
    meta: { scannedTokens: 0, trades: 0, wallets: 0, updatedAt: 0, source: "sim", live: false, activeTotal: 0, graduatedTotal: 0, launchTotal: 0 },
  };

  constructor(private opts: ScannerOpts, private log: (m: string) => void) {}

  get(): SmartMoneySnapshot {
    return this.snap;
  }

  /** Full drill-down for one token: its radar intel, live trade tape, and the
   *  scored wallets that traded it. Null if the token isn't on the radar. */
  tokenDetail(address: string): TokenDetail | null {
    const want = address.toLowerCase();
    const intel = this.snap.tokens.find((t) => t.token.toLowerCase() === want);
    if (!intel) return null;

    const byTx = this.acc.get(intel.token);
    const trades: TokenTrade[] = [];
    if (byTx) {
      for (const t of byTx.values()) {
        if (!t.recipient || typeof t.valueUsd !== "number") continue;
        trades.push({
          side: t.side ?? "",
          wallet: t.recipient,
          valueUsd: t.valueUsd,
          priceUsd: typeof t.priceUsd === "number" ? t.priceUsd : intel.priceUsd,
          at: (t.timestamp ?? 0) * 1000,
          txHash: t.transactionHash ?? "",
        });
      }
    }
    trades.sort((a, b) => b.at - a.at);

    const buyers: TokenBuyer[] = [];
    for (const w of this.snap.scores) {
      const row = w.breakdown?.find((b) => b.symbol === intel.symbol);
      if (!row) continue;
      buyers.push({
        wallet: w.wallet,
        tier: w.tier,
        pnlUsd: w.pnlUsd,
        tokenPnlUsd: row.pnlUsd,
        buyUsd: row.buyUsd,
        fresh: w.fresh,
      });
    }
    buyers.sort((a, b) => b.tokenPnlUsd - a.tokenPnlUsd);

    return { intel, trades: trades.slice(0, 60), buyers: buyers.slice(0, 20) };
  }

  /** Full drill-down for one wallet: its score + per-token P&L (with token addresses
   *  so rows can link), its cross-token trade tape, and its board rank. Works for ANY
   *  wallet we've seen on the tape, not just the ranked top-N — if the wallet is on the
   *  leaderboard we return that rich score (tier, win rate, hold time, tx count); if not,
   *  we compute the same P&L math on demand (enrichments left null, labelled honestly). */
  walletDetail(address: string): WalletDetail | null {
    const want = address.toLowerCase();
    const bySym = new Map<string, Pos>();
    const symToken = new Map<string, string>();
    const priceBySym = new Map<string, number>();
    const trades: WalletTrade[] = [];

    for (const [token, byTx] of this.acc) {
      const launch = this.meta.get(token);
      const sym = launch?.symbol ?? token.slice(0, 8);
      let touched = false;
      for (const t of byTx.values()) {
        if ((t.recipient || "").toLowerCase() !== want) continue;
        touched = true;
        // tokenAmount is raw on-chain units; convert to human units like build()/computeBehavior().
        const amt = Number(t.tokenAmount ?? 0) / 1e18;
        const v = typeof t.valueUsd === "number" ? t.valueUsd : 0;
        let p = bySym.get(sym);
        if (!p) bySym.set(sym, (p = { buyUsd: 0, sellUsd: 0, buyTok: 0, sellTok: 0, trades: 0 }));
        p.trades += 1;
        if (t.side === "buy") {
          p.buyUsd += v;
          p.buyTok += amt;
        } else if (t.side === "sell") {
          p.sellUsd += v;
          p.sellTok += amt;
        }
        trades.push({
          token,
          symbol: sym,
          side: t.side ?? "",
          valueUsd: v,
          priceUsd: typeof t.priceUsd === "number" ? t.priceUsd : launch?.priceUsd ?? 0,
          at: (t.timestamp ?? 0) * 1000,
          txHash: t.transactionHash ?? "",
        });
      }
      if (touched) {
        symToken.set(sym, token);
        priceBySym.set(sym, launch?.priceUsd ?? 0);
      }
    }
    if (!bySym.size) return null; // never seen this wallet on the tape

    // Prefer the ranked snapshot score (carries tier/win-rate/hold/tx enrichment).
    const rankIdx = this.snap.scores.findIndex((w) => w.wallet.toLowerCase() === want);
    let score: WalletScore;
    if (rankIdx >= 0) {
      score = this.snap.scores[rankIdx];
    } else {
      let pnl = 0, realized = 0, unrealized = 0, wins = 0, vol = 0, ttrades = 0, toks = 0;
      const breakdown: WalletTokenPnl[] = [];
      for (const [sym, p] of bySym) {
        const remaining = Math.max(0, p.buyTok - p.sellTok);
        const price = priceBySym.get(sym) ?? 0;
        const holdingUsd = remaining * price;
        const tokenPnl = p.sellUsd + holdingUsd - p.buyUsd;
        const avgCost = p.buyTok > 0 ? p.buyUsd / p.buyTok : 0;
        realized += p.sellUsd - avgCost * Math.min(p.sellTok, p.buyTok);
        unrealized += holdingUsd - avgCost * remaining;
        pnl += tokenPnl;
        if (tokenPnl > 0) wins += 1;
        vol += p.buyUsd + p.sellUsd;
        ttrades += p.trades;
        toks += 1;
        breakdown.push({
          symbol: sym,
          trades: p.trades,
          buyUsd: Math.round(p.buyUsd),
          sellUsd: Math.round(p.sellUsd),
          holdingUsd: Math.round(holdingUsd),
          pnlUsd: Math.round(tokenPnl),
        });
      }
      breakdown.sort((a, b) => Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd));
      const txCount = this.walletMeta.get(want)?.txCount ?? null;
      score = {
        wallet: want,
        pnlUsd: Math.round(pnl),
        realizedUsd: Math.round(realized),
        unrealizedUsd: Math.round(unrealized),
        winRate: toks ? wins / toks : 0,
        winRateLB: wilsonLower(wins, toks),
        tokens: toks,
        trades: ttrades,
        volumeUsd: Math.round(vol),
        score: pnl * (ttrades / (ttrades + SHRINK)),
        tier: "trader",
        earlyBuys: 0,
        holdMedianMin: null,
        flipper: false,
        diamond: false,
        txCount,
        fresh: txCount != null && txCount < 30,
        breakdown,
      };
      score.tier = tierFor(score);
    }

    // Attach token addresses to breakdown rows so the page can link each token.
    const breakdown = (score.breakdown ?? []).map((b) => ({ ...b, token: symToken.get(b.symbol) ?? "" }));
    trades.sort((a, b) => b.at - a.at);
    return { score: { ...score, breakdown }, trades: trades.slice(0, 80), rank: rankIdx >= 0 ? rankIdx + 1 : null };
  }

  async refresh(clock: number): Promise<void> {
    if (!this.startedAt) this.startedAt = clock;
    let launches: Launch[];
    try {
      const f = await fetchLaunches(this.opts.scanTokens, this.opts.ponsApiKey);
      launches = f.launches;
      this.lastTotals = f.totals;
    } catch (err) {
      this.log(`scanner: launches fetch failed (${(err as Error).message}) — keeping ${this.snap.meta.source}`);
      return;
    }
    if (!launches.length) return;

    let fetched = 0;
    await pooled(launches, CONCURRENCY, async (l) => {
      this.meta.set(l.token, l);
      // record a graduation-progress sample for velocity/ETA
      if (l.graduationPct != null) {
        const h = this.gradHist.get(l.token) ?? [];
        h.push({ pct: l.graduationPct, at: clock });
        while (h.length > GRAD_HIST_CAP) h.shift();
        this.gradHist.set(l.token, h);
      }
      // track what this deployer has launched (for serial-rug detection)
      if (l.deployer) {
        let dh = this.deployerHist.get(l.deployer);
        if (!dh) this.deployerHist.set(l.deployer, (dh = { tokens: new Set(), graduated: new Set() }));
        dh.tokens.add(l.token);
        if (l.graduated) dh.graduated.add(l.token);
      }
      // price history for momentum + sparkline
      const ph = this.priceHist.get(l.token) ?? [];
      ph.push({ p: l.priceUsd, at: clock });
      while (ph.length > 30) ph.shift();
      this.priceHist.set(l.token, ph);
      let trades: RawTrade[];
      try {
        trades = await fetchTrades(l.token, this.opts.ponsApiKey);
      } catch {
        return;
      }
      fetched += 1;
      let byTx = this.acc.get(l.token);
      if (!byTx) this.acc.set(l.token, (byTx = new Map()));
      for (const t of trades) {
        if (!t.transactionHash) continue;
        byTx.set(t.transactionHash, t);
      }
      if (byTx.size > TRADES_PER_TOKEN_CAP) {
        const drop = byTx.size - TRADES_PER_TOKEN_CAP;
        let k = 0;
        for (const key of byTx.keys()) {
          if (k++ >= drop) break;
          byTx.delete(key);
        }
      }
    });

    if (!fetched) {
      this.log("scanner: all trade fetches failed this pass — keeping last snapshot");
      return;
    }

    this.snap = this.build(clock);
    await this.enrichHolders(clock);
    await this.enrichWallets(clock);
    const hot = this.snap.tokens[0];
    this.log(
      `scanner: ${fetched}/${launches.length} tokens · ${this.snap.meta.trades} trades · ${this.snap.meta.wallets} wallets · ` +
        `hot ${hot?.symbol ?? "-"}(${hot?.heat ?? 0},${hot?.state ?? "-"}) · ${this.snap.alerts.length} alerts`,
    );
  }

  /** Enrich the hottest tokens with holder-concentration risk from Blockscout,
   *  cached per token (holder distribution moves slowly). Best-effort. */
  private async enrichHolders(clock: number): Promise<void> {
    if (!this.opts.blockscoutUrl) return;
    const targets = this.snap.tokens
      .slice(0, HOLDER_TOP_N)
      .filter((t) => {
        const c = this.holderCache.get(t.token);
        return !c || clock - c.at >= HOLDER_TTL_MS;
      });

    if (targets.length) {
      await pooled(targets, 2, async (t) => {
        const m = this.meta.get(t.token);
        if (!m) return;
        try {
          const [info, holders] = await Promise.all([
            blockscoutGet(this.opts.blockscoutUrl, `tokens/${t.token}`),
            blockscoutGet(this.opts.blockscoutUrl, `tokens/${t.token}/holders`),
          ]);
          const supply = safeBig(info?.total_supply);
          if (supply <= 0n) return;
          const items: { address?: { hash?: string }; value?: string }[] = Array.isArray(holders?.items) ? holders.items : [];
          const exclude = new Set([m.pool, m.pairToken].filter(Boolean));
          const ranked = items
            .map((h) => ({ addr: (h.address?.hash ?? "").toLowerCase(), val: safeBig(h.value) }))
            .filter((h) => h.addr && !exclude.has(h.addr))
            .sort((a, b) => (a.val < b.val ? 1 : a.val > b.val ? -1 : 0));
          const top10 = ranked.slice(0, 10).reduce((s, h) => s + h.val, 0n);
          const top10Pct = Number((top10 * 10000n) / supply) / 10000;
          const dev = items.find((h) => (h.address?.hash ?? "").toLowerCase() === m.deployer);
          const devHoldPct = dev ? Number((safeBig(dev.value) * 10000n) / supply) / 10000 : 0;
          const v24 = Number((info as { volume_24h?: string })?.volume_24h);
          this.holderCache.set(t.token, { top10Pct, devHoldPct, volume24h: Number.isFinite(v24) ? v24 : null, at: clock });
        } catch {
          /* skip this token — best-effort enrichment */
        }
      });
    }

    for (const t of this.snap.tokens) {
      const c = this.holderCache.get(t.token);
      if (c) {
        t.top10Pct = c.top10Pct;
        t.devHoldPct = c.devHoldPct;
        t.concentrated = c.top10Pct > 0.6;
        t.volume24hUsd = c.volume24h;
      }
    }
  }

  /** Enrich the top-scored wallets with a Blockscout tx count → a FRESH flag (very
   *  new wallet). Cached ~30m; budgeted to the leaderboard's head. Best-effort. */
  private async enrichWallets(clock: number): Promise<void> {
    if (!this.opts.blockscoutUrl) return;
    const WALLET_TTL_MS = 30 * 60 * 1000;
    const FRESH_TX = 30; // fewer than this many total txs → a new wallet
    const targets = this.snap.scores.slice(0, 15).filter((w) => {
      const c = this.walletMeta.get(w.wallet);
      return !c || clock - c.at >= WALLET_TTL_MS;
    });
    if (targets.length) {
      await pooled(targets, 2, async (w) => {
        try {
          const c = (await blockscoutGet(this.opts.blockscoutUrl, `addresses/${w.wallet}/counters`)) as {
            transactions_count?: string;
          };
          const txCount = Number(c?.transactions_count);
          if (Number.isFinite(txCount)) this.walletMeta.set(w.wallet, { txCount, at: clock });
        } catch {
          /* skip */
        }
      });
    }
    for (const w of this.snap.scores) {
      const c = this.walletMeta.get(w.wallet);
      if (c) {
        w.txCount = c.txCount;
        w.fresh = c.txCount < FRESH_TX;
      }
    }
  }

  private gradVelocity(token: string): number | null {
    const h = this.gradHist.get(token);
    if (!h || h.length < 2) return null;
    const first = h[0];
    const last = h[h.length - 1];
    const dtMin = (last.at - first.at) / 60000;
    if (dtMin <= 0) return null;
    return (last.pct - first.pct) / dtMin; // % per minute
  }

  /** FIFO-match each scored wallet's sells against its earlier buys to get hold
   *  times → flipper (churns fast) / diamond (holds most of what it bought, up). */
  private computeBehavior(scores: WalletScore[]): void {
    const wanted = new Set(scores.map((w) => w.wallet));
    // wallet → token → its trades (buy/sell) with size + time + block
    const byWallet = new Map<string, Map<string, { side: string; ts: number; block: number; tok: number }[]>>();
    for (const [token, byTx] of this.acc) {
      for (const t of byTx.values()) {
        const w = (t.recipient ?? "").toLowerCase();
        if (!w || !wanted.has(w) || (t.side !== "buy" && t.side !== "sell")) continue;
        let byTok = byWallet.get(w);
        if (!byTok) byWallet.set(w, (byTok = new Map()));
        let arr = byTok.get(token);
        if (!arr) byTok.set(token, (arr = []));
        arr.push({ side: t.side, ts: (t.timestamp ?? 0) * 1000, block: t.blockNumber ?? 0, tok: Number(t.tokenAmount ?? 0) / 1e18 });
      }
    }
    for (const w of scores) {
      const byTok = byWallet.get(w.wallet);
      if (!byTok) continue;
      const holdMins: number[] = [];
      let bought = 0;
      let sold = 0;
      for (const arr of byTok.values()) {
        arr.sort((a, b) => a.block - b.block || a.ts - b.ts);
        const queue: { ts: number; tok: number }[] = [];
        for (const t of arr) {
          if (t.side === "buy") {
            queue.push({ ts: t.ts, tok: t.tok });
            bought += t.tok;
          } else {
            sold += t.tok;
            let rem = t.tok;
            while (rem > 1e-9 && queue.length) {
              const lot = queue[0];
              const used = Math.min(rem, lot.tok);
              holdMins.push((t.ts - lot.ts) / 60000);
              lot.tok -= used;
              rem -= used;
              if (lot.tok <= 1e-9) queue.shift();
            }
          }
        }
      }
      if (holdMins.length >= 3) {
        holdMins.sort((a, b) => a - b);
        const mid = Math.floor(holdMins.length / 2);
        const median = holdMins.length % 2 ? holdMins[mid] : (holdMins[mid - 1] + holdMins[mid]) / 2;
        w.holdMedianMin = Math.max(0, Math.round(median));
        w.flipper = median < 15;
      }
      const remaining = Math.max(0, bought - sold);
      w.diamond = bought > 0 && remaining / bought > 0.7 && w.unrealizedUsd > 0;
    }
  }

  /** The scanner's self-graded track record. Logs the strongest actionable signal per
   *  token (cooldown-gated), resolves matured ones against the latest price, and rolls
   *  up wallet/trade/hit-rate counts. A backtest of the radar's own calls — honest, and
   *  labelled as such (a signal "hits" if price rose ≥10% ~45m out; not P&L). */
  private trackStats(tokens: TokenIntel[], alertsLive: number, clock: number): ScanStats {
    const DAY = 24 * 60 * 60 * 1000;
    const RESOLVE_MS = 45 * 60 * 1000; // judge a signal 45m after it fired
    const COOLDOWN_MS = 90 * 60 * 1000; // don't re-log the same token+type inside 90m
    const HIT = 0.1; // +10% forward = a hit
    const LOG_CAP = 800;

    // 1) log the single strongest actionable signal per token
    for (const t of tokens) {
      let type: LoggedSignal["type"] | null = null;
      if (t.heatBand === "hot") type = "heating";
      else if (t.earlySmartEntry) type = "earlysmart";
      else if (t.state === "accumulating" && t.smartNetFlowUsd > 0) type = "accumulating";
      if (!type || t.priceUsd <= 0) continue;
      const key = `${t.token}:${type}`;
      if (clock - (this.lastLogged.get(key) ?? 0) < COOLDOWN_MS) continue;
      this.lastLogged.set(key, clock);
      this.signalLog.push({ token: t.token, symbol: t.symbol, type, at: clock, price: t.priceUsd, resolved: false, returnPct: 0, hit: false });
    }
    if (this.signalLog.length > LOG_CAP) this.signalLog.splice(0, this.signalLog.length - LOG_CAP);

    // 2) resolve matured signals against the latest known price
    for (const s of this.signalLog) {
      if (s.resolved || clock - s.at < RESOLVE_MS) continue;
      const ph = this.priceHist.get(s.token);
      const curr = ph && ph.length ? ph[ph.length - 1].p : 0;
      if (curr <= 0 || s.price <= 0) continue; // can't judge without both prices
      s.returnPct = (curr - s.price) / s.price;
      s.hit = s.returnPct >= HIT;
      s.resolved = true;
    }

    // 3) wallet + trade rollup from the accumulated tape
    let tradesObserved = 0;
    const ever = new Set<string>();
    const active = new Set<string>();
    for (const byTx of this.acc.values()) {
      tradesObserved += byTx.size;
      for (const tr of byTx.values()) {
        const w = tr.recipient;
        if (!w) continue;
        ever.add(w);
        if ((tr.timestamp ?? 0) * 1000 >= clock - DAY) active.add(w);
      }
    }

    const resolved = this.signalLog.filter((s) => s.resolved);
    const hits = resolved.filter((s) => s.hit);
    const best = resolved.reduce<LoggedSignal | null>((b, s) => (!b || s.returnPct > b.returnPct ? s : b), null);
    const types: LoggedSignal["type"][] = ["heating", "earlysmart", "accumulating"];
    const byType = types.map((type) => {
      const of = this.signalLog.filter((s) => s.type === type);
      const res = of.filter((s) => s.resolved);
      return { type, logged: of.length, resolved: res.length, hit: res.filter((s) => s.hit).length };
    });
    const uptimeMin = Math.max(0, Math.round((clock - this.startedAt) / 60000));

    return {
      uptimeMin,
      windowHrs: Math.min(24, Math.max(0, uptimeMin / 60)),
      walletsTracked: ever.size,
      walletsActive24h: active.size,
      tokensScanned: tokens.length,
      tokensSeen: this.meta.size,
      tradesObserved,
      signals24h: this.signalLog.filter((s) => s.at >= clock - DAY).length,
      signalsLogged: this.signalLog.length,
      signalsResolved: resolved.length,
      signalsHit: hits.length,
      hitRate: resolved.length ? hits.length / resolved.length : null,
      avgReturnPct: resolved.length ? resolved.reduce((a, s) => a + s.returnPct, 0) / resolved.length : null,
      bestCall: best ? { symbol: best.symbol, returnPct: best.returnPct } : null,
      byType,
      alertsLive,
    };
  }

  private build(clock: number): SmartMoneySnapshot {
    const tokenTrades: TokenTrades[] = [];
    const buys: PonsBuy[] = [];
    let totalTrades = 0;

    for (const [token, byTx] of this.acc) {
      const m = this.meta.get(token);
      if (!m) continue;
      const trades: TradeLite[] = [];
      for (const t of byTx.values()) {
        totalTrades += 1;
        if (t.recipient && typeof t.valueUsd === "number") {
          const tsMs = (t.timestamp ?? 0) * 1000;
          trades.push({
            side: t.side ?? "",
            recipient: t.recipient,
            valueUsd: t.valueUsd,
            tokenAmount: Number(t.tokenAmount ?? 0) / 1e18,
            timestamp: tsMs,
            blockNumber: t.blockNumber ?? 0,
          });
          if (t.side === "buy" && t.valueUsd >= this.opts.minBuyUsd && t.transactionHash) {
            buys.push({ id: t.transactionHash, symbol: m.symbol, token, wallet: t.recipient, valueUsd: t.valueUsd, at: tsMs });
          }
        }
      }
      tokenTrades.push({ symbol: m.symbol, priceUsd: m.priceUsd, trades });
    }

    const scores = scoreWallets(tokenTrades, 40);
    this.computeBehavior(scores); // FIFO hold-time → flipper / diamond tags
    // smartSet = the wallets that earned a smart-grade tier (or clear P&L fallback).
    const smartSet = new Set(
      scores.filter((w) => w.tier === "elite" || w.tier === "smart" || w.pnlUsd >= SMART_PNL).map((w) => w.wallet),
    );

    // ----- Pass: raw per-token signals + early buyers + alerts -----
    const raws: TokenRaw[] = [];
    const earlyByWallet = new Map<string, number>();
    const alerts: Alert[] = [];

    for (const [token, byTx] of this.acc) {
      const m = this.meta.get(token);
      if (!m) continue;
      const rows = [...byTx.values()].filter((t) => t.recipient && typeof t.valueUsd === "number");
      if (!rows.length) continue;

      let buyVol = 0, sellVol = 0, buyCount = 0, sellCount = 0, recentBuys = 0;
      let smartBuyUsd = 0, smartSellUsd = 0, v5 = 0, vPrev = 0;
      let biggestBuy = 0, biggestSell = 0;
      const buyers = new Set<string>();
      const smartBuyers = new Set<string>();
      const sellers = new Set<string>();
      const perWalletBuyUsd = new Map<string, number>();
      const buyEvents: { wallet: string; ts: number; block: number; v: number }[] = [];

      for (const t of rows) {
        const w = (t.recipient as string).toLowerCase();
        const v = t.valueUsd as number;
        const tsMs = (t.timestamp ?? 0) * 1000;
        const isSmart = smartSet.has(w);
        if (t.side === "buy") {
          buyVol += v; buyCount += 1; buyers.add(w);
          if (v > biggestBuy) biggestBuy = v;
          perWalletBuyUsd.set(w, (perWalletBuyUsd.get(w) ?? 0) + v);
          if (tsMs >= clock - M60) recentBuys += 1;
          if (tsMs >= clock - M5) v5 += 1;
          else if (tsMs >= clock - 2 * M5) vPrev += 1;
          if (isSmart) { smartBuyers.add(w); smartBuyUsd += v; }
          buyEvents.push({ wallet: w, ts: tsMs, block: t.blockNumber ?? 0, v });
          if (v >= WHALE_BUY_USD && tsMs >= clock - ALERT_WINDOW_MS) {
            alerts.push({
              id: t.transactionHash ?? `${token}-${tsMs}`,
              type: "whale",
              symbol: m.symbol,
              token,
              wallet: w,
              detail: `${isSmart ? "Smart wallet" : "Whale"} bought $${Math.round(v).toLocaleString()} of ${m.symbol}`,
              valueUsd: v,
              at: tsMs,
              severity: v >= WHALE_BUY_USD * 3 ? "high" : "medium",
            });
          }
        } else if (t.side === "sell") {
          sellVol += v; sellCount += 1;
          sellers.add(w);
          if (v > biggestSell) biggestSell = v;
          if (isSmart) smartSellUsd += v;
        }
      }

      // early buyers (first EARLY_N distinct by (block, time))
      buyEvents.sort((a, b) => a.block - b.block || a.ts - b.ts);
      const seenEarly = new Set<string>();
      for (const e of buyEvents) {
        if (seenEarly.size >= EARLY_N) break;
        if (!seenEarly.has(e.wallet)) {
          seenEarly.add(e.wallet);
          earlyByWallet.set(e.wallet, (earlyByWallet.get(e.wallet) ?? 0) + 1);
        }
      }
      // did proven wallets get in early? (strong retro + live signal)
      let smartFirstBuyers = 0;
      for (const b of seenEarly) if (smartSet.has(b)) smartFirstBuyers += 1;
      const earlySmartEntry = smartFirstBuyers >= 2;

      // Same-block bundle: ≥3 distinct wallets buying in one block, sizes clustered
      // (each within 2× of the block's median) → coordinated, not organic.
      const byBlock = new Map<number, { wallet: string; v: number }[]>();
      for (const e of buyEvents) {
        if (!e.block) continue;
        const arr = byBlock.get(e.block) ?? [];
        arr.push({ wallet: e.wallet, v: e.v });
        byBlock.set(e.block, arr);
      }
      let bundleWallets = 0;
      for (const arr of byBlock.values()) {
        const wallets = new Set(arr.map((a) => a.wallet));
        if (wallets.size < 3) continue;
        const vals = arr.map((a) => a.v).sort((a, b) => a - b);
        const med = vals[Math.floor(vals.length / 2)] || 1;
        const clustered = arr.filter((a) => a.v <= 2 * med && a.v >= med / 2).length;
        if (clustered >= 3) bundleWallets = Math.max(bundleWallets, wallets.size);
      }

      const netFlow = buyVol - sellVol;
      const smartNet = smartBuyUsd - smartSellUsd;
      const pressure = buyVol + sellVol > 0 ? (buyVol - sellVol) / (buyVol + sellVol) : 0;
      const accel = v5 - vPrev;
      const maxWalletBuy = Math.max(0, ...perWalletBuyUsd.values());
      const buyerConcentration = buyVol > 0 ? maxWalletBuy / buyVol : 0;
      const ageMin = m.launchedAt != null ? Math.max(0, Math.round((clock - m.launchedAt) / 60000)) : null;
      const gradVel = this.gradVelocity(token);
      const etaMin =
        gradVel != null && gradVel > 0 && m.graduationPct != null && m.graduationPct < 100
          ? Math.round((100 - m.graduationPct) / gradVel)
          : null;
      const imminent = !!(m.graduationPct != null && m.graduationPct >= 80 && gradVel != null && gradVel > 0 && etaMin != null && etaMin <= 60);
      const state: FlowState =
        smartNet > 0 && smartBuyUsd > 1.5 * smartSellUsd ? "accumulating"
          : smartNet < 0 && smartSellUsd > 1.5 * smartBuyUsd ? "distributing"
            : "neutral";

      // ----- depth layer: deployer + liquidity risk -----
      const dh = this.deployerHist.get(m.deployer);
      const deployerTokens = dh?.tokens.size ?? (m.deployer ? 1 : 0);
      const deployerGradRate = dh && dh.tokens.size ? dh.graduated.size / dh.tokens.size : m.graduated ? 1 : 0;
      const serialRugger = deployerTokens >= 3 && deployerGradRate < 0.15;
      const deployerSelling = !!(m.deployer && sellers.has(m.deployer));
      const liqRatio = m.liquidityUsd != null && m.marketCapUsd > 0 ? m.liquidityUsd / m.marketCapUsd : null;
      const liqHealth = liqRatio == null ? null : liqRatio < 0.05 ? "thin" : liqRatio > 0.2 ? "deep" : "ok";
      const hc = this.holderCache.get(token);

      // price momentum + sparkline from the price history buffer
      const smartShare = buyVol > 0 ? smartBuyUsd / buyVol : 0;
      const ph = this.priceHist.get(token) ?? [];
      const nowP = ph.length ? ph[ph.length - 1].p : m.priceUsd;
      let baseP: number | null = null;
      for (const s of ph) if (s.at <= clock - M60) baseP = s.p;
      if (baseP == null && ph.length) baseP = ph[0].p;
      const priceChange1h = baseP && baseP > 0 ? Number(((nowP - baseP) / baseP).toFixed(4)) : null;
      const spark = ph.slice(-12).map((s) => Number(s.p.toPrecision(6)));

      raws.push({
        intel: {
          symbol: m.symbol,
          token,
          priceUsd: m.priceUsd,
          marketCapUsd: m.marketCapUsd,
          liquidityUsd: m.liquidityUsd,
          ageMin,
          graduationPct: m.graduationPct,
          gradVelocity: gradVel != null ? Number(gradVel.toFixed(3)) : null,
          etaMin,
          imminent,
          buyCount,
          sellCount,
          buyVolUsd: Math.round(buyVol),
          sellVolUsd: Math.round(sellVol),
          netFlowUsd: Math.round(netFlow),
          pressure: Number(pressure.toFixed(3)),
          accel,
          uniqueBuyers: buyers.size,
          smartBuyers: smartBuyers.size,
          smartNetFlowUsd: Math.round(smartNet),
          smartInflowUsd: Math.round(smartBuyUsd),
          buyerConcentration: Number(buyerConcentration.toFixed(3)),
          state,
          recentBuys,
          deployer: m.deployer,
          liqHealth,
          deployerSelling,
          deployerTokens,
          deployerGradRate: Number(deployerGradRate.toFixed(2)),
          serialRugger,
          top10Pct: hc?.top10Pct ?? null,
          devHoldPct: hc?.devHoldPct ?? null,
          concentrated: hc != null && hc.top10Pct > 0.6,
          bundleWallets,
          earlySmartEntry,
          smartFirstBuyers,
          priceChange1h,
          smartShare: Number(smartShare.toFixed(3)),
          biggestBuyUsd: Math.round(biggestBuy),
          biggestSellUsd: Math.round(biggestSell),
          volume24hUsd: hc?.volume24h ?? null,
          spark,
        },
        smartNetPos: Math.max(0, smartNet),
        accelPos: Math.max(0, accel),
        gradVel: Math.max(0, gradVel ?? 0),
        ageBoost: ageMin != null ? Math.max(0, 1 - ageMin / 2880) : 0.3,
        trades: rows.length,
        wash: buyerConcentration,
      });

      // cluster + distribution + heating alerts
      if (smartBuyers.size >= 2) {
        alerts.push({
          id: `cluster-${token}`,
          type: "cluster",
          symbol: m.symbol,
          token,
          detail: `${smartBuyers.size} smart wallets accumulating ${m.symbol} · $${Math.round(smartBuyUsd).toLocaleString()} in`,
          valueUsd: Math.round(smartBuyUsd),
          at: clock,
          severity: smartBuyers.size >= 3 ? "high" : "medium",
        });
      }
      if (state === "distributing" && smartSellUsd >= HEATING_INFLOW_USD) {
        alerts.push({
          id: `dist-${token}`,
          type: "distribution",
          symbol: m.symbol,
          token,
          detail: `Smart money is EXITING ${m.symbol} · $${Math.round(smartSellUsd).toLocaleString()} sold`,
          valueUsd: Math.round(smartSellUsd),
          at: clock,
          severity: "high",
        });
      }
      if (ageMin != null && ageMin <= HEATING_AGE_MIN && smartNet >= HEATING_INFLOW_USD) {
        alerts.push({
          id: `heat-${token}`,
          type: "heating",
          symbol: m.symbol,
          token,
          detail: `${m.symbol} is ${ageMin}m old, smart money accumulating $${Math.round(smartNet).toLocaleString()}`,
          valueUsd: Math.round(smartNet),
          at: clock,
          severity: "high",
        });
      }
      if (bundleWallets >= 3) {
        alerts.push({
          id: `bundle-${token}`,
          type: "bundle",
          symbol: m.symbol,
          token,
          detail: `${bundleWallets} wallets bought ${m.symbol} in one block — coordinated bundle`,
          valueUsd: 0,
          at: clock,
          severity: bundleWallets >= 5 ? "high" : "medium",
        });
      }
      if (earlySmartEntry) {
        alerts.push({
          id: `early-${token}`,
          type: "earlysmart",
          symbol: m.symbol,
          token,
          detail: `${smartFirstBuyers} proven wallets were early buyers of ${m.symbol}`,
          valueUsd: Math.round(smartBuyUsd),
          at: clock,
          severity: "medium",
        });
      }
    }

    // ----- Cross-sectional normalisation → 0–100 heat -----
    const norm = (vals: number[]) => {
      const min = Math.min(...vals), max = Math.max(...vals);
      const span = max - min;
      return (x: number) => (span > 0 ? (x - min) / span : 0);
    };
    const nSmart = norm(raws.map((r) => r.smartNetPos));
    const nAccel = norm(raws.map((r) => r.accelPos));
    const nPress = norm(raws.map((r) => Math.max(0, r.intel.pressure)));
    const nBuyers = norm(raws.map((r) => r.intel.uniqueBuyers));
    const nGrad = norm(raws.map((r) => r.gradVel));

    const tokens: TokenIntel[] = raws.map((r) => {
      let heat =
        100 *
        (0.3 * nSmart(r.smartNetPos) +
          0.2 * nAccel(r.accelPos) +
          0.15 * nPress(Math.max(0, r.intel.pressure)) +
          0.15 * nBuyers(r.intel.uniqueBuyers) +
          0.1 * nGrad(r.gradVel) +
          0.1 * r.ageBoost);
      heat *= r.trades / (r.trades + 20); // thin-data shrink
      if (r.wash > 0.6) heat *= 0.5; // wash gate
      const h = Math.round(Math.max(0, Math.min(100, heat)));
      const heatBand: HeatBand = h >= 70 ? "hot" : h >= 40 ? "warm" : "cold";
      return { ...r.intel, heat: h, heatBand };
    });

    for (const w of scores) {
      w.earlyBuys = earlyByWallet.get(w.wallet) ?? 0;
      w.tier = tierFor(w);
    }

    tokens.sort((a, b) => b.heat - a.heat);
    buys.sort((a, b) => b.at - a.at);
    const seenAlert = new Set<string>();
    const rankedAlerts = alerts
      .sort((a, b) => (b.severity === "high" ? 1 : 0) - (a.severity === "high" ? 1 : 0) || b.at - a.at)
      .filter((a) => (seenAlert.has(a.id) ? false : seenAlert.add(a.id)))
      .slice(0, 24);

    const stats = this.trackStats(tokens, rankedAlerts.length, clock);

    return {
      scores,
      tokens: tokens.slice(0, 24),
      alerts: rankedAlerts,
      buys: buys.slice(0, 40),
      meta: {
        scannedTokens: tokenTrades.length,
        trades: totalTrades,
        wallets: scores.length,
        updatedAt: clock,
        source: "pons",
        live: true,
        activeTotal: this.lastTotals.active,
        graduatedTotal: this.lastTotals.graduated,
        launchTotal: this.lastTotals.launch,
        stats,
      },
    };
  }
}
