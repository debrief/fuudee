/**
 * What the History view lists, kept free of VS Code so it can be tested
 * (SUB-21): the plot's steps, newest first, with the one Ctrl+Z takes back
 * next marked. Colour and hiding are steps like any other (SUB-22, decision
 * 12 Oct), named by their notes, such as "Colour of BLUE ONE set to red".
 */
import type { HistoryStep } from "../service.js";

export type Row = { kind: "step"; step: HistoryStep; current: boolean; nextToUndo: boolean };

export function historyRows(steps: HistoryStep[], current: number): Row[] {
  const currentIndex = steps.findIndex((s) => s.seq === current);
  const undoable = currentIndex > 0; // the import can't be undone
  return [...steps].reverse().map((step) => {
    const isCurrent = step.seq === current;
    return { kind: "step", step, current: isCurrent, nextToUndo: isCurrent && undoable };
  });
}
