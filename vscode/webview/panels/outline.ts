/**
 * The Outline panel model (PAR-01 to PAR-04, docs/panel-parity-srd.md): one host-neutral tree
 * that VS Code's OutlineProvider (src/views/outline.ts) and the playground's OutlineTree
 * (play/outline.ts, play/outlinerow.ts) only render. Free of VS Code and of the DOM.
 *
 * What it decides, so that neither front end does:
 * - The sections (SUB-31): Plot features, with its groups (Tracks, Annotations, Sensor
 *   observations, each with its count) and a Narrative row; Supporting files; Reference data.
 *   Their order, the empty rows ("None", "None yet"), and what shows with no plot open.
 * - A sensor under its host track (CAP-22), opening to its cuts, in pages of CUT_PAGE by time
 *   when it has more; a TMA solution (CAP-21) opening to its legs, each leg to its fixes.
 * - What each row says (PAR-04): its label, its detail with the tags in one order
 *   (TMA · contact · DR · selected · hidden on map · when), its tooltip, what a screen reader
 *   hears, its icon (a codicon id: the playground draws its own), whether it is selected or
 *   hidden, whether it opens, whether its children wait until it does, and whether it starts open.
 *   Cuts, legs and fixes say what outlinemodel.ts has them say; sensors what sensors.ts does.
 *
 * Children are made once a plot, as their branch opens, so a sensor of thousands of cuts opens
 * at once and a cut selected on the map can be found, its sensor and page made, to reveal it.
 * A row's actions are the action catalogue's (panels/actions.ts, PAR-05) for its menu context, by id.
 */
import type { DebriefFeatureCollection, StacItem } from "@debrief/schemas";
import { formatTime } from "@debrief/kernel";
import { isFeature, isHidden, type PlotFeature } from "../../src/hidden.js";
import { count, describeTimes } from "../../src/format.js";
import { shapeOf } from "../annotationlook.js";
import { DR_TAG, isDeadReckoned } from "../fixes.js";
import { trackDetails } from "../frequencies.js";
import { cutRow, fixKey, fixRow, legKey, legRow, outlineIndex, type OutlineIndex } from "../outlinemodel.js";
import { featureName, sensorDetail, type CutFeature, type SensorEntry } from "../sensors.js";
import { rowActions } from "./actions.js";

/** How many cuts a page of a sensor's cuts holds: a sensor of more opens to pages, by time. */
export const CUT_PAGE = 500;

/** What the Outline says with no plot open (VS Code's welcome view says the same: package.json viewsWelcome). */
export const NO_PLOT = "Open a plot from a catalogue to see its tracks, annotations and sensor data here.";

/** What the Outline is built from: the plot open and its other assets. */
export interface OutlineInput {
  plot: DebriefFeatureCollection;
  /** Sources, supporting files and payloads: everything the plot's item holds but the plot. */
  files: readonly OutlineFile[];
}

/** A source, supporting file or payload of the plot's item. */
export interface OutlineFile {
  key: string;
  title: string;
  kind: string;
  href: string;
}

/** An item's assets but its plot, as the Supporting files section lists them; href says where each is (a file on disk, or in the browser). */
export function filesOf(item: StacItem, href: (asset: { href: string }) => string): OutlineFile[] {
  return Object.entries(item.assets)
    .filter(([key]) => key !== "plot")
    .map(([key, asset]) => ({
      key,
      title: asset.title ?? asset.href.split("/").pop() ?? asset.href,
      kind: String(asset["debrief:asset_kind"] ?? "file"),
      href: href(asset),
    }));
}

interface NodeBase {
  /** Stable for a plot, and across plots for headings: what the selection, the open branches and the tree items are keyed by. */
  key: string;
  parent?: OutlineNode;
}
export type OutlineNode = NodeBase &
  (
    | { kind: "section"; id: "features" | "files" | "reference"; label: string; children: OutlineNode[] }
    | { kind: "group"; id: "tracks" | "annotations" | "sensors"; label: string; children: OutlineNode[] }
    | { kind: "feature"; feature: PlotFeature; sensor?: SensorEntry; children?: OutlineNode[]; lazy?: "legs" | "cuts" }
    | { kind: "leg"; solution: string; leg: number }
    | { kind: "fix"; solution: string; at: number }
    | { kind: "page"; sensor: string; first: number; last: number }
    | { kind: "cut"; cut: CutFeature; sensor: string }
    | { kind: "file"; title: string; fileKind: string; href: string }
    | { kind: "narrative"; entries: number; sources: number }
    | { kind: "empty"; text: string }
  );

