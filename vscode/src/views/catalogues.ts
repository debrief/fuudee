/**
 * Catalogues view: the analyst's catalogues and the plots in each (SUB-17), and where
 * collation is done (CAP-08 to CAP-12; decision, product owner, 16 Oct 2026).
 *
 * The tree is the Catalogues panel model's (webview/panels/catalogues.ts, PAR-01), as the
 * playground's is: catalogue → plot → track, what each row says, its marks, its menu context
 * and what choosing it runs. This reads the catalogues from disk and renders the model as
 * tree items (PAR-03): it maps an icon name to a ThemeIcon and a row's action to a command. It
 * adds, drops, reorders and rewords nothing. With no catalogue the tree is empty, and VS
 * Code's welcome view (package.json viewsWelcome, the model's WELCOME) is shown.
 */
import * as vscode from "vscode";
import { knownStores, readCatalogue } from "../catalogue.js";
import { CataloguesModel, type CatalogueEntry, type CataloguesNode, type CataloguesRow, type CollationMarks } from "../../webview/panels/catalogues.js";

export type { CollationMarks } from "../../webview/panels/catalogues.js";
export { describeCoverage } from "../../webview/panels/catalogues.js";

/** A row of the model as a tree item: the same label, description, tooltip, screen reader's label and menu context. */
export function treeItemOf(row: CataloguesRow): vscode.TreeItem {
  const state = row.branch ? (row.open ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed) : vscode.TreeItemCollapsibleState.None;
  const item = new vscode.TreeItem(row.label, state);
  if (row.kind !== "problem" && row.kind !== "status") item.id = row.key;
  if (row.detail) item.description = row.detail;
  if (row.tooltip) item.tooltip = row.tooltip;
  item.accessibilityInformation = { label: row.aria };
  item.iconPath = new vscode.ThemeIcon(row.icon, row.warning ? new vscode.ThemeColor("list.warningForeground") : undefined);
  if (row.menu) item.contextValue = row.menu;
  if (row.run) item.command = { command: row.run.action, title: row.label, arguments: [...row.run.args] };
  return item;
}

export class CataloguesProvider implements vscode.TreeDataProvider<CataloguesNode> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly refreshed = new vscode.EventEmitter<void>();
  /** The catalogues were read again: an import, say. Collation's marks follow. */
  readonly onDidRefresh = this.refreshed.event;
  private marks_: CollationMarks = { flags: [] };
  private model = new CataloguesModel({ catalogues: [], marks: { flags: [] } });

  constructor(private readonly configFile?: string) {}

  refresh(): void {
    this.changed.fire();
    this.refreshed.fire();
  }

  /** What is marked now, for tests and agents. */
  marks(): CollationMarks {
    return this.marks_;
  }

  /** Collation's marks: drawn again, without reading the catalogues for collation again. */
  setMarks(marks: CollationMarks): void {
    this.marks_ = marks;
    this.changed.fire();
  }

  /** The catalogues as they are on disk now, as the model takes them. */
  private build(): CataloguesModel {
    const { stores, problem } = knownStores(this.configFile);
    const catalogues: CatalogueEntry[] = stores.map((store) => {
      const view = readCatalogue(store);
      return { store: store.id, ...(view.id && { id: view.id }), title: view.title, location: store.location, readOnly: !!store.read_only, plots: view.plots, ...(view.problem && { problem: view.problem }) };
    });
    return new CataloguesModel({ catalogues, ...(problem && { problem }), marks: this.marks_ });
  }

  /** The model as last listed, for tests and agents (and the shared flows' rows). */
  current(): CataloguesModel {
    return this.model;
  }

  getChildren(node?: CataloguesNode): CataloguesNode[] {
    if (!node) this.model = this.build();
    return node ? this.model.children(node) : this.model.roots;
  }

  getTreeItem(node: CataloguesNode): vscode.TreeItem {
    return treeItemOf(this.model.row(node));
  }
}
