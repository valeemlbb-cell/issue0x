import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "./Avatar";
import { fetchTreasury, type Treasury } from "../lib/agentTreasury";
import "./launchcard.css";

function usd(n: number): string {
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 }).format(n)}`;
}
function eth(n: number): string {
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.001) return n.toFixed(4);
  if (n > 0) return n.toPrecision(2);
  return "0";
}

/**
 * The pre-launch hero card — the honest replacement for the seeded equity/record demo.
 * It shows only real, on-chain figures: the live-soon progress toward the $1,500 fee
 * target, the fee-wallet capital, and that $ISX is live on pons. No fabricated P&L.
 */
export function LaunchCard({ avatar, handle }: { avatar?: string | null; handle?: string | null }) {
  const [t, setT] = useState<Treasury | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const d = await fetchTreasury();
      if (alive) setT(d);
    };
    load();
    const id = window.setInterval(load, 20_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const progress = t?.progressPct ?? 0;
  const goLive = t?.goLive ?? false;
  const target = t ? usd(t.liveThresholdUsd) : "$1,500";

  return (
    <div className="launchcard">
      <div className="launchcard__top">
        <Avatar src={avatar ?? "/issue0x-avatar.png"} handle={handle ?? "issue0x"} kind="agent" size={64} />
        <div className="launchcard__who">
          <span className="launchcard__handle">{handle ?? "issue0x"}</span>
          <span className="launchcard__status">
            <span className="launchcard__dot" aria-hidden="true" /> pre-launch · agentic trader
          </span>
        </div>
      </div>

      <div className={`launchcard__gate ${goLive ? "is-live" : ""}`}>
        <div className="launchcard__gaterow">
          <span className="launchcard__tag">{goLive ? "◆ LIVE" : "◆ Live soon"}</span>
          <span className="num launchcard__nums">
            {t ? usd(t.capitalUsd) : "—"} <span className="launchcard__of">/ {target} in fees</span>
          </span>
        </div>
        <div className="launchcard__track" aria-hidden="true">
          <i style={{ ["--p" as string]: Math.max(0.01, progress / 100) }} />
        </div>
        <p className="launchcard__note">
          The agent goes live when its fee treasury reaches {target} — real on-chain progress,
          {" "}
          {progress.toFixed(1)}% there.
        </p>
      </div>

      <dl className="launchcard__stats">
        <div>
          <dt>Trading capital · from fees</dt>
          <dd className="num">{t ? `${eth(t.capitalEth)} ETH ≈ ${usd(t.capitalUsd)}` : "—"}</dd>
        </div>
        <div>
          <dt>Launch target</dt>
          <dd className="num">{target} in fees</dd>
        </div>
      </dl>

      <Link to="/radar" className="launchcard__cta">
        Watch the live radar →
      </Link>
    </div>
  );
}
