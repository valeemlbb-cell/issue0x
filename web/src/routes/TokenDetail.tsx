import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchTokenDetail, type TokenDetail as TokenDetailT, type TokenTrade, type TokenBuyer } from "../lib/agentToken";
import { compact, count, pnl, ago } from "../lib/format";
import { shortWallet } from "../lib/ponsTrades";
import { tokenUrl, txUrl, shortHash } from "../lib/explorer";
import "./token-detail.css";

type Phase = "loading" | "ready" | "missing" | "offline";
const POLL_MS = 8000;

function usd(n: number): string {
  const a = Math.abs(n);
  if (a > 0 && a < 1) return "<$1"; // a real sub-dollar dust trade, not a zero
  return `$${compact(a)}`;
}
function signedUsd(n: number): string {
  return `${n >= 0 ? "+" : "−"}$${compact(Math.abs(n))}`;
}
function ageLabel(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / 1440)}d`;
}
function priceLabel(p: number): string {
  if (p === 0) return "$0";
  if (p < 0.01) return `$${p.toPrecision(2)}`;
  return `$${p.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
}

/**
 * The per-token drill-down: everything the agent's deep scan knows about one token —
 * its heat and flow, its risk profile (holders, deployer, wash), the scored wallets
 * that traded it, and a live tape of recent buys and sells with links to the settling
 * txs. Auto-refreshes every few seconds like the rest of the monitor. Agent-only; if
 * the agent is down or the token has aged off the scan, the page says so plainly.
 */
