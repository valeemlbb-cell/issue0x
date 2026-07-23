import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Seal } from "../components/Seal";
import { Avatar } from "../components/Avatar";
import { AgentBio } from "../components/AgentBio";
import { HowToUse } from "../components/HowToUse";
import { LaunchCard } from "../components/LaunchCard";
import { Marquee } from "../components/Marquee";
import { PriceTicker } from "../components/PriceTicker";
import { EquityChart } from "../components/EquityChart";
import { useLiveAgent } from "../lib/useLiveAgent";
import { useReveal } from "../lib/useReveal";
import { DATA_SOURCE } from "../lib/store";
import { DESKS } from "../lib/isx";
import { ago, hitRate, pnl, usdg } from "../lib/format";

import "./landing.css";

const MARQUEE = [
  "$ISX · issue0x on Robinhood Chain",
  "one agent — prediction markets, degen, futures",
  "smart money · KOLs · whales — the chain on one radar",
  "every position sealed before it opens",
  "hold $ISX, earn when the agent closes green",
];

export function Landing() {
  const { agent, equity, positions, now, born } = useLiveAgent();
  const closes = useMemo(
    () =>
      positions
        .filter((p) => p.status !== "open")
        .sort((a, b) => b.closedAt - a.closedAt)
        .slice(0, 4),
    [positions],
  );
  // Reveal below-fold sections as they scroll in. Keyed to whether the agent has
  // loaded (so late-rendered sections get observed) — NOT to closes.length, which
  // ticks constantly and would thrash the observer.
  useReveal([!!agent]);

  // Before the agent trades, its equity curve and record would be fabricated. In that
  // state the hero shows the real live-soon launch card instead, and the seeded stat
  // strip is hidden — only real, on-chain figures are shown pre-launch.
  const preLaunch = DATA_SOURCE === "simulation";

  return (
    <>
      <Marquee items={MARQUEE} />
      <PriceTicker />

      {/* ---------- Hero ---------- */}
      <section className="hero">
        <div className="page hero__grid">
          <div className="hero__copy">
            <p className="hero__eyebrow">issue0x · an agentic trader on Robinhood Chain</p>
            <h1 className="hero__title">
              An agent that trades.
              <br />
              A record you <em>can't fake</em>.
            </h1>
            <p className="hero__lede prose">
              issue0x reads the chain — smart-money buys, KOL calls, whale moves — and
              works three desks off it: prediction markets, degen, and futures. Every
              position is sealed before it opens, so the record can't be faked. Hold $ISX
              to share what it closes in profit — and to watch the same radar it trades on.
            </p>
            <div className="hero__actions">
              <Link className="btn btn--primary btn--lg" to="/desk">
                Watch it trade
              </Link>
              <Link className="btn btn--ghost btn--lg" to="/isx">
                How holders earn
              </Link>
            </div>
            <p className="hero__caveat">
              The agent trades protocol capital, never your deposit — you're in its upside
              through the pool, never in its drawdown. Every loss is on the record next to
              every win.
            </p>
          </div>

          {/* Pre-launch: the real live-soon launch card (no fabricated equity/record). */}
          {preLaunch && <LaunchCard avatar={agent?.avatar} handle={agent?.handle} />}

          {/* Live snapshot of the ONE agent: its capital curve, its record, and its
              most recent closes — moving, wins and losses side by side. */}
          {!preLaunch && agent && equity && (
            <div className="demo">
              <div className="demo__card demo__agent">
                <div className="demo__agenttop">
                  <Avatar src={agent.avatar} handle={agent.handle} kind="agent" size={64} />
                  <div>
                    <span className="demo__handle">{agent.handle}</span>
                    <span className="demo__no">
                      <span className="demo__livedot" aria-hidden="true" /> {agent.status} ·
                      agentic trader
                    </span>
                  </div>
                </div>

                <EquityChart points={equity} baseline={agent.startEquity} height={104} />

                <dl className="demo__record">
                  <div>
                    <dt>Realised</dt>
                    <dd className="num is-pos">{pnl(agent.realisedPnl)}</dd>
                  </div>
                  <div>
                    <dt>Win rate</dt>
                    <dd className="num">{hitRate(agent.won, agent.closed)}</dd>
                  </div>
                  <div>
                    <dt>To holders</dt>
                    <dd className="num">{usdg(agent.holderPool)}</dd>
                  </div>
                  <div>
                    <dt>Open</dt>
                    <dd className="num">{agent.open}</dd>
                  </div>
                </dl>
              </div>

              <div className="demo__card demo__feed">
                <div className="demo__feedhead">
                  <span>Recent closes</span>
                  <span className="demo__live">
                    <span className="demo__livedot" aria-hidden="true" /> live
                  </span>
                </div>
                <ul className="demo__list">
                  {closes.map((c) => (
                    <li key={c.id} className={`demo__row ${born.has(c.id) ? "is-new" : ""}`}>
                      <div className="demo__rowtop">
                        <span className="num demo__subject">{c.subject}</span>
                        <Seal status={c.status} size="sm" />
                      </div>
                      <p className="demo__q">{c.title}</p>
                      <div className="demo__rowfoot">
                        <span className={`num ${(c.pnl ?? 0) >= 0 ? "is-pos" : "is-neg"}`}>
                          {pnl(c.pnl ?? 0)} USDG
                        </span>
                        <span className="num demo__when">{ago(c.closedAt, now)} ago</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---------- Stat strip (real record — hidden until the agent trades live) ---------- */}
      {!preLaunch && agent && (
        <section className="page statstrip" data-reveal>
          <Stat label="Trading capital" value={`${usdg(agent.equity)} USDG`} />
          <Stat label="Realised PnL" value={`${pnl(agent.realisedPnl)} USDG`} />
          <Stat label="To holders" value={`${usdg(agent.holderPool)} USDG`} />
          <Stat label="Open positions" value={String(agent.open)} />
        </section>
      )}

      {/* ---------- The agent's dossier ---------- */}
      <AgentBio avatar={agent?.avatar} handle={agent?.handle} status={agent?.status} />

      {/* ---------- How it works ---------- */}
      <section id="how" className="page section">
        <header className="section__head" data-reveal>
          <h2>Four steps, and no way to cheat them</h2>
        </header>
        <ol className="steps">
          <StepItem
            n={1}
            title="Seal"
            body="Before it acts, the agent commits the position — direction, size, one line of why — hashed and timestamped. That's the entry on the record, permanently, before anything happens."
          />
          <StepItem
            n={2}
            title="Work"
            body="The position sits open on its desk. Nobody, not even the agent, can rewrite the entry, backdate it, or quietly drop the ones that go wrong."
          />
          <StepItem
            n={3}
            title="Resolve"
            body="The market settles, or the position closes, on an objective outcome. It's scored on what actually happened — the Brier rule on predictions, realised PnL on trades."
          />
          <StepItem
            n={4}
            title="Pay"
            body="A winning close funds the holder pool and buys back $ISX to burn. The record updates — every position, green or red, stays on it, so what you hold is a track record that can't be curated."
          />
        </ol>
      </section>

      {/* ---------- The desks ---------- */}
      <section className="page section">
        <header className="section__head section__head--row" data-reveal>
          <div>
            <h2>Three desks, one agent</h2>
            <p className="prose">
              The same discipline on very different trades — sealed before it opens, scored
              on the real close.
            </p>
          </div>
          <Link className="btn btn--ghost" to="/desk">
            Open the monitor
          </Link>
        </header>
        <div className="deskrow">
          {DESKS.map((d, i) => (
            <article key={d.id} className="deskbrief" data-reveal style={{ ["--i" as string]: i }}>
              <h3 className="deskbrief__name">{d.name}</h3>
              <p className="deskbrief__scope">{d.scope}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- Run it yourself ---------- */}
      <HowToUse />

      {/* ---------- Close ---------- */}
      <section className="page closer" data-reveal>
        <h2 className="closer__title">The record is open.</h2>
        <p className="prose closer__prose">
          Read how the agent has actually traded before you hold a thing. Every position,
          every hash, every loss is on the table without a wallet.
        </p>
        <Link className="btn btn--primary btn--lg" to="/desk">
          Watch it trade
        </Link>
      </section>
    </>
  );
}

/* ---------- Local pieces ---------- */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <dt className="stat__label">{label}</dt>
      <dd className="stat__value num">{value}</dd>
    </div>
  );
}

function StepItem({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="stepitem" data-reveal style={{ ["--i" as string]: n - 1 }}>
      <span className="stepitem__n num">{n}</span>
      <h3 className="stepitem__title">{title}</h3>
      <p className="stepitem__body">{body}</p>
    </li>
  );
}
