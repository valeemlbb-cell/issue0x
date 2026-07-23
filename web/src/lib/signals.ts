import type { Desk, Signal, SignalStrength, SignalType } from "./types";
import { SIM_NOW, allPositions } from "./sim";
import { between, mulberry32, pick } from "./rng";

/**
 * The radar: a deterministic feed of on-chain / social events the agent watches —
 * smart-money buys, KOL calls, new listings, whale moves, unlocks. Some lead a
 * position the agent then took (actedOn), which is what ties the radar to the
 * agent's reasoning.
 *
 * Handles and wallet labels here are fictional — a simulated radar must not put
 * words in a real person's mouth. When the live chain feed is wired, these become
 * real labelled wallets and real social calls.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const SMART_WALLETS = [
  "0x7f2a·9c1", "earlylp.eth", "sol_sniper.eth", "delta.eth", "0x3ab·d2f", "vwap.eth", "0x9c4·1a8",
];
const KOLS = ["@chainseer", "@degenoracle", "@0xmaxi", "@tapewatcher", "@liquidiq", "@perp_priest", "@floorpriest"];
const WHALES = ["whale 0x9c·77", "treasury.eth", "0xdead·beef", "market_maker.eth"];
// Real Robinhood Chain tokens that stand in for "new listings" on the radar.
const NEW_TOKENS = ["JUGGERNAUT", "CASHDOG", "BYCOCKET", "bcat", "CASHCAT", "USER"];

function strength(rand: () => number): SignalStrength {
  const r = rand();
  return r > 0.8 ? "high" : r > 0.45 ? "medium" : "low";
}

function detailFor(type: SignalType, subject: string, actor: string, rand: () => number): string {
  const usd = `${Math.round(between(rand, 8, 240))}k`;
  switch (type) {
    case "smart-money":
      return `${actor} bought ${usd} of ${subject}`;
    case "kol":
      return `${actor} called ${subject} — ${pick(rand, ["“accumulating here”", "“this runs”", "“best R/R on the chain”", "“don’t fade it”"])}`;
    case "listing":
      return `${subject} just listed — ${Math.round(between(rand, 40, 900))} holders in the first hour`;
    case "whale":
      return `${actor} moved ${usd} into ${subject}`;
    case "unlock":
      return `${subject} unlock in ${Math.round(between(rand, 2, 72))}h — ${Math.round(between(rand, 1, 9))}% of supply`;
  }
}

function actorFor(type: SignalType, rand: () => number): string {
  if (type === "smart-money") return pick(rand, SMART_WALLETS);
  if (type === "kol") return pick(rand, KOLS);
  if (type === "whale") return pick(rand, WHALES);
  return "chain";
}

function deskOf(subject: string, positionsSubjects: Map<string, Desk>): Desk | null {
  return positionsSubjects.get(subject) ?? null;
}

let cache: Signal[] | null = null;

function build(): Signal[] {
  const rand = mulberry32(0x1ada7);
  const positions = allPositions();
  const subjectDesk = new Map<string, Desk>();
  for (const p of positions) subjectDesk.set(p.subject, p.desk);

  const out: Signal[] = [];
  let seq = 0;
  const push = (s: Omit<Signal, "id">) => out.push({ ...s, id: `SIG-${String(3000 + seq++ * 7).slice(-4)}` });

  // Lead signals: for recent positions, place a signal shortly before the seal.
  const recent = positions
    .filter((p) => p.sealedAt > SIM_NOW - 12 * DAY)
    .sort((a, b) => b.sealedAt - a.sealedAt)
    .slice(0, 26);
  for (const p of recent) {
    if (rand() > 0.62) continue;
    const type: SignalType = p.desk === "degen" ? (rand() > 0.5 ? "smart-money" : "kol") : rand() > 0.55 ? "smart-money" : "whale";
    const actor = actorFor(type, rand);
    push({
      type,
      subject: p.subject,
      desk: p.desk,
      actor,
      detail: detailFor(type, p.subject, actor, rand),
      strength: strength(rand),
      at: p.sealedAt - Math.round(between(rand, 0.5, 8) * HOUR),
      actedOn: true,
    });
  }

  // Ambient chain chatter: listings, whales, KOL calls, unlocks — not all acted on.
  const ambient = 30;
  for (let i = 0; i < ambient; i += 1) {
    const type = pick(rand, ["kol", "listing", "whale", "smart-money", "unlock", "kol", "listing"] as SignalType[]);
    const subject = type === "listing" ? pick(rand, NEW_TOKENS) : pick(rand, [...subjectDesk.keys()]);
    const actor = actorFor(type, rand);
    push({
      type,
      subject,
      desk: type === "listing" ? "degen" : deskOf(subject, subjectDesk),
      actor,
      detail: detailFor(type, subject, actor, rand),
      strength: strength(rand),
      at: SIM_NOW - Math.round(between(rand, 0.2, 11) * DAY),
      actedOn: false,
    });
  }

  return out.sort((a, b) => b.at - a.at);
}

export function allSignals(): Signal[] {
  if (!cache) cache = build();
  return cache;
}

/* ---------- Live tape ---------- */

