import { NavLink, Link } from "react-router-dom";
import type { ReactNode } from "react";
import { Mark } from "./Mark";
import { ThemeToggle } from "./ThemeToggle";
import { DATA_SOURCE } from "../lib/store";
import "./shell.css";

const NAV = [
  { to: "/desk", label: "The Desk" },
  { to: "/radar", label: "Radar" },
  { to: "/isx", label: "$ISX" },
  { to: "/docs", label: "Docs" },
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {DATA_SOURCE === "simulation" && (
        <div className="disclosure" role="status">
          <span className="disclosure__tag">Live soon</span>
          <p>
            issue0x goes live the moment its fee treasury reaches $1,500 — the radar,
            scanner and treasury are already real and on-chain; the desk figures are a
            preview from a seeded model until then. Watch the real progress on{" "}
            <Link to="/isx" className="disclosure__link">$ISX</Link>.
          </p>
        </div>
      )}

      <header className="topbar">
        <div className="topbar__inner page">
          <Link to="/" className="brand" aria-label="issue0x, home">
            <Mark />
            <span className="brand__word">issue0x</span>
          </Link>

          <nav className="topnav" aria-label="Main">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `topnav__link ${isActive ? "is-active" : ""}`}
              >
                {item.label}
              </NavLink>
            ))}
            <a href="/#run" className="topnav__link topnav__link--run">Run it</a>
          </nav>

          <div className="topbar__right">
            <ThemeToggle />
            <button type="button" className="btn btn--ghost topbar__connect">
              Connect
            </button>
          </div>
        </div>
      </header>

      <main id="main">{children}</main>

      <footer className="footer">
        <div className="page footer__inner">
          <div className="footer__top">
            <div className="footer__brandcol">
              <Link to="/" className="footer__brand" aria-label="issue0x, home">
                <Mark size={30} />
                <span className="brand__word">issue0x</span>
              </Link>
              <p className="footer__statement">
                One agent, trading on-chain. Every position sealed before it opens and
                scored on the real outcome — hold $ISX to share what it closes in profit.
              </p>
              <span className={`footer__status ${DATA_SOURCE === "simulation" ? "footer__status--sim" : ""}`}>
                <span className="footer__statusdot" aria-hidden="true" />
                {DATA_SOURCE === "simulation" ? "simulation · seeded model" : "agent live · Robinhood Chain"}
              </span>
            </div>

            <nav className="footer__nav" aria-label="Footer">
              <div className="footer__col">
                <h3 className="footer__coltitle">Product</h3>
                <NavLink to="/desk" className="footer__link">The Desk</NavLink>
                <NavLink to="/radar" className="footer__link">Radar</NavLink>
                <NavLink to="/isx" className="footer__link">$ISX</NavLink>
              </div>
              <div className="footer__col">
                <h3 className="footer__coltitle">The agent</h3>
                <a className="footer__link" href="/#how">How it works</a>
                <NavLink to="/desk" className="footer__link">The record</NavLink>
                <NavLink to="/radar" className="footer__link">The radar</NavLink>
              </div>
              <div className="footer__col">
                <h3 className="footer__coltitle">On-chain</h3>
                <a className="footer__link" href="https://robinhoodchain.blockscout.com" target="_blank" rel="noopener noreferrer">
                  Explorer <span aria-hidden="true">↗</span>
                </a>
                <a className="footer__link" href="https://www.ponsfamily.com" target="_blank" rel="noopener noreferrer">
                  pons launchpad <span aria-hidden="true">↗</span>
                </a>
              </div>
            </nav>
          </div>

          <div className="footer__wordmark" aria-hidden="true">issue0x</div>

          <div className="footer__bottom">
            <p className="footer__fine">
              A sealed position is a bet the agent is making, not advice, and a good record
              is not a promise about the next one. Nothing here is financial advice.
            </p>
            <span className="footer__copy num">© 2026 issue0x · Robinhood Chain</span>
          </div>
        </div>
      </footer>
    </>
  );
}
