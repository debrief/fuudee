/**
 * History view: every change to the open plot, newest first (SUB-19, SUB-21).
 * Undo is replay to an earlier step, so any step still in the plot or undone
 * can be returned to; steps replaced by a later change are kept on record but
 * cannot be. The history itself lives in Python; this view presents it.
 * Presentation changes made in this window are grouped at the top (SUB-22),
 * and the entry Ctrl+Z will take back next is marked.
 */
import * as vscode from "vscode";
import { describePeriod } from "../format.js";
import type { PresentationStep, TimelineEntry } from "../presentation.js";
import type { HistoryStep } from "../service.js";
import { describeStep } from "../wording.js";
import { historyRows, type LocalRow, type Row } from "./historyrows.js";

type Node = { kind: "status"; text: string; icon: string } | Row | LocalRow;

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
  local: { step: PresentationStep; undone: boolean }[] = [];
  next?: TimelineEntry;

  constructor(private readonly toolTitle: (name: string) => string | undefined) {}

  /** local: presentation changes made in this window, oldest first (SUB-22); next: what Ctrl+Z takes back next. */
  update(
    steps: HistoryStep[],
    current: number,
    open = true,
    problem?: string,
    local: { step: PresentationStep; undone: boolean }[] = [],
    next?: TimelineEntry,
  ): void {
    Object.assign(this, { steps, current, open, problem, local, next });
    this.changed.fire();
  }

  canUndo(): boolean {
    const step = this.steps.find((s) => s.seq === this.current);
    return !!step && this.steps.indexOf(step) > 0;
  }

  canRedo(): boolean {
    return this.steps.some((s) => s.status === "undone");
  }

  /** The rows as listed, for tests and agents. */
  rows(): Row[] {
    return historyRows(this.steps, this.current, this.local, this.next);
  }

  getChildren(node?: Node): Node[] {
    if (node) return node.kind === "group" ? node.children : [];
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
    if (node.kind === "group") {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.id = "presentation-group";
      item.description = "undoable here, not in the plot's history";
      item.tooltip = "Colours and hiding changed in this window: undoable here, never recorded in the plot's history (SUB-22).";
      item.iconPath = new vscode.ThemeIcon("symbol-color");
      return item;
    }
    if (node.kind === "presentation") {
      const item = new vscode.TreeItem(node.step.label);
      item.description = [node.undone ? "undone" : "", node.nextToUndo ? NEXT : ""].filter(Boolean).join(" · ");
      item.tooltip = "A presentation change: undoable here, never recorded in the plot's history (SUB-22).";
      item.iconPath = new vscode.ThemeIcon(node.undone ? "discard" : "symbol-color");
      return item;
    }
    const { step } = node;
    const { label, status } = describeStep(step, this.toolTitle);
    const item = new vscode.TreeItem(label);
    item.id = `step-${step.seq}`;
    const marker = node.current ? "current" : step.status === "undone" ? "undone" : step.status === "abandoned" ? "replaced" : "";
    item.description = [`step ${step.seq}`, marker, node.nextToUndo ? NEXT : "", describePeriod(step.at), step.agent]
      .filter(Boolean)
      .join(" · ");
    item.tooltip = `Step ${step.seq}: ${label}\n${status}\nBy ${step.agent}, ${describePeriod(step.at)}`;
    item.iconPath = new vscode.ThemeIcon(
      ICONS[step.status],
      step.status === "abandoned" ? new vscode.ThemeColor("disabledForeground") : undefined,
    );
    // Which actions the step's context menu offers.
    item.contextValue = step.status === "abandoned" || node.current ? `step-${step.status}-fixed` : `step-${step.status}`;
    return item;
  }
}
