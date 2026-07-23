import { Link } from "react-router-dom";
import { compact } from "../lib/format";
import { AutoBurn } from "../components/AutoBurn";
import { DESKS, ISX, NOT, PROFIT_SPLIT, REWARD_FLOW, UTILITIES } from "../lib/isx";
import "./token.css";

/**
 * What $ISX is and how a holder earns from the issue0x agent trading.
 *
 * Ordered as a stranger reads it: what the agent does, what earns me anything,
 * how the flow works, what else the token does, and what it is not. The "what it
 * is not" section is on the page rather than in a footer, because the honest limit
 * is the thing this product's credibility rests on.
 */
export function Token() {
  const split = PROFIT_SPLIT;
  return (
    <div className="page token">
      <header className="token__head">
        <div>
          <span className="token__ticker num">${ISX.ticker}</span>
          <h1>
            The agent trades. You hold. You earn on a record it <em>can't fake</em>.
          </h1>
          <p className="prose">
            issue0x is one agent working three desks — prediction markets, degen, and
            futures. Every position is sealed before it opens and scored on the real
            outcome. Hold $ISX and you share its winning closes; you never deposit, and
            you're never in a losing trade.
          </p>
        </div>
        <dl className="token__facts">
          <div>
            <dt>Supply</dt>
            <dd className="num">{compact(ISX.supply)}</dd>
          </div>
          <div>
            <dt>Trades on</dt>
            <dd>{ISX.venue}</dd>
          </div>
          <div>
            <dt>Holder share</dt>
            <dd className="num">{split.holders / 100}%</dd>
          </div>
        </dl>
      </header>

      <p className="notice notice--warn token__notice">
        ${ISX.ticker} isn't earning yet. The agent goes live — and holder rewards begin — when its
        fee treasury reaches $1,500 (tracked below). Until then the desk figures are a preview from a
        seeded model, and every buyback-and-burn will be counted here with its tx hash.
      </p>

      {/* ---------- Live treasury + auto-burn (real on-chain; hidden until reachable) ---------- */}
      <section className="token__section">
        <AutoBurn />
      </section>

      {/* ---------- The desks ---------- */}
      <section className="token__section">
        <header className="token__sectionhead">
          <h2>Three desks, one record</h2>
          <p className="prose">
            The agent trades very different things — but the discipline is the same on
            each. What it intends is sealed before the position opens, and it's scored on
            what actually happened. That's the record you're trusting when you hold.
          </p>
        </header>
        <div className="desks">
          {DESKS.map((d) => (
            <article key={d.id} className="desk">
              <h3 className="desk__name">{d.name}</h3>
              <p className="desk__scope">{d.scope}</p>
              <dl className="desk__rec">
                <div>
                  <dt>Sealed</dt>
                  <dd>{d.sealed}</dd>
                </div>
                <div>
                  <dt>Scored</dt>
                  <dd>{d.scored}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- The reward flow ---------- */}
      <section className="token__section">
        <header className="token__sectionhead">
          <h2>How a reward reaches you</h2>
          <p className="prose">
            Every reward is a real gain the agent closed — not a mint. If the positions
            don't close green, the pool isn't funded. The record cuts both ways.
          </p>
        </header>
        <ol className="flow">
          {REWARD_FLOW.map((f, i) => (
            <li key={f.step} className="flowstep">
              <span className="flowstep__n num">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="flowstep__step">{f.step}</h3>
                <p className="flowstep__detail">{f.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="splitbar">
          <div
            className="splitbar__track"
            role="img"
            aria-label={`Realised profit on a winning close: holders ${split.holders / 100}%, desk ${split.desk / 100}%, burned ${split.burn / 100}%.`}
          >
            <span style={{ width: `${split.holders / 100}%`, background: "var(--amber)" }} />
            <span style={{ width: `${split.desk / 100}%`, background: "var(--indigo)" }} />
            <span style={{ width: `${split.burn / 100}%`, background: "var(--crimson)" }} />
          </div>
          <dl className="splitbar__key">
            <div>
              <dt>
                <span className="sw" style={{ background: "var(--amber)" }} aria-hidden="true" />
                To holders
              </dt>
              <dd className="num">{split.holders / 100}%</dd>
            </div>
            <div>
              <dt>
                <span className="sw" style={{ background: "var(--indigo)" }} aria-hidden="true" />
                Compounds the desk
              </dt>
              <dd className="num">{split.desk / 100}%</dd>
            </div>
            <div>
              <dt>
                <span className="sw" style={{ background: "var(--crimson)" }} aria-hidden="true" />
                Buyback &amp; burn
              </dt>
              <dd className="num">{split.burn / 100}%</dd>
            </div>
          </dl>
          <p className="splitbar__note">
            Only profit is split. The trading capital always stays with the desk — a
            losing trade reduces that capital, never the holder pool.
          </p>
        </div>
      </section>

      {/* ---------- What it does ---------- */}
      <section className="token__section">
        <header className="token__sectionhead">
          <h2>What it does</h2>
        </header>
        <ol className="uses">
          {UTILITIES.map((u) => (
            <li key={u.id} className="use">
              <div className="use__head">
                <h3>{u.title}</h3>
                <span className="use__badge">{u.action}</span>
              </div>
              <p className="use__body">{u.body}</p>
              <p className="use__why">
                <span className="use__whylabel">Why this way</span>
                {u.rationale}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- What it is not ---------- */}
      <section className="token__section">
        <header className="token__sectionhead">
          <h2>What it is not</h2>
          <p className="prose">
            The limits are here rather than in a footer. The list a token page leaves out
            is usually the one that matters.
          </p>
        </header>
        <ul className="nots">
          {NOT.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="token__fine">
          Paying holders a share of trading results is securities-adjacent in many
          jurisdictions. This is the most defensible shape — the agent trades protocol
          capital, never a user deposit, and holders are exposed to realised gains and
          never to drawdown — but it is a question for a lawyer, not a settled one. Not
          deployed, not audited, not financial advice.
        </p>
      </section>

      <section className="page closer token__closer">
        <h2>Read the record first.</h2>
        <p className="prose closer__prose">
          The monitor is every position the agent has taken — each hash, each win, each
          loss. Look at how it's actually traded before you hold a thing.
        </p>
        <div className="token__actions">
          <Link className="btn btn--primary btn--lg" to="/desk">
            Open the monitor
          </Link>
          <Link className="btn btn--ghost btn--lg" to="/">
            Back to overview
          </Link>
        </div>
      </section>
    </div>
  );
}
