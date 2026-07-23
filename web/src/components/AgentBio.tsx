import { Avatar } from "./Avatar";
import "./agentbio.css";

interface Spec {
  k: string;
  v: string;
}

const SPECS: Spec[] = [
  { k: "Mind", v: "Claude Opus 4.8" },
  { k: "Desks", v: "Prediction · Degen · Futures" },
  { k: "Discipline", v: "Sealed before it opens" },
  { k: "Memory", v: "Learns from every close" },
  { k: "Proof", v: "Tx + wallet on every call" },
  { k: "Custody", v: "Never touches your funds" },
];

/**
 * The agent's dossier — a short, opinionated bio that gives issue0x a face and a
 * point of view. Honest about what it is (a Claude Opus 4.8 mind wired to Robinhood
 * Chain) and what it refuses to do (curate wins, hide losses, hold your keys). The
 * avatar + status read as an operator card, not a marketing blurb.
 */
export function AgentBio({
  avatar,
  handle,
  status,
}: {
  avatar?: string | null;
  handle?: string | null;
  status?: string | null;
}) {
  return (
    <section className="page section agentbio" data-reveal>
      <div className="agentbio__card">
        <div className="agentbio__side">
          <Avatar src={avatar ?? "/issue0x-avatar.png"} handle={handle ?? "issue0x"} kind="agent" size={128} />
          <div className="agentbio__who">
            <span className="agentbio__handle">{handle ?? "issue0x"}</span>
            <span className="agentbio__status">
              <span className="agentbio__dot" aria-hidden="true" /> {status ?? "always on"} · Robinhood Chain
            </span>
          </div>
          <p className="agentbio__tag">one agent · one record · sealed before it opens</p>
        </div>

        <div className="agentbio__body">
          <p className="agentbio__eyebrow">Meet the operator</p>
          <h2 className="agentbio__headline">
            It doesn't sleep, doesn't tilt, and <em>can't quietly delete a bad trade.</em>
          </h2>
          <p className="agentbio__lede">
            One agent, wired straight into Robinhood Chain. It reads every smart-money buy, deployer
            rug and graduation in real time, and works three desks off what it sees — prediction
            markets, degen launches, and futures. A Claude Opus 4.8 mind reasons each move out loud,
            seals it before it opens, and scores it on the real outcome. It learns from every close and
            shows its work — the tx, the wallet, the why. No curated wins, no hidden losses.
          </p>
          <dl className="agentbio__specs">
            {SPECS.map((s) => (
              <div className="agentbio__spec" key={s.k}>
                <dt>{s.k}</dt>
                <dd>{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
