import { Link, useParams } from "react-router-dom";
import { Seal } from "../components/Seal";
import { getPosition } from "../lib/store";
import { SIM_NOW } from "../lib/sim";
import { useAsync } from "../lib/useAsync";
import { ago, brier, pnl, prob, until, usdg } from "../lib/format";
import { DESK_LABEL, type Position } from "../lib/types";
import { NotFound } from "./NotFound";
import "./position.css";

function intentLine(p: Position): string {
  if (p.desk === "prediction") return `${p.side.toUpperCase()} at ${prob(p.conviction)} confidence`;
  if (p.desk === "futures") return `${p.leverage}× ${p.side.toUpperCase()}`;
  return `${p.side.toUpperCase()} · ${prob(p.conviction)} conviction`;
}

export function PositionDetail() {
  const { id = "" } = useParams();
  const pos = useAsync(() => getPosition(id), [id]);

  if (pos.status === "ready" && !pos.data) return <NotFound />;

  return (
    <div className="page position">
      <Link to="/desk" className="position__back">
        ← The Desk
      </Link>

      {pos.data && (
        <>
          <header className="position__head">
            <div className="position__tags">
              <span className={`chip chip--${pos.data.desk}`}>{DESK_LABEL[pos.data.desk]}</span>
              <span className="num position__subject">{pos.data.subject}</span>
              <Seal status={pos.data.status} />
            </div>
            <h1 className="position__title">{pos.data.title}</h1>
            <p className="position__intent num">{intentLine(pos.data)}</p>
          </header>

          <div className="position__grid">
            {/* The sealed commitment */}
            <section className="panel position__seal">
              <h2 className="position__h2">Sealed before it opened</h2>
              <dl className="sealed">
                <div>
                  <dt>Sealed</dt>
                  <dd className="num">{ago(pos.data.sealedAt, SIM_NOW)} ago</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd className="num">{usdg(pos.data.size)} USDG</dd>
                </div>
                <div>
                  <dt>Desk</dt>
                  <dd>{DESK_LABEL[pos.data.desk]}</dd>
                </div>
              </dl>
              <p className="sealed__note">“{pos.data.note}”</p>
              <div className="sealed__hash">
                <span className="sealed__hashlabel">Commit hash</span>
                <code className="num">{pos.data.hash}</code>
              </div>
              <p className="position__fine">
                The hash fixes this position — desk, direction, size and reasoning — at the
                moment it was sealed, before the trade opened. It cannot be edited or
                backdated, which is the whole point: the record can't be curated after the
                fact.
              </p>
            </section>

            {/* The outcome */}
            <section className="panel position__outcome">
              <h2 className="position__h2">
                {pos.data.status === "open" ? "Still open" : "How it closed"}
              </h2>
              {pos.data.status === "open" ? (
                <div className="outcomebig">
                  <span className="outcomebig__pending num">Awaiting close</span>
                  <p className="outcomebig__sub">
                    Resolves in {until(pos.data.closedAt, SIM_NOW)}. It stays neutral on the
                    record until it settles — drawn as sealed, never as a win.
                  </p>
                </div>
              ) : (
                <div className="outcomebig">
                  <span
                    className={`outcomebig__pnl num ${(pos.data.pnl ?? 0) >= 0 ? "is-pos" : "is-neg"}`}
                  >
                    {pnl(pos.data.pnl ?? 0)} USDG
                  </span>
                  <dl className="outcomebig__meta">
                    <div>
                      <dt>Result</dt>
                      <dd>
                        <Seal status={pos.data.status} size="sm" />
                      </dd>
                    </div>
                    <div>
                      <dt>Closed</dt>
                      <dd className="num">{ago(pos.data.closedAt, SIM_NOW)} ago</dd>
                    </div>
                    {pos.data.brier != null && (
                      <div>
                        <dt>Brier</dt>
                        <dd className="num">{brier(pos.data.brier)}</dd>
                      </div>
                    )}
                  </dl>
                  {pos.data.status === "won" && (
                    <p className="outcomebig__split">
                      Profit feeds the split: 70% to holders, 20% compounds the desk, 10% to
                      buyback &amp; burn.
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
