/**
 * What the History view lists, kept free of VS Code so it can be tested
 * (SUB-21, SUB-22): presentation changes made in this window in a group of
 * their own at the top, then the plot's steps, newest first. The entry
 * Ctrl+Z will take back next is marked, whichever kind it is.
 */
import type { HistoryStep } from "../service.js";
import type { PresentationStep, TimelineEntry } from "../presentation.js";

export const PRESENTATION_GROUP = "Presentation (this window)";

export type LocalRow = { kind: "presentation"; step: PresentationStep; undone: boolean; nextToUndo: boolean };
export type Row =
  | { kind: "group"; label: string; children: LocalRow[] }
  | { kind: "step"; step: HistoryStep; current: boolean; nextToUndo: boolean };

/**
 * local: presentation steps, oldest first; next: what Ctrl+Z takes back next
 * (none: the plot's own current step, if it can be undone).
 */
export function historyRows(
  steps: HistoryStep[],
  current: number,
  local: { step: PresentationStep; undone: boolean }[],
  next: TimelineEntry | undefined,
): Row[] {
  const currentIndex = steps.findIndex((s) => s.seq === current);
  const dataNext = (!next || next.kind === "data") && currentIndex > 0; // the import can't be undone
  const rows: Row[] = [];
  if (local.length) {
    rows.push({
      kind: "group",
      label: PRESENTATION_GROUP,
      children: [...local].reverse().map(({ step, undone }) => ({
        kind: "presentation" as const,
        step,
        undone,
        nextToUndo: next?.kind === "presentation" && next.step === step,
      })),
    });
  }
  for (const step of [...steps].reverse()) {
    const isCurrent = step.seq === current;
    rows.push({ kind: "step", step, current: isCurrent, nextToUndo: isCurrent && dataNext });
  }
  return rows;
}
