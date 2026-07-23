/** Durable bot state on disk — open/closed positions, realized P&L, fees paid. Kept in
 *  a single JSON file next to the bot so a restart resumes where it left off. */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { BotState, Position } from "./types.js";

const STATE_PATH = resolve(process.cwd(), "issue0x-state.json");

const EMPTY: BotState = { positions: [], realizedPnlEth: 0, feesPaidEth: 0, startedAt: null, cycles: 0 };

export function loadState(): BotState {
  if (!existsSync(STATE_PATH)) return { ...EMPTY };
  try {
    const s = JSON.parse(readFileSync(STATE_PATH, "utf8")) as BotState;
    return { ...EMPTY, ...s, positions: Array.isArray(s.positions) ? s.positions : [] };
  } catch {
    return { ...EMPTY };
  }
}

export function saveState(state: BotState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function openPositions(state: BotState): Position[] {
  return state.positions.filter((p) => p.status === "open");
}
