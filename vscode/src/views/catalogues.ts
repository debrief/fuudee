/** Catalogues view: the analyst's catalogues and the plots in each (CAP-08, SUB-17). */
import * as vscode from "vscode";
import { knownStores, readCatalogue, type CatalogueView, type PlotSummary } from "../catalogue.js";
import { count, describePeriod } from "../format.js";

type Node = { kind: "catalogue"; view: CatalogueView } | { kind: "plot"; view: CatalogueView; plot: PlotSummary } | { kind: "problem"; text: string };

export class CataloguesProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly configFile?: string) {}

  refresh(): void {
    this.changed.fire();
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      const { stores, problem } = knownStores(this.configFile);
      const nodes: Node[] = stores.map((store) => ({ kind: "catalogue", view: readCatalogue(store) }));
      return problem ? [{ kind: "problem", text: problem }, ...nodes] : nodes;
    }
    if (node.kind === "catalogue") {
      if (node.view.problem) return [{ kind: "problem", text: node.view.problem }];
      return node.view.plots.map((plot) => ({ kind: "plot", view: node.view, plot }));
    }
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "problem") {
      const item = new vscode.TreeItem(node.text);
      item.iconPath = new vscode.ThemeIcon("warning");
      return item;
    }
    if (node.kind === "catalogue") {
      const { store } = node.view;
      const item = new vscode.TreeItem(node.view.title, vscode.TreeItemCollapsibleState.Expanded);
      item.id = `catalogue:${store.id}`;
      item.iconPath = new vscode.ThemeIcon(store.read_only ? "lock" : "library");
      item.description = [store.read_only ? "read-only" : "", count(node.view.plots.length, "plot")].filter(Boolean).join(" · ");
      item.tooltip = store.location;
      item.contextValue = store.read_only ? "catalogue-read-only" : "catalogue";
      return item;
    }
    const item = new vscode.TreeItem(node.plot.title);
    item.id = `plot:${node.view.store.id}:${node.plot.id}`;
    item.iconPath = new vscode.ThemeIcon("map");
    item.description = describePeriod(node.plot.start, node.plot.end);
    item.contextValue = "plot";
    item.command = { command: "debrief.openPlot", title: "Open plot", arguments: [node.view.store.id, node.plot.id] };
    return item;
  }
}