/** What a row does when it is activated (clicked, Enter), besides being selected. */
export type OutlineActivate = { kind: "timeline" } | { kind: "file"; href: string };

/** A row as both front ends render it. */
export interface OutlineRow {
  key: string;
  kind: OutlineNode["kind"];
  /** A feature's own kind: track, annotation, sensor_observations or sensor. */
  feature?: string;
  label: string;
  /** The tags, then what the row is (its time, its cuts): what VS Code's description and the playground's detail say. */
  detail: string;
  /** The tags in the detail, in order: TMA, its contact, DR, selected, hidden on map. */
  tags: string[];
  tooltip?: string;
  /** What a screen reader hears. */
  aria: string;
  /** A codicon id; the playground draws its own artwork for it. */
  icon?: string;
  selected: boolean;
  hidden: boolean;
  /** Whether it opens. */
  branch: boolean;
  /** Whether its children are made only when it opens. */
  lazy: boolean;
  /** Whether it is open when first shown. */
  open: boolean;
  /** Whether choosing it selects something (headings, pages, files and the narrative row do not). */
  selectable: boolean;
  /** Its menu context, as the action catalogue's placements match it (VS Code's contextValue). */
  menu?: string;
  /** The ids of the actions its context menu offers (the action catalogue's, PAR-05), whether or not they can run now. */
  actions: readonly string[];
  activate?: OutlineActivate;
}

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
const FEATURE_ICONS: Record<string, string> = { track: "pulse", sensor_observations: "radio-tower", sensor: "radio-tower" };

const GROUPS: { id: "tracks" | "annotations" | "sensors"; label: string; kind: string }[] = [
  { id: "tracks", label: "Tracks", kind: "track" },
  { id: "annotations", label: "Annotations", kind: "annotation" },
  { id: "sensors", label: "Sensor observations", kind: "sensor_observations" },
];

const join = (parts: readonly (string | undefined | false)[]) => parts.filter(Boolean).join(" · ");

export class OutlineModel {
  /** The plot's index the tree was built from (undefined with no plot open). */
  readonly index?: OutlineIndex;
  /** The top rows: the three sections, or none with no plot open. */
  readonly roots: OutlineNode[] = [];
  /** Every node made so far, by key: the eager ones at once, the rest as their branches open. */
  private readonly nodes = new Map<string, OutlineNode>();
  private readonly made = new Map<string, OutlineNode[]>();

  constructor(input?: OutlineInput) {
    if (!input) return;
    const index = (this.index = outlineIndex(input.plot));
    const features: OutlineNode & { kind: "section" } = { kind: "section", key: "section:features", id: "features", label: "Plot features", children: [] };
    // A sensor shows under its host track (CAP-22), and opens to its cuts.
    const carried = new Map<string, SensorEntry[]>();
    for (const entry of index.sensors.values()) {
      const host = entry.sensor.properties.host_track_id;
      carried.set(host, [...(carried.get(host) ?? []), entry]);
    }
    const plotFeatures = input.plot.features.filter(isFeature);
    for (const g of GROUPS) {
      const members = plotFeatures.filter((f) => f.properties.kind === g.kind);
      if (!members.length) continue;
      const group: OutlineNode & { kind: "group" } = { kind: "group", key: `group:${g.id}`, id: g.id, label: g.label, parent: features, children: [] };
      for (const feature of members) {
        const node: OutlineNode & { kind: "feature" } = { kind: "feature", key: feature.id, feature, parent: group, ...(index.solutions.has(feature.id) && { lazy: "legs" as const }) };
        group.children.push(this.add(node));
        const sensors = carried.get(feature.id);
        if (sensors && !node.lazy) {
          node.children = sensors.map((entry) =>
            this.add({ kind: "feature", key: entry.sensor.id, feature: entry.sensor, sensor: entry, parent: node, ...(entry.cuts.length && { lazy: "cuts" as const }) }),
          );
        }
      }
      features.children.push(this.add(group));
    }
    // The narrative: one row, read in the Timeline (a plot may hold sixty thousand entries).
    const entries = input.plot.features.filter((f) => f.properties.kind === "narrative");
    if (entries.length) {
      const sources = new Set(entries.map((f) => (f.properties as { source: string }).source)).size;
      features.children.push(this.add({ kind: "narrative", key: "narrative", entries: entries.length, sources, parent: features }));
    }
    const files: OutlineNode & { kind: "section" } = { kind: "section", key: "section:files", id: "files", label: "Supporting files", children: [] };
    files.children = input.files.length
      ? input.files.map((f) => this.add({ kind: "file", key: `file:${f.key}`, title: f.title, fileKind: f.kind, href: f.href, parent: files }))
      : [this.add({ kind: "empty", key: "empty:files", text: "None", parent: files })];
    const reference: OutlineNode & { kind: "section" } = { kind: "section", key: "section:reference", id: "reference", label: "Reference data", children: [] };
    reference.children = [this.add({ kind: "empty", key: "empty:reference", text: "None yet", parent: reference })];
    this.roots = [features, files, reference].map((s) => this.add(s));
  }

