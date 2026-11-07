/**
 * A sensor's ambiguous cuts and the cut at current time (CAP-22; product owner, 24 Oct 2026): their
 * commands registered once for both hosts (review of 7 Nov 2026, finding 2). Keep a side (port or
 * starboard) of the cut at current time, those in the time window, those selected or all of a
 * sensor's; a cut's menu; the cut current time is at, for a sensor. Given a resolution (agents, the
 * map, tests), nothing is asked. How each host asks (VS Code's QuickPicks, the playground's menus)
 * is its CutsHost.
 */
import { registerCommands, type Host, type Run } from "./register.js";

export const CUT_COMMANDS = {
  resolveAmbiguity: "debrief.resolveAmbiguity",
  /** A cut's menu: keep either bearing, make it ambiguous again, select it, keep a side for more. */
  cutMenu: "debrief.cutMenu",
  currentCut: "debrief.currentCut",
} as const;

/** What a host runs for each, given the command's own arguments. */
export type CutsHost = { [K in keyof typeof CUT_COMMANDS]: Run };

export function registerCuts(host: Host, cuts: CutsHost): void {
  registerCommands(host, CUT_COMMANDS, cuts);
}
