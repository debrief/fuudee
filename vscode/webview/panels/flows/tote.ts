/**
 * The Tote's entries on the Outline's tracks (CAP-06; product owner's rule, webview/totelogic.ts):
 * set as primary, add, and remove, registered once for both hosts (review of 7 Nov 2026, finding 2).
 * The tracks are the command's rows, and the change to the Tote's choice is the same in both; the
 * host says which rows are tracks and shows the Tote with the choice made.
 */
import type { ToteView } from "@debrief/schemas";
import { withPrimary, withoutSecondary, withSecondaries } from "../../totelogic.js";
import type { FlowHost } from "./host.js";
import { registerCommands, type Host } from "./register.js";

export const TOTE_COMMANDS = {
  setPrimary: "debrief.tote.setPrimary",
  add: "debrief.tote.add",
  remove: "debrief.tote.remove",
} as const;

export const ONE_PRIMARY = "Select one track to be the Tote's primary.";
export const TRACKS_TO_ADD = "Select the tracks to add to the Tote.";
export const TRACKS_TO_REMOVE = "Select the tracks to remove from the Tote.";

export interface ToteHost extends Pick<FlowHost, "message"> {
  /** The tracks among the command's rows: given (an id, ids, a Target), with the others chosen beside it from a menu, else the selection. */
  tracksOf(target?: unknown, others?: unknown): string[];
  /** The Tote's choice changed, and shown: the problem, if any. */
  change(change: (tote: ToteView) => ToteView): unknown;
}

/** The Tote's entries' commands: the problem, if any, said and returned. */
export function registerTote(host: Host, tote: ToteHost): void {
  const refuse = (problem: string) => (void tote.message("warning", problem), problem);
  registerCommands(host, TOTE_COMMANDS, {
    setPrimary: (target?: unknown, others?: unknown) => {
      const ids = tote.tracksOf(target, others);
      if (ids.length !== 1) return refuse(ONE_PRIMARY);
      return tote.change((t) => withPrimary(t, ids[0]));
    },
    add: (target?: unknown, others?: unknown) => {
      const ids = tote.tracksOf(target, others);
      if (!ids.length) return refuse(TRACKS_TO_ADD);
      return tote.change((t) => withSecondaries(t, ids));
    },
    remove: (target?: unknown, others?: unknown) => {
      const ids = tote.tracksOf(target, others);
      if (!ids.length) return refuse(TRACKS_TO_REMOVE);
      return tote.change((t) => ids.reduce((v, id) => (v.primary === id ? withPrimary(v, undefined) : withoutSecondary(v, id)), t));
    },
  });
}
