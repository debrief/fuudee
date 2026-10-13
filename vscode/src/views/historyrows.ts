/**
 * What the History view lists, kept free of VS Code so it can be tested
 * (SUB-21): the plot's steps, newest first, with the one Ctrl+Z takes back
 * next marked. Colour and hiding are steps like any other (SUB-22, decision
 * 12 Oct), named by their notes, such as "Colour of BLUE ONE set to red".
 */
import type { HistoryStep } from "../service.js";

export type Row = { kind: "step"; step: HistoryStep; current: boolean; nextToUndo: boolean };

export function historyRows(steps: HistoryStep[], current: number): Row[] {
  const next = nextToUndo(steps, current);
  return [...steps].reverse().map((step) => ({ kind: "step", step, current: step.seq === current, nextToUndo: next.has(step.seq) }));
}

/**
 * The steps Ctrl+Z takes back next: the current step and, when that step changes
 * only the plot's records (a received plot file's arrival), the change before it
 * too, as the service does, so Undo never seems to do nothing.
 */
function nextToUndo(steps: HistoryStep[], current: number): Set<number> {
  const bySeq = new Map(steps.map((s) => [s.seq, s]));
  const taken = new Set<number>();
  let step = bySeq.get(current);
  while (step) {
    taken.add(step.seq);
    if (!step.records_only || !step.after) break;
    step = bySeq.get(step.after);
  }
  // The first step (the import) can't be undone, nor a step undone only with it.
  const undoable = step !== undefined && (step.after ?? steps.indexOf(step)) > 0;
  return undoable ? taken : new Set();
}
