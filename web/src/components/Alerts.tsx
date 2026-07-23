import { ago } from "../lib/format";
import { addrUrl } from "../lib/explorer";
import type { Alert } from "../lib/agentSmart";
import "./alerts.css";

const TYPE_LABEL: Record<Alert["type"], string> = {
  whale: "Whale entry",
  cluster: "Smart cluster",
  heating: "Heating",
  distribution: "Smart exit",
  bundle: "Bundle",
  earlysmart: "Early smart",
};

/**
 * The signals stream — the highest-signal events the scanner sees, newest first.
 * Includes the rare truthful one: smart money DISTRIBUTING (exiting) before the
 * crowd, not just cheerleading the way up. Agent-only; hidden when unavailable.
 */
export function Alerts({ alerts, now }: { alerts: Alert[]; now: number }) {
  if (!alerts.length) return null;
  return (
    <section className="panel alertspanel">
      <div className="alertspanel__head">
        <h2 className="alertspanel__title">
          <span className="alertspanel__idx num">◎</span> Signals
        </h2>
        <span className="alertspanel__count num">{alerts.length}</span>
      </div>
      <ul className="alertlist">
        {alerts.map((a) => (
          <li key={a.id} className="alertrow" data-type={a.type} data-sev={a.severity}>
            <span className="alertrow__sev" aria-hidden="true" />
            <div className="alertrow__body">
              <p className="alertrow__head">
                <span className="alertrow__type">{TYPE_LABEL[a.type]}</span>
                <span className="num alertrow__sym">{a.symbol}</span>
              </p>
              <p className="alertrow__detail">{a.detail}</p>
            </div>
            <div className="alertrow__side">
              <span className="num alertrow__when">{ago(a.at, now)}</span>
              <a
                className="alertrow__link"
                href={addrUrl(a.wallet ?? a.token)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View on the explorer"
              >
                ↗
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
