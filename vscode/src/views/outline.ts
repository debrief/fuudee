/**
 * Outline: one sectioned tree of plot features, supporting files and
 * reference data (SUB-31). Selecting features here selects them everywhere,
 * and a selection made elsewhere is shown here (SUB-26).
 */
import * as vscode from "vscode";
import type { OpenedPlot } from "../catalogue.js";
import type { Session } from "../session.js";
import { isFeature, isHidden, type PlotFeature } from "../hidden.js";
import { count, describeTimes } from "../format.js";
import { shapeOf } from "../../webview/annotationlook.js";
import { DR_TAG, isDeadReckoned } from "../../webview/fixes.js";
import { trackDetails } from "../../webview/frequencies.js";

type Feature = PlotFeature;
export type Node =
  | { kind: "section"; id: "features" | "files" | "reference"; label: string; children: Node[] }
  | { kind: "group"; id: string; label: string; parent: Node; children: Node[] }
  | { kind: "feature"; feature: Feature; parent: Node }
  | { kind: "file"; title: string; fileKind: string; href: string; parent: Node }
  | { kind: "narrative"; entries: number; sources: number; parent: Node }
  | { kind: "empty"; text: string; parent: Node };

/** Codicons for each kind of annotation (CAP-03). */
const ANNOTATION_ICONS: Record<string, string> = {
  line: "dash",
  area: "primitive-square",
  circle: "circle-large-outline",
  ellipse: "circle-large",
  label: "symbol-text",
  marker: "location",
  note: "note",
};

const GROUPS: { id: string; label: string; kind: string }[] = [
  { id: "tracks", label: "Tracks", kind: "track" },
  { id: "annotations", label: "Annotations", kind: "annotation" },
  { id: "sensors", label: "Sensor observations", kind: "sensor_observations" },
];

/** The tree for one plot, built once when the plot opens or reloads. */
function build(opened: OpenedPlot): { roots: Node[]; features: Map<string, Node> } {
  const features = new Map<string, Node>();
  const section = (id: "features" | "files" | "reference", label: string): Node & { kind: "section" } => ({
    kind: "section",
    id,
    label,
    children: [],
  });
  const plotSection = section("features", "Plot features");
  for (const g of GROUPS) {
    const members = opened.plot.features.filter(isFeature).filter((f) => f.properties.kind === g.kind);
    if (!members.length) continue;
    const group: Node & { kind: "group" } = { kind: "group", id: g.id, label: g.label, parent: plotSection, children: [] };
    for (const feature of members) {
      const node: Node = { kind: "feature", feature, parent: group };
      features.set(feature.id, node);
      group.children.push(node);
    }
    plotSection.children.push(group);
  }
  // The narrative: one row, read in the Timeline (a plot may hold sixty thousand entries).
  const entries = opened.plot.features.filter((f) => f.properties.kind === "narrative");
  if (entries.length) {
    const sources = new Set(entries.map((f) => (f.properties as { source: string }).source)).size;
    plotSection.children.push({ kind: "narrative", entries: entries.length, sources, parent: plotSection });
  }
  const files = section("files", "Supporting files");
  files.children = opened.files.length
    ? opened.files.map((f) => ({ kind: "file", title: f.title, fileKind: f.kind, href: f.href, parent: files }))
    : [{ kind: "empty", text: "None", parent: files }];
  const reference = section("reference", "Reference data");
  reference.children = [{ kind: "empty", text: "None yet", parent: reference }];
  return { roots: [plotSection, files, reference], features };
}

