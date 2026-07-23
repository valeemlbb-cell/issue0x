import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import "./docs.css";

interface Section {
  id: string;
  title: string;
}

const TOC: Section[] = [
  { id: "overview", title: "Overview" },
  { id: "agent", title: "The agent" },
  { id: "radar", title: "The radar" },
  { id: "signals", title: "Signal catalogue" },
  { id: "drilldowns", title: "Token & wallet pages" },
  { id: "record", title: "Track record" },
  { id: "bot", title: "Run it yourself" },
  { id: "isx", title: "$ISX & rewards" },
  { id: "treasury", title: "Treasury & auto-burn" },
  { id: "launch", title: "Launch" },
  { id: "honesty", title: "Honesty" },
];

/**
 * The docs — one long, honest page explaining everything issue0x is and does. A sticky
 * table of contents on the left, the manual on the right. Deliberately concrete: names
 * the real signals, the real economics, and the real limits.
 */
export function Docs() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const s of TOC) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  return (
    <div className="page page--wide docs">
      <aside className="docs__toc" aria-label="Contents">
        <span className="docs__toclabel">Docs</span>
        <nav>
          {TOC.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={`docs__toclink ${active === s.id ? "is-active" : ""}`}>
              {s.title}
            </a>
          ))}
        </nav>
        <Link to="/radar" className="docs__tocradar">Open the live radar →</Link>
      </aside>

      <main className="docs__body">
        <header className="docs__head">
          <p className="docs__eyebrow">Documentation</p>
          <h1>issue0x — the whole machine, explained.</h1>
          <p className="docs__lede prose">
            One AI agent that reads Robinhood Chain in real time and trades three desks off what it
            sees — every position sealed before it opens, every signal traceable to a tx, and a record
            it can't curate. This is what it does, how each part works, and where value accrues.
          </p>
        </header>

        <Doc id="overview" title="Overview">
          <p>
            <b>issue0x</b> is a single agentic trader on Robinhood Chain. A Claude Opus 4.8 mind watches
            the chain — smart-money buys, deployer rugs, graduations, whale moves — reasons out loud,
            and works three desks: <b>prediction markets, degen launches, and futures</b>. Before it
            acts, it seals the position: direction, size, one line of why, hashed and timestamped. That
            sealed entry is the record, permanently, before anything happens — so wins can't be curated
            and losses can't be quietly dropped.
          </p>
          <p>
            Around the agent sits a full intelligence stack: a live on-chain radar, per-token and
            per-wallet drill-downs, a self-graded track record, a downloadable bot that runs the same
            strategy on your machine, and the <b>$ISX</b> token that shares what the agent closes in
            profit and burns supply as it wins.
          </p>
          <Callout>
            Everything data-driven here is real on-chain data. Where the agent hasn't traded live yet,
            the desk figures are a clearly-labelled preview from a seeded model — never dressed up as real.
          </Callout>
        </Doc>

        <Doc id="agent" title="The agent">
          <ul className="docs__list">
            <li><b>A Claude Opus 4.8 mind.</b> Frontier reasoning, not a rules bot. It weighs the radar's signals, forms a thesis, and commits to it.</li>
            <li><b>Three desks, one discipline.</b> Prediction markets (scored by the Brier rule), degen launches (realised P&amp;L), and futures — the same commit-reveal on very different trades.</li>
            <li><b>Sealed before it opens.</b> Each position is hashed + timestamped at entry. Nobody, not even the agent, can rewrite, backdate, or hide it afterward.</li>
            <li><b>Self-learning.</b> On every close it updates a recency-decayed Beta posterior + PnL memory per desk, producing a size weight the risk gate applies next time. It learns which desks and signal-types are working — and it's honest that this is in-context reflection, not model training.</li>
            <li><b>Non-custodial, always.</b> It trades protocol capital, never a user deposit. You're in its upside through the pool, never in its drawdown.</li>
          </ul>
        </Doc>

        <Doc id="radar" title="The radar — the smartest scanner on Robinhood Chain">
          <p>
            The radar is the agent's eyes, and it's open for you to watch. It scans the most active
            tokens on the chain every ~60s, accumulates trade history across scans so its read deepens
            over time, and scores everything into one number: <b>heat, 0–100</b>.
          </p>
          <p>
            Heat blends smart-money net flow, buy pressure, 5-minute acceleration, unique-buyer breadth,
            and graduation pace — then shrinks itself on thin data and gates down one-wallet-dominated
            (wash) volume, so a single spoofer can't fake a hot token. Green means accumulating; red
            means distributing — smart money leaving is a signal too.
          </p>
        </Doc>

        <Doc id="signals" title="Signal catalogue">
          <p>Every token and wallet is scored on a deep set of real signals:</p>
          <div className="docs__grid">
            <Sig t="Heat (0–100)" d="Normalised, wash-gated momentum score — where money is moving now." />
            <Sig t="Smart-money net flow" d="Smart wallets' buys minus sells, in USD — the flagship read." />
            <Sig t="Flow state" d="Accumulating / distributing / neutral, from buy-vs-sell pressure." />
            <Sig t="Smart-money leaderboard" d="Wallets ranked by real P&L, with a Wilson lower-bound win rate so a 1/1 fluke can't top the board." />
            <Sig t="Wallet tiers" d="Elite / sniper / smart / whale / active — earned from track record + early entries." />
            <Sig t="Graduation velocity + ETA" d="How fast a token is bonding toward graduation, and when." />
            <Sig t="Deployer serial-rug" d="Flags deployers who launch many tokens that almost never graduate." />
            <Sig t="Holder concentration" d="Top-10 holder share (pool-excluded) + dev holding, from Blockscout." />
            <Sig t="Flipper / diamond" d="FIFO hold-time per wallet — fast churners vs holders." />
            <Sig t="Same-block bundle" d="Coordinated buys in one block — a launch's insiders moving together." />
            <Sig t="Wallet age (FRESH)" d="New wallets flagged; fresh + big profit is a red flag, and it cleanly separates real wallets from million-tx bots." />
            <Sig t="Whale walls + 24h vol" d="Biggest single buy/sell and real 24h volume." />
            <Sig t="Alerts" d="Whale, cluster, heating, distribution (smart exit), bundle, early-smart — pushed as they happen." />
          </div>
          <Callout>
            <b>Source provenance.</b> Every on-chain signal carries a real settling tx hash. Open it on the
            block explorer and confirm the buy actually happened — the source, not just our word for it.
          </Callout>
        </Doc>

        <Doc id="drilldowns" title="Token & wallet pages">
          <ul className="docs__list">
            <li><b>Per-token drill-down.</b> Click any token for its full read: heat, flow, graduation, a price sparkline, a risk panel (holders, deployer record, wash, liquidity), the smart wallets in it, and a live trade tape with tx links.</li>
            <li><b>Per-wallet drill-down.</b> Click any wallet — from the tape, the buyers, or the leaderboard — for its tier, realised/open P&amp;L, win rate, a per-token breakdown, and its cross-token trade tape.</li>
          </ul>
        </Doc>

        <Doc id="record" title="Track record — self-graded, honest">
          <p>
            The radar keeps score of its own calls. When a token turns hot, shows early smart-money entry,
            or flips to accumulating with positive smart flow, it's logged with the price at that moment.
            About 45 minutes later it's resolved against the price then — a <b>hit</b> if it rose ≥10%.
          </p>
          <p>
            The result is a live scoreboard: wallets tracked, trades observed, signals logged, hit rate,
            average forward return, and a per-type breakdown. It's a backtest of the radar's own calls —
            signal quality, honestly labelled, not P&amp;L and not advice.
          </p>
        </Doc>

        <Doc id="bot" title="Run it yourself — the issue0x-trader bot">
          <p>
            Download the bot and run the agent's strategy on your own machine, in your terminal. It pulls
            the same live radar, enters on heat + smart inflow, and manages every position with
            take-profit, stop-loss and a distribution-exit.
          </p>
          <ul className="docs__list">
            <li><b>Paper by default.</b> Simulated fills, no wallet, zero risk — until you choose to go live.</li>
            <li><b>Non-custodial.</b> In live mode your key is read from a local file you control and only signs your own trades. Never printed, never transmitted.</li>
            <li><b>Transparent 2% fee.</b> Live trades pay a flat 2% service fee on each side — a visible on-chain transfer to the operator. Paper mode sends nothing; it only subtracts the fee in simulated accounting so your P&amp;L is realistic.</li>
            <li><b>For agents too.</b> A Claude skill and a zero-dependency MCP server let Claude drive the bot — <code>scan_radar</code>, <code>list_positions</code>, <code>run_cycle</code> — all respecting the config's mode.</li>
          </ul>
          <p className="docs__cta"><Link to="/#run" className="docs__ctalink">Get the bot →</Link></p>
        </Doc>

        <Doc id="isx" title="$ISX &amp; how holders earn">
          <p>
            <b>$ISX</b> is the token behind the agent. Hold it and you share what the agent closes in
            profit — you never deposit, and you're never in a losing trade. When a position closes green,
            the profit is split the moment it settles:
          </p>
          <div className="docs__split">
            <div className="docs__splititem"><span className="docs__splitpct num">70%</span><span>to holders</span></div>
            <div className="docs__splititem"><span className="docs__splitpct num">10%</span><span>buys back &amp; burns $ISX</span></div>
            <div className="docs__splititem"><span className="docs__splitpct num">20%</span><span>compounds the desk</span></div>
          </div>
          <p>
            In a losing stretch, nothing is paid out — payouts come only from real, booked wins. Every
            position, green or red, stays on the record, so what you hold is a track record that can't be
            curated. The token trades on the pons launchpad.
          </p>
        </Doc>

        <Doc id="treasury" title="Treasury &amp; auto-burn">
          <p>
            The treasury is real and on-chain. Trading fees accumulate in the operator wallet — you can
            watch the balance live. As the agent books wins, a share buys back <b>$ISX</b> and burns it,
            and creator fees claimed from the launchpad are burned directly, cutting supply.
          </p>
          <p>
            Every burn is counted and posted with its tx hash, so the supply cut is verifiable, not a
            claim. Before the first burn the ledger honestly shows zero — the mechanism is wired, the
            numbers are only ever real ones.
          </p>
        </Doc>

        <Doc id="launch" title="Launch — live when it earns">
          <p>
            issue0x goes live when its fee treasury reaches <b>$1,500</b>. That threshold — real
            on-chain progress, shown as a live bar — is the trigger: at it, the agent begins trading with
            real capital, holder rewards start, and the desk flips from preview to live. Until then, the
            radar, scanner and treasury are already real; the desk figures are a labelled preview.
          </p>
        </Doc>

        <Doc id="honesty" title="Honesty — the whole point">
          <ul className="docs__list">
            <li><b>Sealed before open.</b> The record can't be curated — losses stay next to wins.</li>
            <li><b>On-chain proof.</b> Signals link to real tx hashes; the treasury and burns are readable on the explorer.</li>
            <li><b>No fake numbers.</b> Pre-launch, fabricated P&amp;L is hidden; only real figures (fees, capital, burns) are shown, and previews are marked.</li>
            <li><b>Non-custodial.</b> The agent never touches your deposit; the bot never transmits your key.</li>
            <li><b>Honest limits.</b> The radar sees only the tokens it polls, marks open gains at the current price, and is per-venue. It's a sharp read on who's up here — not a certified track record.</li>
          </ul>
        </Doc>

        <footer className="docs__foot">
          <Link to="/radar" className="btn btn--primary">Watch the live radar</Link>
          <Link to="/#run" className="btn btn--ghost">Run the bot</Link>
        </footer>
      </main>
    </div>
  );
}

function Doc({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="docs__section">
      <h2 className="docs__h2">{title}</h2>
      {children}
    </section>
  );
}

function Sig({ t, d }: { t: string; d: string }) {
  return (
    <div className="docs__sig">
      <dt>{t}</dt>
      <dd>{d}</dd>
    </div>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return <div className="docs__callout">{children}</div>;
}
