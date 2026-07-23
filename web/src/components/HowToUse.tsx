import "./howtouse.css";

const DOWNLOAD = "/issue0x-trader.zip";

/**
 * "Run it yourself" — the how-to for the downloadable issue0x-trader bot. Two paths,
 * humans and agents, both off the same package. Honest and up-front about the two things
 * that matter: it's non-custodial (your key stays local) and there's a transparent 2%
 * operator fee on live trades. Paper mode is the default and never touches a wallet.
 */
export function HowToUse() {
  return (
    <section id="run" className="page section howto" data-reveal>
      <header className="howto__head">
        <p className="howto__eyebrow">Run it yourself</p>
        <h2 className="howto__title">
          The same strategy, <em>in your terminal</em>.
        </h2>
        <p className="howto__lede prose">
          Download the issue0x bot and run the agent's strategy on your own machine. It reads
          the same live smart-money radar, enters on heat + smart inflow, and manages every
          position with take-profit, stop-loss and a distribution-exit. Starts in <b>paper mode</b> —
          simulated, no wallet, zero risk — until you decide to go live.
        </p>
        <div className="howto__cta">
          <a className="btn btn--primary btn--lg" href={DOWNLOAD} download>
            ↓ Download the bot
          </a>
          <span className="howto__req num">Node.js 18+ · macOS / Linux / Windows</span>
        </div>
      </header>

      <div className="howto__cols">
        {/* Humans */}
        <article className="howto__card">
          <div className="howto__cardhead">
            <span className="howto__idx num">01</span>
            <h3>For humans</h3>
          </div>
          <p className="howto__cardsub">Four commands to a live paper run.</p>
          <pre className="howto__code" aria-label="Terminal commands for humans">
            <code>
              <span className="c-dim"># unzip, then:</span>{"\n"}
              cd issue0x-trader{"\n"}
              npm install{"\n"}
              cp issue0x.config.example.json issue0x.config.json{"\n"}
              {"\n"}
              <span className="c-dim"># preview the radar — no trades:</span>{"\n"}
              npm run scan{"\n"}
              {"\n"}
              <span className="c-dim"># run it (paper by default):</span>{"\n"}
              npm start{"\n"}
              npm run positions
            </code>
          </pre>
          <p className="howto__note">
            Tune <code>issue0x.config.json</code> — heat threshold, position size, TP/SL. Going
            live is an explicit opt-in in that file (your key, in a local file, never leaves your
            machine).
          </p>
        </article>

        {/* Agents */}
        <article className="howto__card">
          <div className="howto__cardhead">
            <span className="howto__idx num">02</span>
            <h3>For agents</h3>
          </div>
          <p className="howto__cardsub">Drive it from Claude via a skill or MCP.</p>
          <pre className="howto__code" aria-label="MCP registration for agents">
            <code>
              <span className="c-dim">// .mcp.json — wire the bot's tools</span>{"\n"}
              {"{"}{"\n"}
              {"  "}<span className="c-key">"mcpServers"</span>: {"{"}{"\n"}
              {"    "}<span className="c-key">"issue0x-trader"</span>: {"{"}{"\n"}
              {"      "}<span className="c-key">"command"</span>: <span className="c-str">"npx"</span>,{"\n"}
              {"      "}<span className="c-key">"args"</span>: [<span className="c-str">"tsx"</span>, <span className="c-str">"mcp/server.ts"</span>]{"\n"}
              {"    "}{"}"}{"\n"}
              {"  "}{"}"}{"\n"}
              {"}"}
            </code>
          </pre>
          <p className="howto__note">
            Tools: <code>scan_radar</code>, <code>list_positions</code>, <code>bot_config</code>,{" "}
            <code>run_cycle</code> — all respect the config's mode, so an agent can't silently trade
            real funds. Or drop <code>SKILL.md</code> into <code>~/.claude/skills/</code>.
          </p>
        </article>
      </div>

      <div className="howto__disclose">
        <div className="howto__discitem">
          <span className="howto__dischead">Non-custodial</span>
          <span className="howto__discbody">Your key is read from a local file and only signs your own trades. Never printed, never transmitted.</span>
        </div>
        <div className="howto__discitem">
          <span className="howto__dischead">Transparent 2% fee</span>
          <span className="howto__discbody">A flat 2% service fee on each side of a live trade — buy and sell — as a visible on-chain transfer to the issue0x operator. Paper mode sends nothing.</span>
        </div>
        <div className="howto__discitem">
          <span className="howto__dischead">Paper-first</span>
          <span className="howto__discbody">The default mode is fully simulated. Live trading is gated behind explicit acknowledgments and a countdown.</span>
        </div>
      </div>
    </section>
  );
}
