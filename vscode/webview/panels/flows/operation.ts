/**
 * The Tools' entries for the Outline's selection (product owner, 27 Oct 2026), run, written once for
 * both front ends (PAR-09): what they act on (operationContext: the Outline's rows chosen, the
 * solution Bearings shows, the time window, whether an earlier revision is shown), the refusal when
 * the selection has nothing an entry acts on, or why it cannot, then the change. Split before and
 * after a position of a TMA solution's leg (or a cut: the solution's position at its time); hide,
 * show and delete cuts; leave them out of a solution or count them in (which solution, asked when
 * they are rooted in several and Bearings shows none of them); keep a side; a solution from them,
 * whose first guess's form opens in Bearings. One step each, but the solution from cuts.
 */
import type { TmaRequest } from "@debrief/schemas";
import type { FormatSettings } from "@debrief/kernel";
import { exclusionTarget, outlineOperations, pickedCuts, pickOf, splitPlace, tmaRequestOf, type Operation, type OperationContext, type OperationId, type OutlineIndex, type OutlinePick } from "../../outlinemodel.js";
import type { Done, FlowHost } from "./host.js";

/** What the entries act on, as a host has it now. */
export interface OperationState {
  /** The open plot's index (outlinemodel.ts outlineIndex), undefined with no plot open. */
  index?: OutlineIndex;
  /** The Outline's rows chosen, by key. */
  keys: readonly string[];
  /** The solution Bearings shows, if any. */
  shownSolution?: string;
  /** The time window shown. */
  window?: { start: string; end: string };
  /** An earlier revision is shown read-only. */
  readOnly?: boolean;
  settings?: FormatSettings;
}

/** What the entries act on: the rows given (a menu's), else the Outline's rows chosen. Undefined with no plot open. */
export function operationContext(state: OperationState, keys?: readonly string[]): OperationContext | undefined {
  const { index } = state;
  if (!index) return undefined;
  return {
    index,
    picks: (keys ?? state.keys).map((k) => pickOf(index, k)).filter((p): p is OutlinePick => !!p),
    ...(state.shownSolution && { shownSolution: state.shownSolution }),
    ...(state.window && { window: { start: Date.parse(state.window.start), end: Date.parse(state.window.end) } }),
    ...(state.readOnly && { readOnly: true }),
    ...(state.settings && { settings: state.settings }),
  };
}

/** The entries for the rows given, or the Outline's rows chosen: each enabled, or with the reason it is not. */
export function operationsFor(state: OperationState, keys?: readonly string[]): Operation[] {
  const context = operationContext(state, keys);
  return context ? outlineOperations(context) : [];
}

export interface OperationHost extends FlowHost {
  operationState(): OperationState;
  /** A solution split into legs at a time, its leg starting before or after the position then: one step. */
  splitLeg(solution: string, at: string, side: "before" | "after"): Promise<Done>;
  setCutsHidden(cutIds: string[], hidden: boolean): Promise<Done>;
  deleteCuts(cutIds: string[]): Promise<Done>;
  /** Cuts rooted in a solution left out of its RMS error, or counted in again: one step. */
  exclude(solution: string, cutIds: string[], excluded: boolean): Promise<Done>;
  /** Ambiguous cuts given a side, or made ambiguous again: one step. */
  keepSide(keep: "port" | "starboard" | "ambiguous", cutIds: string[]): Promise<Done>;
  /** Bearings shown on a sensor, with the first guess's form for these cuts or this period. */
  makeSolution(sensor: string, focus: { make: true; cut_ids: string[] } | { make: true; period: NonNullable<TmaRequest["period"]> }): Promise<void>;
}

/** Said when the selection has nothing an entry acts on. */
export const NOT_OFFERED = "Select what this acts on in the Outline first: a solution's position, cuts, or a sensor.";

/** Run an entry on the rows given, or the Outline's rows chosen: what it said, a problem said as a warning. */
export async function runOperation(host: OperationHost, id: OperationId, keys?: readonly string[]): Promise<Done> {
  const refuse = (problem: string): Done => {
    void host.message("warning", problem);
    return { problem };
  };
  const context = operationContext(host.operationState(), keys);
  const op = context && outlineOperations(context).find((o) => o.id === id);
  if (!context || !op) return refuse(NOT_OFFERED);
  if (!op.enabled) return refuse(op.reason ?? NOT_OFFERED);
  const { index, picks } = context;
  const cuts = pickedCuts(picks);
  const cutIds = cuts.map((c) => c.id);
  const said = (done: Done, tell?: (notes: string[]) => string): Done => {
    if (done.problem) return refuse(done.problem);
    const notes = done.notes ?? [];
    if (tell && notes.length) void host.message("info", tell(notes));
    return { notes, ...(done.changed !== undefined && { changed: done.changed }) };
  };
  const sentences = (notes: string[]) => `${notes.join(". ")}.`;
  if (id === "split-before" || id === "split-after") {
    // A position of the solution, or a cut: the solution's position at its time.
    const side = id === "split-before" ? "before" : "after";
    const place = splitPlace(context, side);
    if (typeof place === "string") return refuse(place);
    const at = new Date(index.solutions.get(place.solution)!.times[place.index]).toISOString();
    return said(await host.splitLeg(place.solution, at, side));
  }
  if (id === "hide-cuts" || id === "show-cuts") return said(await host.setCutsHidden(cutIds, id === "hide-cuts"), sentences);
  if (id === "delete-cuts") return said(await host.deleteCuts(cutIds), sentences);
  if (id === "leave-out" || id === "count-in") {
    const target = exclusionTarget(index, cuts, context.shownSolution);
    let solution = target.solution;
    if (!solution) {
      // Rooted in several solutions, none shown in Bearings: which one.
      const names = target.candidates.map((c) => index.solutions.get(c)!.track.properties.name);
      const chosen = await host.ask({ kind: "pick", text: `${id === "leave-out" ? "Leave the cuts out of" : "Count the cuts in"} which solution?`, choices: names });
      if (chosen === undefined) return {};
      solution = target.candidates[names.indexOf(chosen)];
    }
    const rooted = new Set(index.solutions.get(solution)!.track.properties.tma!.cut_ids);
    return said(await host.exclude(solution, cutIds.filter((c) => rooted.has(c)), id === "leave-out"));
  }
  if (id === "keep-port" || id === "keep-starboard" || id === "keep-ambiguous") {
    const keep = id === "keep-port" ? "port" : id === "keep-starboard" ? "starboard" : "ambiguous";
    const twins = cuts.filter((c) => !!c.properties.ambiguous_bearing).map((c) => c.id);
    return said(await host.keepSide(keep, twins), (notes) => notes.join(" "));
  }
  // A solution from the cuts: the first guess's form, in Bearings, showing the first cut's sensor.
  const made = tmaRequestOf(context);
  if (typeof made === "string") return refuse(made);
  await host.makeSolution(made.cuts[0].properties.sensor_id, made.request.cut_ids ? { make: true, cut_ids: made.request.cut_ids } : { make: true, period: made.request.period! });
  return {};
}
