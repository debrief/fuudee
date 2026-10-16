/**
 * Catalogues view: the analyst's catalogues and the plots in each (SUB-17), and where
 * collation is done (CAP-08 to CAP-12; decision, product owner, 16 Oct 2026). Each item
 * lists its tracks and the periods each has data for, read from the item alone. With a
 * plot open, items with new data for it are marked (a sparkle and the words *New data*,
 * never colour alone), products that drew from an item since revised are flagged *May
 * need review*, and an item's tracks say how they are known to be the open plot's
 * platforms. What is marked comes from the tool service (debrief/coverage,
 * debrief/review_flags); the menus take new data, set it aside, clear a flag, and link or
 * unlink a platform.
 */
import * as vscode from "vscode";
import type { CoverageReport, ReviewFlag, TrackCoverage } from "@debrief/schemas";
import { knownStores, readCatalogue, type CatalogueView, type PlotSummary } from "../catalogue.js";
import { count, describePeriod, describeTimes } from "../format.js";

export type Node =
  | { kind: "catalogue"; view: CatalogueView }
  | { kind: "plot"; view: CatalogueView; plot: PlotSummary }
  | { kind: "track"; view: CatalogueView; plot: PlotSummary; track: TrackCoverage }
  | { kind: "problem"; text: string };

/** What collation says of the catalogues, with a plot open: from the tool service. */
export interface CollationMarks {
  /** The open plot's store and item. */
  open?: { store: string; item: string };
  coverage?: CoverageReport;
  flags: (ReviewFlag & { store?: string })[];
}

const key = (catalogue: string | undefined, item: string) => `${catalogue ?? ""}/${item}`;

/** A track's periods of data in words: "08:00:00Z – 12:00:00Z", or how many and the first. */
export function describeCoverage(track: TrackCoverage): string {
  const spans = track.spans;
  const fixes = count(track.fixes, "fix", "fixes");
  if (!spans.length) return fixes;
  const first = describeTimes(spans[0].start, spans.at(-1)!.end);
  return spans.length === 1 ? `${first} · ${fixes}` : `${count(spans.length, "period")}, ${first} · ${fixes}`;
}

export class CataloguesProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly refreshed = new vscode.EventEmitter<void>();
  /** The catalogues were read again: an import, say. Collation's marks follow. */
  readonly onDidRefresh = this.refreshed.event;
  private marks_: CollationMarks = { flags: [] };

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
    if (node.kind === "plot") return node.plot.tracks.map((track) => ({ kind: "track", view: node.view, plot: node.plot, track }));
    return [];
  }

  private isOpen(node: { view: CatalogueView; plot: PlotSummary }): boolean {
    return this.marks_.open?.store === node.view.store.id && this.marks_.open.item === node.plot.id;
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
    if (node.kind === "track") return this.trackItem(node);
    const open = this.isOpen(node);
    const id = key(node.view.id, node.plot.id);
    const listed = this.marks_.coverage?.items.find((i) => key(i.catalogue, i.item) === id);
    const flag = this.marks_.flags.find((f) => key(f.catalogue, f.item) === id);
    const fresh = listed?.new_data;
    const item = new vscode.TreeItem(node.plot.title, node.plot.tracks.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.id = `plot:${node.view.store.id}:${node.plot.id}`;
    // A mark is a symbol and words, never colour alone; its reason is its tooltip and its label for screen readers.
    item.iconPath = new vscode.ThemeIcon(flag ? "warning" : fresh ? "sparkle" : open ? "map-filled" : "map", flag ? new vscode.ThemeColor("list.warningForeground") : undefined);
    const words = [
      open ? "open" : "",
      fresh ? "New data" : "",
      flag ? "May need review" : "",
      listed?.role === "drawn_from" ? (listed.revised ? "drawn from, revised since" : "drawn from") : "",
    ].filter(Boolean);
    item.description = [...words, describePeriod(node.plot.start, node.plot.end)].filter(Boolean).join(" · ");
    const notes = [fresh?.note, flag ? `${flag.note}.` : undefined, listed?.revised ? "Revised since the open plot took data from it." : undefined].filter(Boolean);
    item.tooltip = [node.plot.title, ...notes].join("\n");
    item.accessibilityInformation = { label: [node.plot.title, ...words, ...notes].join(", ") };
    item.contextValue = ["plot", open ? "open" : this.marks_.open ? "other" : "", fresh ? "new-data" : "", flag ? "review" : ""].filter(Boolean).join("-");
    item.command = { command: "debrief.openPlot", title: "Open plot", arguments: [node.view.store.id, node.plot.id] };
    return item;
  }

  private trackItem(node: Node & { kind: "track" }): vscode.TreeItem {
    const { track } = node;
    const item = new vscode.TreeItem(track.name);
    item.id = `track:${node.view.store.id}:${node.plot.id}:${track.track}`;
    item.iconPath = new vscode.ThemeIcon("pulse");
    // How the open plot knows it: the plot's own, linked to one of its tracks, or proposed by name.
    let how = "";
    let state = "";
    if (!this.isOpen(node)) {
      for (const platform of this.marks_.coverage?.platforms ?? []) {
        const source = platform.sources.find((s) => s.catalogue === node.view.id && s.item === node.plot.id && s.track === track.track);
        if (!source) continue;
        how = source.link === "proposed" ? `proposed as ${platform.name}` : `linked to ${platform.name}`;
        state = source.link;
        break;
      }
    }
    item.description = [how, describeCoverage(track)].filter(Boolean).join(" · ");
    item.tooltip = [`${track.name}: ${count(track.fixes, "fix", "fixes")}`, ...track.spans.map((s) => `Data ${describePeriod(s.start, s.end)}`), how && `In the open plot: ${how}`].filter(Boolean).join("\n");
    item.contextValue = this.marks_.open && !this.isOpen(node) ? `item-track${state ? `-${state}` : ""}` : "item-track-open";
    return item;
  }
}
