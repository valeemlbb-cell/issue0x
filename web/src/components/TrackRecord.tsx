import { count } from "../lib/format";
import type { ScanStats } from "../lib/agentSmart";
import "./trackrecord.css";

const TYPE_LABEL: Record<string, string> = {
  heating: "Heating",
  earlysmart: "Early smart",
  accumulating: "Accumulating",
};

function windowLabel(hrs: number): string {
  if (hrs >= 24) return "last 24h";
  if (hrs < 1) return `last ${Math.max(1, Math.round(hrs * 60))}m`;
  return `last ${hrs.toFixed(hrs < 10 ? 1 : 0)}h`;
}
function pctLabel(frac: number | null): string {
  if (frac == null) return "—";
  return `${Math.round(frac * 100)}%`;
}
function retLabel(frac: number | null): string {
  if (frac == null) return "—";
  const s = frac >= 0 ? "+" : "−";
  return `${s}${(Math.abs(frac) * 100).toFixed(1)}%`;
}

/**
 * The scanner's own track record: how much it's watching (wallets, tokens, trades) and
 * how its calls have played out (signals logged, resolved, hit rate, average forward
 * return). A self-graded backtest of the radar — a signal "hits" if the token's price
 * rose ≥10% about 45 minutes after it fired. Honest about the window (time since the
 * scanner started, capped at 24h) and honest that this is signal quality, not P&L.
 * Agent-only — hidden when the deep scan isn't the live source.
 */
export function TrackRecord({ stats }: { stats: ScanStats }) {
  const win = windowLabel(stats.windowHrs);
  const hitTone = stats.hitRate == null ? undefined : stats.hitRate >= 0.5 ? "pos" : stats.hitRate < 0.35 ? "neg" : undefined;

  return (
    <section className="panel trec">
      <div className="trec__head">
        <div>
          <h2 className="trec__title">
            <span className="trec__idx num">▚</span> Track record
          </h2>
          <p className="trec__sub">
            What the scanner is watching, and how its calls resolve — a self-graded backtest of the radar.
          </p>
        </div>
        <span className="trec__window num">{win}</span>
      </div>

      {/* Hero row — the four numbers that matter */}
      <div className="trec__hero">
        <Tile k="Wallets tracked" v={count(stats.walletsTracked)} sub={`${count(stats.walletsActive24h)} active 24h`} hero />
        <Tile k="Signals" v={count(stats.signals24h)} sub={`${win} · ${count(stats.signalsResolved)} resolved`} hero />
        <Tile
          k="Hit rate"
          v={pctLabel(stats.hitRate)}
          sub={stats.signalsResolved > 0 ? `${count(stats.signalsHit)} / ${count(stats.signalsResolved)} rose ≥10%` : "resolving…"}
          tone={hitTone}
          hero
        />
        <Tile
          k="Avg forward return"
          v={retLabel(stats.avgReturnPct)}
          sub={stats.bestCall ? `best ${stats.bestCall.symbol} ${retLabel(stats.bestCall.returnPct)}` : "resolving…"}
          tone={stats.avgReturnPct == null ? undefined : stats.avgReturnPct >= 0 ? "pos" : "neg"}
          hero
        />
      </div>

      {/* Secondary strip */}
      <div className="trec__strip">
        <Mini k="Tokens on radar" v={count(stats.tokensScanned)} />
        <Mini k="Tokens seen" v={count(stats.tokensSeen)} />
        <Mini k="Trades observed" v={count(stats.tradesObserved)} />
        <Mini k="Signals logged" v={count(stats.signalsLogged)} />
        <Mini k="Alerts live" v={count(stats.alertsLive)} />
        <Mini k="Uptime" v={upLabel(stats.uptimeMin)} />
      </div>

      {/* Per-type breakdown */}
      <div className="trec__types">
        {stats.byType.map((t) => {
          const rate = t.resolved > 0 ? t.hit / t.resolved : null;
          return (
            <div className="trec__type" key={t.type}>
              <div className="trec__typehead">
                <span className="trec__typename">{TYPE_LABEL[t.type] ?? t.type}</span>
                <span className={`num trec__typerate ${rate == null ? "" : rate >= 0.5 ? "is-pos" : rate < 0.35 ? "is-neg" : ""}`}>
                  {pctLabel(rate)}
                </span>
              </div>
              <div className="trec__typebar" aria-hidden="true">
                <i style={{ ["--r" as string]: rate ?? 0 }} className={rate == null ? "is-empty" : ""} />
              </div>
              <span className="num trec__typemeta">
                {count(t.logged)} logged · {count(t.resolved)} resolved · {count(t.hit)} hit
              </span>
            </div>
          );
        })}
      </div>

      <p className="trec__note">
        A signal is logged when a token turns hot, shows early smart-money entry, or flips to accumulating with
        positive smart net flow. It "hits" if the price is up ≥10% about 45 minutes later, judged against the
        last price we saw. Self-graded signal quality across a window that starts when the scanner did — not P&L,
        not advice.
      </p>
    </section>
  );
}

function upLabel(min: number): string {
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / 1440)}d`;
}

function Tile({ k, v, sub, tone, hero }: { k: string; v: string; sub?: string; tone?: "pos" | "neg"; hero?: boolean }) {
  return (
    <div className={`trec__tile ${hero ? "trec__tile--hero" : ""}`}>
      <span className="trec__tilek">{k}</span>
      <span className={`num trec__tilev ${tone ? `is-${tone}` : ""}`}>{v}</span>
      {sub && <span className="num trec__tilesub">{sub}</span>}
    </div>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="trec__mini">
      <span className="num trec__miniv">{v}</span>
      <span className="trec__minik">{k}</span>
    </div>
  );
}
