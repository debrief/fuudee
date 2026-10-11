/**
 * History view: every change to the open plot, newest first (SUB-19, SUB-21).
 * Undo is replay to an earlier step, so any step still in the plot or undone
 * can be returned to; steps replaced by a later change are kept on record but
 * cannot be. The history itself lives in Python; this view presents it.
 */
import * as vscode from "vscode";
import { describePeriod } from "../format.js";
import type { HistoryStep } from "../service.js";
import { describeStep } from "../wording.js";

type Node = { kind: "status"; text: string; icon: string } | { kind: "step"; step: HistoryStep; current: boolean };

const ICONS: Record<HistoryStep["status"], string> = {
  applied: "pass-filled",
  undone: "discard",
  abandoned: "circle-slash",
};

export class HistoryProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  steps: HistoryStep[] = [];
  current = 0;
  problem?: string;
  open = false;

  constructor(private readonly toolTitle: (name: string) => string | undefined) {}

  update(steps: HistoryStep[], current: number, open = true, problem?: string): void {
    Object.assign(this, { steps, current, open, problem });
    this.changed.fire();
  }

  canUndo(): boolean {
    const step = this.steps.find((s) => s.seq === this.current);
    return !!step && this.steps.indexOf(step) > 0;
  }

  canRedo(): boolean {
    return this.steps.some((s) => s.status === "undone");
  }

  getChildren(node?: Node): Node[] {
    if (node) return [];
    if (this.problem) return [{ kind: "status", text: this.problem, icon: "warning" }];
    if (!this.open) return [{ kind: "status", text: "Open a plot to see its history.", icon: "info" }];
    return [...this.steps].reverse().map((step) => ({ kind: "step", step, current: step.seq === this.current }));
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
    item.description = [`step ${step.seq}`, marker, describePeriod(step.at), step.agent].filter(Boolean).join(" · ");
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
