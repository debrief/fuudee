/**
 * Outline: one sectioned tree of plot features, supporting files and
 * reference data (SUB-31). Selecting features here selects them everywhere,
 * and a selection made elsewhere is shown here (SUB-26).
 *
 * The tree is the Outline panel model's (webview/panels/outline.ts, PAR-01), as the playground's
 * is: its sections and groups, a sensor's pages of cuts, a solution's legs and fixes, what each
 * row says and which branches start open. This only renders it as tree items (PAR-03): it maps
 * an icon name to a ThemeIcon, a row's activation to a command, and keeps the branches the
 * analyst opened or closed. It adds, drops, reorders and rewords nothing.
 */
import * as vscode from "vscode";
import type { Session } from "../session.js";
import type { OutlineIndex } from "../../webview/outlinemodel.js";
import { OutlineModel, selectable, type OutlineNode, type OutlineRow } from "../../webview/panels/outline.js";

export type Node = OutlineNode;

/** A node's key, as the Outline's selection names it: a feature's or a cut's id; a leg's or a fix's, its solution's with #leg2 or #fix14. */
export function keyOf(node: Node): string | undefined {
  return selectable(node) ? node.key : undefined;
}

/** A row of the model as a tree item: the same label, description, tooltip and screen reader's label. */
export function treeItemOf(row: OutlineRow, open: boolean): vscode.TreeItem {
  const state = row.branch ? (open ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed) : vscode.TreeItemCollapsibleState.None;
  const item = new vscode.TreeItem(row.label, state);
  item.id = row.key;
  item.description = row.detail;
  if (row.tooltip) item.tooltip = row.tooltip;
  item.accessibilityInformation = { label: row.aria };
  if (row.icon) item.iconPath = new vscode.ThemeIcon(row.icon, row.selected ? new vscode.ThemeColor("list.highlightForeground") : undefined);
  if (row.menu) item.contextValue = row.menu;
  if (row.activate?.kind === "timeline") item.command = { command: "debrief.timeline.focus", title: "Show the Timeline" };
  if (row.activate?.kind === "file") {
    const uri = vscode.Uri.file(row.activate.href);
    item.resourceUri = uri;
    item.command = { command: "vscode.open", title: "Open", arguments: [uri] };
  }
  return item;
}

export class OutlineProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node[] | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private model = new OutlineModel();
  /** The branches the analyst opened or closed, by key (kept across plots, as VS Code keeps them). */
  private readonly expanded = new Map<string, boolean>();
  /** The Outline's rows chosen, by key: marked selected. */
  private chosen = new Set<string>();

  constructor(session: Session) {
    session.onPlot((opened) => {
      this.model = new OutlineModel(opened);
      this.changed.fire(undefined);
    });
  }

  /** The plot's index the tree was built from, for the Tools' entries and Bearings. */
  get index(): OutlineIndex | undefined {
    return this.model.index;
  }

  /** The node a key names, made if its branch has not opened yet (a cut selected on the map, revealed here). */
  nodeOf(key: string): Node | undefined {
    return this.model.node(key);
  }

  /** A row as the model says it, with the rows chosen marked. */
  rowOf(node: Node): OutlineRow {
    return this.model.row(node, this.chosen);
  }

  /** A branch opened or closed in the tree (onDidExpandElement, onDidCollapseElement). */
  setExpanded(node: Node, open: boolean): void {
    this.expanded.set(node.key, open);
  }

  /** Whether a branch is open: as the analyst left it, or as the model has it first show. */
  private isOpen(node: Node): boolean {
    return this.expanded.get(node.key) ?? this.model.row(node, this.chosen).open;
  }

  /** Every row listed, by key, in order: the rows of the branches open (Select all, as Ctrl+A in the tree, product owner, 28 Oct 2026). */
  listedKeys(): string[] {
    return this.model.listedKeys((node) => this.isOpen(node));
  }

  /** The Outline's rows chosen: marked selected, the rows whose marking changed redrawn. */
  markKeys(keys: readonly string[]): void {
    const next = new Set(keys);
    const touched = [...new Set([...this.chosen, ...next])].filter((k) => this.chosen.has(k) !== next.has(k));
    this.chosen = next;
    const nodes = touched.map((k) => this.model.node(k)).filter((n): n is Node => !!n);
    if (nodes.length) this.changed.fire(nodes);
  }

  getParent(node: Node): Node | undefined {
    return node.parent;
  }

  getChildren(node?: Node): Node[] {
    return node ? this.model.children(node) : this.model.roots;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    return treeItemOf(this.rowOf(node), this.isOpen(node));
  }
}

export function featureIdsOf(nodes: readonly Node[]): string[] {
  return [...new Set(nodes.flatMap((n) => (n.kind === "feature" ? [n.feature.id] : n.kind === "cut" ? [n.cut.id] : n.kind === "leg" || n.kind === "fix" ? [n.solution] : [])))];
}

/** The Outline's keys for nodes chosen: features, cuts, legs and fixes (headings and pages left out). */
export function keysOf(nodes: readonly Node[]): string[] {
  return nodes.flatMap((n) => {
    const key = keyOf(n);
    return key ? [key] : [];
  });
}
