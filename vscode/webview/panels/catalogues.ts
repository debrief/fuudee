/**
 * The Catalogues panel model (PAR-01, PAR-02, docs/panel-parity-srd.md): one host-neutral tree that
 * VS Code's CataloguesProvider (src/views/catalogues.ts) and the playground's Catalogues panel
 * (play/cataloguelist.ts) only render. Free of VS Code and of the DOM.
 *
 * The analyst's catalogues and the plots in each (SUB-17), where collation is done (CAP-08 to
 * CAP-12): catalogue → plot → track. What it decides, so that neither front end does:
 * - A catalogue's row: its title, "read-only" and "N plots", where it is; a problem row under it
 *   when it cannot be read, and one at the top when the configuration cannot.
 * - A plot's row: its title, its period and collation's marks in words (open, New data, May need
 *   review, drawn from), never colour alone; choosing it opens the plot.
 * - A track's row: its periods of data, and how the open plot knows it ("linked to X", "proposed as
 *   X").
 * - Each row's menu context and the actions it offers, from the action catalogue (panels/actions.ts).
 * - The empty state (no catalogue: the welcome text) and the loading row (the playground's Python
 *   starting, §5).
 *
 * The catalogues are read by each host (VS Code from disk, the playground from Python); collation's
 * marks come from the tool service (debrief/coverage, debrief/review_flags). This only presents them.
 */
import type { CoverageReport, ReviewFlag, TrackCoverage } from "@debrief/schemas";
import { count, describePeriod, describeTimes } from "../../src/format.js";
import { rowActions } from "./actions.js";

/** A plot of a catalogue, as its STAC item says it. */
export interface PlotSummary {
  id: string;
  title: string;
  start?: string;
  end?: string;
  /** Each track's periods of data, as the item keeps them (CAP-08): read from the item alone. */
  tracks: TrackCoverage[];
}

/** A catalogue, as a host has read it. */
export interface CatalogueEntry {
  /** The store's id: where the plots are opened from. */
  store: string;
  /** The catalogue's own id, from its catalog.json: what collation names items by. */
  id?: string;
  title: string;
  /** Where it is (a folder), for its tooltip. */
  location: string;
  readOnly: boolean;
  plots: PlotSummary[];
  /** Why it could not be read. */
  problem?: string;
}

/** What collation says of the catalogues, with a plot open: from the tool service. */
export interface CollationMarks {
  /** The open plot's store and item. */
  open?: { store: string; item: string };
  coverage?: CoverageReport;
  flags: (ReviewFlag & { store?: string })[];
}

/** What the Catalogues are built from. */
export interface CataloguesInput {
  catalogues: readonly CatalogueEntry[];
  /** Why the configuration (the list of catalogues) could not be read. */
  problem?: string;
  marks: CollationMarks;
  /** The catalogues are still being read: the playground's Python starting (§5). */
  starting?: boolean;
}

/** What the Catalogues say while the playground's Python starts (VS Code reads them from disk at once). */
export const STARTING = "Reading catalogues…";
/** What the Catalogues say with no catalogue: VS Code's welcome view (package.json viewsWelcome), line by line, with its links. */
export const WELCOME: readonly { text: string; action?: string }[] = [
  { text: "Debrief keeps plots in catalogues: folders you choose." },
  { text: "Add catalogue folder", action: "debrief.addCatalogue" },
  { text: "Create catalogue", action: "debrief.createCatalogue" },
  { text: "New to Debrief? Five short walkthroughs work on a copy of the sample exercise." },
  { text: "Start a walkthrough", action: "debrief.walkthroughs" },
];
/** What opens a plot. */
export const OPEN_PLOT = "debrief.openPlot";

export type CataloguesNode =
  | { kind: "status"; key: string; text: string; icon: string }
  | { kind: "problem"; key: string; text: string }
  | { kind: "catalogue"; key: string; catalogue: CatalogueEntry }
  | { kind: "plot"; key: string; catalogue: CatalogueEntry; plot: PlotSummary }
  | { kind: "track"; key: string; catalogue: CatalogueEntry; plot: PlotSummary; track: TrackCoverage };

