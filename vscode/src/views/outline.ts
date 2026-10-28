/**
 * Outline: one sectioned tree of plot features, supporting files and
 * reference data (SUB-31). Selecting features here selects them everywhere,
 * and a selection made elsewhere is shown here (SUB-26).
 *
 * TMA solutions and sensors open (product owner, 27 Oct 2026): a solution to its legs, each
 * leg to its positions (fixes), with their time, course and speed; a sensor to its cuts, with
 * their time, bearing, range and whether hidden. Children are made only when a branch opens,
 * and a sensor's cuts come in pages of CUT_PAGE (by time), so a sensor of thousands of cuts
 * opens at once; the native tree draws only the rows in sight. Each node is made once a plot,
 * so a cut selected on the map is revealed here, its sensor and page opened.
 */
import * as vscode from "vscode";
import type { OpenedPlot } from "../catalogue.js";
import type { Session } from "../session.js";
import { isFeature, isHidden, type PlotFeature } from "../hidden.js";
import { count, describeTimes } from "../format.js";
import { shapeOf } from "../../webview/annotationlook.js";
import { DR_TAG, isDeadReckoned } from "../../webview/fixes.js";
import { trackDetails } from "../../webview/frequencies.js";
import { featureName, sensorDetail, sensorsOf, type CutFeature } from "../../webview/sensors.js";
import { cutRow, fixKey, fixRow, legKey, legRow, outlineIndex, type OutlineIndex } from "../../webview/outlinemodel.js";
import { formatTime } from "@debrief/kernel";

type Feature = PlotFeature;
export type Node =
  | { kind: "section"; id: "features" | "files" | "reference"; label: string; children: Node[] }
  | { kind: "group"; id: string; label: string; parent: Node; children: Node[] }
  | { kind: "feature"; feature: Feature; parent: Node; children?: Node[]; detail?: string; lazy?: "legs" | "cuts" }
  | { kind: "leg"; solution: string; leg: number; parent: Node }
  | { kind: "fix"; solution: string; at: number; parent: Node }
  | { kind: "page"; sensor: string; first: number; last: number; parent: Node }
  | { kind: "cut"; cut: CutFeature; sensor: string; parent: Node }
  | { kind: "file"; title: string; fileKind: string; href: string; parent: Node }
  | { kind: "narrative"; entries: number; sources: number; parent: Node }
  | { kind: "empty"; text: string; parent: Node };

/** How many cuts a page of a sensor's cuts holds: a sensor of more opens to pages, by time. */
export const CUT_PAGE = 500;

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

interface Tree {
  roots: Node[];
  features: Map<string, Node>;
  index?: OutlineIndex;
  /** Nodes made as branches open (legs, fixes, pages, cuts), by key: each made once a plot. */
  made: Map<string, Node>;
}

