import { useEffect, useState } from "react";
import { fetchTreasury, type Treasury } from "../lib/agentTreasury";
import { txUrl, addrUrl, shortHash } from "../lib/explorer";
import { count, ago } from "../lib/format";
import "./autoburn.css";

function fmtEth(n: number): string {
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.001) return n.toFixed(4);
  if (n > 0) return n.toPrecision(2); // show real tiny balances, not a rounded "0.00000"
  return "0";
}
function fmtIsx(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
function fmtUsd(n: number): string {
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 }).format(n)}`;
}

/**
 * Real treasury + auto-burn stats. The capital figure is the fee wallet's live on-chain
 * balance — the ETH accumulated from the 2% trading fees. The burn ledger is every $ISX
 * buyback-and-burn, each counted and linked to its settling tx. Everything here is real
 * chain data: before the first burn it shows an honest zero, never a placeholder number.
 */
export function AutoBurn() {
  const [t, setT] = useState<Treasury | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const d = await fetchTreasury();
      if (!alive) return;
      setT(d);
      setLoaded(true);
    };
    load();
    const poll = window.setInterval(load, 20_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, []);

  // Only render once we have a real, reachable treasury (agent live). Stays hidden on
  // the sim fallback so nothing here is ever a simulated number.
  if (!loaded || !t || !t.live) return null;

  return (
    <section className="panel burnpanel">
      <div className="panel__head">
        <h2>Treasury &amp; auto-burn</h2>
        <span className="burnpanel__src num">
          <span className="burnpanel__dot" aria-hidden="true" /> on-chain{t.updatedAt ? ` · ${ago(t.updatedAt, now)} ago` : ""}
        </span>
      </div>

      {/* Live-soon gate: the agent goes live when fees hit the threshold. Real progress. */}
      <div className={`golive ${t.goLive ? "is-live" : ""}`}>
        <div className="golive__row">
          <span className="golive__tag">{t.goLive ? "◆ LIVE" : "◆ Live soon"}</span>
          <span className="num golive__nums">
            {fmtUsd(t.capitalUsd)} <span className="golive__of">/ {fmtUsd(t.liveThresholdUsd)} in fees</span>
          </span>
        </div>
        <div className="golive__track" aria-hidden="true">
          <i style={{ ["--p" as string]: Math.max(0.01, t.progressPct / 100) }} />
        </div>
        <p className="golive__note">
          {t.goLive
            ? "Fee target reached — the agent trades live."
            : `The agent goes live the moment the fee treasury reaches ${fmtUsd(t.liveThresholdUsd)}. ${t.progressPct.toFixed(1)}% there — this bar is the real on-chain balance, not a countdown.`}
        </p>
      </div>

      <div className="burnpanel__kpis">
        <div className="burnkpi">
          <span className="burnkpi__k">Trading capital · from fees</span>
          <span className="num burnkpi__v">{fmtEth(t.capitalEth)} ETH</span>
          <span className="num burnkpi__addr">
            ≈ {fmtUsd(t.capitalUsd)}
            {t.feeWallet && (
              <>
                {" · "}
                <a className="burnkpi__link" href={addrUrl(t.feeWallet)} target="_blank" rel="noopener noreferrer">
                  {t.feeWallet.slice(0, 8)}…{t.feeWallet.slice(-4)} ↗
                </a>
              </>
            )}
          </span>
        </div>
        <div className="burnkpi">
          <span className="burnkpi__k">$ISX auto-burned</span>
          <span className="num burnkpi__v burnkpi__v--burn">{fmtIsx(t.totalBurnedIsx)}</span>
          <span className="num burnkpi__addr">{count(t.burnCount)} {t.burnCount === 1 ? "burn" : "burns"}</span>
        </div>
      </div>

      {t.burns.length > 0 ? (
        <ul className="burnlist">
          <li className="burnlist__head" aria-hidden="true">
            <span>Burned</span>
            <span>When</span>
            <span>Proof</span>
          </li>
          {t.burns.slice(0, 12).map((b) => (
            <li key={b.txHash} className="burnrow">
              <span className="num burnrow__amt">🔥 {fmtIsx(b.amountIsx)} $ISX</span>
              <span className="num burnrow__when">{b.at ? `${ago(b.at, now)} ago` : "—"}</span>
              <a className="num burnrow__tx" href={txUrl(b.txHash)} target="_blank" rel="noopener noreferrer">
                {shortHash(b.txHash)} ↗
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="burnpanel__empty">
          No burns yet. Buybacks begin the first time the agent banks a green close — every burn will
          be counted here and posted with its tx hash, so the supply cut is verifiable, not a claim.
        </p>
      )}
    </section>
  );
}
