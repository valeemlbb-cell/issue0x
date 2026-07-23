import { createHash } from "node:crypto";
import type { Decision, Desk } from "./types.js";

/**
 * Sealing a position: a commit hash over its canonical, immutable fields taken
 * BEFORE it opens. This is the product's whole claim — the record cannot be
 * edited or backdated. The hash covers desk, subject, side, conviction, leverage,
 * size and the sealed timestamp; nothing added later can change it.
 */
export function sealHash(desk: Desk, d: Decision, size: number, sealedAt: number): string {
  const canonical = JSON.stringify({
    desk,
    subject: d.subject,
    side: d.side,
    conviction: d.conviction,
    leverage: d.leverage,
    size,
    note: d.note,
    sealedAt,
  });
  return "0x" + createHash("sha256").update(canonical).digest("hex");
}