export function TokenDetail() {
  const { address = "" } = useParams();
  const [detail, setDetail] = useState<TokenDetailT | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [now, setNow] = useState(() => Date.now());
  const loadedOnce = useRef(false);

  useEffect(() => {
    loadedOnce.current = false;
    setDetail(null);
    setPhase("loading");
    let alive = true;

    const load = async () => {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 12000);
      try {
        const d = await fetchTokenDetail(address, ctrl.signal);
        if (!alive) return;
        loadedOnce.current = true;
        setDetail(d);
        setPhase("ready");
      } catch (e) {
        if (!alive) return;
        // Keep the last good render on a transient blip; only show an error state
        // if we never managed to load this token at all.
        if (!loadedOnce.current) {
          setPhase((e as Error).message === "not-on-radar" ? "missing" : "offline");
        }
      } finally {
        window.clearTimeout(t);
      }
    };

    load();
    const poll = window.setInterval(load, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [address]);

  if (phase === "loading") {
    return (
      <div className="page page--wide tokendetail">
        <BackLink />
        <div className="tkd__loading">Loading token intel…</div>
      </div>
    );
  }
  if (phase === "missing" || phase === "offline") {
    return (
      <div className="page page--wide tokendetail">
        <BackLink />
        <div className="tkd__empty">
          <h1>{phase === "missing" ? "Not on the radar" : "Agent offline"}</h1>
          <p className="prose">
            {phase === "missing" ? (
              <>
                This token isn't in the current deep scan — it may have aged out of the window, or
                never crossed the radar. The scanner tracks the most active tokens on Robinhood Chain.
              </>
            ) : (
              <>
                The scanner isn't reachable right now, so this token's live intel can't be shown. The
                radar itself falls back to a lighter source; the full drill-down needs the agent.
              </>
            )}
          </p>
          <div className="tkd__emptylinks">
            <Link to="/radar" className="tkd__cta">← back to the radar</Link>
            {address && (
              <a href={tokenUrl(address)} target="_blank" rel="noopener noreferrer" className="tkd__cta tkd__cta--ghost">
                open on explorer ↗
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  const d = detail!;
  const t = d.intel;
  const gradPct = t.graduationPct != null ? Math.round(t.graduationPct) : null;

  return (
    <div className="page page--wide tokendetail">
      <BackLink />

      {/* ---- Header ---- */}
      <header className="tkd__head" data-band={t.heatBand}>
        <div className="tkd__heatwrap">
          <span className="tkd__heat num">{t.heat}</span>
          <span className="tkd__heatlabel">heat</span>
        </div>
        <div className="tkd__id">
          <h1 className="tkd__sym">{t.symbol}</h1>
          <div className="tkd__chips">
            <span className={`achip achip--state achip--${t.state}`}>{t.state}</span>
            <span className="achip achip--age">{ageLabel(t.ageMin)} old</span>
            {t.priceChange1h != null && (
              <span className={`achip achip--mom achip--mom-${t.priceChange1h >= 0 ? "up" : "down"}`}>
                {t.priceChange1h >= 0 ? "▲" : "▼"} {Math.abs(t.priceChange1h * 100).toFixed(1)}% 1h
              </span>
            )}
            {t.imminent && <span className="achip achip--grad">grad ~{t.etaMin}m</span>}
            {t.earlySmartEntry && <span className="achip achip--smart">◆ {t.smartFirstBuyers} smart early</span>}
          </div>
          <div className="tkd__addr">
            <span className="num tkd__addrfull">{t.token}</span>
            <a href={tokenUrl(t.token)} target="_blank" rel="noopener noreferrer" className="tkd__link">
              explorer ↗
            </a>
            <a href={`https://www.ponsfamily.com/launchpad/${t.token}`} target="_blank" rel="noopener noreferrer" className="tkd__link">
              pons ↗
            </a>
          </div>
        </div>
        <div className="tkd__price">
          <span className="num tkd__pricebig">{priceLabel(t.priceUsd)}</span>
          <span className="tkd__pricecap num">${compact(t.marketCapUsd)} mcap</span>
        </div>
      </header>

      {/* ---- Graduation + sparkline ---- */}
      <section className="panel tkd__band">
        {gradPct != null && (
          <div className="tkd__grad">
            <div className="tkd__gradlabel">
              <span>Graduation</span>
              <span className="num">
                {gradPct}%{t.etaMin != null ? ` · ETA ~${t.etaMin}m` : gradPct >= 100 ? " · graduated" : ""}
              </span>
            </div>
            <div className="tkd__gradtrack">
              <i style={{ ["--g" as string]: Math.max(0, Math.min(1, gradPct / 100)) }} />
            </div>
          </div>
        )}
        {t.spark.length >= 3 ? (
          <div className="tkd__spark">
            <span className="tkd__sparklabel num">price · last {t.spark.length} scans</span>
            <Sparkline points={t.spark} up={(t.priceChange1h ?? 0) >= 0} />
          </div>
        ) : (
          <p className="tkd__sparkwait num">price sparkline builds over the next few scans…</p>
        )}
      </section>

      {/* ---- Flow intel ---- */}
      <section className="panel tkd__section">
        <h2 className="tkd__h2"><span className="tkd__idx num">◈</span> Flow</h2>
        <div className="tkd__grid">
          <Stat k="Smart net flow" v={t.smartBuyers > 0 ? signedUsd(t.smartNetFlowUsd) : "—"} tone={t.smartNetFlowUsd >= 0 ? "pos" : "neg"} big />
          <Stat k="Smart buyers" v={`${t.smartBuyers} · ${usd(t.smartInflowUsd)} in`} />
          <Stat k="Smart share of buys" v={`${Math.round(t.smartShare * 100)}%`} tone={t.smartShare > 0.3 ? "pos" : undefined} />
          <Stat k="Net flow (all, 60m)" v={signedUsd(t.netFlowUsd)} tone={t.netFlowUsd >= 0 ? "pos" : "neg"} />
          <Stat k="Buy pressure" v={`${Math.round(t.pressure * 100)}%`} tone={t.pressure >= 0 ? "pos" : "neg"} />
          <Stat k="Buys / sells (60m)" v={`${count(t.buyCount)} / ${count(t.sellCount)}`} />
          <Stat k="Unique buyers" v={count(t.uniqueBuyers)} />
          <Stat k="Buy accel (5m)" v={t.accel >= 0 ? `+${t.accel}` : String(t.accel)} tone={t.accel >= 0 ? "pos" : "neg"} />
          <Stat k="Recent buys (60m)" v={count(t.recentBuys)} />
          {t.biggestBuyUsd > 0 && <Stat k="Biggest buy" v={usd(t.biggestBuyUsd)} tone="pos" />}
          {t.biggestSellUsd > 0 && <Stat k="Biggest sell" v={usd(t.biggestSellUsd)} tone="neg" />}
          {t.volume24hUsd != null && <Stat k="24h volume" v={usd(t.volume24hUsd)} />}
          {t.liquidityUsd != null && <Stat k="Liquidity" v={usd(t.liquidityUsd)} />}
        </div>
      </section>

      {/* ---- Risk ---- */}
      <section className="panel tkd__section tkd__section--risk">
        <h2 className="tkd__h2"><span className="tkd__idx num">⚠</span> Risk</h2>
        <div className="tkd__grid">
          {t.top10Pct != null && (
            <Stat k="Top-10 holders" v={`${Math.round(t.top10Pct * 100)}% of supply`} tone={t.concentrated ? "neg" : undefined} />
          )}
          {t.devHoldPct != null && (
            <Stat k="Dev holding" v={`${(t.devHoldPct * 100).toFixed(1)}%`} tone={t.devHoldPct > 0.1 ? "neg" : undefined} />
          )}
          <Stat k="Wash risk" v={`${Math.round(t.buyerConcentration * 100)}% top wallet`} tone={t.buyerConcentration > 0.6 ? "neg" : undefined} />
          <Stat
            k="Deployer record"
            v={`${t.deployerTokens} seen · ${Math.round(t.deployerGradRate * 100)}% grad`}
            tone={t.serialRugger ? "neg" : undefined}
          />
          <Stat k="Deployer selling" v={t.deployerSelling ? "yes — on the tape" : "not seen"} tone={t.deployerSelling ? "neg" : undefined} />
          {t.liqHealth && <Stat k="Liquidity health" v={t.liqHealth} tone={t.liqHealth === "thin" ? "neg" : undefined} />}
          {t.bundleWallets >= 3 && <Stat k="Same-block bundle" v={`${t.bundleWallets} wallets`} tone="neg" />}
          {t.serialRugger && <Stat k="Serial rugger" v="flagged" tone="neg" />}
        </div>
        <p className="tkd__risknote">
          Holder + deployer figures come from Blockscout, pool addresses excluded. A deployer's record
          only counts launches this scanner has seen, so it builds over time — absence isn't innocence.
        </p>
      </section>

      {/* ---- Smart buyers ---- */}
      {d.buyers.length > 0 && (
        <section className="panel tkd__section">
          <h2 className="tkd__h2"><span className="tkd__idx num">◆</span> Smart money in this token <span className="tkd__count num">{d.buyers.length}</span></h2>
          <div className="tkd__buyers">
            <div className="tkd__buyhead" aria-hidden="true">
              <span>Wallet</span>
              <span>Bought here</span>
              <span>P&amp;L here</span>
            </div>
            <ul className="tkd__buylist">
              {d.buyers.map((b) => (
                <BuyerRow key={b.wallet} b={b} />
              ))}
            </ul>
          </div>
          <p className="tkd__risknote">
            Ranked by realised + open P&amp;L on this token across the radar window. Tier reflects the
            wallet's whole record, not just this position.
          </p>
        </section>
      )}

      {/* ---- Trade tape ---- */}
      <section className="panel tkd__section">
        <h2 className="tkd__h2">
          <span className="tkd__idx num">≣</span> Live trades <span className="tkd__count num">{d.trades.length}</span>
        </h2>
        {d.trades.length > 0 ? (
          <ul className="tkd__tape">
            {d.trades.map((tr, i) => (
              <TradeRow key={`${tr.txHash}-${i}`} tr={tr} now={now} />
            ))}
          </ul>
        ) : (
          <p className="tkd__sparkwait num">No trades captured in the current window.</p>
        )}
      </section>

      <p className="tkd__foot num">
        Auto-refreshing every {POLL_MS / 1000}s · agent deep scan of Robinhood Chain
      </p>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/radar" className="tkd__back">
      ← radar
    </Link>
  );
}

function Stat({ k, v, tone, big }: { k: string; v: string; tone?: "pos" | "neg"; big?: boolean }) {
  return (
    <div className={`tkd__stat ${big ? "tkd__stat--big" : ""}`}>
      <dt>{k}</dt>
      <dd className={`num ${tone ? `is-${tone}` : ""}`}>{v}</dd>
    </div>
  );
}

function BuyerRow({ b }: { b: TokenBuyer }) {
  return (
    <li className="tkd__buyer">
      <span className="tkd__buyerid">
        <Link to={`/wallet/${b.wallet}`} className="num tkd__buyerwallet">
          {shortWallet(b.wallet)}
        </Link>
        {b.tier !== "trader" && <span className={`tier tier--${b.tier}`}>{b.tier}</span>}
        {b.fresh && <span className="smtag smtag--fresh">fresh</span>}
      </span>
      <span className="num tkd__buyerbuy">{usd(b.buyUsd)}</span>
      <span className={`num tkd__buyerpnl ${b.tokenPnlUsd >= 0 ? "is-pos" : "is-neg"}`}>{pnl(b.tokenPnlUsd)}</span>
    </li>
  );
}

function TradeRow({ tr, now }: { tr: TokenTrade; now: number }) {
  const isBuy = tr.side.toLowerCase() === "buy";
  return (
    <li className={`tkd__trade ${isBuy ? "is-buy" : "is-sell"}`}>
      <span className="tkd__tradeside">{isBuy ? "BUY" : "SELL"}</span>
      <Link to={`/wallet/${tr.wallet}`} className="num tkd__tradewallet">
        {shortWallet(tr.wallet)}
      </Link>
      <span className="num tkd__tradeusd">{usd(tr.valueUsd)}</span>
      <span className="num tkd__tradetime">{tr.at > 0 ? `${ago(tr.at, now)} ago` : "—"}</span>
      {tr.txHash ? (
        <a href={txUrl(tr.txHash)} target="_blank" rel="noopener noreferrer" className="num tkd__tradetx">
          {shortHash(tr.txHash)} ↗
        </a>
      ) : (
        <span className="tkd__tradetx tkd__tradetx--none">—</span>
      )}
    </li>
  );
}

/** A price sparkline from the scanner's per-token price history. */
function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 260;
  const h = 44;
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((p - min) / span) * (h - 6) - 3).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="tkd__sparksvg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={up ? "var(--indigo)" : "var(--crimson)"} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
