/**
 * Bot feed — the bridge that lets The Desk mirror a REAL issue0x-trader bot.
 *
 * The bot (wherever the operator runs it, on their own machine, with their own key)
 * POSTs a compact snapshot of its state to /report after each cycle. We validate it,
 * clamp it, and keep the latest. The Desk reads /desk-feed and shows those real
 * positions and closes — labelled by the bot's mode (paper or live), never dressed up.
 * If no report arrives for a while, the feed is marked stale so the UI can say so.
 */

export interface BotOpen {
  symbol: string;
  token: string;
  sizeEth: number;
  entryPriceUsd: number;
  entryAt: number;
}
export interface BotClose {
  symbol: string;
  token: string;
  pnlEth: number;
  pnlPct: number;
  status: string;
  reason: string;
  exitAt: number;
  exitTx: string | null;
}
export interface BotReport {
  bot: string;
  mode: "paper" | "live";
  updatedAt: number;
  open: BotOpen[];
  closedRecent: BotClose[];
  realizedPnlEth: number;
  feesPaidEth: number;
  cycles: number;
}
export interface DeskFeed {
  present: boolean;
  stale: boolean;
  receivedAt: number;
  report: BotReport | null;
}

const STALE_MS = 5 * 60 * 1000;

function num(v: unknown, d = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}
function str(v: unknown, d = ""): string {
  return typeof v === "string" ? v.slice(0, 64) : d;
}

/** Validate + clamp an untrusted report body into a safe BotReport, or null. */
export function parseReport(raw: unknown): BotReport | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const mode = o.mode === "live" ? "live" : "paper";
  const open = Array.isArray(o.open) ? o.open : [];
  const closed = Array.isArray(o.closedRecent) ? o.closedRecent : [];
  return {
    bot: str(o.bot, "issue0x-trader"),
    mode,
    updatedAt: num(o.updatedAt, Date.now()),
    realizedPnlEth: num(o.realizedPnlEth),
    feesPaidEth: num(o.feesPaidEth),
    cycles: Math.max(0, Math.floor(num(o.cycles))),
    open: open.slice(0, 50).map((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      return { symbol: str(x.symbol), token: str(x.token), sizeEth: num(x.sizeEth), entryPriceUsd: num(x.entryPriceUsd), entryAt: num(x.entryAt) };
    }),
    closedRecent: closed.slice(0, 30).map((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      return {
        symbol: str(x.symbol),
        token: str(x.token),
        pnlEth: num(x.pnlEth),
        pnlPct: num(x.pnlPct),
        status: str(x.status),
        reason: str(x.reason, "").slice(0, 60),
        exitAt: num(x.exitAt),
        exitTx: typeof x.exitTx === "string" ? x.exitTx.slice(0, 80) : null,
      };
    }),
  };
}

export class BotFeed {
  private report: BotReport | null = null;
  private receivedAt = 0;

  ingest(r: BotReport): void {
    this.report = r;
    this.receivedAt = Date.now();
  }

  get(): DeskFeed {
    const stale = this.receivedAt > 0 && Date.now() - this.receivedAt > STALE_MS;
    return { present: !!this.report && !stale, stale, receivedAt: this.receivedAt, report: this.report };
  }
}
