/**
 * Reading file catalogues in the extension (SUB-15, SUB-17, SUB-23).
 *
 * Read-only: every write goes through the Python service, where domain logic
 * lives (PRN-03). Items are found by walking the catalogue's folders and
 * trusting each item's parent link, never the catalogue's child links, as
 * debrief-stac does. Every file is validated on reading.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { loadConfig, type ConfigError } from "@debrief/config";
import {
  parseDocument,
  validateDocument,
  type DebriefFeatureCollection,
  type ImageExport,
  type RevisionShown,
  type KnownStore,
  type StacItem,
  type TrackCoverage,
} from "@debrief/schemas";

export const CATALOGUE_FILE = "catalog.json";

export interface PlotSummary {
  id: string;
  title: string;
  start?: string;
  end?: string;
  /** Each track's periods of data, as the item keeps them (CAP-08): read from the item alone. */
  tracks: TrackCoverage[];
}

export interface CatalogueView {
  store: KnownStore;
  /** The catalogue's own id, from its catalog.json: what collation names items by. */
  id?: string;
  title: string;
  plots: PlotSummary[];
  problem?: string;
}

export interface OpenedPlot {
  store: KnownStore;
  item: StacItem;
  plot: DebriefFeatureCollection;
  /** Assets other than the plot itself: sources, supporting files and payloads. */
  files: { key: string; title: string; kind: string; href: string }[];
  /** Where the plot's history stood when it was read, from the tool service (SUB-28). */
  base?: { current: number; plot_hash: string };
  /** How many steps its history held when it was read, from the tool service. */
  latest?: number;
  /** The hash of the plot's view (its island, SUB-22) when it was read, to pass back when changing it. */
  viewHash?: string;
  /** An earlier revision of the plot, shown read-only: the one an image was exported at (SUB-25). */
  revision?: RevisionShown;
  /** The export log entry for that image: the view and time it was exported at. */
  exported?: ImageExport;
}

/**
 * The plot file: one file holding the plot's content, its island (view state,
 * SUB-22) and its whole history (decision 13 Oct). It changes whenever anyone
 * changes any of them.
 */
export function plotFile(store: KnownStore, item: StacItem): string | undefined {
  const asset = item.assets.plot;
  if (!asset) return undefined;
  try {
    return assetPath(store, item, asset);
  } catch {
    return undefined;
  }
}

/** Where a plot's history stands, as its plot file says. */
export interface HistoryOnDisk {
  current: number;
  latest: number;
  /** The current step's result_hash: the hash of the plot's content (none before the first step). */
  plot_hash?: string;
}

/**
 * Where the plot's history stands in a plot file's text, or undefined if it
 * has none that can be read. Only the pointers are read here: the Python
 * service checks the history's checksums when the plot is opened.
 */
export function historyIn(text: string): HistoryOnDisk | undefined {
  try {
    const history = (JSON.parse(text) as { history?: { current?: unknown; steps?: { result_hash?: unknown }[] } }).history;
    if (!history || typeof history.current !== "number" || !Array.isArray(history.steps)) return undefined;
    const hash = history.current > 0 ? history.steps[history.current - 1]?.result_hash : undefined;
    return { current: history.current, latest: history.steps.length, plot_hash: typeof hash === "string" ? hash : undefined };
  } catch {
    return undefined;
  }
}

