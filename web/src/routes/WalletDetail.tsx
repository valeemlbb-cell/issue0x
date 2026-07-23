import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchWalletDetail, type WalletDetail as WalletDetailT, type WalletTrade } from "../lib/agentWallet";
import type { WalletTokenPnl } from "../lib/smartMoney";
import { compact, count, pnl, ago } from "../lib/format";
import { shortWallet } from "../lib/ponsTrades";
import { addrUrl, txUrl, shortHash } from "../lib/explorer";
import "./wallet-detail.css";

type Phase = "loading" | "ready" | "missing" | "offline";
const POLL_MS = 8000;

function usd(n: number): string {
  const a = Math.abs(n);
  if (a > 0 && a < 1) return "<$1";
  return `$${compact(a)}`;
}
function holdLabel(min: number): string {
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

/**
 * The per-wallet drill-down: everything the agent's deep scan knows about one wallet —
 * its tier and realised/open P&L, its win rate, the tokens it traded and how each one
 * paid off, and a live tape of its buys and sells across the radar with links to the
 * settling txs and to each token's page. Reached by clicking a wallet in a trade tape,
 * the buyers list, or the leaderboard. Auto-refreshes; agent-only.
 */
export function WalletDetail() {
  const { address = "" } = useParams();
  const [detail, setDetail] = useState<WalletDetailT | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
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
        const d = await fetchWalletDetail(address, ctrl.signal);
        if (!alive) return;
        loadedOnce.current = true;
        setDetail(d);
        setPhase("ready");
      } catch (e) {
        if (!alive) return;
        if (!loadedOnce.current) {
          setPhase((e as Error).message === "not-seen" ? "missing" : "offline");
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — the full address is still shown */
    }
  };

  if (phase === "loading") {
    return (
      <div className="page page--wide walletdetail">
        <BackLink />
        <div className="wkd__loading">Loading wallet record…</div>
      </div>
    );
  }
  if (phase === "missing" || phase === "offline") {
    return (
      <div className="page page--wide walletdetail">
        <BackLink />
        <div className="wkd__empty">
          <h1>{phase === "missing" ? "Wallet not on the tape" : "Agent offline"}</h1>
          <p className="prose">
            {phase === "missing" ? (
              <>
                This wallet hasn't traded any token the scanner is watching — it isn't in the current
                deep scan. The record is reconstructed from pons trades on the tokens on the radar.
              </>
            ) : (
              <>
                The scanner isn't reachable right now, so this wallet's record can't be shown. The
                drill-down needs the agent's deep scan.
              </>
            )}
          </p>
          <div className="wkd__emptylinks">
            <Link to="/radar" className="wkd__cta">← back to the radar</Link>
            {address && (
              <a href={addrUrl(address)} target="_blank" rel="noopener noreferrer" className="wkd__cta wkd__cta--ghost">
                open on explorer ↗
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  const d = detail!;
  const w = d.score;
  const breakdown = (w.breakdown ?? []).slice().sort((a, b) => b.pnlUsd - a.pnlUsd);

  return (
    <div className="page page--wide walletdetail">
      <BackLink />

      {/* ---- Header ---- */}
      <header className="wkd__head">
        <div className="wkd__rankwrap">
          <span className="wkd__rank num">{d.rank != null ? `#${d.rank}` : "—"}</span>
          <span className="wkd__ranklabel">{d.rank != null ? "on board" : "unranked"}</span>
        </div>
        <div className="wkd__id">
          <h1 className="wkd__wallet num">{shortWallet(w.wallet)}</h1>
          <div className="wkd__chips">
            {w.tier !== "trader" && <span className={`tier tier--${w.tier}`}>{w.tier}</span>}
            {w.diamond && <span className="smtag smtag--diamond">diamond</span>}
            {w.flipper && <span className="smtag smtag--flipper">flipper</span>}
            {w.fresh && (
              <span className="smtag smtag--fresh" title={w.txCount != null ? `${w.txCount} total txs` : "new wallet"}>
                {w.pnlUsd > 1000 ? "fresh ⚠" : "fresh"}
              </span>
            )}
          </div>
          <div className="wkd__addr">
            <span className="num wkd__addrfull">{w.wallet}</span>
            <button type="button" className="wkd__copy" onClick={copy}>
              {copied ? "✓ copied" : "⧉ copy"}
            </button>
            <a href={addrUrl(w.wallet)} target="_blank" rel="noopener noreferrer" className="wkd__copy">
              explorer ↗
            </a>
          </div>
        </div>
        <div className={`wkd__pnlbig num ${w.pnlUsd >= 0 ? "is-pos" : "is-neg"}`}>
          <span className="wkd__pnlval">{pnl(w.pnlUsd)}</span>
          <span className="wkd__pnllabel">total P&amp;L (on radar)</span>
        </div>
      </header>

      {/* ---- Hero P&L split ---- */}
      <section className="panel wkd__band">
        <Split k="Realized" v={pnl(w.realizedUsd)} tone={w.realizedUsd >= 0 ? "pos" : "neg"} />
        <Split k="Open" v={pnl(w.unrealizedUsd)} tone={w.unrealizedUsd >= 0 ? "pos" : "neg"} />
        <Split k="Win rate" v={`${Math.round(w.winRateLB * 100)}%`} sub={`${Math.round(w.winRate * 100)}% raw`} />
        <Split k="Volume" v={usd(w.volumeUsd)} />
      </section>

      {/* ---- Stats ---- */}
      <section className="panel wkd__section">
        <h2 className="wkd__h2"><span className="wkd__idx num">◆</span> Record</h2>
        <div className="wkd__grid">
          <Stat k="Tokens traded" v={count(w.tokens)} />
          <Stat k="Trades" v={count(w.trades)} />
          <Stat k="Win rate (Wilson)" v={`${Math.round(w.winRateLB * 100)}%`} tone={w.winRateLB >= 0.5 ? "pos" : undefined} />
          {w.earlyBuys > 0 && <Stat k="Early on" v={`${count(w.earlyBuys)} tokens`} tone="pos" />}
          {w.holdMedianMin != null && <Stat k="Median hold" v={holdLabel(w.holdMedianMin)} />}
          {w.txCount != null && <Stat k="On-chain txs" v={count(w.txCount)} tone={w.fresh ? "neg" : undefined} />}
          <Stat k="Effective score" v={pnl(Math.round(w.score))} tone={w.score >= 0 ? "pos" : "neg"} />
        </div>
      </section>

      {/* ---- Per-token breakdown ---- */}
      {breakdown.length > 0 && (
        <section className="panel wkd__section">
          <h2 className="wkd__h2">
            <span className="wkd__idx num">≣</span> Tokens <span className="wkd__count num">{breakdown.length}</span>
          </h2>
          <div className="wkd__toks">
            <div className="wkd__tokhead" aria-hidden="true">
              <span>Token</span>
              <span>Bought · sold · held</span>
              <span>P&amp;L</span>
            </div>
            <ul className="wkd__toklist">
              {breakdown.map((b) => (
                <TokenRow key={b.symbol} b={b} />
              ))}
            </ul>
          </div>
          <p className="wkd__note">
            P&amp;L = sold + still-held (at the current price) − bought, per token, across the tokens on
            the radar. Not this wallet's whole book — only what crossed the scan.
          </p>
        </section>
      )}

      {/* ---- Trade tape ---- */}
      <section className="panel wkd__section">
        <h2 className="wkd__h2">
          <span className="wkd__idx num">↹</span> Trades <span className="wkd__count num">{d.trades.length}</span>
        </h2>
        {d.trades.length > 0 ? (
          <ul className="wkd__tape">
            {d.trades.map((tr, i) => (
              <TradeRow key={`${tr.txHash}-${i}`} tr={tr} now={now} />
            ))}
          </ul>
        ) : (
          <p className="wkd__note">No trades captured in the current window.</p>
        )}
      </section>

      <p className="wkd__foot num">
        Auto-refreshing every {POLL_MS / 1000}s · a heuristic P&amp;L from pons trades, not a certified record
      </p>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/radar" className="wkd__back">
      ← radar
    </Link>
  );
}

function Split({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: "pos" | "neg" }) {
  return (
    <div className="wkd__split">
      <span className="wkd__splitk">{k}</span>
      <span className={`num wkd__splitv ${tone ? `is-${tone}` : ""}`}>{v}</span>
      {sub && <span className="num wkd__splitsub">{sub}</span>}
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: "pos" | "neg" }) {
  return (
    <div className="wkd__stat">
      <dt>{k}</dt>
      <dd className={`num ${tone ? `is-${tone}` : ""}`}>{v}</dd>
    </div>
  );
}

function TokenRow({ b }: { b: WalletTokenPnl }) {
  const inner = (
    <>
      <span className="num wkd__toksym">{b.symbol}</span>
      <span className="num wkd__tokmeta">
        {usd(b.buyUsd)} · {usd(b.sellUsd)}
        {b.holdingUsd > 0 && <> · {usd(b.holdingUsd)} held</>} · {b.trades}t
      </span>
      <span className={`num wkd__tokpnl ${b.pnlUsd >= 0 ? "is-pos" : "is-neg"}`}>{pnl(b.pnlUsd)}</span>
    </>
  );
  return b.token ? (
    <li className="wkd__tok">
      <Link to={`/token/${b.token}`} className="wkd__toklink">
        {inner}
      </Link>
    </li>
  ) : (
    <li className="wkd__tok wkd__tok--plain">{inner}</li>
  );
}

function TradeRow({ tr, now }: { tr: WalletTrade; now: number }) {
  const isBuy = tr.side.toLowerCase() === "buy";
  return (
    <li className={`wkd__trade ${isBuy ? "is-buy" : "is-sell"}`}>
      <span className="wkd__tradeside">{isBuy ? "BUY" : "SELL"}</span>
      <Link to={`/token/${tr.token}`} className="num wkd__tradetok">
        {tr.symbol}
      </Link>
      <span className="num wkd__tradeusd">{usd(tr.valueUsd)}</span>
      <span className="num wkd__tradetime">{tr.at > 0 ? `${ago(tr.at, now)} ago` : "—"}</span>
      {tr.txHash ? (
        <a href={txUrl(tr.txHash)} target="_blank" rel="noopener noreferrer" className="num wkd__tradetx">
          {shortHash(tr.txHash)} ↗
        </a>
      ) : (
        <span className="wkd__tradetx wkd__tradetx--none">—</span>
      )}
    </li>
  );
}