export class OutlineProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node[] | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private tree: { roots: Node[]; features: Map<string, Node> } = { roots: [], features: new Map() };
  private shown: string[] = [];

  constructor(private readonly session: Session) {
    session.onPlot((opened) => {
      this.tree = opened ? build(opened) : { roots: [], features: new Map() };
      this.shown = [...session.selection];
      this.changed.fire(undefined);
    });
    session.onSelection((ids) => {
      // Redraw only the features whose marking changed.
      const touched = new Set([...this.shown, ...ids]);
      this.shown = [...ids];
      const nodes = [...touched].map((id) => this.tree.features.get(id)).filter((n): n is Node => !!n);
      if (nodes.length) this.changed.fire(nodes);
    });
  }

  featureNode(id: string): Node | undefined {
    return this.tree.features.get(id);
  }

  getParent(node: Node): Node | undefined {
    return node.kind === "section" ? undefined : node.parent;
  }

  getChildren(node?: Node): Node[] {
    if (!node) return this.tree.roots;
    return node.kind === "section" || node.kind === "group" ? node.children : [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const expanded = vscode.TreeItemCollapsibleState.Expanded;
    switch (node.kind) {
      case "section":
        return Object.assign(new vscode.TreeItem(node.label, expanded), { id: `section:${node.id}` });
      case "group":
        return Object.assign(new vscode.TreeItem(node.label, expanded), {
          id: `group:${node.id}`,
          description: String(node.children.length),
        });
      case "empty":
        return Object.assign(new vscode.TreeItem(node.text), { description: "" });
      case "narrative": {
        const item = new vscode.TreeItem("Narrative");
        item.id = "narrative";
        item.description = `${count(node.entries, "entry", "entries")} from ${count(node.sources, "source")}`;
        item.iconPath = new vscode.ThemeIcon("comment-discussion");
        item.tooltip = "Read in the Timeline, in time order with notes and periods";
        item.command = { command: "debrief.timeline.focus", title: "Show the Timeline" };
        return item;
      }
      case "file": {
        const item = new vscode.TreeItem(node.title);
        item.description = node.fileKind;
        item.iconPath = new vscode.ThemeIcon(node.fileKind === "source" ? "lock" : "file");
        item.tooltip = node.fileKind === "source" ? "Source: never changed by Debrief" : node.href;
        item.resourceUri = vscode.Uri.file(node.href);
        item.command = { command: "vscode.open", title: "Open", arguments: [vscode.Uri.file(node.href)] };
        return item;
      }
      case "feature": {
        const { feature } = node;
        const selected = this.session.selection.includes(feature.id);
        const item = new vscode.TreeItem(feature.properties.name);
        item.id = `feature:${feature.id}`;
        const icon =
          feature.properties.kind === "annotation"
            ? feature.properties.furniture
              ? "compass"
              : ANNOTATION_ICONS[shapeOf(feature.properties, feature.geometry?.type)]
            : { track: "pulse", sensor_observations: "radio-tower" }[feature.properties.kind];
        item.iconPath = new vscode.ThemeIcon(icon ?? "circle", selected ? new vscode.ThemeColor("list.highlightForeground") : undefined);
        // Double-click is the map's way in; here it is Enter on the menu's "Change annotation…".
        if (feature.properties.kind === "annotation" && !feature.properties.furniture) {
          item.tooltip = `${feature.properties.name}: right-click to change or delete it`;
        }
        const props = feature.properties as { times?: string[]; time?: string; time_range?: { start: string; end: string } };
        const when = props.times
          ? describeTimes(props.times[0], props.times.at(-1))
          : props.time_range
            ? describeTimes(props.time_range.start, props.time_range.end)
            : describeTimes(props.time);
        const hidden = isHidden(feature);
        // A track plotted by dead reckoning: a small DR beside its name (decision, product owner, 14 Oct 2026).
        const dr = feature.properties.kind === "track" && isDeadReckoned(feature.properties);
        if (dr) item.tooltip = `${feature.properties.name}: plotted by dead reckoning (DR), from its first fix by each fix's course and speed`;
        // A track's details say its labels, symbols and arrows (CAP-32; product owner, 15 Oct 2026).
        if (feature.properties.kind === "track") item.tooltip = trackDetails(feature.properties, when, dr);
        item.description = [dr ? DR_TAG : "", selected ? "selected" : "", hidden ? "hidden on map" : "", when].filter(Boolean).join(" · ");
        // Chart furniture is shown or removed with the North arrow command, not changed through a form.
        const kind = feature.properties.kind === "annotation" && feature.properties.furniture ? "furniture" : feature.properties.kind;
        item.contextValue = `feature-${kind}${hidden ? "-hidden" : ""}`;
        return item;
      }
    }
  }
}

export function featureIdsOf(nodes: readonly Node[]): string[] {
  return nodes.flatMap((n) => (n.kind === "feature" ? [n.feature.id] : []));
}