  /** What the Outline says when it lists nothing: no plot open. */
  get emptyText(): string | undefined {
    return this.roots.length ? undefined : NO_PLOT;
  }

  private add<T extends OutlineNode>(node: T): T {
    const known = this.nodes.get(node.key);
    if (known) return known as T;
    this.nodes.set(node.key, node);
    return node;
  }

  /** A node's children: made the first time its branch opens, the same nodes after. */
  children(node: OutlineNode): OutlineNode[] {
    if (node.kind === "section" || node.kind === "group") return node.children;
    if (node.kind === "feature" && !node.lazy) return node.children ?? [];
    let made = this.made.get(node.key);
    if (!made) this.made.set(node.key, (made = this.make(node)));
    return made;
  }

  private make(node: OutlineNode): OutlineNode[] {
    const index = this.index;
    if (!index) return [];
    if (node.kind === "feature" && node.lazy === "legs") {
      const s = index.solutions.get(node.feature.id);
      if (!s) return [];
      return Array.from({ length: s.bounds.length - 1 }, (_, k) => this.add({ kind: "leg", key: legKey(s.track.id, k + 1), solution: s.track.id, leg: k + 1, parent: node }));
    }
    if (node.kind === "feature" && node.lazy === "cuts") {
      const entry = index.sensors.get(node.feature.id);
      if (!entry) return [];
      if (entry.cuts.length <= CUT_PAGE) return entry.cuts.map((cut) => this.add({ kind: "cut", key: cut.id, cut, sensor: entry.sensor.id, parent: node }));
      const pages: OutlineNode[] = [];
      for (let first = 0; first < entry.cuts.length; first += CUT_PAGE) {
        const last = Math.min(entry.cuts.length, first + CUT_PAGE) - 1;
        pages.push(this.add({ kind: "page", key: `${entry.sensor.id}#page${first}`, sensor: entry.sensor.id, first, last, parent: node }));
      }
      return pages;
    }
    if (node.kind === "leg") {
      const s = index.solutions.get(node.solution);
      if (!s) return [];
      const out: OutlineNode[] = [];
      for (let i = s.bounds[node.leg - 1]; i < s.bounds[node.leg]; i++) out.push(this.add({ kind: "fix", key: fixKey(node.solution, i), solution: node.solution, at: i, parent: node }));
      return out;
    }
    if (node.kind === "page") {
      const entry = index.sensors.get(node.sensor);
      if (!entry) return [];
      return entry.cuts.slice(node.first, node.last + 1).map((cut) => this.add({ kind: "cut", key: cut.id, cut, sensor: node.sensor, parent: node }));
    }
    return [];
  }

  /** The node a key names, made if its branch has not opened yet (a cut selected on the map, to be revealed). */
  node(key: string): OutlineNode | undefined {
    const known = this.nodes.get(key);
    if (known || !this.index) return known;
    const cut = this.index.cuts.get(key);
    if (cut) {
      const sensor = this.nodes.get(cut.sensor);
      if (!sensor) return undefined;
      const pages = this.children(sensor);
      if (pages[0]?.kind === "page") this.children(pages[Math.floor(cut.index / CUT_PAGE)]);
      return this.nodes.get(key);
    }
    const hash = key.lastIndexOf("#");
    if (hash > 0) {
      const solution = this.nodes.get(key.slice(0, hash));
      if (!solution) return undefined;
      for (const leg of this.children(solution)) this.children(leg);
      return this.nodes.get(key);
    }
    return undefined;
  }

