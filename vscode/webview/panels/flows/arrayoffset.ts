/**
 * A towed array's offset astern of the ship, and how it follows (CAP-22; product owner, 24 Oct
 * 2026): its command registered once for both hosts (review of 7 Nov 2026, finding 2). Run on a
 * sensor's row; given an offset (null for none) and a mode (agents, tests), nothing is asked. How
 * each host asks (VS Code's input box and QuickPick, the playground's form) is its own.
 */
import { registerCommands, type Host, type Run } from "./register.js";

export const ARRAY_OFFSET_COMMANDS = { setArrayOffset: "debrief.setArrayOffset" } as const;

/** What a host runs, given the command's own arguments: (target, offset, mode). */
export type ArrayOffsetHost = { [K in keyof typeof ARRAY_OFFSET_COMMANDS]: Run };

export function registerArrayOffset(host: Host, arrays: ArrayOffsetHost): void {
  registerCommands(host, ARRAY_OFFSET_COMMANDS, arrays);
}
