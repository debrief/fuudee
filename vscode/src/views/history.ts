/**
 * History view: every change to the open plot, newest first (SUB-19, SUB-21).
 * Undo is replay to an earlier step, so any step still in the plot or undone
 * can be returned to; steps replaced by a later change are kept on record but
 * cannot be. The history itself lives in Python; this view presents it.
 * Colour and hiding are steps like any other (SUB-22, decision 12 Oct). The
 * step Ctrl+Z will take back next is marked.
 */
import * as vscode from "vscode";
import { describePeriod } from "../format.js";
import type { HistoryStep } from "../service.js";
import { describeStep } from "../wording.js";
import { historyRows, undoRedo, type Row } from "./historyrows.js";

type Node = { kind: "status"; text: string; icon: string } | Row;

const ICONS: Record<HistoryStep["status"], string> = {
  applied: "pass-filled",
  undone: "discard",
  abandoned: "circle-slash",
};
const NEXT = "next to undo";

export class HistoryProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  steps: HistoryStep[] = [];
  current = 0;
  problem?: string;
  open = false;

  constructor(private readonly toolTitle: (name: string) => string | undefined) {}

  /** The step shown read-only, when an earlier revision is shown (an image traced to its plot). */
  shown?: number;

  update(steps: HistoryStep[], current: number, open = true, problem?: string, shown?: number): void {
    Object.assign(this, { steps, current, open, problem, shown });
    this.changed.fire();
  }

  canUndo(): boolean {
    return undoRedo(this.steps, this.current, this.shown !== undefined).canUndo;
  }

  canRedo(): boolean {
    return undoRedo(this.steps, this.current, this.shown !== undefined).canRedo;
  }

  /** The rows as listed, for tests and agents. */
  rows(): Row[] {
    return historyRows(this.steps, this.current);
  }

  getChildren(node?: Node): Node[] {
    if (node) return [];
    if (this.problem) return [{ kind: "status", text: this.problem, icon: "warning" }];
    if (!this.open) return [{ kind: "status", text: "Open a plot to see its history.", icon: "info" }];
    return this.rows();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "status") {
      const item = new vscode.TreeItem(node.text);
      item.iconPath = new vscode.ThemeIcon(node.icon);
      return item;
    }
    const { step } = node;
    const { label, status } = describeStep(step, this.toolTitle);
    const item = new vscode.TreeItem(label);
    item.id = `step-${step.seq}`;
    const marker = node.current ? "current" : step.status === "undone" ? "undone" : step.status === "abandoned" ? "replaced" : "";
    const shown = step.seq === this.shown ? "shown read-only" : "";
    item.description = [`step ${step.seq}`, marker, shown, this.shown === undefined && node.nextToUndo ? NEXT : "", describePeriod(step.at), step.agent]
      .filter(Boolean)
      .join(" · ");
    item.tooltip = `Step ${step.seq}: ${label}\n${status}\nBy ${step.agent}, ${describePeriod(step.at)}`;
    item.iconPath = new vscode.ThemeIcon(
      ICONS[step.status],
      step.status === "abandoned" ? new vscode.ThemeColor("disabledForeground") : undefined,
    );
    // Which actions the step's context menu offers.
    item.contextValue = step.status === "abandoned" || node.current || this.shown !== undefined ? `step-${step.status}-fixed` : `step-${step.status}`;
    return item;
  }
}