  /** The keys of the branches a row is in, outermost first: what opens to bring it into sight. */
  ancestors(key: string): string[] {
    const out: string[] = [];
    for (let at = this.node(key)?.parent; at; at = at.parent) out.unshift(at.key);
    return out;
  }

  /** Every row to select listed, by key, in order: the rows of the branches open (Select all, as Ctrl+A in the tree). */
  listedKeys(isOpen: (node: OutlineNode) => boolean): string[] {
    const out: string[] = [];
    const walk = (nodes: OutlineNode[]) => {
      for (const node of nodes) {
        if (selectable(node)) out.push(node.key);
        if (isBranch(node) && isOpen(node)) walk(this.children(node));
      }
    };
    walk(this.roots);
    return out;
  }

  /** The keys of the branches that are open when first shown, of the nodes made so far. */
  startOpen(): string[] {
    return [...this.nodes.values()].filter((n) => startsOpen(n)).map((n) => n.key);
  }

  /** What a row says, and its state, with these keys selected (the Outline's rows chosen). */
  row(node: OutlineNode, selected: ReadonlySet<string>): OutlineRow {
    const row = this.said(node, selected);
    return { ...row, actions: rowActions("debrief.outline", row.menu) };
  }

  private said(node: OutlineNode, selected: ReadonlySet<string>): OutlineRow {
    const index = this.index;
    const base = {
      key: node.key,
      kind: node.kind,
      selected: selectable(node) && selected.has(node.key),
      hidden: false,
      branch: isBranch(node),
      lazy: isLazy(node),
      open: startsOpen(node),
      selectable: selectable(node),
      actions: [] as string[],
    };
    const tagged = (tags: string[], rest: string | undefined) => ({ tags, detail: join([...tags, rest]) });
    const mark = base.selected ? ["selected"] : [];
    switch (node.kind) {
      case "section":
        return { ...base, label: node.label, detail: "", tags: [], aria: node.label };
      case "group":
        return { ...base, label: node.label, detail: String(node.children.length), tags: [], aria: `${node.label}, ${node.children.length}` };
      case "empty":
        return { ...base, label: node.text, detail: "", tags: [], aria: node.text };
      case "narrative": {
        const detail = `${count(node.entries, "entry", "entries")} from ${count(node.sources, "source")}`;
        return { ...base, label: "Narrative", detail, tags: [], tooltip: "Read in the Timeline, in time order with notes and periods", aria: `Narrative, ${detail}`, icon: "comment-discussion", activate: { kind: "timeline" } };
      }
      case "file": {
        const source = node.fileKind === "source";
        return { ...base, label: node.title, detail: node.fileKind, tags: [], tooltip: source ? "Source: never changed by Debrief" : node.href, aria: `${node.title}, ${node.fileKind}`, icon: source ? "lock" : "file", activate: { kind: "file", href: node.href } };
      }
      case "page": {
        const entry = index!.sensors.get(node.sensor)!;
        const label = `${formatTime(entry.times[node.first])}–${formatTime(entry.times[node.last])}`;
        const n = (i: number) => i.toLocaleString("en-GB");
        const detail = `cuts ${n(node.first + 1)}–${n(node.last + 1)} of ${n(entry.cuts.length)}`;
        return { ...base, label, detail, tags: [], aria: `${label}, ${detail}`, icon: "list-flat" };
      }
      case "leg": {
        const said = legRow(index!.solutions.get(node.solution)!, node.leg);
        return { ...base, label: said.name, ...tagged(mark, said.detail), tooltip: `${said.label}. Expand it for its positions; select one to split before or after it (Tools).`, aria: said.label, icon: "git-commit", menu: "outline-leg" };
      }
      case "fix": {
        const said = fixRow(index!.solutions.get(node.solution)!, node.at);
        return { ...base, label: said.name, ...tagged(mark, said.detail), tooltip: `${said.label}. Split before makes it the first fix of a new leg; Split after, the last of its leg.`, aria: said.label, icon: "circle-small-filled", menu: "outline-fix" };
      }
      case "cut": {
        const said = cutRow(index!.sensors.get(node.sensor)!, node.cut);
        return {
          ...base,
          hidden: said.hidden,
          label: said.name,
          ...tagged(mark, said.detail),
          tooltip: `${said.label}. Shift-click or Ctrl-click to choose more; the Tools act on them.`,
          aria: said.label,
          icon: said.hidden ? "eye-closed" : said.ambiguous ? "question" : "arrow-small-right",
          // What its menu offers: every cut's entries, the reasons said if one cannot act.
          menu: `outline-cut${said.hidden ? "-hidden" : ""}`,
        };
      }
      case "feature":
        return { ...base, feature: node.feature.properties.kind, ...featureRow(node, mark) };
    }
  }
}

