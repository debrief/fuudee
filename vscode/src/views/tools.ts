/**
 * Tools view: the tools that apply to the current selection, and why the
 * others don't (TL-08, TL-09, CON-10); above them, the entries for the
 * Outline's selection (product owner, 27 Oct 2026).
 *
 * The list is the Tools panel model's (webview/panels/tools.ts, PAR-01), as the playground's is:
 * its status row, its sections and their counts, which start open, what each row says and what
 * choosing it runs. This only renders it as tree items (PAR-03): it maps an icon name to a
 * ThemeIcon, a row's action to a command, and sets a tool's tooltip in Markdown. It adds, drops,
 * reorders and rewords nothing.
 */
import * as vscode from "vscode";
import type { Session } from "../session.js";
import type { ToolListing } from "../service.js";
import type { Operation } from "../../webview/outlinemodel.js";
import { ToolsModel, type ToolsNode, type ToolsRow } from "../../webview/panels/tools.js";

export { OPERATION_COMMANDS } from "../../webview/panels/tools.js";

/** A row of the model as a tree item: the same label, description, tooltip and screen reader's label. */
export function treeItemOf(row: ToolsRow): vscode.TreeItem {
  const state = row.branch ? (row.open ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed) : vscode.TreeItemCollapsibleState.None;
  const item = new vscode.TreeItem(row.label, state);
  item.id = row.key;
  if (row.detail) item.description = row.detail;
  if (row.tip) item.tooltip = new vscode.MarkdownString(`**${row.tip.title}**\n\n${row.tip.explanation}${row.tip.judgement ? `\n\n_${row.tip.judgement}_` : ""}`);
  else if (row.tooltip) item.tooltip = row.tooltip;
  item.accessibilityInformation = { label: row.aria };
  if (row.icon) item.iconPath = new vscode.ThemeIcon(row.icon);
  if (row.run) item.command = { command: row.run.action, title: row.label, arguments: [...row.run.args] };
  return item;
}

export class ToolsProvider implements vscode.TreeDataProvider<ToolsNode> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  listing?: ToolListing;
  offered: string[] = [];
  problem?: string;
  private model = new ToolsModel({ plotOpen: false, selected: 0, offered: [], operations: [] });

  constructor(
    private readonly session: Session,
    /** The entries for the Outline's selection, as it stands. */
    private readonly operations: () => Operation[] = () => [],
  ) {}

  update(listing: ToolListing | undefined, offered: string[], problem?: string): void {
    this.listing = listing;
    this.offered = offered;
    this.problem = problem;
    this.changed.fire();
  }

  /** The Outline's selection changed (or what Bearings shows): its entries again. */
  refresh(): void {
    this.changed.fire();
  }

  /** The model as things stand, made again for each listing of the roots. */
  private build(): ToolsModel {
    return new ToolsModel({
      listing: this.listing,
      problem: this.problem,
      plotOpen: !!this.session.current,
      selected: this.session.selection.length,
      offered: this.offered,
      operations: this.operations(),
    });
  }

  /** The rows as listed, for tests and agents. */
  rows(): ToolsRow[] {
    return this.build().rows();
  }

  getChildren(node?: ToolsNode): ToolsNode[] {
    if (!node) this.model = this.build();
    return node ? this.model.children(node) : this.model.roots;
  }

  getTreeItem(node: ToolsNode): vscode.TreeItem {
    return treeItemOf(this.model.row(node));
  }
}