/** A row as both front ends render it. */
export interface CataloguesRow {
  key: string;
  kind: CataloguesNode["kind"];
  label: string;
  /** What VS Code's description and the playground's detail say. */
  detail: string;
  tooltip?: string;
  /** What a screen reader hears. */
  aria: string;
  /** A codicon id; the playground draws its own artwork for it. */
  icon: string;
  /** Drawn in the warning colour, beside its words (a plot that may need review). */
  warning: boolean;
  /** Whether it opens, and whether it is open when first shown. */
  branch: boolean;
  open: boolean;
  /** Its menu context, as the action catalogue's placements match it (VS Code's contextValue). */
  menu?: string;
  /** The ids of the actions its context menu offers (the action catalogue's, PAR-05). */
  actions: readonly string[];
  /** What choosing it runs: opening a plot. */
  run?: { action: string; args: readonly unknown[] };
}

const itemKey = (catalogue: string | undefined, item: string) => `${catalogue ?? ""}/${item}`;

/** A track's periods of data in words: "08:00:00Z – 12:00:00Z", or how many and the first. */
export function describeCoverage(track: TrackCoverage): string {
  const spans = track.spans;
  const fixes = count(track.fixes, "fix", "fixes");
  if (!spans.length) return fixes;
  const first = describeTimes(spans[0].start, spans.at(-1)!.end);
  return spans.length === 1 ? `${first} · ${fixes}` : `${count(spans.length, "period")}, ${first} · ${fixes}`;
}

export class CataloguesModel {
  constructor(private readonly input: CataloguesInput) {}

  /** Whether the tree is empty, so the welcome text is shown instead (VS Code's welcome view). */
  get empty(): boolean {
    return !this.roots.length;
  }

  get roots(): CataloguesNode[] {
    const { catalogues, problem, starting } = this.input;
    if (starting) return [{ kind: "status", key: "catalogues:starting", text: STARTING, icon: "loading~spin" }];
    const nodes: CataloguesNode[] = catalogues.map((catalogue) => ({ kind: "catalogue", key: `catalogue:${catalogue.store}`, catalogue }));
    return problem ? [{ kind: "problem", key: "catalogues:problem", text: problem }, ...nodes] : nodes;
  }

  children(node: CataloguesNode): CataloguesNode[] {
    if (node.kind === "catalogue") {
      const { catalogue } = node;
      if (catalogue.problem) return [{ kind: "problem", key: `problem:${catalogue.store}`, text: catalogue.problem }];
      return catalogue.plots.map((plot) => ({ kind: "plot", key: `plot:${catalogue.store}:${plot.id}`, catalogue, plot }));
    }
    if (node.kind === "plot") return node.plot.tracks.map((track) => ({ kind: "track", key: `track:${node.catalogue.store}:${node.plot.id}:${track.track}`, catalogue: node.catalogue, plot: node.plot, track }));
    return [];
  }

  private isOpen(node: { catalogue: CatalogueEntry; plot: PlotSummary }): boolean {
    const open = this.input.marks.open;
    return open?.store === node.catalogue.store && open.item === node.plot.id;
  }