/** A feature's row: its name; TMA and its contact, DR, selected, hidden on map, then its times (or a sensor's cuts). */
function featureRow(node: OutlineNode & { kind: "feature" }, mark: string[]): Pick<OutlineRow, "label" | "detail" | "tags" | "tooltip" | "aria" | "icon" | "hidden" | "menu"> {
  const { feature, sensor } = node;
  const props = feature.properties;
  const name = featureName(feature);
  const times = props as { times?: string[]; time?: string; time_range?: { start: string; end: string } };
  const when = sensor
    ? sensorDetail(sensor)
    : times.times
      ? describeTimes(times.times[0], times.times.at(-1))
      : times.time_range
        ? describeTimes(times.time_range.start, times.time_range.end)
        : describeTimes(times.time);
  const hidden = isHidden(feature);
  const tma = props.kind === "track" ? props.tma : undefined;
  // A track plotted by dead reckoning: a small DR beside its name (decision, product owner, 14 Oct 2026).
  const dr = props.kind === "track" && isDeadReckoned(props);
  const tags = [...(tma ? ["TMA", tma.contact] : dr ? [DR_TAG] : []), ...mark, ...(hidden ? ["hidden on map"] : [])];
  let tooltip: string | undefined;
  if (props.kind === "annotation" && !props.furniture) tooltip = `${name}: right-click to change or delete it`;
  // A track's details say its span, how it is plotted, and its labels, symbols and arrows (CAP-32).
  if (props.kind === "track") tooltip = trackDetails(props, when, dr);
  // A TMA solution (CAP-21).
  if (tma) tooltip = `${name}: a TMA solution of ${tma.contact}, rooted in ${tma.cut_ids.length} cuts${tma.leg_starts?.length ? `, ${tma.leg_starts.length + 1} legs` : ""}. Expand it for its legs and positions; Bearings shows its residuals.`;
  if (sensor) {
    const host = sensor.host ? sensor.host.properties.name : "a track not in the plot";
    tooltip = `${name}, a sensor of ${host}: ${when}. Expand it for its cuts. Right-click to keep port or starboard bearings, make a TMA solution from its cuts, show, hide or recolour it`;
  }
  const icon = props.kind === "annotation" ? (props.furniture ? "compass" : ANNOTATION_ICONS[shapeOf(props, feature.geometry?.type)]) : FEATURE_ICONS[props.kind];
  // Chart furniture is shown or removed with the North arrow command, not changed through a form.
  const kind = props.kind === "annotation" && props.furniture ? "furniture" : tma ? "track-tma" : props.kind;
  const detail = join([...tags, when]);
  return { label: name, detail, tags, tooltip, aria: detail ? `${name}, ${detail.replace(/ · /g, ", ")}` : name, icon: icon ?? "circle", hidden, menu: `feature-${kind}${hidden ? "-hidden" : ""}` };
}

/** Whether a node opens. */
export function isBranch(node: OutlineNode): boolean {
  switch (node.kind) {
    case "section":
    case "group":
    case "leg":
    case "page":
      return true;
    case "feature":
      return !!node.lazy || !!node.children?.length;
    default:
      return false;
  }
}

/** Whether a node's children are made only when it opens: a solution's legs, a leg's fixes, a sensor's cuts or pages. */
function isLazy(node: OutlineNode): boolean {
  return node.kind === "leg" || node.kind === "page" || (node.kind === "feature" && !!node.lazy);
}

/** Whether a branch is open when first shown: the headings, and a track's sensors. */
export function startsOpen(node: OutlineNode): boolean {
  return isBranch(node) && !isLazy(node);
}

/** Whether choosing a row selects something: a feature, a cut, a leg or a fix. */
export function selectable(node: OutlineNode): boolean {
  return node.kind === "feature" || node.kind === "cut" || node.kind === "leg" || node.kind === "fix";
}
