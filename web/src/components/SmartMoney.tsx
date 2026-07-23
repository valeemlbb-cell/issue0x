import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { pnl, compact, ago } from "../lib/format";
import { shortWallet } from "../lib/ponsTrades";
import { addrUrl } from "../lib/explorer";
import type { WalletScore } from "../lib/smartMoney";
import "./smartmoney.css";

function holdLabel(min: number): string {
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

interface Status {
  source: "agent" | "pons" | "sim";
  live: boolean;
  updatedAt: number;
  scannedTokens: number | null;
  wallets: number;
}

/**
 * The smart-money leaderboard: wallets ranked by their P&L across the tokens on the
 * radar. Rank, wallet, a byline of the record, the P&L headline, and a score bar. A
 * data table, not a card grid — the leader is scaled up, digits are tabular, and
 * each wallet's full address is one copy away so the ranking is evidence, not claim.
 */
export function SmartMoney({
  scores,
  status,
  loading,
}: {
  scores: WalletScore[];
  status?: Status;
  loading?: boolean;
}) {
  const top = scores[0]?.score ?? 1;
  const simulated = status ? !status.live : scores.length > 0 && scores.every((s) => s.simulated);
  const now = status?.updatedAt ?? Date.now();

  return (
    <section className="panel smpanel">
      <div className="smpanel__head">
        <div>
          <h2 className="smpanel__title">
            <span className="smpanel__idx num">◆</span> Smart money
          </h2>
          <p className="smpanel__sub">
            Top wallets by realised + open P&amp;L across the tokens on the radar
            {status?.source === "agent" && status.scannedTokens != null
              ? ` · agent deep scan of ${status.scannedTokens} tokens`
              : simulated
                ? " · simulated"
                : " · live from pons"}
          </p>
        </div>
        <span className={`smpanel__src ${simulated ? "is-sim" : "is-live"}`}>
          <span className="smpanel__srcdot" aria-hidden="true" />
          {simulated ? "sim" : `updated ${ago(now, Date.now())} ago`}
        </span>
      </div>

      <div className="smlist__head" aria-hidden="true">
        <span>#</span>
        <span>Wallet · record</span>
        <span>P&amp;L</span>
      </div>

      <ol className="smlist" aria-busy={loading}>
        {loading && scores.length === 0 ? (
          [0, 1, 2, 3, 4].map((i) => (
            <li className="smrow smrow--skel" key={i} aria-hidden="true">
              <span className="skel skel__rank" />
              <div className="smrow__id">
                <span className="skel skel__line" style={{ width: "45%" }} />
                <span className="skel skel__line skel__line--sm" style={{ width: "65%" }} />
              </div>
              <span className="skel skel__pnl" />
            </li>
          ))
        ) : (
          <>
            {scores.map((w, i) => (
              <Row key={w.wallet} w={w} i={i} top={top} />
            ))}
            {scores.length === 0 && <li className="smrow__empty">Scanning pons for wallet P&amp;L…</li>}
          </>
        )}
      </ol>

      <p className="smpanel__note">
        Score = P&amp;L shrunk for trade count, so a lucky fill can't top the board. Only tokens
        on the radar, open gains marked at the current price — a heuristic for who's up here,
        not a certified track record.
      </p>
    </section>
  );
}

function Row({ w, i, top }: { w: WalletScore; i: number; top: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const panelId = useId();
  const v = Math.max(0, Math.min(1, top > 0 ? w.score / top : 0));
  const rank = i + 1;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(w.wallet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — no-op, the full address is still shown */
    }
  };

  return (
    <li className={`smrow ${rank === 1 ? "is-top" : ""} ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="smrow__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`smrow__rank rank--${rank <= 3 ? rank : "n"}`}>{rank}</span>
        <span className="smrow__id">
          <span className="smrow__idline">
            <span className="num smrow__wallet">{shortWallet(w.wallet)}</span>
            {w.tier !== "trader" && <span className={`tier tier--${w.tier}`}>{w.tier}</span>}
            <span className="smrow__chev" aria-hidden="true">▾</span>
          </span>
          <span className="num smrow__byline" title={`${Math.round(w.winRate * 100)}% raw hit rate`}>
            {w.tokens} {w.tokens === 1 ? "token" : "tokens"} · {Math.round(w.winRateLB * 100)}% win · {w.trades} trades
            {w.volumeUsd > 0 && <> · ${compact(w.volumeUsd)} vol</>}
          </span>
          <span className="smrow__bar" aria-hidden="true">
            <i style={{ ["--v" as string]: v }} />
          </span>
        </span>
        <span className={`num smrow__pnl ${w.pnlUsd >= 0 ? "is-pos" : "is-neg"}`}>{pnl(w.pnlUsd)}</span>
      </button>

      {open && (
        <div className="smrow__panel" id={panelId}>
          {!w.simulated ? (
            <div className="smrow__addr">
              <span className="num smrow__addrfull">{w.wallet}</span>
              <Link className="smrow__copy smrow__copy--go" to={`/wallet/${w.wallet}`}>
                full record →
              </Link>
              <button type="button" className="smrow__copy" onClick={copy} title={copied ? "Copied" : "Copy address"}>
                {copied ? "✓ copied" : "⧉ copy"}
              </button>
              <a className="smrow__copy" href={addrUrl(w.wallet)} target="_blank" rel="noopener noreferrer">
                explorer ↗
              </a>
            </div>
          ) : (
            <p className="smrow__simnote">Simulated wallet — no on-chain address.</p>
          )}

          <div className="smrow__split">
            <span className="smrow__splititem num">
              realized{" "}
              <b className={w.realizedUsd >= 0 ? "is-pos" : "is-neg"}>{pnl(w.realizedUsd)}</b>
            </span>
            <span className="smrow__splititem num">
              open{" "}
              <b className={w.unrealizedUsd >= 0 ? "is-pos" : "is-neg"}>{pnl(w.unrealizedUsd)}</b>
            </span>
            {w.earlyBuys > 0 && <span className="smrow__splititem num">early on {w.earlyBuys}</span>}
            {w.holdMedianMin != null && <span className="smrow__splititem num">holds ~{holdLabel(w.holdMedianMin)}</span>}
            {w.diamond && <span className="smtag smtag--diamond">diamond</span>}
            {w.flipper && <span className="smtag smtag--flipper">flipper</span>}
            {w.fresh && (
              <span className="smtag smtag--fresh" title={w.txCount != null ? `${w.txCount} total txs — a new wallet` : "new wallet"}>
                {w.pnlUsd > 1000 ? "fresh ⚠" : "fresh"}
              </span>
            )}
          </div>

          {w.breakdown && w.breakdown.length > 0 ? (
            <div className="smbreak">
              <div className="smbreak__head" aria-hidden="true">
                <span>Token</span>
                <span>Bought · sold · held</span>
                <span>P&amp;L</span>
              </div>
              <ul className="smbreak__list">
                {w.breakdown.slice(0, 8).map((t) => (
                  <li key={t.symbol} className="smtok">
                    <span className="num smtok__sym">{t.symbol}</span>
                    <span className="num smtok__meta">
                      ${compact(t.buyUsd)} · ${compact(t.sellUsd)}
                      {t.holdingUsd > 0 && <> · ${compact(t.holdingUsd)} held</>} · {t.trades}t
                    </span>
                    <span className={`num smtok__pnl ${t.pnlUsd >= 0 ? "is-pos" : "is-neg"}`}>{pnl(t.pnlUsd)}</span>
                  </li>
                ))}
              </ul>
              <p className="smbreak__note">
                P&amp;L = sold + still-held (at current price) − bought, across the tokens on the radar.
              </p>
            </div>
          ) : (
            !w.simulated && <p className="smrow__simnote">Per-token detail unavailable for this wallet.</p>
          )}
        </div>
      )}
    </li>
  );
}
