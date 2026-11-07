/**
 * Bearings and TMA solutions (CAP-21), registered once for both front ends (review of 7 Nov 2026,
 * finding 2): Bearings shown, popped out into a window of its own, brought back and its window
 * brought to the front (product owner, 28 Oct 2026); a solution made from a sensor's cuts, split
 * into legs, and cuts left out of its RMS error or counted in again, each one step (product owner,
 * 24 Oct 2026). What each host does differently (how it shows Bearings, how it makes the change)
 * is its TmaHost; the commands, their arguments and their refusals are these.
 */
import type { TmaFocus, TmaRequest, TmaResiduals } from "@debrief/schemas";
import type { OperationId } from "../../outlinemodel.js";
import type { Done, FlowHost } from "./host.js";
import { registerCommands, type Host, type Target } from "./register.js";

/** The commands, by what each does. */
export const BEARINGS_COMMANDS = {
  show: "debrief.showBearings",
  popOut: "debrief.popOutBearings",
  bringBack: "debrief.bringBackBearings",
  focusWindow: "debrief.focusBearingsWindow",
  create: "debrief.tmaCreate",
  splitLeg: "debrief.tmaSplitLeg",
  exclude: "debrief.tmaExclude",
} as const;

/** A solution made: its feature, and what the service said of it. */
export interface Made {
  problem?: string;
  feature?: string;
  notes?: string[];
  residuals?: TmaResiduals;
}

export const SELECT_SOLUTION = "Select one TMA solution to split into legs.";
export const SET_TIME = "Set current time first: the solution is split into legs there.";
export const CHOOSE_CUTS = "Choose the cuts to leave out in Bearings.";

/** What a host does for Bearings and TMA. */
export interface TmaHost extends Pick<FlowHost, "message"> {
  /** Bearings in sight wherever it is live (popped out, its window; else the panel), showing this sensor or solution, if given, with something chosen there once. */
  show(id: string | undefined, focus?: TmaFocus): unknown;
  popOut(): unknown;
  bringBack(): unknown;
  focusWindow(): unknown;
  /** The first of a command's rows, as given (a string), or of its Target (VS Code's selection, if none). */
  idOf(target?: string | Target): string | undefined;
  /** The one TMA solution a command's rows name, if they name one. */
  solutionOf(target?: string | Target): string | undefined;
  /** Current time, if set. */
  currentTime(): string | undefined;
  /** One of the Tools' entries on the Outline's selection (operation.ts): TMA solution from cuts…, without a request. */
  runOperation(id: OperationId): unknown;
  /** A solution made from the request: one step, the solution selected. */
  create(request: TmaRequest): Promise<Made>;
  /** A solution split into legs at a time, or with join the leg starting then joined to the one before: one step. */
  splitLeg(solution: string, at: string, join: boolean): Promise<Done>;
  /** Rooted cuts left out of a solution's RMS error, or counted in again: one step. */
  exclude(solution: string, cutIds: string[], excluded: boolean): Promise<Done>;
}

/** Bearings' and TMA's commands, registered with the host. Each returns what it did, or the problem, for agents and tests. */
export function registerBearings(host: Host, tma: TmaHost): void {
  const refuse = (problem: string) => (void tma.message("warning", problem), { problem });
  registerCommands(host, BEARINGS_COMMANDS, {
    // Bearings, showing a sensor's cuts or a solution; with focus (a walkthrough's step, an agent),
    // something chosen there once: a cut, a period and its first guess, or the largest residual.
    show: (target?: string | Target, focus?: TmaFocus) => tma.show(tma.idOf(target), focus),
    // Bearings popped out into a window of its own, for a second monitor, as legacy's Stacked Dots
    // could be; brought back to the panel; its window brought to the front.
    popOut: () => tma.popOut(),
    bringBack: () => tma.bringBack(),
    focusWindow: () => tma.focusWindow(),
    // Made from a period of a sensor's cuts in Bearings, with a first guess by form or by two
    // clicks on the map: one step. Given a request (agents, tests, the view), it asks nothing;
    // without one, TMA solution from cuts… on what the Outline has selected (product owner, 27 Oct 2026).
    create: async (request?: TmaRequest) => {
      if (!request) return tma.runOperation("tma-from-cuts");
      const made = await tma.create(request);
      return made.problem ? refuse(made.problem) : made;
    },
    // A solution split into legs at a time (current time unless given), or with join the leg
    // starting then joined to the one before: one step. It stays one track.
    splitLeg: async (target?: string | Target, options?: { at?: string; join?: boolean }) => {
      const solution = tma.solutionOf(target);
      if (!solution) return refuse(SELECT_SOLUTION);
      const at = options?.at ?? tma.currentTime();
      if (!at) return refuse(SET_TIME);
      const done = await tma.splitLeg(solution, at, !!options?.join);
      return done.problem ? refuse(done.problem) : { notes: done.notes };
    },
    // Rooted cuts left out of a solution's RMS error, such as wild bearings, or counted again: one step.
    exclude: async (solutionId?: string, cutIds?: string[], excluded = true) => {
      if (!solutionId || !cutIds?.length) return refuse(CHOOSE_CUTS);
      const done = await tma.exclude(solutionId, cutIds, excluded);
      return done.problem ? refuse(done.problem) : { changed: done.changed, notes: done.notes };
    },
  });
}
