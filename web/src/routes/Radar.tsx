import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getSignals } from "../lib/store";
import { makeLiveDegenSignal, makeLiveNewsSignal } from "../lib/signals";
import { buyToSignal, fetchPonsActivity, type PonsBuy } from "../lib/ponsTrades";
import { fetchAgentSmartMoney, type TokenIntel, type Alert, type SmartMeta } from "../lib/agentSmart";
import { simScores, type WalletScore } from "../lib/smartMoney";
import { SmartMoney } from "../components/SmartMoney";
import { AlphaRadar } from "../components/AlphaRadar";
import { TrackRecord } from "../components/TrackRecord";
import { Alerts } from "../components/Alerts";
import { PriceTicker } from "../components/PriceTicker";
import { SIM_NOW } from "../lib/sim";
import { ago, count } from "../lib/format";
import { txUrl, addrUrl, shortHash } from "../lib/explorer";
import { SIGNAL_LABEL, type Signal, type SignalStrength, type SignalType } from "../lib/types";
import "./radar.css";

const STRENGTH_LEVEL: Record<SignalStrength, number> = { low: 1, medium: 2, high: 3 };
const FEED_CAP = 60;
const FILTERS: SignalType[] = ["smart-money", "whale", "kol", "listing", "unlock"];

/** Where the Degen stream + leaderboard are coming from right now. */
type DegenSource = "agent" | "pons" | "sim";
interface DegenStatus {
  source: DegenSource;
  live: boolean;
  updatedAt: number;
  scannedTokens: number | null;
  wallets: number;
}

interface LiveState {
  signals: Signal[];
  now: number;
  born: Set<string>;
  scores: WalletScore[];
  tokens: TokenIntel[];
  alerts: Alert[];
  market: SmartMeta | null;
  status: DegenStatus;
  loaded: boolean;
}

/**
 * The live tape, two streams into one feed:
 *  - Degen column = REAL buys, preferring the agent's deep scan (many tokens,
 *    accumulated history), then the client-side pons scan, then simulation.
 *  - Chain news column = simulated KOL/macro/prediction signals, every few seconds.
 * A clock ticks the relative times every second; rows that arrive after load are
 * flagged so only they animate in. `status` reports which source is live so the UI
 * never claims "real pons" while it's actually on the sim fallback.
 */
