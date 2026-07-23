import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <section className="page" style={{ paddingBlock: "var(--section)" }}>
      <h1>No such page</h1>
      <p className="prose" style={{ marginTop: "var(--s-4)" }}>
        That page does not exist. The Desk is where the agent's record lives.
      </p>
      <Link className="btn btn--primary" to="/desk" style={{ marginTop: "var(--s-6)" }}>
        Open The Desk
      </Link>
    </section>
  );
}