  row(node: CataloguesNode): CataloguesRow {
    const base = { key: node.key, kind: node.kind, detail: "", warning: false, branch: false, open: false, actions: [] as string[] };
    const { marks } = this.input;
    switch (node.kind) {
      case "status":
        return { ...base, label: node.text, aria: node.text, icon: node.icon };
      case "problem":
        return { ...base, label: node.text, aria: node.text, icon: "warning" };
      case "catalogue": {
        const { catalogue } = node;
        const detail = [catalogue.readOnly ? "read-only" : "", count(catalogue.plots.length, "plot")].filter(Boolean).join(" · ");
        const menu = catalogue.readOnly ? "catalogue-read-only" : "catalogue";
        return { ...base, label: catalogue.title, detail, tooltip: catalogue.location, aria: `${catalogue.title}, ${detail}`, icon: catalogue.readOnly ? "lock" : "library", branch: true, open: true, menu, actions: rowActions("debrief.catalogues", menu) };
      }
      case "plot": {
        const { catalogue, plot } = node;
        const open = this.isOpen(node);
        const id = itemKey(catalogue.id, plot.id);
        const listed = marks.coverage?.items.find((i) => itemKey(i.catalogue, i.item) === id);
        const flag = marks.flags.find((f) => itemKey(f.catalogue, f.item) === id);
        const fresh = listed?.new_data;
        // A mark is a symbol and words, never colour alone; its reason is its tooltip and what a screen reader hears.
        const words = [open ? "open" : "", fresh ? "New data" : "", flag ? "May need review" : "", listed?.role === "drawn_from" ? (listed.revised ? "drawn from, revised since" : "drawn from") : ""].filter(Boolean);
        const notes = [fresh?.note, flag ? `${flag.note}.` : undefined, listed?.revised ? "Revised since the open plot took data from it." : undefined].filter((n): n is string => !!n);
        const menu = ["plot", open ? "open" : marks.open ? "other" : "", fresh ? "new-data" : "", flag ? "review" : ""].filter(Boolean).join("-");
        return {
          ...base,
          label: plot.title,
          detail: [...words, describePeriod(plot.start, plot.end)].filter(Boolean).join(" · "),
          tooltip: [plot.title, ...notes].join("\n"),
          aria: [plot.title, ...words, ...notes].join(", "),
          icon: flag ? "warning" : fresh ? "sparkle" : open ? "map-filled" : "map",
          warning: !!flag,
          branch: plot.tracks.length > 0,
          menu,
          actions: rowActions("debrief.catalogues", menu),
          run: { action: OPEN_PLOT, args: [catalogue.store, plot.id] },
        };
      }
      case "track": {
        const { catalogue, plot, track } = node;
        // How the open plot knows it: the plot's own, linked to one of its tracks, or proposed by name.
        let how = "";
        let state = "";
        if (!this.isOpen(node)) {
          for (const platform of marks.coverage?.platforms ?? []) {
            const source = platform.sources.find((s) => s.catalogue === catalogue.id && s.item === plot.id && s.track === track.track);
            if (!source) continue;
            how = source.link === "proposed" ? `proposed as ${platform.name}` : `linked to ${platform.name}`;
            state = source.link;
            break;
          }
        }
        const detail = [how, describeCoverage(track)].filter(Boolean).join(" · ");
        const menu = marks.open && !this.isOpen(node) ? `item-track${state ? `-${state}` : ""}` : "item-track-open";
        return {
          ...base,
          label: track.name,
          detail,
          tooltip: [`${track.name}: ${count(track.fixes, "fix", "fixes")}`, ...track.spans.map((s) => `Data ${describePeriod(s.start, s.end)}`), how && `In the open plot: ${how}`].filter(Boolean).join("\n"),
          aria: `${track.name}, ${detail}`,
          icon: "pulse",
          menu,
          actions: rowActions("debrief.catalogues", menu),
        };
      }
    }
  }

  /** Every row, in order, each branch's rows under it, for tests and agents. */
  rows(): CataloguesRow[] {
    const walk = (nodes: CataloguesNode[]): CataloguesRow[] => nodes.flatMap((n) => [this.row(n), ...walk(this.children(n))]);
    return walk(this.roots);
  }

  /** A node by its key. */
  nodeOf(key: string): CataloguesNode | undefined {
    const find = (nodes: CataloguesNode[]): CataloguesNode | undefined => {
      for (const n of nodes) {
        if (n.key === key) return n;
        const inner = find(this.children(n));
        if (inner) return inner;
      }
      return undefined;
    };
    return find(this.roots);
  }
}

/** The plot a row names, for the collation flows (flows/collation.ts). */
export function plotTargetOf(node: CataloguesNode | undefined): { store: string; catalogue: string; item: string; title: string } | undefined {
  if (node?.kind !== "plot") return undefined;
  return { store: node.catalogue.store, catalogue: node.catalogue.id ?? "", item: node.plot.id, title: node.plot.title };
}
/** The track a row names, for the collation flows. */
export function trackTargetOf(node: CataloguesNode | undefined): { store: string; catalogue: string; item: string; title: string; track: string; name: string } | undefined {
  if (node?.kind !== "track") return undefined;
  return { store: node.catalogue.store, catalogue: node.catalogue.id ?? "", item: node.plot.id, title: node.plot.title, track: node.track.track, name: node.track.name };
}
