import type { Config } from "./config.js";
import type { Decision, Desk, Quote, Signal } from "./types.js";
import { DECISION_TOOL, systemPrompt, userPrompt } from "./prompt.js";

/**
 * The trading brain. Two implementations behind one interface:
 *  - AnthropicLlm: the real Opus 4.8 brain, via the Messages API with a forced
 *    tool call so the reply is always a validated decision object.
 *  - MockLlm: a deterministic stand-in so the whole loop runs offline with no key.
 *    It is intentionally cautious and only occasionally acts.
 */
export interface Llm {
  readonly name: string;
  decide(
    desk: Desk,
    quotes: Quote[],
    signals: Signal[],
    equity: number,
    openOnDesk: number,
    record?: string,
  ): Promise<Decision>;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export class AnthropicLlm implements Llm {
  readonly name: string;
  constructor(private cfg: Config) {
    this.name = `anthropic:${cfg.model}`;
  }

  async decide(
    desk: Desk,
    quotes: Quote[],
    signals: Signal[],
    equity: number,
    openOnDesk: number,
    record = "",
  ): Promise<Decision> {
    const body = {
      model: this.cfg.model,
      max_tokens: this.cfg.maxTokens,
      system: systemPrompt(),
      messages: [{ role: "user", content: userPrompt(desk, quotes, signals, equity, openOnDesk, record) }],
      tools: [DECISION_TOOL],
      tool_choice: { type: "tool", name: DECISION_TOOL.name },
    };

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": this.cfg.anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      content?: { type: string; name?: string; input?: unknown }[];
    };
    const tool = json.content?.find((c) => c.type === "tool_use" && c.name === DECISION_TOOL.name);
    if (!tool || typeof tool.input !== "object" || tool.input == null) {
      throw new Error("Anthropic reply had no submit_decision tool call.");
    }
    return normalizeDecision(tool.input as Record<string, unknown>, desk, quotes);
  }
}

/** Deterministic offline brain: seeded by desk+subject so runs are reproducible. */
export class MockLlm implements Llm {
  readonly name = "mock";
  private seed = 0x9e3779b9;

  private rand(salt: number): number {
    let a = (this.seed ^ salt) >>> 0;
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  async decide(desk: Desk, quotes: Quote[], _signals: Signal[], _equity: number, openOnDesk: number): Promise<Decision> {
    this.seed = (this.seed + 0x1000193) >>> 0;
    const cands = quotes.filter((q) => q.desk === desk);
    const sit: Decision = {
      act: false, subject: "", side: desk === "prediction" ? "yes" : "long",
      conviction: 0.5, leverage: 0, sizePct: 0, horizonHours: 24, title: "", note: "No edge — sitting out.",
    };
    if (cands.length === 0 || openOnDesk >= 3) return sit;
    const pick = cands[Math.floor(this.rand(1) * cands.length)];
    // Act only ~55% of the time, so the record has genuine gaps.
    if (this.rand(2) > 0.55) return sit;

    const long = this.rand(3) > 0.4;
    const side = desk === "prediction" ? (long ? "yes" : "no") : long ? "long" : "short";
    const conviction = Number((0.55 + this.rand(4) * 0.32).toFixed(2));
    const leverage = desk === "futures" ? Math.round(2 + this.rand(5) * 6) : 0;
    return {
      act: true,
      subject: pick.subject,
      side,
      conviction,
      leverage,
      sizePct: Number((1.5 + this.rand(6) * 3).toFixed(1)),
      horizonHours: Math.round(12 + this.rand(7) * 120),
      title: `${side.toUpperCase()} ${pick.subject}`,
      note: `${pick.context}; ${(conviction * 100).toFixed(0)}% is where I'd seal it.`,
    };
  }
}

/** Coerce a raw brain reply into a safe Decision (clamp ranges, validate subject). */
function normalizeDecision(raw: Record<string, unknown>, desk: Desk, quotes: Quote[]): Decision {
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const s = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim() : d);
  const act = raw.act === true;
  const subject = s(raw.subject, "");
  const known = quotes.some((q) => q.desk === desk && q.subject === subject);
  const validSides: Record<Desk, Decision["side"][]> = {
    prediction: ["yes", "no"],
    degen: ["long", "short"],
    futures: ["long", "short"],
  };
  let side = s(raw.side, validSides[desk][0]) as Decision["side"];
  if (!validSides[desk].includes(side)) side = validSides[desk][0];

  return {
    act: act && known,
    subject,
    side,
    conviction: Math.min(0.97, Math.max(0.5, n(raw.conviction, 0.5))),
    leverage: desk === "futures" ? Math.max(1, Math.round(n(raw.leverage, 1))) : 0,
    sizePct: Math.max(0, n(raw.sizePct, 0)),
    horizonHours: Math.max(1, n(raw.horizonHours, 24)),
    title: s(raw.title, `${side.toUpperCase()} ${subject}`),
    note: s(raw.note, "—"),
  };
}

export function makeLlm(cfg: Config): Llm {
  return cfg.llmProvider === "anthropic" ? new AnthropicLlm(cfg) : new MockLlm();
}