function useLiveSignals(): LiveState {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [scores, setScores] = useState<WalletScore[]>(simScores);
  const [tokens, setTokens] = useState<TokenIntel[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [market, setMarket] = useState<SmartMeta | null>(null);
  const [now, setNow] = useState(SIM_NOW);
  const [status, setStatus] = useState<DegenStatus>({
    source: "sim",
    live: false,
    updatedAt: SIM_NOW,
    scannedTokens: null,
    wallets: 0,
  });
  const [loaded, setLoaded] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const born = useRef<Set<string>>(new Set());
  const smartSet = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    let clock = SIM_NOW;
    let ponsUp = false;

    // Seed the News column from the sim backlog (non-degen); Degen fills from real data.
    getSignals().then((s) => {
      if (!alive) return;
      const news = s.filter((x) => x.desk !== "degen");
      news.forEach((x) => seen.current.add(x.id));
      setSignals(news);
    });

    const clockTimer = window.setInterval(() => {
      clock += 1000;
      setNow(clock);
    }, 1000);

    // News stream — simulated.
    let newsTimer: number;
    const scheduleNews = () => {
      newsTimer = window.setTimeout(
        () => {
          if (!alive) return;
          const sig = makeLiveNewsSignal(clock);
          seen.current.add(sig.id);
          born.current.add(sig.id);
          setSignals((prev) => [sig, ...prev].slice(0, FEED_CAP));
          scheduleNews();
        },
        3500 + Math.random() * 3500,
      );
    };
    scheduleNews();

    // Turn a batch of real buys into signals and merge them, newest first.
    const applyBuys = (buys: PonsBuy[]) => {
      const fresh = buys.filter((b) => !seen.current.has(b.id));
      if (!fresh.length) return;
      const sigs = fresh.map((b) => {
        seen.current.add(b.id);
        born.current.add(b.id);
        const ageMs = Math.max(0, Date.now() - b.at); // map real recency onto the clock
        return { ...buyToSignal(b, smartSet.current), at: clock - ageMs };
      });
      setSignals((prev) => [...sigs, ...prev].sort((a, b) => b.at - a.at).slice(0, FEED_CAP));
    };

    const takeScores = (sc: WalletScore[]) => {
      if (!sc.length) return;
      setScores(sc.slice(0, 12));
      // A buy is "smart money" only if the buyer is a notably profitable wallet
      // (≥$500 up across observed tokens) — real, from the live leaderboard.
      smartSet.current = new Set(sc.filter((w) => w.pnlUsd >= 500).map((w) => w.wallet.toLowerCase()));
    };

    // Degen stream — prefer the AGENT deep scan, then client pons, then sim.
    const pollDegen = async () => {
      // 1. Agent runtime's deep scan (most tokens, accumulated history).
      try {
        const a = await fetchAgentSmartMoney();
        if (!alive) return;
        if (a.meta.source === "pons" && a.scores.length) {
          ponsUp = true;
          takeScores(a.scores);
          applyBuys(a.buys);
          setTokens(a.tokens);
          setAlerts(a.alerts);
          setMarket(a.meta);
          setStatus({
            source: "agent",
            live: true,
            updatedAt: a.meta.updatedAt,
            scannedTokens: a.meta.scannedTokens,
            wallets: a.meta.wallets,
          });
          setLoaded(true);
          return;
        }
      } catch {
        /* agent down — try the browser's own pons scan */
      }
      // 2. Client-side pons scan (top 8 tokens, single snapshot).
      try {
        const { buys, scores: sc } = await fetchPonsActivity();
        if (!alive) return;
        ponsUp = true;
        takeScores(sc);
        applyBuys(buys);
        setStatus({
          source: "pons",
          live: true,
          updatedAt: Date.now(),
          scannedTokens: 8,
          wallets: sc.length,
        });
        setLoaded(true);
        return;
      } catch {
        ponsUp = false; // both real sources down — the sim fallback keeps the column alive
        setStatus((s) => ({ ...s, source: "sim", live: false }));
        setLoaded(true);
      }
    };
    void pollDegen();
    const degenTimer = window.setInterval(pollDegen, 12_000);

    // Sim fallback for the Degen column — only fires while real sources are down.
    let degenSimTimer: number;
    const scheduleDegenSim = () => {
      degenSimTimer = window.setTimeout(
        () => {
          if (!alive) return;
          if (!ponsUp) {
            const sig = makeLiveDegenSignal(clock);
            seen.current.add(sig.id);
            born.current.add(sig.id);
            setSignals((prev) => [sig, ...prev].slice(0, FEED_CAP));
          }
          scheduleDegenSim();
        },
        4000 + Math.random() * 3000,
      );
    };
    scheduleDegenSim();

    return () => {
      alive = false;
      window.clearInterval(clockTimer);
      window.clearTimeout(newsTimer);
      window.clearInterval(degenTimer);
      window.clearTimeout(degenSimTimer);
    };
  }, []);

  return { signals, now, born: born.current, scores, tokens, alerts, market, status, loaded };
}