let liveSeq = 0;
const R = () => Math.random();
const rpick = <T,>(items: readonly T[]): T => items[Math.floor(R() * items.length)];

/**
 * Produce one fresh signal for the live feed, stamped `now`. Non-deterministic on
 * purpose — this is the moving tape, not the seeded backlog. Subjects are the real
 * Robinhood Chain tickers the rest of the app trades; handles stay fictional in the
 * simulation (the live agent replaces them with real labelled wallets).
 */
export function makeLiveSignal(now: number): Signal {
  const subjectDesk = new Map<string, Desk>();
  for (const p of allPositions()) subjectDesk.set(p.subject, p.desk);
  const subjects = [...subjectDesk.keys()];

  const type: SignalType = rpick(["smart-money", "smart-money", "kol", "whale", "listing", "smart-money"]);
  const subject = type === "listing" ? rpick(NEW_TOKENS) : rpick(subjects);
  const actor = actorForLive(type);
  return {
    id: `SIG-L${liveSeq++}-${Math.floor(R() * 1e6)}`,
    type,
    subject,
    desk: type === "listing" ? "degen" : subjectDesk.get(subject) ?? null,
    actor,
    detail: liveDetail(type, subject, actor),
    strength: R() > 0.8 ? "high" : R() > 0.45 ? "medium" : "low",
    at: now,
    actedOn: R() > 0.78,
  };
}

/**
 * A live "chain news" signal — everything the radar's News column shows: KOL calls,
 * macro, prediction/futures moves. Never a degen memecoin buy; those come from the
 * real pons trades feed (see lib/ponsTrades.ts), not the simulation.
 */
export function makeLiveNewsSignal(now: number): Signal {
  const subjectDesk = new Map<string, Desk>();
  for (const p of allPositions()) subjectDesk.set(p.subject, p.desk);
  const newsSubjects = [...subjectDesk.entries()].filter(([, d]) => d !== "degen").map(([s]) => s);
  const subjects = newsSubjects.length ? newsSubjects : ["BTC", "ETH", "CPI"];

  const type: SignalType = rpick(["kol", "kol", "smart-money", "whale", "unlock"]);
  const subject = rpick(subjects);
  const actor = actorForLive(type);
  return {
    id: `SIG-N${liveSeq++}-${Math.floor(R() * 1e6)}`,
    type,
    subject,
    desk: subjectDesk.get(subject) ?? "prediction",
    actor,
    detail: liveDetail(type, subject, actor),
    strength: R() > 0.8 ? "high" : R() > 0.45 ? "medium" : "low",
    at: now,
    actedOn: R() > 0.85,
  };
}

const DEGEN_TICKERS = [
  "RIBBIT", "ROBINWOOD", "WAGMI", "HOODIE", "VLAD", "CAT", "PICKLE", "DIH", "JUGGERNAUT", "CASHDOG",
];

/**
 * A simulated degen buy — the fallback for the radar's Degen column when the real
 * pons trade feed is unreachable (e.g. pons rate-limits without a partner key).
 * Real tokens, fictional wallet, plausible size. Disclosed as simulated on-page.
 */
export function makeLiveDegenSignal(now: number): Signal {
  const subject = rpick(DEGEN_TICKERS);
  const actor = rpick(SMART_WALLETS);
  const usd = Math.round(20 + R() * 900);
  return {
    id: `SIG-D${liveSeq++}-${Math.floor(R() * 1e6)}`,
    type: "whale",
    subject,
    desk: "degen",
    actor,
    detail: `bought $${usd.toLocaleString()} of ${subject}`,
    strength: usd >= 500 ? "high" : usd >= 100 ? "medium" : "low",
    at: now,
    actedOn: false,
  };
}

function actorForLive(type: SignalType): string {
  if (type === "kol") return rpick(KOLS);
  if (type === "whale") return rpick(WHALES);
  if (type === "listing") return "chain";
  return rpick(SMART_WALLETS);
}

function liveDetail(type: SignalType, subject: string, actor: string): string {
  const usd = `${Math.round(8 + R() * 240)}k`;
  switch (type) {
    case "smart-money":
      return `${actor} bought ${usd} of ${subject}`;
    case "kol":
      return `${actor} called ${subject}`;
    case "whale":
      return `${actor} moved ${usd} into ${subject}`;
    case "listing":
      return `${subject} just listed on pons`;
    case "unlock":
      return `${subject} unlock incoming`;
  }
}
