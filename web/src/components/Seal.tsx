import type { PositionStatus } from "../lib/types";
import "./seal.css";

/**
 * The state of a position, drawn as a stamp.
 *
 * Three states, three treatments, and never colour alone: open is a hollow indigo
 * seal (committed, unjudged), won is a filled amber stamp, lost is a struck crimson
 * one. Each carries a glyph and a word, because amber-vs-crimson is the pairing
 * most likely to fail for the most common colour-vision deficiencies, and this
 * interface is almost entirely outcomes.
 *
 * Open is drawn as *sealed*, never as a win — a position is neutral until it
 * closes, and rendering an open trade green would be the single most dishonest
 * thing this product could do.
 */
const COPY: Record<PositionStatus, { label: string; glyph: string }> = {
  open: { label: "Open", glyph: "◫" },
  won: { label: "Won", glyph: "◼" },
  lost: { label: "Lost", glyph: "◻" },
};

export function Seal({ status, size = "md" }: { status: PositionStatus; size?: "sm" | "md" }) {
  const { label, glyph } = COPY[status];
  return (
    <span className={`seal seal--${status} seal--${size}`}>
      <span className="seal__glyph" aria-hidden="true">
        {glyph}
      </span>
      {label}
    </span>
  );
}

/** Just the outcome word + glyph inline, for dense rows. */
export function Outcome({ status }: { status: PositionStatus }) {
  const { label, glyph } = COPY[status];
  return (
    <span className={`outcome outcome--${status}`}>
      <span aria-hidden="true">{glyph}</span> {label}
    </span>
  );
}