/** The tree for one plot, built once when the plot opens or reloads; legs, fixes and cuts as their branches open. */
function build(opened: OpenedPlot): Tree {
  const features = new Map<string, Node>();
  const section = (id: "features" | "files" | "reference", label: string): Node & { kind: "section" } => ({
    kind: "section",
    id,
    label,
    children: [],
  });
  const plotSection = section("features", "Plot features");
  const index = outlineIndex(opened.plot);
  // A sensor shows under its host track (CAP-22), and opens to its cuts.
  const sensors = new Map<string, ReturnType<typeof sensorsOf>>();
  for (const entry of index.sensors.values()) {
    const host = entry.sensor.properties.host_track_id;
    sensors.set(host, [...(sensors.get(host) ?? []), entry]);
  }
  for (const g of GROUPS) {
    const members = opened.plot.features.filter(isFeature).filter((f) => f.properties.kind === g.kind);
    if (!members.length) continue;
    const group: Node & { kind: "group" } = { kind: "group", id: g.id, label: g.label, parent: plotSection, children: [] };
    for (const feature of members) {
      const node: Node & { kind: "feature" } = { kind: "feature", feature, parent: group, ...(index.solutions.has(feature.id) && { lazy: "legs" as const }) };
      features.set(feature.id, node);
      group.children.push(node);
      const carried = sensors.get(feature.id);
      if (carried) {
        node.children = carried.map((entry) => {
          const child: Node = { kind: "feature", feature: entry.sensor, parent: node, detail: sensorDetail(entry), ...(entry.cuts.length && { lazy: "cuts" as const }) };
          features.set(entry.sensor.id, child);
          return child;
        });
      }
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
  return { roots: [plotSection, files, reference], features, index, made: new Map() };
}

/** A node's key, as the Outline's selection names it: a feature's or a cut's id; a leg's or a fix's, its solution's with #leg2 or #fix14. */
export function keyOf(node: Node): string | undefined {
  switch (node.kind) {
    case "feature":
      return node.feature.id;
    case "cut":
      return node.cut.id;
    case "leg":
      return legKey(node.solution, node.leg);
    case "fix":
      return fixKey(node.solution, node.at);
    default:
      return undefined;
  }
}

export class OutlineProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node[] | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private tree: Tree = { roots: [], features: new Map(), made: new Map() };
  private shown: string[] = [];

  constructor(private readonly session: Session) {
    session.onPlot((opened) => {
      this.tree = opened ? build(opened) : { roots: [], features: new Map(), made: new Map() };
      this.shown = [...session.selection];
      this.changed.fire(undefined);
    });
    session.onSelection((ids) => {
      // Redraw only the features whose marking changed.
      const touched = new Set([...this.shown, ...ids]);
      this.shown = [...ids];
      const nodes = [...touched].map((id) => this.tree.features.get(id) ?? this.tree.made.get(id)).filter((n): n is Node => !!n);
      if (nodes.length) this.changed.fire(nodes);
    });
  }

  /** The plot's index the tree was built from, for the Tools' entries and Bearings. */
  get index(): OutlineIndex | undefined {
    return this.tree.index;
  }

  featureNode(id: string): Node | undefined {
    return this.tree.features.get(id);
  }

  /** The node a key names, made if its branch has not opened yet (a cut selected on the map, revealed here). */
  nodeOf(key: string): Node | undefined {
    const feature = this.tree.features.get(key);
    if (feature) return feature;
    const made = this.tree.made.get(key);
    if (made) return made;
    const index = this.tree.index;
    if (!index) return undefined;
    const cut = index.cuts.get(key);
    if (cut) {
      const sensor = this.tree.features.get(cut.sensor);
      if (!sensor) return undefined;
      this.getChildren(sensor);
      const pages = this.getChildren(sensor);
      if (pages[0]?.kind === "page") this.getChildren(pages[Math.floor(cut.index / CUT_PAGE)]);
      return this.tree.made.get(key);
    }
    const hash = key.lastIndexOf("#");
    if (hash > 0) {
      const solution = this.tree.features.get(key.slice(0, hash));
      if (!solution) return undefined;
      const legs = this.getChildren(solution);
      for (const leg of legs) this.getChildren(leg);
      return this.tree.made.get(key);
    }
    return undefined;
  }

  private make<T extends Node>(key: string, node: T): T {
    const known = this.tree.made.get(key);
    if (known) return known as T;
    this.tree.made.set(key, node);
    return node;
  }

  getParent(node: Node): Node | undefined {
    return node.kind === "section" ? undefined : node.parent;
  }

  getChildren(node?: Node): Node[] {
    if (!node) return this.tree.roots;
    if (node.kind === "section" || node.kind === "group") return node.children;
    const index = this.tree.index;
    if (node.kind === "feature") {
      if (node.lazy === "legs" && index) {
        const s = index.solutions.get(node.feature.id);
        if (!s) return [];
        return Array.from({ length: s.bounds.length - 1 }, (_, k) => this.make(legKey(s.track.id, k + 1), { kind: "leg" as const, solution: s.track.id, leg: k + 1, parent: node }));
      }
      if (node.lazy === "cuts" && index) {
        const entry = index.sensors.get(node.feature.id);
        if (!entry) return [];
        if (entry.cuts.length <= CUT_PAGE) return entry.cuts.map((cut) => this.make(cut.id, { kind: "cut" as const, cut, sensor: entry.sensor.id, parent: node }));
        const pages: Node[] = [];
        for (let first = 0; first < entry.cuts.length; first += CUT_PAGE) {
          const last = Math.min(entry.cuts.length, first + CUT_PAGE) - 1;
          pages.push(this.make(`${entry.sensor.id}#page${first}`, { kind: "page" as const, sensor: entry.sensor.id, first, last, parent: node }));
        }
        return pages;
      }
      return node.children ?? [];
    }
    if (node.kind === "leg" && index) {
      const s = index.solutions.get(node.solution);
      if (!s) return [];
      const out: Node[] = [];
      for (let i = s.bounds[node.leg - 1]; i < s.bounds[node.leg]; i++) out.push(this.make(fixKey(node.solution, i), { kind: "fix" as const, solution: node.solution, at: i, parent: node }));
      return out;
    }
    if (node.kind === "page" && index) {
      const entry = index.sensors.get(node.sensor);
      if (!entry) return [];
      return entry.cuts.slice(node.first, node.last + 1).map((cut) => this.make(cut.id, { kind: "cut" as const, cut, sensor: node.sensor, parent: node }));
    }
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const expanded = vscode.TreeItemCollapsibleState.Expanded;
    const collapsed = vscode.TreeItemCollapsibleState.Collapsed;
    const index = this.tree.index;
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
      case "leg": {
        const s = index!.solutions.get(node.solution)!;
        const said = legRow(s, node.leg);
        const item = new vscode.TreeItem(said.name, collapsed);
        item.id = `leg:${legKey(node.solution, node.leg)}`;
        item.description = said.detail;
        item.tooltip = `${said.label}. Expand it for its positions; select one to split before or after it (Tools).`;
        item.iconPath = new vscode.ThemeIcon("git-commit");
        item.contextValue = "outline-leg";
        item.accessibilityInformation = { label: said.label };
        return item;
      }
      case "fix": {
        const s = index!.solutions.get(node.solution)!;
        const said = fixRow(s, node.at);
        const item = new vscode.TreeItem(said.name);
        item.id = `fix:${fixKey(node.solution, node.at)}`;
        item.description = said.detail;
        item.tooltip = `${said.label}. Split before makes it the first fix of a new leg; Split after, the last of its leg.`;
        item.iconPath = new vscode.ThemeIcon("circle-small-filled");
        item.contextValue = "outline-fix";
        item.accessibilityInformation = { label: said.label };
        return item;
      }
      case "page": {
        const entry = index!.sensors.get(node.sensor)!;
        const item = new vscode.TreeItem(`${formatTime(entry.times[node.first])}–${formatTime(entry.times[node.last])}`, collapsed);
        item.id = `page:${node.sensor}#${node.first}`;
        item.description = `cuts ${(node.first + 1).toLocaleString("en-GB")}–${(node.last + 1).toLocaleString("en-GB")} of ${entry.cuts.length.toLocaleString("en-GB")}`;
        item.iconPath = new vscode.ThemeIcon("list-flat");
        return item;
      }
      case "cut": {
        const entry = index!.sensors.get(node.sensor)!;
        const said = cutRow(entry, node.cut);
        const selected = this.session.selection.includes(node.cut.id);
        const item = new vscode.TreeItem(said.name);
        item.id = `cut:${node.cut.id}`;
        item.description = [selected ? "selected" : "", said.detail].filter(Boolean).join(" · ");
        item.tooltip = `${said.label}. Shift-click or Ctrl-click to choose more; the Tools act on them.`;
        item.iconPath = new vscode.ThemeIcon(said.hidden ? "eye-closed" : said.ambiguous ? "question" : "arrow-small-right", selected ? new vscode.ThemeColor("list.highlightForeground") : undefined);
        // What its menu offers: every cut's entries, the reasons said if one cannot act.
        item.contextValue = `outline-cut${said.hidden ? "-hidden" : ""}`;
        item.accessibilityInformation = { label: said.label };
        return item;
      }
      case "feature": {
        const { feature } = node;
        const selected = this.session.selection.includes(feature.id);
        const name = featureName(feature);
        const opens = !!node.children?.length || !!node.lazy;
        const item = new vscode.TreeItem(name, opens ? (node.lazy ? collapsed : expanded) : vscode.TreeItemCollapsibleState.None);
        item.id = `feature:${feature.id}`;
        const icon =
          feature.properties.kind === "annotation"
            ? feature.properties.furniture
              ? "compass"
              : ANNOTATION_ICONS[shapeOf(feature.properties, feature.geometry?.type)]
            : ({ track: "pulse", sensor_observations: "radio-tower", sensor: "radio-tower" } as Record<string, string>)[feature.properties.kind];
        item.iconPath = new vscode.ThemeIcon(icon ?? "circle", selected ? new vscode.ThemeColor("list.highlightForeground") : undefined);
        // Double-click is the map's way in; here it is Enter on the menu's "Change annotation…".
        if (feature.properties.kind === "annotation" && !feature.properties.furniture) {
          item.tooltip = `${name}: right-click to change or delete it`;
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
        if (dr) item.tooltip = `${name}: plotted by dead reckoning (DR), from its first fix by each fix's course and speed`;
        // A track's details say its labels, symbols and arrows (CAP-32; product owner, 15 Oct 2026).
        if (feature.properties.kind === "track") item.tooltip = trackDetails(feature.properties, when, dr);
        // A TMA solution (CAP-21): tagged, with its contact, beside its name.
        const tma = feature.properties.kind === "track" ? feature.properties.tma : undefined;
        if (tma) item.tooltip = `${name}: a TMA solution of ${tma.contact}, rooted in ${tma.cut_ids.length} cuts${tma.leg_starts?.length ? `, ${tma.leg_starts.length + 1} legs` : ""}. Expand it for its legs and positions; Bearings shows its residuals.`;
        item.description = [tma ? `TMA · ${tma.contact}` : "", dr && !tma ? DR_TAG : "", selected ? "selected" : "", hidden ? "hidden on map" : "", node.detail ?? when].filter(Boolean).join(" · ");
        if (feature.properties.kind === "sensor") item.tooltip = `${name}, a sensor of this track: ${node.detail}. Expand it for its cuts. Right-click to keep port or starboard bearings, make a TMA solution from its cuts, show, hide or recolour it`;
        // Chart furniture is shown or removed with the North arrow command, not changed through a form.
        const kind = feature.properties.kind === "annotation" && feature.properties.furniture ? "furniture" : tma ? "track-tma" : feature.properties.kind;
        item.contextValue = `feature-${kind}${hidden ? "-hidden" : ""}`;
        return item;
      }
    }
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