/** Where the plot's history stands on disk now, or undefined if it cannot be read. */
export function historyOnDisk(file: string): HistoryOnDisk | undefined {
  try {
    return historyIn(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Whether the plot on disk is no longer the one opened: a step made, undone or
 * redone elsewhere (SUB-28). A change to its view alone leaves all three the same.
 */
export function changedSince(onDisk: HistoryOnDisk | undefined, opened: Pick<OpenedPlot, "base" | "latest">): boolean {
  if (!onDisk || !opened.base) return false;
  return (
    onDisk.current !== opened.base.current ||
    (opened.latest !== undefined && onDisk.latest !== opened.latest) ||
    (onDisk.plot_hash !== undefined && onDisk.plot_hash !== opened.base.plot_hash)
  );
}

/**
 * A plot file's content, for the map and the outline: its history left out.
 * The history can be as large as the plot again, and nothing on screen reads it.
 */
export function plotContent(text: string): DebriefFeatureCollection {
  const raw = JSON.parse(text) as Record<string, unknown>;
  delete raw.history;
  return validateDocument("plot", raw);
}

export function knownStores(configFile?: string): { stores: KnownStore[]; problem?: string } {
  try {
    return { stores: configFile ? loadConfig(configFile).stores : loadConfig().stores };
  } catch (error) {
    return { stores: [], problem: (error as ConfigError).message };
  }
}

/** Item summaries by file, kept until the file changes, so refreshing is cheap. */
const summaries = new Map<string, { mtimeMs: number; size: number; summary?: PlotSummary }>();

function summarise(itemFile: string): PlotSummary | undefined {
  const { mtimeMs, size } = statSync(itemFile);
  const cached = summaries.get(itemFile);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) return cached.summary;
  const text = readFileSync(itemFile, "utf8");
  const raw = JSON.parse(text) as { links?: { rel?: string; href?: string }[] };
  const parented = (raw.links ?? []).some((l) => l.rel === "parent" && l.href === `../${CATALOGUE_FILE}`);
  let summary: PlotSummary | undefined;
  if (parented) {
    const item = parseDocument("stac_item", text);
    const p = item.properties;
    summary = {
      id: item.id,
      title: p.title ?? item.id,
      start: p.start_datetime ?? p.datetime ?? undefined,
      end: p.end_datetime ?? p.datetime ?? undefined,
      tracks: p["debrief:coverage"] ?? [],
    };
  }
  summaries.set(itemFile, { mtimeMs, size, summary });
  return summary;
}

export function readCatalogue(store: KnownStore): CatalogueView {
  const root = store.location;
  if (!existsSync(path.join(root, CATALOGUE_FILE))) {
    return { store, title: store.title, plots: [], problem: `No catalogue found at ${root}` };
  }
  try {
    const catalogue = parseDocument("stac_catalog", readFileSync(path.join(root, CATALOGUE_FILE), "utf8"));
    const plots: PlotSummary[] = [];
    for (const name of readdirSync(root).sort()) {
      const itemFile = path.join(root, name, `${name}.json`);
      if (!statSync(path.join(root, name)).isDirectory() || !existsSync(itemFile)) continue;
      const summary = summarise(itemFile);
      if (summary) plots.push(summary);
    }
    return { store, id: catalogue.id, title: catalogue.title ?? store.title, plots };
  } catch (error) {
    return { store, title: store.title, plots: [], problem: (error as Error).message };
  }
}

/** An asset's file, which must lie inside its item's folder. */
function assetPath(store: KnownStore, item: StacItem, asset: { href: string }): string {
  const folder = path.resolve(store.location, item.id);
  const file = path.resolve(folder, asset.href);
  if (!file.startsWith(folder + path.sep)) throw new Error(`${item.id} refers to a file outside its folder: ${asset.href}`);
  return file;
}

export function openPlot(store: KnownStore, itemId: string): OpenedPlot {
  const item = parseDocument(
    "stac_item",
    readFileSync(path.join(store.location, itemId, `${itemId}.json`), "utf8"),
  );
  const plotAsset = item.assets.plot;
  if (!plotAsset) throw new Error(`${itemId} has no plot`);
  const plot = plotContent(readFileSync(assetPath(store, item, plotAsset), "utf8"));
  const files = Object.entries(item.assets)
    .filter(([key]) => key !== "plot")
    .map(([key, asset]) => ({
      key,
      title: asset.title ?? path.basename(asset.href),
      kind: String(asset["debrief:asset_kind"] ?? "file"),
      href: assetPath(store, item, asset),
    }));
  return { store, item, plot, files };
}
