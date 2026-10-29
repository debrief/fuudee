/**
 * The History panel model (PAR-01, PAR-02, docs/panel-parity-srd.md): one host-neutral list that VS
 * Code's HistoryProvider (src/views/history.ts) and the playground's History panel
 * (play/historylist.ts) only render. Free of VS Code and of the DOM.
 *
 * Every change to the open plot, newest first (SUB-19, SUB-21), as historyRows lists them: each
 * step's name (describeStep), its detail (step n · current, undone or replaced · shown read-only ·
 * next to undo · when · by whom), its tooltip ("Step n: name / status / By agent, when"), its
 * icon, and the actions its context menu offers, from the action catalogue (panels/actions.ts):
 * Go back to this step on a step in the plot, Redo up to this step on one undone; neither on the
 * current step, a step replaced by a later change, or while an earlier revision is shown read-only.
 * With no plot open, or when the history cannot be read, one row saying so.
 */
import { describePeriod } from "../../src/format.js";
import type { HistoryStep } from "../../src/service.js";
import { historyRows, undoRedo } from "../../src/views/historyrows.js";
import { describeStep } from "../../src/wording.js";
import { rowActions } from "./actions.js";

/** What History says with no plot open. */
export const NO_PLOT = "Open a plot to see its history.";
/** What History says when there is no tool service (or Python) to read it from. */
export const NEEDS_SERVICE = "History needs the tool service.";
/** The marker on the step Ctrl+Z takes back next. */
export const NEXT_TO_UNDO = "next to undo";

/** What History is built from. */
export interface HistoryInput {
  /** Whether a plot is open. */
  open: boolean;
  steps: readonly HistoryStep[];
  /** The step current. */
  current: number;
  /** The step shown read-only, when an earlier revision is shown (an image traced to its plot). */
  shown?: number;
  /** Why the history could not be read. */
  problem?: string;
  /** A tool's title, by name, for steps a tool made. */
  toolTitle: (name: string) => string | undefined;
}

const ICONS: Record<HistoryStep["status"], string> = {
  applied: "pass-filled",
  undone: "discard",
  abandoned: "circle-slash",
};

/** A row as both front ends render it. */
export interface HistoryRow {
  key: string;
  kind: "status" | "step";
  label: string;
  /** What VS Code's description and the playground's detail say. */
  detail: string;
  tooltip?: string;
  /** A codicon id; the playground draws its own artwork for it. */
  icon: string;
  /** Drawn faint (a step replaced by a later change). */
  muted: boolean;
  /** The step's number and status, for a step. */
  seq?: number;
  status?: HistoryStep["status"];
  current: boolean;
  nextToUndo: boolean;
  /** Whether it is the step of the revision shown read-only. */
  shown: boolean;
  /** Its menu context, as the action catalogue's placements match it (VS Code's contextValue). */
  menu?: string;
  /** The ids of the actions its context menu offers (the action catalogue's, PAR-05). */
  actions: readonly string[];
}

export class HistoryModel {
  constructor(private readonly input: HistoryInput) {}

  private get readOnly(): boolean {
    return this.input.shown !== undefined;
  }

  /** Whether Undo and Redo can act (PAR-08). */
  get canUndo(): boolean {
    return undoRedo(this.input.steps, this.input.current, this.readOnly).canUndo;
  }
  get canRedo(): boolean {
    return undoRedo(this.input.steps, this.input.current, this.readOnly).canRedo;
  }

  rows(): HistoryRow[] {
    const { problem, open, steps, current, shown, toolTitle } = this.input;
    const status = (text: string, icon: string): HistoryRow => ({ key: "history:status", kind: "status", label: text, detail: "", icon, muted: false, current: false, nextToUndo: false, shown: false, actions: [] });
    if (problem) return [status(problem, "warning")];
    if (!open) return [status(NO_PLOT, "info")];
    return historyRows([...steps], current).map(({ step, current: isCurrent, nextToUndo }) => {
      const { label, status: said } = describeStep(step, toolTitle);
      const marker = isCurrent ? "current" : step.status === "undone" ? "undone" : step.status === "abandoned" ? "replaced" : "";
      const isShown = step.seq === shown;
      const next = !this.readOnly && nextToUndo;
      const detail = [`step ${step.seq}`, marker, isShown ? "shown read-only" : "", next ? NEXT_TO_UNDO : "", describePeriod(step.at), step.agent].filter(Boolean).join(" · ");
      // Which actions its context menu offers: none on the current step, a replaced one, or while a revision is shown.
      const menu = step.status === "abandoned" || isCurrent || this.readOnly ? `step-${step.status}-fixed` : `step-${step.status}`;
      return {
        key: `step-${step.seq}`,
        kind: "step",
        label,
        detail,
        tooltip: `Step ${step.seq}: ${label}\n${said}\nBy ${step.agent}, ${describePeriod(step.at)}`,
        icon: ICONS[step.status],
        muted: step.status === "abandoned",
        seq: step.seq,
        status: step.status,
        current: isCurrent,
        nextToUndo: next,
        shown: isShown,
        menu,
        actions: rowActions("debrief.history", menu),
      };
    });
  }
}
