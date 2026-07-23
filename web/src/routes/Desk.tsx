import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { EquityChart } from "../components/EquityChart";
import { Seal } from "../components/Seal";
import { AutoBurn } from "../components/AutoBurn";
import { LearningPanel } from "../components/LearningPanel";
import { getLearning, getReasoningFeed, DATA_SOURCE } from "../lib/store";
import { useLiveAgent } from "../lib/useLiveAgent";
import { useAsync } from "../lib/useAsync";
import { ago, brier, hitRate, pnl, prob, until, usdg } from "../lib/format";
import { DESK_LABEL, SIGNAL_LABEL, type Desk as DeskId, type Position } from "../lib/types";
import "./desk.css";

const DESKS: DeskId[] = ["prediction", "degen", "futures"];

/** The sealed intent of a position, one line, per desk. */
function intent(p: Position): string {
  if (p.desk === "prediction") return `${p.side.toUpperCase()} · ${prob(p.conviction)}`;
  if (p.desk === "futures") return `${p.leverage}× ${p.side.toUpperCase()}`;
  return p.side.toUpperCase();
}

function DeskChip({ desk }: { desk: Position["desk"] }) {
  return <span className={`chip chip--${desk}`}>{DESK_LABEL[desk]}</span>;
}

export function Desk() {
  const { positions, now, born, agent, equity } = useLiveAgent();
  const reasoning = useAsync(getReasoningFeed, []);
  const learning = useAsync(getLearning, []);

  const openPositions = useMemo(
    () => positions.filter((p) => p.status === "open").sort((a, b) => a.closedAt - b.closedAt),
    [positions],
  );
  const recentCloses = useMemo(
    () => positions.filter((p) => p.status !== "open").sort((a, b) => b.closedAt - a.closedAt).slice(0, 8),
    [positions],
  );
  const deskStats = useMemo(
    () =>
      DESKS.map((desk) => {
        const mine = positions.filter((p) => p.desk === desk);
        const closed = mine.filter((p) => p.status !== "open");
        return {
          desk,
          open: mine.filter((p) => p.status === "open").length,
          closed: closed.length,
          won: closed.filter((p) => p.status === "won").length,
          pnl: closed.reduce((s, p) => s + (p.pnl ?? 0), 0),
        };
      }),
    [positions],
  );

  const preLaunch = DATA_SOURCE === "simulation";

  return (
    <div className="page desk">
      {/* ---------- Agent masthead ---------- */}
      {agent && (
        <header className="agentbar">
          <div className="agentbar__id">
            <Avatar src={agent.avatar} handle={agent.handle} kind="agent" size={64} />
            <div>
              <span className="agentbar__handle">{agent.handle}</span>
              <span className="agentbar__status">
                <span className={`agentbar__dot ${preLaunch ? "is-pre" : ""}`} aria-hidden="true" />
                {preLaunch ? "pre-launch · goes live at $1,500 in fees" : `${agent.status} · working ${ago(agent.since, now)}`}
              </span>
            </div>
          </div>
          {/* The real numbers (realised PnL, win rate, holder pool) only exist once it
              trades. Before then they'd be fabricated, so the masthead KPIs are hidden and
              the live-soon treasury below carries the only real figures. */}
          {!preLaunch && (
            <dl className="kpis">
              <Kpi
                label="Realised PnL"
                value={`${pnl(agent.realisedPnl)} USDG`}
                tone={agent.realisedPnl >= 0 ? "pos" : "neg"}
              />
              <Kpi label="Win rate" value={hitRate(agent.won, agent.closed)} />
              <Kpi label="To holders" value={`${usdg(agent.holderPool)} USDG`} tone="pos" />
              <Kpi label="Bought back &amp; burned" value={`${usdg(agent.burned)} USDG`} />
            </dl>
          )}
        </header>
      )}

      {/* ---------- Treasury + live-soon gate (real) — the hero while pre-launch ---------- */}
      <AutoBurn />

      {/* ---------- Equity curve — hidden pre-launch (no capital deployed yet) ---------- */}
      {!preLaunch && equity && agent && (
        <section className="panel eqpanel">
          <div className="panel__head">
            <h2>Trading capital</h2>
            <span className="eqpanel__delta num">
              {usdg(agent.startEquity)} → {usdg(agent.equity)} USDG
            </span>
          </div>
          <EquityChart points={equity} baseline={agent.startEquity} height={260} showAxis />
          <p className="eqpanel__note">
            The agent's realised trading result on protocol capital — never a user deposit.
            Of the profit it books, 70% is paid to holders, 10% buys back &amp; burns $ISX,
            and 20% compounds the desk. In a losing stretch nothing is paid out.
          </p>
        </section>
      )}

      {/* ---------- Desks ---------- */}
      {preLaunch && (
        <p className="desk__preview">
          Preview — the desks, positions and reasoning below are sample activity from a seeded
          model, shown so you can see the shape of the record. They become real trades at launch.
        </p>
      )}
      <section className="desks3">
        {deskStats.map((d) => (
          <article key={d.desk} className={`deskcard deskcard--${d.desk}`}>
            <div className="deskcard__head">
              <DeskChip desk={d.desk} />
              <span className="deskcard__open num">{d.open} open</span>
            </div>
            <dl className="deskcard__stats">
              <div>
                <dt>Realised</dt>
                <dd className={`num ${d.pnl >= 0 ? "is-pos" : "is-neg"}`}>{pnl(d.pnl)}</dd>
              </div>
              <div>
                <dt>Win rate</dt>
                <dd className="num">{hitRate(d.won, d.closed)}</dd>
              </div>
              <div>
                <dt>Closed</dt>
                <dd className="num">{d.closed}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>

      {/* ---------- What it's learned ---------- */}
      {learning.data && (
        <LearningPanel learning={learning.data} simulated={DATA_SOURCE === "simulation"} />
      )}

      {/* ---------- Why it's trading ---------- */}
      {reasoning.data && reasoning.data.length > 0 && (
        <section className="panel why">
          <div className="panel__head">
            <h2>Why it's trading</h2>
            <Link className="why__radar" to="/radar">
              Open the radar →
            </Link>
          </div>
          <ul className="whylist">
            {reasoning.data.map(({ position: p, signals }) => (
              <li key={p.id} className="whyrow">
                <Link to={`/positions/${p.id}`} className="whyrow__pos">
                  <DeskChip desk={p.desk} />
                  <span className="num whyrow__subject">{p.subject}</span>
                  <span className="num whyrow__intent">{intent(p)}</span>
                  <Seal status={p.status} size="sm" />
                </Link>
                <p className="whyrow__thesis">“{p.note}”</p>
                {signals.length > 0 && (
                  <ul className="whyrow__signals">
                    {signals.map((s) => (
                      <li key={s.id}>
                        <span className="whyrow__sigtype">{SIGNAL_LABEL[s.type]}</span>
                        {s.detail}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- Positions ---------- */}
      <div className="desk__cols">
        {/* Open */}
        <section className="panel">
          <div className="panel__head">
            <h2>Open positions</h2>
            <span className="panel__count num">{openPositions.length}</span>
          </div>
          <ul className="poslist">
            {openPositions.map((p) => (
              <li key={p.id} className={born.has(p.id) ? "is-new" : ""}>
                <Link to={`/positions/${p.id}`} className="posrow">
                  <div className="posrow__main">
                    <div className="posrow__top">
                      <DeskChip desk={p.desk} />
                      <span className="num posrow__subject">{p.subject}</span>
                      <span className="num posrow__intent">{intent(p)}</span>
                    </div>
                    <p className="posrow__title">{p.title}</p>
                  </div>
                  <div className="posrow__side">
                    <Seal status={p.status} size="sm" />
                    <span className="posrow__meta num">resolves in {until(p.closedAt, now)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Recent closes */}
        <section className="panel">
          <div className="panel__head">
            <h2>Recent closes</h2>
            <span className={`panel__live ${preLaunch ? "is-preview" : ""}`}>
              <span className="panel__livedot" aria-hidden="true" /> {preLaunch ? "preview" : "live"}
            </span>
          </div>
          <ul className="poslist">
            {recentCloses.map((p) => (
              <li key={p.id} className={born.has(p.id) ? "is-new" : ""}>
                <Link to={`/positions/${p.id}`} className="posrow">
                  <div className="posrow__main">
                    <div className="posrow__top">
                      <DeskChip desk={p.desk} />
                      <span className="num posrow__subject">{p.subject}</span>
                      {p.brier != null && <span className="num posrow__brier">brier {brier(p.brier)}</span>}
                    </div>
                    <p className="posrow__title">{p.title}</p>
                  </div>
                  <div className="posrow__side">
                    <span className={`num posrow__pnl ${(p.pnl ?? 0) >= 0 ? "is-pos" : "is-neg"}`}>
                      {pnl(p.pnl ?? 0)}
                    </span>
                    <span className="posrow__meta num">{ago(p.closedAt, now)} ago</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ---------- Holder strip (real payouts — hidden until live) ---------- */}
      {!preLaunch && agent && (
        <section className="panel holderstrip">
          <div className="holderstrip__copy">
            <h2>Where the wins go</h2>
            <p className="prose">
              Every winning close is split the moment it settles — the pool below is real
              profit the agent has already booked, not a projection.
            </p>
          </div>
          <dl className="holderstrip__nums">
            <div>
              <dt>To holders, to date</dt>
              <dd className="num is-pos">{usdg(agent.holderPool)} USDG</dd>
            </div>
            <div>
              <dt>Bought back &amp; burned</dt>
              <dd className="num">{usdg(agent.burned)} USDG</dd>
            </div>
          </dl>
          <Link className="btn btn--primary" to="/isx">
            How holders earn
          </Link>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="kpi">
      <dt className="kpi__label">{label}</dt>
      <dd className={`kpi__value num ${tone ? `is-${tone}` : ""}`}>{value}</dd>
    </div>
  );
}
