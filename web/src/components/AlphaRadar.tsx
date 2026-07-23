import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { compact, count } from "../lib/format";
import { addrUrl } from "../lib/explorer";
import type { TokenIntel, SmartMeta } from "../lib/agentSmart";
import "./alpharadar.css";

const STATE_LABEL: Record<TokenIntel["state"], string> = {
  accumulating: "accumulating",
  distributing: "distributing",
  neutral: "flat",
};

function usd(n: number): string {
  const s = n < 0 ? "−" : "";
  return `${s}$${compact(Math.abs(n))}`;
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

/**
 * The Token Alpha-Radar: the tokens smart money and buy pressure are flowing into
 * (or out of), ranked by a normalised 0–100 heat score. Each row reads at a glance —
 * heat, age, graduation progress + ETA, smart-money net flow and its direction — and
 * expands to the full read. Agent-only (needs the deep server scan); hidden otherwise.
 */
export function AlphaRadar({ tokens, market }: { tokens: TokenIntel[]; market?: SmartMeta }) {
  if (!tokens.length) return null;
  const gradRate = market?.launchTotal ? Math.round(((market.graduatedTotal ?? 0) / market.launchTotal) * 100) : null;
  return (
    <section className="panel alphapanel">
      <div className="alphapanel__head">
        <div>
          <h2 className="alphapanel__title">
            <span className="alphapanel__idx num">◈</span> Alpha radar
          </h2>
          <p className="alphapanel__sub">
            Tokens ranked by a 0–100 heat score — smart-money net flow, buy pressure,
            velocity, breadth and graduation pace. Green = accumulating, red = distributing.
          </p>
          {market?.launchTotal ? (
            <p className="alphapanel__market num">
              {count(market.launchTotal)} launched · {count(market.activeTotal ?? 0)} live ·{" "}
              {count(market.graduatedTotal ?? 0)} graduated{gradRate != null ? ` · ${gradRate}% grad rate` : ""}
            </p>
          ) : null}
        </div>
        <span className="alphapanel__count num">{tokens.length}</span>
      </div>

      <div className="alpha__headrow" aria-hidden="true">
        <span>Heat</span>
        <span>Token</span>
        <span>Graduation</span>
        <span>Smart net flow</span>
      </div>

      <ol className="alphalist">
        {tokens.map((t) => (
          <TokenRow key={t.token} t={t} />
        ))}
      </ol>

      <p className="alphapanel__note">
        Heat is normalised across the tokens scanned this pass and shrunk on thin data;
        one-wallet-dominated volume is gated down. A read on where money is moving now, not advice.
      </p>
    </section>
  );
}

function TokenRow({ t }: { t: TokenIntel }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buyShare = t.buyVolUsd + t.sellVolUsd > 0 ? t.buyVolUsd / (t.buyVolUsd + t.sellVolUsd) : 0.5;

  return (
    <li className={`alpharow ${open ? "is-open" : ""}`} data-band={t.heatBand}>
      <button
        type="button"
        className="alpharow__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="alpharow__heat num">{t.heat}</span>

        <span className="alpharow__id">
          <span className="alpharow__sym">{t.symbol}</span>
          <span className="alpharow__chips">
            <span className="achip achip--age">{ageLabel(t.ageMin)}</span>
            <span className={`achip achip--state achip--${t.state}`}>{STATE_LABEL[t.state]}</span>
            {t.priceChange1h != null && (
              <span className={`achip achip--mom achip--mom-${t.priceChange1h >= 0 ? "up" : "down"}`}>
                {t.priceChange1h >= 0 ? "▲" : "▼"} {Math.abs(t.priceChange1h * 100).toFixed(0)}% 1h
              </span>
            )}
            {t.imminent && <span className="achip achip--grad">grad ~{t.etaMin}m</span>}
            {t.earlySmartEntry && <span className="achip achip--smart">◆ {t.smartFirstBuyers} smart early</span>}
            {t.concentrated && <span className="achip achip--risk">conc {Math.round((t.top10Pct ?? 0) * 100)}%</span>}
            {t.deployerSelling && <span className="achip achip--risk">dev sell</span>}
            {t.serialRugger && <span className="achip achip--risk">serial</span>}
            {t.bundleWallets >= 3 && <span className="achip achip--risk">bundle {t.bundleWallets}</span>}
            {t.liqHealth === "thin" && <span className="achip achip--risk">thin liq</span>}
          </span>
        </span>

        <span className="alpharow__grad" title={t.graduationPct != null ? `${Math.round(t.graduationPct)}% to graduation` : "no bonding curve"}>
          <span className="alpharow__gradtrack">
            <i style={{ ["--g" as string]: Math.max(0, Math.min(1, (t.graduationPct ?? 0) / 100)) }} />
          </span>
          <span className="num alpharow__gradpct">{t.graduationPct != null ? `${Math.round(t.graduationPct)}%` : "—"}</span>
        </span>

        <span className="alpharow__flow">
          <span className="alpharow__flowbar" aria-hidden="true">
            <i className="is-buy" style={{ ["--b" as string]: buyShare }} />
          </span>
          <span className={`num alpharow__net ${t.smartNetFlowUsd >= 0 ? "is-pos" : "is-neg"}`}>
            {t.smartBuyers > 0 ? signedUsd(t.smartNetFlowUsd) : "—"}
          </span>
          <span className="alpharow__chev" aria-hidden="true">▾</span>
        </span>
      </button>

      {open && (
        <div className="alpharow__panel" id={panelId}>
          <div className="alphastats">
            <Stat k="Smart buyers" v={`${t.smartBuyers} · $${compact(t.smartInflowUsd)} in`} />
            <Stat k="Net flow (all)" v={signedUsd(t.netFlowUsd)} tone={t.netFlowUsd >= 0 ? "pos" : "neg"} />
            <Stat k="Buy pressure" v={`${Math.round(t.pressure * 100)}%`} tone={t.pressure >= 0 ? "pos" : "neg"} />
            <Stat k="Unique buyers" v={String(t.uniqueBuyers)} />
            <Stat k="Buy accel (5m)" v={t.accel >= 0 ? `+${t.accel}` : String(t.accel)} tone={t.accel >= 0 ? "pos" : "neg"} />
            <Stat k="Recent buys (60m)" v={String(t.recentBuys)} />
            <Stat k="Market cap" v={`$${compact(t.marketCapUsd)}`} />
            {t.liquidityUsd != null && <Stat k="Liquidity" v={`$${compact(t.liquidityUsd)}`} />}
            {t.etaMin != null && <Stat k="Graduation ETA" v={`~${t.etaMin}m`} />}
            <Stat k="Wash risk" v={`${Math.round(t.buyerConcentration * 100)}% top wallet`} tone={t.buyerConcentration > 0.6 ? "neg" : undefined} />
            {t.top10Pct != null && (
              <Stat k="Top-10 holders" v={`${Math.round(t.top10Pct * 100)}% of supply`} tone={t.concentrated ? "neg" : undefined} />
            )}
            {t.devHoldPct != null && (
              <Stat k="Dev holding" v={`${(t.devHoldPct * 100).toFixed(1)}%`} tone={t.devHoldPct > 0.1 ? "neg" : undefined} />
            )}
            <Stat
              k="Deployer record"
              v={`${t.deployerTokens} seen · ${Math.round(t.deployerGradRate * 100)}% grad`}
              tone={t.serialRugger ? "neg" : undefined}
            />
            {t.liqHealth && <Stat k="Liquidity" v={t.liqHealth} tone={t.liqHealth === "thin" ? "neg" : undefined} />}
            {t.smartFirstBuyers > 0 && (
              <Stat k="Early smart buyers" v={`${t.smartFirstBuyers} in the first ${10}`} tone="pos" />
            )}
            {t.bundleWallets >= 3 && <Stat k="Same-block bundle" v={`${t.bundleWallets} wallets`} tone="neg" />}
            <Stat k="Smart share of buys" v={`${Math.round(t.smartShare * 100)}%`} tone={t.smartShare > 0.3 ? "pos" : undefined} />
            {t.biggestBuyUsd > 0 && <Stat k="Biggest buy" v={`$${compact(t.biggestBuyUsd)}`} tone="pos" />}
            {t.biggestSellUsd > 0 && <Stat k="Biggest sell" v={`$${compact(t.biggestSellUsd)}`} tone="neg" />}
            {t.volume24hUsd != null && <Stat k="24h volume" v={`$${compact(t.volume24hUsd)}`} />}
            {t.priceChange1h != null && (
              <Stat
                k="Price 1h"
                v={`${t.priceChange1h >= 0 ? "+" : ""}${(t.priceChange1h * 100).toFixed(1)}%`}
                tone={t.priceChange1h >= 0 ? "pos" : "neg"}
              />
            )}
          </div>
          {t.spark.length >= 3 && (
            <div className="alphaspark">
              <span className="alphaspark__label num">price · last {t.spark.length} scans</span>
              <Sparkline points={t.spark} up={(t.priceChange1h ?? 0) >= 0} />
            </div>
          )}
          <div className="alpharow__links">
            <Link to={`/token/${t.token}`} className="alpharow__detail">full analysis →</Link>
            <a href={addrUrl(t.token)} target="_blank" rel="noopener noreferrer">token ↗</a>
            {t.deployer && (
              <a href={addrUrl(t.deployer)} target="_blank" rel="noopener noreferrer">deployer ↗</a>
            )}
            <a href={`https://www.ponsfamily.com/launchpad/${t.token}`} target="_blank" rel="noopener noreferrer">pons ↗</a>
          </div>
        </div>
      )}
    </li>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: "pos" | "neg" }) {
  return (
    <div className="alphastat">
      <dt>{k}</dt>
      <dd className={`num ${tone ? `is-${tone}` : ""}`}>{v}</dd>
    </div>
  );
}

/** A tiny price sparkline from the scanner's per-token price history. */
function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 180;
  const h = 34;
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((p - min) / span) * (h - 5) - 2.5).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="alphaspark__svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={up ? "var(--indigo)" : "var(--crimson)"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** The USD helper is exported for the alerts stream to share the compact style. */
export { usd };