export function Radar() {
  const { signals, now, born, scores, tokens, alerts, market, status, loaded } = useLiveSignals();
  const [active, setActive] = useState<Set<SignalType>>(new Set());
  const [query, setQuery] = useState("");
  // The tape runs on the sim clock (`now`); freshness is measured against real time.
  // This re-evaluates every render, and the clock ticks a render every second.
  const nowReal = Date.now();

  const counts = useMemo(() => {
    const c = { total: 0, "smart-money": 0, kol: 0, acted: 0 };
    for (const s of signals) {
      c.total += 1;
      if (s.type === "smart-money" || s.type === "kol") c[s.type] += 1;
      if (s.actedOn) c.acted += 1;
    }
    return c;
  }, [signals]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return signals.filter((s) => {
      if (active.size && !active.has(s.type)) return false;
      if (q && !`${s.subject} ${s.actor} ${s.detail}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [signals, active, query]);

  const degen = shown.filter((s) => s.desk === "degen");
  const news = shown.filter((s) => s.desk !== "degen");
  const degenLive = status.source !== "sim";

  const toggle = (t: SignalType) =>
    setActive((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });

  return (
    <div className="page page--wide radar">
      <header className="radar__head">
        <div className="radar__headmain">
          <p className="radar__eyebrow">the radar · chain monitor</p>
          <h1>
            What's moving <em>on-chain</em>.
          </h1>
          <p className="prose">
            Smart-money buys, KOL calls, new listings and whale moves on Robinhood Chain —
            the same feed the agent watches. When it acts on one, you'll see it marked.
          </p>
          {/* Deep-scan meta — honest about scope, freshness, and source. */}
          <p className="radar__meta">
            <SourceBadge status={status} />
            {status.scannedTokens != null && (
              <>
                <span className="radar__metadot" aria-hidden="true">·</span>
                <span className="num">{count(status.scannedTokens)} tokens scanned</span>
              </>
            )}
            {status.wallets > 0 && (
              <>
                <span className="radar__metadot" aria-hidden="true">·</span>
                <span className="num">{count(status.wallets)} wallets ranked</span>
              </>
            )}
            {status.live && (
              <>
                <span className="radar__metadot" aria-hidden="true">·</span>
                {/* the agent stamps updatedAt in real epoch time, so measure it against
                    real time — not the sim clock the signal tape runs on */}
                <span className="num">updated {ago(status.updatedAt, nowReal)} ago</span>
              </>
            )}
          </p>
        </div>
        <span className={`radar__livetag ${degenLive ? "is-live" : "is-sim"}`}>
          <span className="radar__livedot" aria-hidden="true" /> {degenLive ? "live" : "sim"}
        </span>
      </header>

      <div className="radar__tape">
        <PriceTicker />
      </div>

      <section className="radar__stats">
        <Stat label="Signals tracked" value={counts.total} />
        <Stat label="Smart-money buys" value={counts["smart-money"]} />
        <Stat label="KOL calls" value={counts.kol} />
        <Stat label="Agent acted on" value={counts.acted} accent />
      </section>

      {market?.stats && status.source === "agent" && <TrackRecord stats={market.stats} />}

      {(tokens.length > 0 || alerts.length > 0) && (
        <div className="radar__intel">
          <AlphaRadar tokens={tokens} market={market ?? undefined} />
          <Alerts alerts={alerts} now={nowReal} />
        </div>
      )}

      <SmartMoney scores={scores} status={status} loading={!loaded} />

      <FilterBar active={active} onToggle={toggle} query={query} onQuery={setQuery} shown={shown.length} total={signals.length} />

      <div className="radar__cols">
        <FeedColumn
          index="01"
          title="Degen"
          subtitle={
            degenLive
              ? status.source === "agent"
                ? "Real buys — agent deep scan of pons (wallet + USD)"
                : "Real buys on pons — wallet + USD, live from the trade feed"
              : "Simulated buys — pons rate-limited without a partner key"
          }
          live={degenLive}
          signals={degen}
          now={now}
          born={born}
          loading={!loaded}
        />
        <FeedColumn
          index="02"
          title="Chain news"
          subtitle="KOL calls, macro, prediction & futures moves across the chain"
          live
          signals={news}
          now={now}
          born={born}
          loading={false}
        />
      </div>
    </div>
  );
}

function SourceBadge({ status }: { status: DegenStatus }) {
  const label = status.source === "agent" ? "agent · deep scan" : status.source === "pons" ? "pons · live" : "pons · sim";
  return (
    <span className={`radar__src ${status.live ? "is-live" : "is-sim"}`}>
      <span className="radar__srcdot" aria-hidden="true" /> {label}
    </span>
  );
}

function FilterBar({
  active,
  onToggle,
  query,
  onQuery,
  shown,
  total,
}: {
  active: Set<SignalType>;
  onToggle: (t: SignalType) => void;
  query: string;
  onQuery: (v: string) => void;
  shown: number;
  total: number;
}) {
  return (
    <div className="radarfilter" role="toolbar" aria-label="Filter the radar">
      <div className="radarfilter__chips" role="group" aria-label="Signal types">
        {FILTERS.map((t) => {
          const on = active.has(t);
          return (
            <button
              key={t}
              type="button"
              className={`fchip fchip--${t} ${on ? "is-on" : ""}`}
              aria-pressed={on}
              onClick={() => onToggle(t)}
            >
              {SIGNAL_LABEL[t]}
            </button>
          );
        })}
      </div>
      <div className="radarfilter__right">
        <label className="radarfilter__search">
          <span className="sr-only">Search ticker or wallet</span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Filter by ticker…"
            spellCheck={false}
          />
        </label>
        <span className="radarfilter__count num">
          {shown === total ? total : `${shown}/${total}`}
        </span>
      </div>
    </div>
  );
}

function FeedColumn({
  index,
  title,
  subtitle,
  live,
  signals,
  now,
  born,
  loading,
}: {
  index: string;
  title: string;
  subtitle: string;
  live: boolean;
  signals: Signal[];
  now: number;
  born: Set<string>;
  loading: boolean;
}) {
  return (
    <section className="feedcol">
      <div className="feedcol__head">
        <div>
          <h2 className="feedcol__title">
            <span className="feedcol__idx num">{index}</span>
            {title}
            <span className={`feedcol__src ${live ? "is-live" : "is-sim"}`}>{live ? "live" : "simulated"}</span>
          </h2>
          <p className="feedcol__sub">{subtitle}</p>
        </div>
        <span className="feedcol__count num">{signals.length}</span>
      </div>
      <ul className="feed" role="log" aria-live="polite" aria-relevant="additions" aria-busy={loading}>
        {loading && signals.length === 0 ? (
          <SkeletonRows />
        ) : (
          <>
            {signals.map((s) => (
              <SignalRow key={s.id} s={s} now={now} fresh={born.has(s.id)} />
            ))}
            {signals.length === 0 && (
              <li className="feed__empty">
                <span className="feed__emptydot" aria-hidden="true" /> Quiet here right now — watching.
              </li>
            )}
          </>
        )}
      </ul>
    </section>
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <li className="sigrow sigrow--skel" key={i} aria-hidden="true">
          <span className="skel skel__chip" />
          <div className="sigrow__body">
            <span className="skel skel__line" style={{ width: `${70 - i * 8}%` }} />
            <span className="skel skel__line skel__line--sm" style={{ width: `${40 + i * 6}%` }} />
          </div>
        </li>
      ))}
    </>
  );
}

function SignalRow({ s, now, fresh }: { s: Signal; now: number; fresh: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <li
      className={`sigrow ${s.actedOn ? "is-acted" : ""} ${fresh ? "is-new" : ""} ${open ? "is-open" : ""}`}
      data-type={s.type}
    >
      <span className={`chip chip--${s.type}`}>{SIGNAL_LABEL[s.type]}</span>
      <div className="sigrow__body">
        <p className="sigrow__detail">{s.detail}</p>
        <div className="sigrow__meta">
          <span className="num sigrow__actor">{s.actor}</span>
          <span className="num sigrow__subject">{s.subject}</span>
          {s.source?.txHash ? (
            <a
              className="num sigrow__src"
              href={txUrl(s.source.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              title="View the settling transaction on the Robinhood Chain explorer"
            >
              ↗ {shortHash(s.source.txHash)}
            </a>
          ) : (
            <span className="sigrow__src sigrow__src--sim" title="Simulated signal — no on-chain source">
              sim
            </span>
          )}
          {s.actedOn && <span className="sigrow__acted">◆ agent acted</span>}
        </div>
      </div>
      <div className="sigrow__side">
        <Strength level={STRENGTH_LEVEL[s.strength]} label={s.strength} />
        <span className="num sigrow__when" title={new Date(s.at).toLocaleTimeString()}>
          {ago(s.at, now)} ago
        </span>
      </div>
      <button
        type="button"
        className="sigrow__expand"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Hide detail" : "Show detail"}
      >
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <dl className="sigrow__panel" id={panelId}>
          <SigDetail k="Signal" v={SIGNAL_LABEL[s.type]} />
          <SigDetail k="Token" v={s.subject} />
          <SigDetail k="Actor" v={s.actor} />
          <SigDetail k="Strength" v={s.strength} />
          {s.source?.wallet && <SigDetail k="Wallet" v={s.source.wallet} href={addrUrl(s.source.wallet)} />}
          {s.source?.txHash && <SigDetail k="Transaction" v={shortHash(s.source.txHash)} href={txUrl(s.source.txHash)} />}
          <SigDetail k="When" v={new Date(s.at).toLocaleString()} />
          <SigDetail k="Source" v={s.source?.venue ?? "simulated feed"} />
          {s.actedOn && <SigDetail k="Agent" v="opened a position off this signal" />}
        </dl>
      )}
    </li>
  );
}

function SigDetail({ k, v, href }: { k: string; v: string; href?: string }) {
  return (
    <div className="sigdetail">
      <dt>{k}</dt>
      <dd className="num">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {v} <span aria-hidden="true">↗</span>
          </a>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}

function Strength({ level, label }: { level: number; label: string }) {
  return (
    <span className={`strength strength--${level}`} title={`${label} signal`} aria-label={`${label} strength`}>
      <i /> <i /> <i />
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`radar__stat ${accent ? "radar__stat--accent" : ""}`}>
      <dt>{label}</dt>
      <dd key={value} className={`num ${accent ? "is-pos" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
