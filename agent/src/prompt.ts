import type { Desk, Quote, Signal } from "./types.js";

/**
 * The trading brain's instructions and its output contract. The decision is taken
 * with a forced tool call, so the model always returns a validated object rather
 * than prose — that is what makes the loop deterministic to consume even though
 * the reasoning behind it is the full model.
 */

const DESK_BRIEF: Record<Desk, string> = {
  prediction:
    "Binary events on tokenized stocks, crypto and macro that resolve to a hard yes/no. side is 'yes' or 'no'; conviction is your P(the side you take is correct); leverage is 0.",
  degen:
    "Momentum on new and volatile tokens. side is 'long' or 'short'; conviction is your confidence; leverage is 0 (spot). Size small — these have fat tails both ways.",
  futures:
    "Directional perp positions. side is 'long' or 'short'; set leverage (1–max) deliberately; conviction is your confidence in the direction.",
};

export function systemPrompt(): string {
  return [
    "You are issue0x, a single agentic trader whose entire track record is public and unfakeable.",
    "Every position you take is hashed and timestamped BEFORE it opens and scored on the real outcome, so you cannot cherry-pick or backdate. Wins and losses both stay on the record.",
    "",
    "Your discipline:",
    "- Only act when you have a genuine, statable edge. Sitting out (act=false) is a valid, common, and often correct decision. Do NOT force a trade every tick.",
    "- Be calibrated. conviction is a probability, not a vibe: 0.55 means barely better than a coin flip; reserve >0.8 for rare, strong setups. Overconfidence is punished hardest by the score.",
    "- Size to survive. You trade protocol capital, never a user's deposit; a blown-up desk helps no one. Small, asymmetric bets beat big convicted ones.",
    "- One line of honest reasoning per position (note). If you can't say the edge in one clear sentence, you don't have one — sit out.",
    "- Losses are expected and acceptable on the record. A bad bet honestly sized is fine; a reckless bet is not.",
    "",
    "You are not guaranteed to be right. Your job is to be well-calibrated and disciplined over many decisions, not to win every one.",
  ].join("\n");
}

export function userPrompt(
  desk: Desk,
  quotes: Quote[],
  signals: Signal[],
  equity: number,
  openOnDesk: number,
  record = "",
): string {
  const lines = quotes
    .filter((q) => q.desk === desk)
    .map((q) => `  - ${q.subject}: price ${q.price} — ${q.context}`)
    .join("\n");
  const radar = signals
    .filter((s) => s.desk === desk)
    .slice(0, 8)
    .map((s) => `  - [${s.type}, ${s.strength}] ${s.detail}`)
    .join("\n");
  return [
    `Desk: ${desk}. ${DESK_BRIEF[desk]}`,
    `Current trading capital: ${Math.round(equity)} USDG. Open positions already on this desk: ${openOnDesk}.`,
    record ? "\n" + record : "",
    "",
    "Candidates and what the feed shows right now:",
    lines || "  (no candidates)",
    "",
    "Radar — smart money, KOLs and whales on these names (signal, not gospel; confirm it against the tape):",
    radar || "  (quiet)",
    "",
    "Decide whether to open ONE position on this desk now. If nothing has a real edge, return act=false.",
    "Weigh your own record above: lean into desks and signal types that have actually worked for you, and be pickier where you've been cold. But a crowded call is not an edge, and a past loss on a desk is not a reason to force a win back.",
    "sizePct is the share of capital to commit; keep it modest — the risk gate will clamp anything reckless.",
  ].join("\n");
}

/** The forced-tool schema. The model must return an object matching this. */
export const DECISION_TOOL = {
  name: "submit_decision",
  description: "Submit your trading decision for this desk this tick.",
  input_schema: {
    type: "object",
    properties: {
      act: { type: "boolean", description: "true to open a position, false to sit this desk out." },
      subject: { type: "string", description: "The candidate to trade (must be one shown), or empty if act=false." },
      side: { type: "string", enum: ["yes", "no", "long", "short"] },
      conviction: { type: "number", description: "Calibrated probability the position is correct, 0–1." },
      leverage: { type: "number", description: "Futures leverage 1–max; 0 for prediction/degen." },
      sizePct: { type: "number", description: "Percent of capital to commit, e.g. 3." },
      horizonHours: { type: "number", description: "Expected time to resolution, in hours." },
      title: { type: "string", description: "One-line headline of the position." },
      note: { type: "string", description: "One sentence of honest reasoning — the edge." },
    },
    required: ["act", "side", "conviction", "leverage", "sizePct", "horizonHours", "title", "note", "subject"],
    additionalProperties: false,
  },
} as const;
