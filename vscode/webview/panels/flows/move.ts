/**
 * Undo, redo and go to a step (SUB-21), written once for both front ends (PAR-09, PAR-12): replay in
 * the service, sending the plot the analyst is looking at as the base, so a change made elsewhere
 * meanwhile is never undone blindly (SUB-28); a newer schema confirmed first (SUB-35); then the plot
 * shown as it now is. Nothing else is closed: the results panel stays open. Undo and Redo with
 * nothing to take back or bring back say so, in the catalogue's words (PAR-08).
 */
import { REASONS } from "../actions.js";
import { confirmNewerSchema } from "./runtool.js";
import { isRefusal, type FlowHost } from "./host.js";
import { READ_ONLY } from "../../../src/figures.js";
import type { Base } from "../../../src/service.js";
import { registerCommands, type Host } from "./register.js";

export type How = "undo" | "redo" | "goto";

export interface MoveHost extends FlowHost {
  /** Whether Undo and Redo can act now (the History panel model's), from the history as it now is. */
  history(): Promise<{ canUndo: boolean; canRedo: boolean }>;
  /** Replay in the service; throws a Refusal for a conflict or a newer schema. */
  move(how: How, base: Base, step: number | undefined, allowNewerSchema: boolean): Promise<void>;
  /** Read the history again, for the History panel. */
  refreshHistory(): Promise<void>;
}

export const NOTHING_TO_UNDO = REASONS["debrief.canUndo"];
export const NOTHING_TO_REDO = REASONS["debrief.canRedo"];
export const NO_SERVICE = "Undo needs Debrief's tool service. Run 'Debrief: Restart tool service'.";

/** Undo, redo or go to a step: the problem, if any, said as a warning. */
export async function move(host: MoveHost, how: How, step?: number): Promise<string | undefined> {
  const problem = await moved(host, how, step);
  await host.refreshHistory();
  if (problem) void host.message("warning", problem);
  return problem;
}

async function moved(host: MoveHost, how: How, step?: number): Promise<string | undefined> {
  const plot = host.plot();
  if (!plot) return "Open a plot first.";
  if (how === "goto" && step === undefined) return undefined;
  if (plot.readOnly) return READ_ONLY;
  const can = await host.history();
  if (how === "undo" && !can.canUndo) return NOTHING_TO_UNDO;
  if (how === "redo" && !can.canRedo) return NOTHING_TO_REDO;
  if (!host.serviceReady() || !plot.base) return NO_SERVICE;
  const base = plot.base;
  try {
    try {
      await host.move(how, base, step, false);
    } catch (error) {
      if (!isRefusal(error, "newer_schema")) throw error;
      if (!(await confirmNewerSchema(host, (error as Error).message))) return "Nothing was changed.";
      await host.move(how, base, step, true);
    }
  } catch (error) {
    if (isRefusal(error, "conflict")) {
      await host.reloadPlot();
      return "The plot was changed elsewhere, so nothing was undone. Debrief is showing the latest; try again if you still want to.";
    }
    return (error as Error).message;
  }
  return host.reloadPlot();
}

export const HISTORY_COMMANDS = {
  undo: "debrief.undo",
  redo: "debrief.redo",
  goToStep: "debrief.goToStep",
  redoToStep: "debrief.redoToStep",
  openLatestRevision: "debrief.openLatestRevision",
} as const;

/** A step, as a command is given it: its number (agents, tests), or a History row (its step's, or its own). */
export type StepTarget = number | { seq?: number } | { step: { seq: number } } | undefined;
/** The number of the step a command was given, if any. */
export const stepOf = (target: StepTarget): number | undefined => (typeof target === "number" ? target : target && "step" in target ? target.step.seq : target?.seq);

/** What a host does for History's commands. */
export interface HistoryHost {
  /** Undo, redo or go to a step, one at a time (the shared flow, move above): the problem, if any, said. */
  move(how: How, step?: number): Promise<unknown>;
  /** An earlier revision shown read-only: the plot as it now is shown instead. Nothing otherwise. */
  openLatestRevision(): Promise<unknown>;
}

/** History's commands, registered once for both hosts (PAR-09): undo, redo, go to (or redo to) a step, and the latest revision. */
export function registerHistory(host: Host, history: HistoryHost): void {
  const goTo = (target?: StepTarget) => {
    const seq = stepOf(target);
    return seq === undefined ? undefined : history.move("goto", seq);
  };
  registerCommands(host, HISTORY_COMMANDS, {
    undo: () => history.move("undo"),
    redo: () => history.move("redo"),
    goToStep: goTo,
    redoToStep: goTo,
    openLatestRevision: () => history.openLatestRevision(),
  });
}
