/**
 * History view: every change to the open plot, newest first (SUB-19, SUB-21).
 * Undo is replay to an earlier step, so any step still in the plot or undone
 * can be returned to; steps replaced by a later change are kept on record but
 * cannot be. The history itself lives in Python; this view presents it.
 *
 * The rows are the History panel model's (webview/panels/history.ts, PAR-01), as the playground's
 * are: each step's name, detail, tooltip and icon, the step Ctrl+Z takes back next marked, the menu
 * context its actions are placed by, and the row with no plot open or the history unread. This only
 * renders them as tree items (PAR-03). It adds, drops, reorders and rewords nothing.
 */
import * as vscode from "vscode";
import type { HistoryStep } from "../service.js";
import { HistoryModel, type HistoryRow } from "../../webview/panels/history.js";
import { historyRows, type Row } from "./historyrows.js";

/** A row of the model as a tree item. */
export function treeItemOf(row: HistoryRow): vscode.TreeItem {
  const item = new vscode.TreeItem(row.label);
  if (row.kind === "step") item.id = row.key;
  if (row.detail) item.description = row.detail;
  if (row.tooltip) item.tooltip = row.tooltip;
  item.iconPath = new vscode.ThemeIcon(row.icon, row.muted ? new vscode.ThemeColor("disabledForeground") : undefined);
  if (row.menu) item.contextValue = row.menu;
  return item;
}

export class HistoryProvider implements vscode.TreeDataProvider<HistoryRow> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  steps: HistoryStep[] = [];
  current = 0;
  problem?: string;
  open = false;
  /** The step shown read-only, when an earlier revision is shown (an image traced to its plot). */
  shown?: number;

  constructor(private readonly toolTitle: (name: string) => string | undefined) {}

  update(steps: HistoryStep[], current: number, open = true, problem?: string, shown?: number): void {
    Object.assign(this, { steps, current, open, problem, shown });
    this.changed.fire();
  }

  /** The panel model, as things stand. */
  model(): HistoryModel {
    return new HistoryModel({ open: this.open, steps: this.steps, current: this.current, shown: this.shown, problem: this.problem, toolTitle: this.toolTitle });
  }

  canUndo(): boolean {
    return this.model().canUndo;
  }

  canRedo(): boolean {
    return this.model().canRedo;
  }

  /** The steps as listed, for tests and agents. */
  rows(): Row[] {
    return historyRows(this.steps, this.current);
  }

  getChildren(node?: HistoryRow): HistoryRow[] {
    return node ? [] : this.model().rows();
  }

  getTreeItem(row: HistoryRow): vscode.TreeItem {
    return treeItemOf(row);
  }
}
