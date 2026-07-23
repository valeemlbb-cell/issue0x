import { pnl } from "../lib/format";
import { DESK_LABEL, type DeskLearning, type Learning } from "../lib/types";
import "./learning.css";

/**
 * "What it's learned" — the agent's own record turned into how it now sizes. Each
 * desk shows its win record, realised PnL, and the size multiplier the risk gate is
 * currently applying (a recency-weighted read on what has actually paid). This is
 * the self-learning made visible: cold desks dial down, hot desks dial up, within
 * the same hard caps.
 */
export function LearningPanel({ learning, simulated }: { learning: Learning; simulated?: boolean }) {
  const hasRecord = learning.desks.some((d) => d.closed > 0);
  return (
    <section className="panel learnpanel">
      <div className="panel__head">
        <h2>What it's learned</h2>
        <span className="learnpanel__tag">{simulated ? "from the simulated record" : "from its own record"}</span>
      </div>
      <p className="learnpanel__lead">
        The agent adapts its sizing from its own results — a recency-weighted read on which
        desks and signals actually pay, applied inside the same hard risk caps. It also feeds
        this record back to itself each tick, so it reasons against what has worked.
      </p>

      <ul className="learnrows">
        {learning.desks.map((d) => (
          <DeskRow key={d.desk} d={d} />
        ))}
      </ul>

      {hasRecord && learning.lessons.length > 0 && (
        <ul className="learnlessons">
          {learning.lessons.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {!hasRecord && <p className="learnpanel__empty">No closes yet — the agent is still building a record to learn from.</p>}
    </section>
  );
}

function DeskRow({ d }: { d: DeskLearning }) {
  const up = d.weight >= 1;
  const mark = ((Math.max(0.5, Math.min(1.5, d.weight)) - 0.5) / 1.0) * 100; // 0.5→0%, 1.0→50%, 1.5→100%
  const left = up ? 50 : mark;
  const width = Math.abs(mark - 50);
  return (
    <li className="learnrow">
      <span className={`chip chip--${d.desk}`}>{DESK_LABEL[d.desk]}</span>
      <span className="learnrow__rec num">{d.closed ? `${d.won}/${d.closed} won` : "no closes"}</span>
      <span className={`learnrow__pnl num ${d.pnl >= 0 ? "is-pos" : "is-neg"}`}>{d.closed ? pnl(d.pnl) : "—"}</span>
      <span className="wbar" title={`size weight ${d.weight}×`}>
        <span className="wbar__track">
          <span className="wbar__center" aria-hidden="true" />
          <span className={`wbar__fill ${up ? "is-up" : "is-down"}`} style={{ left: `${left}%`, width: `${width}%` }} />
        </span>
        <span className={`wbar__val num ${up ? "is-up" : "is-down"}`}>{d.weight.toFixed(2)}×</span>
      </span>
    </li>
  );
}
